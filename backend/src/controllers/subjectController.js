const Subject = require('../models/Subject');

exports.createSubject = async (req, res, next) => {
  try {
    const { name, examDate, difficulty, confidence, topics } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (topics !== undefined && !Array.isArray(topics)) {
      return res.status(400).json({ error: 'topics must be an array of strings if provided' });
    }

    const subject = await Subject.create({
      userId: req.userId,
      name,
      examDate: examDate || null,
      difficulty: difficulty || 3,
      confidence: confidence || 3,
      topics: (topics || []).map((t) => ({ name: t, status: 'not_started', reviewStage: 0, revisionCount: 0 }))
    });

    res.status(201).json(subject);
  } catch (err) {
    next(err);
  }
};

exports.getSubjects = async (req, res, next) => {
  try {
    const subjects = await Subject.find({ userId: req.userId }).sort({ createdAt: 1 });
    res.json(subjects);
  } catch (err) {
    next(err);
  }
};

exports.updateSubject = async (req, res, next) => {
  try {
    const { name, examDate, difficulty, confidence, addTopics } = req.body;
    const subject = await Subject.findOne({ _id: req.params.id, userId: req.userId });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    if (name !== undefined) subject.name = name;
    if (examDate !== undefined) subject.examDate = examDate;
    if (difficulty !== undefined) subject.difficulty = difficulty;
    if (confidence !== undefined) subject.confidence = confidence;
    if (Array.isArray(addTopics)) {
      addTopics.forEach((t) => subject.topics.push({ name: t, status: 'not_started', reviewStage: 0, revisionCount: 0 }));
    }

    await subject.save();
    res.json(subject);
  } catch (err) {
    next(err);
  }
};

// PUT /api/subjects/:id/topics/:topicName   { status }
// Manual override so a student can correct drift in the Subjects screen.
// The "intended" way a topic's status changes is by completing a scheduled
// task (see taskController.completeTask), which also updates reviewStage/
// lastStudiedDate for spaced repetition. This endpoint only touches status.
exports.updateTopicStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['not_started', 'learned', 'needs_revision', 'mastered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` });
    }

    const subject = await Subject.findOne({ _id: req.params.id, userId: req.userId });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const topic = subject.topics.find((t) => t.name === req.params.topicName);
    if (!topic) return res.status(404).json({ error: 'Topic not found on this subject' });

    topic.status = status;
    await subject.save();
    res.json(subject);
  } catch (err) {
    next(err);
  }
};

exports.deleteSubject = async (req, res, next) => {
  try {
    const result = await Subject.deleteOne({ _id: req.params.id, userId: req.userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Subject not found' });
    res.json({ message: 'Subject deleted' });
  } catch (err) {
    next(err);
  }
};
