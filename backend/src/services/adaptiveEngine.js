// ============================================================================
// ADAPTIVE ENGINE
// ----------------------------------------------------------------------------
// Runs when a task is missed. Redistributes the missed minutes across the
// next few days, respecting each day's remaining capacity, so the student's
// exam deadline and other high-priority topics stay protected. This is what
// makes the planner feel alive instead of just a static printed timetable.
// ============================================================================

const Task = require('../models/Task');
const { toDateStr, addDays } = require('../utils/dateUtils');

async function redistributeMissedTask({ userId, planId, missedTask, dailyCapacityMinutes, spreadDays = 3 }) {
  let remaining = missedTask.duration;
  const impacted = [];

  for (let i = 1; i <= spreadDays && remaining > 0; i++) {
    const targetDate = toDateStr(addDays(new Date(), i));

    const existing = await Task.find({
      userId,
      date: targetDate,
      type: { $ne: 'BREAK' },
      status: 'pending'
    });
    const scheduledMinutes = existing.reduce((sum, t) => sum + t.duration, 0);
    const capacityLeft = dailyCapacityMinutes - scheduledMinutes;

    if (capacityLeft <= 0) continue;

    const addMinutes = Math.min(remaining, capacityLeft);

    await Task.create({
      userId,
      planId,
      subjectId: missedTask.subjectId,
      subjectName: missedTask.subjectName,
      topic: missedTask.topic,
      date: targetDate,
      startTime: null, // extra session — frontend can show it as "added today", no fixed slot yet
      duration: addMinutes,
      type: missedTask.type,
      priorityScore: missedTask.priorityScore,
      status: 'pending',
      reason: `Rebalanced from a missed session on ${toDateStr(new Date())}`
    });

    impacted.push({ date: targetDate, addedMinutes: addMinutes });
    remaining -= addMinutes;
  }

  return impacted;
}

module.exports = { redistributeMissedTask };
