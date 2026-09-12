const Task = require('../models/Task');
const Concept = require('../models/Concept');
const StudyPlan = require('../models/StudyPlan');
const { updateProgress } = require('../services/progressService');
const { redistributeMissedTask } = require('../services/adaptiveEngine');

// POST /api/tasks/:id/complete   { feedback?: 'easy' | 'normal' | 'difficult' }
exports.completeTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    task.status = 'completed';
    await task.save();

    if (task.type === 'BREAK' || !task.subjectId) {
      return res.json({ task });
    }

    const feedback = req.body.feedback || 'normal';

    // Resolve conceptId from task or by topic name
    let conceptId = task.conceptId;
    if (!conceptId && task.topic) {
      const c = await Concept.findOne({ name: task.topic });
      if (c) conceptId = c._id;
    }

    // Single source of truth: progressService handles all StudentProgress writes
    let updatedProgress = null;
    if (conceptId) {
      updatedProgress = await updateProgress(req.userId, conceptId, {
        taskType: task.type,
        feedback
      });
    }

    res.json({ task, updatedProgress });
  } catch (err) {
    next(err);
  }
};

// POST /api/tasks/:id/miss
exports.missTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.type === 'BREAK') return res.status(400).json({ error: 'Cannot mark a break as missed' });

    task.status = 'missed';
    await task.save();

    const plan = await StudyPlan.findOne({ userId: req.userId }).sort({ createdAt: -1 });
    const dailyCapacityMinutes = plan ? plan.dailyCapacityMinutes : 120;

    const redistribution = await redistributeMissedTask({
      userId: req.userId,
      planId: task.planId,
      missedTask: task,
      dailyCapacityMinutes
    });

    const impacted = redistribution.impacted || (Array.isArray(redistribution) ? redistribution : []);
    const postponed = redistribution.postponed || [];
    const message = redistribution.message || (impacted.length
      ? `No worries — this session has been rebalanced across the next ${impacted.length} day(s).`
      : 'Marked as missed. No spare capacity in the next few days to reschedule it automatically.');

    res.json({
      message,
      missedTask: task,
      impacted,
      postponed
    });
  } catch (err) {
    next(err);
  }
};
