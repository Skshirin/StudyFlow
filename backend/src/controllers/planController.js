const Subject = require('../models/Subject');
const LegacySubject = require('../models/LegacySubject');
const StudentSubject = require('../models/StudentSubject');
const Module = require('../models/Module');
const Concept = require('../models/Concept');
const StudentProgress = require('../models/StudentProgress');
const StudyPlan = require('../models/StudyPlan');
const Task = require('../models/Task');
const EnergyLog = require('../models/EnergyLog');

const { generateDailyTasks, generateMasterPlan, resequenceDayBreaks, SESSION_CONFIG } = require('../services/schedulingEngine');
const { computePlanHealth } = require('../services/planHealth');
const { assessFeasibility, buildEmergencyPlanDataset } = require('../services/feasibilityEngine');
const { redistributeMissedTask } = require('../services/adaptiveEngine');
const { parseIntent } = require('../services/intentParser');
const { parseIntentWithAI, prioritizeConceptsWithAI } = require('../services/aiService');
const { validateAndResolveIntent } = require('../services/intentValidator');
const { toDateStr, addDays, diffDays } = require('../utils/dateUtils');

const { getStudentSyllabusSubjects } = require('../services/syllabusService');

// POST /api/plan/generate
exports.generatePlan = async (req, res, next) => {
  try {
    let {
      prompt,
      targetGoal,
      goal,
      days,
      durationDays,
      subjectId,
      subject,
      timePreference,
      dailyCapacityMinutes
    } = req.body;

    // 1. Natural language intent understanding via Gemini
    let aiIntent = null;
    if (prompt && prompt.trim()) {
      aiIntent = await parseIntentWithAI(prompt.trim());
    }

    if (!targetGoal) {
      targetGoal = aiIntent?.goalType || goal || 'SCORE_WELL';
    }
    // Normalize FULL_PREPARATION → TOP for backwards compat
    targetGoal = targetGoal.toUpperCase();
    if (targetGoal === 'FULL_PREPARATION') targetGoal = 'TOP';

    // Extract scope from AI intent (hard filter for modules/concepts)
    const scope = aiIntent?.scope || null;

    if (!days && durationDays) {
      days = Number(durationDays);
    }
    if (!days && aiIntent?.durationDays) {
      days = Number(aiIntent.durationDays);
    }

    if (!subjectId && (subject || aiIntent?.subject)) {
      const querySubj = subject || aiIntent?.subject;
      const sDoc = await Subject.findOne({
        $or: [
          { code: querySubj.toString().trim().toUpperCase() },
          { name: new RegExp(querySubj.toString().trim(), 'i') }
        ]
      });
      if (sDoc) subjectId = sDoc._id;
    }

    // Update student subject goal if applicable
    if (subjectId && targetGoal) {
      await StudentSubject.updateOne(
        { userId: req.userId, subjectId },
        { targetGoal }
      );
    } else if (targetGoal) {
      await StudentSubject.updateMany(
        { userId: req.userId },
        { targetGoal }
      );
    }

    let subjects = await getStudentSyllabusSubjects(req.userId);
    if (subjects.length === 0) {
      return res.status(400).json({ error: 'Add at least one subject before generating a plan' });
    }

    if (subjectId) {
      const filtered = subjects.filter((s) =>
        (s._id?.toString() === subjectId.toString() ||
         s.subjectId?._id?.toString() === subjectId.toString() ||
         s.subjectId?.toString() === subjectId.toString())
      );
      if (filtered.length > 0) {
        subjects = filtered;
      }
    }

    const today = new Date();
    let planDays = days ? Number(days) : null;
    if (!planDays) {
      const examDeadlines = subjects
        .map((s) => s.examDate || s.studentSubject?.examDate)
        .filter(Boolean)
        .map((d) => diffDays(today, new Date(d)));
      if (examDeadlines.length > 0) {
        planDays = Math.max(...examDeadlines) + 1;
      } else {
        planDays = 14; // Default to 14 days when no exam date is explicitly set
      }
    }
    planDays = Math.min(Math.max(planDays, 1), 60);

    const effectiveBudgetMinutes = dailyCapacityMinutes
      ? Number(dailyCapacityMinutes)
      : SESSION_CONFIG.DEFAULT_DAILY_BUDGET;

    // 2. Feasibility Engine Assessment
    const feasibility = assessFeasibility({
      subjects,
      dailyCapacityMinutes: effectiveBudgetMinutes,
      today,
      planDays
    });

    const isEmergency = feasibility.status === 'EMERGENCY' || targetGoal === 'EMERGENCY';
    const effectivePlanDays = (isEmergency && feasibility.earliestExamDays)
      ? Math.max(1, feasibility.earliestExamDays)
      : planDays;

    // 3. Flatten real syllabus concepts for Gemini prioritization
    const flatConcepts = [];
    subjects.forEach((s) => {
      (s.modules || []).forEach((m) => {
        (m.concepts || []).forEach((c) => {
          flatConcepts.push({
            id: c._id.toString(),
            name: c.name,
            moduleName: m.name,
            importance: c.importance ?? 2,
            examRelevance: c.examRelevance ?? 2,
            difficulty: c.difficulty ?? 3
          });
        });
      });
    });

    // 4. Gemini AI Concept Prioritization (Call 2)
    const prioritized = await prioritizeConceptsWithAI({
      intent: {
        ...(aiIntent || {}),
        goalType: targetGoal
      },
      concepts: flatConcepts,
      subjectName: subjects[0]?.name || 'Syllabus'
    });

    // 5. Deterministic Master Topic Allocation
    const masterPlan = generateMasterPlan({
      subjects,
      startDateStr: toDateStr(today),
      totalDays: effectivePlanDays,
      intent: {
        ...(aiIntent || {}),
        goalType: targetGoal,
        prioritizedConceptIds: prioritized.prioritizedConceptIds,
        scope
      },
      timePreference: timePreference || 'flexible',
      dailyBudgetMinutes: effectiveBudgetMinutes,
      scope
    });

    // 6. Persist plan and tasks
    await Task.deleteMany({ userId: req.userId });
    const plan = await StudyPlan.create({
      userId: req.userId,
      startDate: masterPlan.startDate,
      endDate: masterPlan.endDate,
      dailyCapacityMinutes: effectiveBudgetMinutes,
      timePreference: timePreference || 'flexible',
      targetGoal
    });

    const tasksToInsert = masterPlan.tasks.map((t) => ({
      ...t,
      userId: req.userId,
      planId: plan._id
    }));

    if (tasksToInsert.length > 0) {
      await Task.insertMany(tasksToInsert);
    }

    const emergencyMode = feasibility.status === 'EMERGENCY';
    const emergencyPlanNotice = emergencyMode
      ? `Emergency triage plan active: only critical high-yield concepts scheduled due to severe time shortfall.`
      : undefined;

    res.status(201).json({
      plan,
      daysGenerated: masterPlan.totalDays,
      startDate: masterPlan.startDate,
      endDate: masterPlan.endDate,
      tasksGenerated: tasksToInsert.length,
      allocatedLearnCount: masterPlan.allocatedLearnCount,
      totalConceptsAvailable: masterPlan.totalConceptsAvailable,
      strategyExplanation: prioritized.strategyExplanation,
      skippedConcepts: masterPlan.skippedConcepts?.length > 0 ? masterPlan.skippedConcepts : (feasibility.skippedConcepts || []),
      scope: masterPlan.scope || null,
      emergencyPlanNotice,
      feasibility: {
        status: feasibility.status,
        trafficLight: feasibility.trafficLight,
        emergencyMode,
        message: feasibility.message,
        skippedConcepts: feasibility.skippedConcepts || []
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/plan/current
exports.getCurrentPlan = async (req, res, next) => {
  try {
    const plan = await StudyPlan.findOne({ userId: req.userId }).sort({ createdAt: -1 });
    if (!plan) {
      return res.json({ plan: null, tasks: [] });
    }

    // Clean up any orphan breaks across all dates for this user
    const dates = await Task.distinct('date', { userId: req.userId });
    for (const d of dates) {
      const studyCount = await Task.countDocuments({ userId: req.userId, date: d, type: { $ne: 'BREAK' } });
      if (studyCount <= 1) {
        await Task.deleteMany({ userId: req.userId, date: d, type: 'BREAK' });
      }
    }

    const tasks = await Task.find({ userId: req.userId, planId: plan._id }).sort({ date: 1, startTime: 1, createdAt: 1 }).lean();

    res.json({
      plan,
      startDate: plan.startDate,
      endDate: plan.endDate,
      targetGoal: plan.targetGoal,
      tasks
    });
  } catch (err) {
    next(err);
  }
};


// GET /api/plan/today
exports.getToday = async (req, res, next) => {
  try {
    const todayStr = toDateStr(new Date());

    // Resequence breaks for today so DB is always 100% clean and interleaved
    await resequenceDayBreaks(req.userId, todayStr);

    const [tasks, subjects, plan] = await Promise.all([
      Task.find({ userId: req.userId, date: todayStr }).sort({ startTime: 1 }),
      getStudentSyllabusSubjects(req.userId),
      StudyPlan.findOne({ userId: req.userId }).sort({ createdAt: -1 })
    ]);

    const dailyCapacityMinutes = plan ? plan.dailyCapacityMinutes : 120;
    const planHealth = computePlanHealth(subjects, new Date(), dailyCapacityMinutes);

    const plannedMinutes = tasks.filter((t) => t.type !== 'BREAK').reduce((s, t) => s + t.duration, 0);
    const sessionsCount = tasks.filter((t) => t.type !== 'BREAK').length;

    // Enrich tasks with concept metadata if missing
    const enrichedTasks = await Promise.all(tasks.map(async (t) => {
      const taskObj = t.toObject ? t.toObject() : { ...t };
      if ((!taskObj.importance || !taskObj.examRelevance) && taskObj.type !== 'BREAK') {
        const concept = await Concept.findOne({ name: taskObj.topic }).lean();
        if (concept) {
          taskObj.importance = concept.importance;
          taskObj.examRelevance = concept.examRelevance;
          taskObj.difficulty = concept.difficulty;
          taskObj.conceptId = concept._id;
        }
      }
      return taskObj;
    }));

    res.json({
      date: todayStr,
      tasks: enrichedTasks,
      plannedMinutes,
      sessionsCount,
      planHealth
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/plan/:date  (date = 'YYYY-MM-DD')
exports.getByDate = async (req, res, next) => {
  try {
    await resequenceDayBreaks(req.userId, req.params.date);
    const tasks = await Task.find({ userId: req.userId, date: req.params.date }).sort({ startTime: 1 });
    res.json({ date: req.params.date, tasks });
  } catch (err) {
    next(err);
  }
};

// GET /api/plan/health
exports.getPlanHealth = async (req, res, next) => {
  try {
    const [subjects, plan] = await Promise.all([
      getStudentSyllabusSubjects(req.userId),
      StudyPlan.findOne({ userId: req.userId }).sort({ createdAt: -1 })
    ]);
    const dailyCapacityMinutes = plan ? plan.dailyCapacityMinutes : 120;
    res.json(computePlanHealth(subjects, new Date(), dailyCapacityMinutes));
  } catch (err) {
    next(err);
  }
};

// POST /api/plan/energy  { date, level }
exports.logEnergy = async (req, res, next) => {
  try {
    const { date, level } = req.body;
    if (!date || !['high', 'normal', 'low'].includes(level)) {
      return res.status(400).json({ error: 'date and level (high|normal|low) are required' });
    }
    const log = await EnergyLog.findOneAndUpdate(
      { userId: req.userId, date },
      { userId: req.userId, date, level },
      { upsert: true, new: true }
    );
    res.json(log);
  } catch (err) {
    next(err);
  }
};

// POST /api/plan/adjust   { text: "I'm tired today" }
// Rule-based first (fast, free, predictable). Falls back to AI only for
// text the rules can't classify. Either way, the actual plan changes are
// made by deterministic code, never by the AI directly.
exports.adjustPlan = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    // Rule-based first for instant, predictable behavior on common commands
    let parsed = parseIntent(text);
    if (!parsed || parsed.intent === 'UNKNOWN') {
      const aiResult = await parseIntentWithAI(text);
      if (aiResult && aiResult.intent !== 'UNKNOWN') {
        parsed = aiResult;
      }
    }

    if (!parsed) {
      parsed = { intent: 'UNKNOWN', source: 'fallback', params: {} };
    }
    parsed.params = parsed.params || {};

    const enrolled = await getStudentSyllabusSubjects(req.userId);
    const validation = await validateAndResolveIntent(parsed, { enrolledSubjects: enrolled });

    if (!validation.isValid && parsed.intent !== 'REDUCE_WORKLOAD' && parsed.intent !== 'BLOCK_TODAY' && parsed.intent !== 'ADD_SESSION') {
      return res.json({
        intent: 'UNKNOWN',
        message: validation.error || "I couldn't understand that request.",
        clarificationNeeded: validation.clarificationNeeded,
        intentSource: parsed.source || 'ai',
        droppedWeakTopics: validation.droppedWeakTopics
      });
    }

    const todayStr = toDateStr(new Date());
    const plan = await StudyPlan.findOne({ userId: req.userId }).sort({ createdAt: -1 });

    if (parsed.intent === 'GENERATE_PLAN' || validation.resolved?.intent === 'GENERATE_PLAN') {
      const resolved = validation.resolved;
      const targetGoal = parsed.goalType || resolved.goal || 'SCORE_WELL';
      const days = parsed.durationDays || resolved.durationDays || 14;

      let subjectId = resolved.subject?._id;
      if (subjectId) {
        const examDate = addDays(new Date(), days);
        await StudentSubject.updateOne(
          { userId: req.userId, subjectId },
          {
            $set: {
              targetGoal,
              examDate
            }
          },
          { upsert: true }
        );
      }

      req.body = {
        prompt: text,
        days,
        subjectId: subjectId ? subjectId.toString() : undefined,
        targetGoal,
        timePreference: 'flexible'
      };
      return exports.generatePlan(req, res, next);
    }

    if (validation.resolved?.intent === 'WEAK_AREA') {
      const topicsList = validation.resolved.weakTopics.map((t) => t.name).join(', ');
      const matchedConceptIds = [];
      const mappedConcepts = [];

      for (const t of validation.resolved.weakTopics) {
        const typeNorm = (t.type || '').toUpperCase();
        if (typeNorm === 'CONCEPT') {
          matchedConceptIds.push(t.id);
          mappedConcepts.push({ id: t.id, name: t.name, moduleId: t.moduleId || null, type: 'CONCEPT' });
          await StudentProgress.updateOne(
            { userId: req.userId, conceptId: t.id },
            { $set: { confidence: 1 } },
            { upsert: true }
          );
        } else if (typeNorm === 'MODULE') {
          const concepts = await Concept.find({ moduleId: t.id }).lean();
          for (const c of concepts) {
            matchedConceptIds.push(c._id);
            mappedConcepts.push({ id: c._id, name: c.name, moduleId: t.id, moduleName: t.name, type: 'CONCEPT' });
            await StudentProgress.updateOne(
              { userId: req.userId, conceptId: c._id },
              { $set: { confidence: 1 } },
              { upsert: true }
            );
          }
        }
      }

      // Also boost priorityScore of any existing pending tasks matching these concepts or topics
      if (matchedConceptIds.length > 0) {
        await Task.updateMany(
          { userId: req.userId, conceptId: { $in: matchedConceptIds }, status: 'pending' },
          { $set: { priorityScore: 0.95 } }
        );
      }

      return res.json({
        message: `Got it! Noted your weak area(s) in ${topicsList}. Priority has been boosted for ${mappedConcepts.length} concept(s).`,
        intentSource: parsed.source || 'ai',
        resolved: validation.resolved,
        mappedConcepts,
        boostedConceptsCount: mappedConcepts.length,
        droppedWeakTopics: validation.droppedWeakTopics
      });
    }

    if (parsed.intent === 'REDUCE_WORKLOAD') {
      const todaysTasks = await Task.find({
        userId: req.userId,
        date: todayStr,
        type: { $ne: 'BREAK' },
        status: 'pending'
      }).sort({ priorityScore: 1 }); // lowest priority first

      if (todaysTasks.length === 0) {
        return res.json({
          message: "You don't have any pending study sessions scheduled for today.",
          intentSource: parsed.source,
          tasks: []
        });
      }

      const totalMinutes = todaysTasks.reduce((s, t) => s + t.duration, 0);
      let percent = parsed.params?.percent || 30;
      let targetReduction = Math.round((totalMinutes * percent) / 100);

      if (parsed.params?.targetHoursToday !== undefined && parsed.params?.targetHoursToday !== null) {
        const targetMinutes = parsed.params.targetHoursToday * 60;
        targetReduction = Math.max(0, totalMinutes - targetMinutes);
        percent = totalMinutes > 0 ? Math.round((targetReduction / totalMinutes) * 100) : 0;
      }

      if (targetReduction === 0 && todaysTasks.length > 1) {
        targetReduction = todaysTasks[0].duration;
      }

      const tomorrowStr = toDateStr(addDays(new Date(), 1));
      let removed = 0;
      const shiftedTasks = [];

      for (const t of todaysTasks) {
        if (removed >= targetReduction && shiftedTasks.length > 0) break;
        t.date = tomorrowStr;
        t.reason = `Shifted to tomorrow to lighten today's workload (${percent}% reduction)`;
        await t.save();
        removed += t.duration;
        shiftedTasks.push(t);
      }

      // Resequence breaks for both today and tomorrow
      await resequenceDayBreaks(req.userId, todayStr);
      await resequenceDayBreaks(req.userId, tomorrowStr);

      const remainingTasks = await Task.find({ userId: req.userId, date: todayStr }).sort({ startTime: 1 });
      const impacted = [{
        date: tomorrowStr,
        addedMinutes: removed
      }];

      return res.json({
        message: `Take some rest! Lightened today's plan by ~${percent}% (${removed} min freed up). Shifted ${shiftedTasks.length} session(s) to tomorrow.`,
        intentSource: parsed.source,
        tasks: remainingTasks,
        impacted,
        removedMinutes: removed,
        remainingMinutes: totalMinutes - removed
      });
    }

    if (parsed.intent === 'BLOCK_TODAY') {
      const todaysTasks = await Task.find({
        userId: req.userId,
        date: todayStr,
        type: { $ne: 'BREAK' },
        status: 'pending'
      });

      if (todaysTasks.length === 0) {
        return res.json({
          message: "You don't have any pending study sessions scheduled for today.",
          intentSource: parsed.source,
          tasks: []
        });
      }

      const tomorrowStr = toDateStr(addDays(new Date(), 1));
      let movedMinutes = 0;
      for (const t of todaysTasks) {
        t.date = tomorrowStr;
        t.reason = 'Shifted to tomorrow because today was blocked';
        await t.save();
        movedMinutes += t.duration;
      }

      // Resequence breaks for both today and tomorrow
      await resequenceDayBreaks(req.userId, todayStr);
      await resequenceDayBreaks(req.userId, tomorrowStr);

      const remainingTasks = await Task.find({ userId: req.userId, date: todayStr }).sort({ startTime: 1 });
      const impacted = [{
        date: tomorrowStr,
        addedMinutes: movedMinutes
      }];

      return res.json({
        message: `No problem — today's ${todaysTasks.length} session(s) (${movedMinutes} min) have been shifted to tomorrow.`,
        intentSource: parsed.source,
        tasks: remainingTasks,
        impacted
      });
    }

    if (parsed.intent === 'MOVE_SUBJECT') {
      const { subject: subjectNameRaw, target } = parsed.params;
      const targetDate = target === 'tomorrow' ? toDateStr(addDays(new Date(), 1)) : todayStr;

      const matches = await Task.find({
        userId: req.userId,
        date: todayStr,
        status: 'pending',
        subjectName: { $regex: new RegExp(subjectNameRaw, 'i') }
      });

      if (matches.length === 0) {
        return res.json({ message: `Couldn't find "${subjectNameRaw}" scheduled today.`, intentSource: parsed.source });
      }

      await Task.updateMany(
        { _id: { $in: matches.map((m) => m._id) } },
        { date: targetDate, reason: `Moved from ${todayStr} at your request` }
      );

      // Resequence breaks on both days
      await resequenceDayBreaks(req.userId, todayStr);
      await resequenceDayBreaks(req.userId, targetDate);

      return res.json({
        message: `Moved ${matches.length} session(s) of "${subjectNameRaw}" to ${targetDate}. (Note: this doesn't yet re-check ${targetDate}'s capacity — a good next improvement.)`,
        intentSource: parsed.source
      });
    }

    if (parsed.intent === 'ADD_SESSION') {
      const activePlan = await StudyPlan.findOne({ userId: req.userId }).sort({ createdAt: -1 });
      const subjects = await getStudentSyllabusSubjects(req.userId);

      let chosenSubject = null;
      if (parsed.subject) {
        const querySubj = parsed.subject.toLowerCase();
        chosenSubject = subjects.find(
          (s) => s.name.toLowerCase().includes(querySubj) || (s.code && s.code.toLowerCase().includes(querySubj))
        );
      }
      if (!chosenSubject && subjects.length > 0) {
        chosenSubject = subjects[0];
      }

      // Find an unlearned concept or fallback
      let conceptToSchedule = null;
      let topicName = chosenSubject ? `${chosenSubject.name} Study Session` : 'Study Session';
      let moduleId = null;
      let importance = 2;
      let examRelevance = 2;
      let difficulty = 3;

      if (chosenSubject && chosenSubject.modules) {
        for (const mod of chosenSubject.modules) {
          for (const con of mod.concepts || []) {
            const alreadyScheduled = await Task.findOne({ userId: req.userId, conceptId: con._id });
            if (!alreadyScheduled) {
              conceptToSchedule = con;
              topicName = con.name;
              moduleId = mod._id;
              importance = con.importance || 2;
              examRelevance = con.examRelevance || 2;
              difficulty = con.difficulty || 3;
              break;
            }
          }
          if (conceptToSchedule) break;
        }
      }

      await Task.create({
        userId: req.userId,
        planId: activePlan ? activePlan._id : null,
        subjectId: chosenSubject ? chosenSubject._id : null,
        subjectName: chosenSubject ? chosenSubject.name : 'General Study',
        topic: topicName,
        conceptId: conceptToSchedule ? conceptToSchedule._id : null,
        moduleId: moduleId,
        importance,
        examRelevance,
        difficulty,
        date: todayStr,
        startTime: null,
        duration: parsed.params?.duration || 45,
        type: 'LEARN',
        priorityScore: 0.90,
        reason: "Added to today's schedule",
        status: 'pending'
      });

      // Resequence breaks so there is exactly one break in between each session
      await resequenceDayBreaks(req.userId, todayStr);

      const remainingTasks = await Task.find({ userId: req.userId, date: todayStr }).sort({ startTime: 1 });
      return res.json({
        message: `Added a study session for ${topicName} (${chosenSubject ? chosenSubject.name : 'General'}). Breaks have been updated in between.`,
        intentSource: parsed.source,
        tasks: remainingTasks
      });
    }

    return res.status(200).json({
      intent: 'UNKNOWN',
      message: "I couldn't confidently understand that request. Try phrasing like \"I'm tired today\" or \"move Math to tomorrow\".",
      intentSource: parsed.source
    });
  } catch (err) {
    next(err);
  }
};
