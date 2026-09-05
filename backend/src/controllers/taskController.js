const Task = require('../models/Task');
const Subject = require('../models/Subject');
const StudyPlan = require('../models/StudyPlan');
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

    const subject = await Subject.findOne({ _id: task.subjectId, userId: req.userId });
    let updatedTopic = null;

    if (subject) {
      const topic = subject.topics.find((t) => t.name === task.topic);
      if (topic) {
        const feedback = req.body.feedback || 'normal';

        if (task.type === 'LEARN') {
          topic.status = 'learned';
          topic.lastStudiedDate = new Date();
          topic.reviewStage = 0;
          topic.revisionCount = 0;
        } else if (task.type === 'REVISE' || task.type === 'MOCK_TEST') {
          topic.lastStudiedDate = new Date();
          topic.revisionCount = (topic.revisionCount || 0) + 1;

          // 'difficult' -> review again soon (don't advance the stage)
          // 'normal'    -> advance one stage
          // 'easy'      -> skip ahead two stages
          let stageChange = 1;
          if (feedback === 'difficult') stageChange = 0;
          if (feedback === 'easy') stageChange = 2;
          topic.reviewStage = Math.min((topic.reviewStage || 0) + stageChange, 3);

          topic.status = 'needs_revision';
          if (topic.revisionCount >= 3 && topic.reviewStage >= 3) {
            topic.status = 'mastered';
          }
        }
        updatedTopic = topic;
        await subject.save();
      }
    }

    res.json({ task, updatedTopic });
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

    const impacted = await redistributeMissedTask({
      userId: req.userId,
      planId: task.planId,
      missedTask: task,
      dailyCapacityMinutes
    });

    res.json({
      message: impacted.length
        ? `No worries — this session has been rebalanced across the next ${impacted.length} day(s).`
        : 'Marked as missed. No spare capacity in the next few days to reschedule it automatically.',
      missedTask: task,
      impacted
    });
  } catch (err) {
    next(err);
  }
};
