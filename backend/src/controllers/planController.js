const Subject = require('../models/Subject');
const StudyPlan = require('../models/StudyPlan');
const Task = require('../models/Task');
const EnergyLog = require('../models/EnergyLog');

const { generateDailyTasks } = require('../services/schedulingEngine');
const { computePlanHealth } = require('../services/planHealth');
const { redistributeMissedTask } = require('../services/adaptiveEngine');
const { parseIntent } = require('../services/intentParser');
const { parseIntentWithAI } = require('../services/aiService');
const { toDateStr, addDays, diffDays } = require('../utils/dateUtils');

// POST /api/plan/generate
exports.generatePlan = async (req, res, next) => {
  try {
    const { dailyCapacityMinutes, timePreference, days } = req.body;
    if (!dailyCapacityMinutes) {
      return res.status(400).json({ error: 'dailyCapacityMinutes is required' });
    }

    const subjects = await Subject.find({ userId: req.userId });
    if (subjects.length === 0) {
      return res.status(400).json({ error: 'Add at least one subject before generating a plan' });
    }

    const today = new Date();
    let planDays = days;
    if (!planDays) {
      const examDeadlines = subjects.filter((s) => s.examDate).map((s) => diffDays(today, new Date(s.examDate)));
      planDays = examDeadlines.length ? Math.max(...examDeadlines) + 1 : 14;
    }
    planDays = Math.min(Math.max(planDays, 7), 30); // clamp to a sane range

    const startDate = toDateStr(today);
    const endDate = toDateStr(addDays(today, planDays - 1));

    const plan = await StudyPlan.create({
      userId: req.userId,
      startDate,
      endDate,
      dailyCapacityMinutes,
      timePreference: timePreference || 'flexible'
    });

    const allTasks = [];
    for (let i = 0; i < planDays; i++) {
      const dateStr = toDateStr(addDays(today, i));
      const { tasks } = generateDailyTasks({
        subjects,
        dateStr,
        dailyCapacityMinutes,
        timePreference: timePreference || 'flexible',
        energyLevel: 'normal'
      });
      tasks.forEach((t) => allTasks.push({ ...t, userId: req.userId, planId: plan._id }));
    }

    if (allTasks.length > 0) await Task.insertMany(allTasks);

    res.status(201).json({
      plan,
      daysGenerated: planDays,
      tasksGenerated: allTasks.length
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/plan/today
exports.getToday = async (req, res, next) => {
  try {
    const todayStr = toDateStr(new Date());
    const [tasks, subjects, plan] = await Promise.all([
      Task.find({ userId: req.userId, date: todayStr }).sort({ startTime: 1 }),
      Subject.find({ userId: req.userId }),
      StudyPlan.findOne({ userId: req.userId }).sort({ createdAt: -1 })
    ]);

    const dailyCapacityMinutes = plan ? plan.dailyCapacityMinutes : 120;
    const planHealth = computePlanHealth(subjects, new Date(), dailyCapacityMinutes);

    const plannedMinutes = tasks.filter((t) => t.type !== 'BREAK').reduce((s, t) => s + t.duration, 0);
    const sessionsCount = tasks.filter((t) => t.type !== 'BREAK').length;

    res.json({
      date: todayStr,
      tasks,
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
      Subject.find({ userId: req.userId }),
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

    let parsed = parseIntent(text);
    if (!parsed) {
      const aiResult = await parseIntentWithAI(text);
      parsed = { intent: aiResult.intent, params: aiResult.params, source: aiResult.source };
    }

    const todayStr = toDateStr(new Date());
    const plan = await StudyPlan.findOne({ userId: req.userId }).sort({ createdAt: -1 });
    const dailyCapacityMinutes = plan ? plan.dailyCapacityMinutes : 120;

    if (parsed.intent === 'REDUCE_WORKLOAD') {
      const percent = parsed.params.percent || 30;
      const todaysTasks = await Task.find({
        userId: req.userId,
        date: todayStr,
        type: { $ne: 'BREAK' },
        status: 'pending'
      }).sort({ priorityScore: 1 }); // lowest priority first — these get dropped first

      const totalMinutes = todaysTasks.reduce((s, t) => s + t.duration, 0);
      const targetReduction = Math.round((totalMinutes * percent) / 100);

      let removed = 0;
      const skippedIds = [];
      for (const t of todaysTasks) {
        if (removed >= targetReduction) break;
        skippedIds.push(t._id);
        removed += t.duration;
      }
      if (skippedIds.length) {
        await Task.updateMany({ _id: { $in: skippedIds } }, { status: 'skipped', reason: 'Skipped to lighten today\'s workload' });
      }

      const remainingTasks = await Task.find({ userId: req.userId, date: todayStr }).sort({ startTime: 1 });
      return res.json({
        message: `Lightened today's plan by ~${percent}% (${removed} minutes freed up).`,
        intentSource: parsed.source,
        tasks: remainingTasks
      });
    }

    if (parsed.intent === 'BLOCK_TODAY') {
      const todaysTasks = await Task.find({
        userId: req.userId,
        date: todayStr,
        type: { $ne: 'BREAK' },
        status: 'pending'
      });

      const impactedAll = [];
      for (const t of todaysTasks) {
        t.status = 'missed';
        await t.save();
        const impacted = await redistributeMissedTask({
          userId: req.userId,
          planId: t.planId,
          missedTask: t,
          dailyCapacityMinutes
        });
        impactedAll.push(...impacted);
      }

      return res.json({
        message: `No problem — today's ${todaysTasks.length} session(s) have been rebalanced across the next few days.`,
        intentSource: parsed.source,
        impacted: impactedAll
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

      return res.json({
        message: `Moved ${matches.length} session(s) of "${subjectNameRaw}" to ${targetDate}. (Note: this doesn't yet re-check ${targetDate}'s capacity — a good next improvement.)`,
        intentSource: parsed.source
      });
    }

    return res.status(200).json({
      message: "I couldn't confidently understand that request. Try phrasing like \"I'm tired today\" or \"move Math to tomorrow\".",
      intentSource: parsed.source
    });
  } catch (err) {
    next(err);
  }
};
