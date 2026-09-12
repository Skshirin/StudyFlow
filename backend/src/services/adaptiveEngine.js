// ============================================================================
// ADAPTIVE ENGINE (V2.0 — Priority-Aware Syllabus Recalculation)
// ----------------------------------------------------------------------------
// Runs when a task is missed.
// - Respects the exam date as a hard boundary — NEVER schedules required work
//   or revision past it.
// - Re-runs priority scoring across remaining incomplete concepts under the
//   reduced runway.
// - Prioritizes high-yield topics; lower-priority concepts can be postponed or
//   dropped entirely rather than force-fit in.
// - Preserves the existing API contract ({ impacted, message, missedTask }).
// ============================================================================

const Task = require('../models/Task');
const StudentSubject = require('../models/StudentSubject');
const Subject = require('../models/Subject');
const Concept = require('../models/Concept');
const { toDateStr, addDays, diffDays } = require('../utils/dateUtils');

/**
 * Redistributes a missed task's minutes with priority awareness and hard exam deadlines.
 *
 * @param {Object} params
 * @param {String} params.userId
 * @param {String} params.planId
 * @param {Object} params.missedTask
 * @param {Number} params.dailyCapacityMinutes
 * @param {Number} [params.spreadDays=3]
 * @param {Date} [params.today=new Date()]
 * @returns {Array} impacted array with attached .impacted, .postponed, and .message
 */
async function redistributeMissedTask({
  userId,
  planId,
  missedTask,
  dailyCapacityMinutes,
  spreadDays = 3,
  today = new Date()
}) {
  // 1. Identify exam deadline and confidence for the missed task's subject
  let examDate = null;
  let confidence = 3;

  if (missedTask.subjectId) {
    const ss = await StudentSubject.findOne({ userId, subjectId: missedTask.subjectId }).lean();
    if (ss) {
      examDate = ss.examDate;
      confidence = ss.confidence || 3;
    } else {
      const legacySubj = await Subject.findOne({ _id: missedTask.subjectId, userId }).lean();
      if (legacySubj) {
        examDate = legacySubj.examDate;
        confidence = legacySubj.confidence || 3;
      }
    }
  }

  // 2. HARD EXAM BOUNDARY CHECK: Never schedule required work past exam date
  let daysUntilExam = null;
  if (examDate) {
    daysUntilExam = diffDays(today, new Date(examDate));
    if (daysUntilExam <= 0) {
      const postponed = [{
        taskId: missedTask._id,
        topic: missedTask.topic,
        subjectName: missedTask.subjectName,
        duration: missedTask.duration,
        reason: `Cannot reschedule past exam deadline: exam date (${toDateStr(new Date(examDate))}) has already arrived.`
      }];
      const emptyResult = [];
      emptyResult.impacted = [];
      emptyResult.postponed = postponed;
      emptyResult.message = `Cannot reschedule missed session past exam deadline on ${toDateStr(new Date(examDate))}. Concept marked as postponed.`;
      return emptyResult;
    }
  }

  // Bound spreadDays strictly to pre-exam runway
  const allowedSpreadDays = daysUntilExam !== null
    ? Math.min(spreadDays, daysUntilExam)
    : spreadDays;

  if (allowedSpreadDays <= 0) {
    const postponed = [{
      taskId: missedTask._id,
      topic: missedTask.topic,
      subjectName: missedTask.subjectName,
      duration: missedTask.duration,
      reason: `Cannot reschedule: exam date (${toDateStr(new Date(examDate))}) leaves no remaining runway.`
    }];
    const emptyResult = [];
    emptyResult.impacted = [];
    emptyResult.postponed = postponed;
    emptyResult.message = `Cannot reschedule missed session: exam deadline has arrived.`;
    return emptyResult;
  }

  // 3. Compute priority score of the missed task under reduced runway
  const concept = await Concept.findOne({ name: missedTask.topic }).lean();
  const relevanceNorm = ((concept?.examRelevance) ?? 2) / 3;
  const importanceNorm = ((concept?.importance) ?? 2) / 3;
  const weaknessNorm = (6 - confidence) / 5;
  const urgencyNorm = daysUntilExam !== null ? Math.min(1.0, 1 / Math.max(daysUntilExam, 1)) : 0.5;
  const missedPriorityScore = Math.round((0.35 * urgencyNorm + 0.25 * relevanceNorm + 0.25 * importanceNorm + 0.15 * weaknessNorm) * 100) / 100;

  let remaining = missedTask.duration;
  const impacted = [];
  const postponed = [];

  // 4. Distribute across allowed pre-exam days
  for (let i = 1; i <= allowedSpreadDays && remaining > 0; i++) {
    const targetDateObj = addDays(today, i);
    const targetDate = toDateStr(targetDateObj);

    // Hard check: ensure targetDate is strictly <= examDate
    if (examDate && new Date(targetDate) > new Date(examDate)) {
      break;
    }

    const existing = await Task.find({
      userId,
      date: targetDate,
      type: { $ne: 'BREAK' },
      status: 'pending'
    }).sort({ priorityScore: 1 }); // Lowest priority first

    const scheduledMinutes = existing.reduce((sum, t) => sum + t.duration, 0);
    let capacityLeft = dailyCapacityMinutes - scheduledMinutes;

    // A. Use remaining daily capacity if available
    if (capacityLeft > 0) {
      const addMinutes = Math.min(remaining, capacityLeft);
      await Task.create({
        userId,
        planId,
        subjectId: missedTask.subjectId,
        subjectName: missedTask.subjectName,
        topic: missedTask.topic,
        date: targetDate,
        startTime: null,
        duration: addMinutes,
        type: missedTask.type,
        priorityScore: missedPriorityScore,
        status: 'pending',
        reason: `Rebalanced from missed session on ${toDateStr(today)} (priority: ${missedPriorityScore})`
      });

      impacted.push({ date: targetDate, addedMinutes: addMinutes });
      remaining -= addMinutes;
      capacityLeft -= addMinutes;
    }

    // B. If capacity is full, check if lower-priority concepts should be postponed/dropped
    if (remaining > 0 && capacityLeft <= 0) {
      for (const existingTask of existing) {
        if (remaining <= 0) break;

        const existingScore = existingTask.priorityScore ?? 0.5;
        if (existingScore < missedPriorityScore) {
          // Postpone lower-priority task
          existingTask.status = 'skipped';
          existingTask.reason = `Postponed to make room for higher-priority missed session (${missedTask.topic}) before exam deadline`;
          await existingTask.save();

          postponed.push({
            taskId: existingTask._id,
            topic: existingTask.topic,
            subjectName: existingTask.subjectName,
            duration: existingTask.duration,
            priorityScore: existingScore,
            reason: `Postponed: displaced by higher-priority missed session (${missedTask.topic}) on ${targetDate}`
          });

          capacityLeft += existingTask.duration;
          const addMinutes = Math.min(remaining, capacityLeft);
          await Task.create({
            userId,
            planId,
            subjectId: missedTask.subjectId,
            subjectName: missedTask.subjectName,
            topic: missedTask.topic,
            date: targetDate,
            startTime: null,
            duration: addMinutes,
            type: missedTask.type,
            priorityScore: missedPriorityScore,
            status: 'pending',
            reason: `Rebalanced from missed session on ${toDateStr(today)} displacing lower-priority work`
          });

          impacted.push({ date: targetDate, addedMinutes: addMinutes });
          remaining -= addMinutes;
          capacityLeft -= addMinutes;
        }
      }
    }
  }

  // 5. If remaining minutes still cannot fit into the pre-exam runway
  if (remaining > 0) {
    postponed.push({
      taskId: missedTask._id,
      topic: missedTask.topic,
      subjectName: missedTask.subjectName,
      duration: remaining,
      priorityScore: missedPriorityScore,
      reason: examDate
        ? `Dropped: insufficient pre-exam runway before ${toDateStr(new Date(examDate))} to schedule remaining ${remaining}m without displacing higher-priority tasks`
        : `Postponed: insufficient daily capacity across next ${spreadDays} days`
    });
  }

  // Resequence breaks on missedTask date and all impacted dates
  const { resequenceDayBreaks } = require('./schedulingEngine');
  await resequenceDayBreaks(userId, missedTask.date);
  for (const row of impacted) {
    await resequenceDayBreaks(userId, row.date);
  }

  // 6. Build user-friendly message
  let message;
  if (impacted.length > 0) {
    message = `No worries — this session has been rebalanced across the next ${impacted.length} day(s).`;
    if (postponed.length > 0) {
      message += ` ${postponed.length} lower-priority session(s) were postponed to protect exam readiness.`;
    }
  } else {
    message = postponed.length
      ? `Marked as missed. Could not reschedule within remaining pre-exam runway without exceeding capacity.`
      : 'Marked as missed. No spare capacity in the next few days to reschedule it automatically.';
  }

  const resultArr = [...impacted];
  resultArr.impacted = impacted;
  resultArr.postponed = postponed;
  resultArr.message = message;
  return resultArr;
}

module.exports = { redistributeMissedTask };
