const Subject = require('../models/Subject');
const LegacySubject = require('../models/LegacySubject');
const StudentSubject = require('../models/StudentSubject');
const Module = require('../models/Module');
const Concept = require('../models/Concept');
const StudentProgress = require('../models/StudentProgress');
const { getStudentSyllabusSubjects } = require('../services/syllabusService');

/**
 * GET /api/subjects/catalog
 * Returns the official syllabus catalog (shared courses seeded in DB, e.g. CSC701, CSC702, CSDC7013, CSDC7022).
 */
exports.getCatalog = async (req, res, next) => {
  try {
    const subjects = await Subject.find({ code: { $exists: true, $ne: null } }).sort({ code: 1 }).lean();
    const results = await Promise.all(
      subjects.map(async (s) => {
        const modules = await Module.find({ subjectId: s._id }).sort({ order: 1 }).lean();
        const moduleIds = modules.map((m) => m._id);
        const conceptCount = await Concept.countDocuments({ moduleId: { $in: moduleIds } });
        return {
          _id: s._id,
          code: s.code,
          name: s.name,
          credits: s.credits,
          moduleCount: modules.length,
          conceptCount
        };
      })
    );
    res.json(results);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/subjects/enroll
 * Enrolls the authenticated student in one or more syllabus subjects.
 */
exports.enrollSubjects = async (req, res, next) => {
  try {
    const { subjects } = req.body; // array of { subjectId, examDate, targetGoal, availableHours, confidence }
    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ error: 'subjects array is required' });
    }

    const enrolled = [];
    for (const item of subjects) {
      const subjectDoc = await Subject.findById(item.subjectId);
      if (!subjectDoc) continue;

      let ss = await StudentSubject.findOne({ userId: req.userId, subjectId: subjectDoc._id });
      if (!ss) {
        ss = new StudentSubject({
          userId: req.userId,
          subjectId: subjectDoc._id,
          examDate: item.examDate ? new Date(item.examDate) : null,
          targetGoal: item.targetGoal || 'SCORE_WELL',
          availableHours: item.availableHours || 30,
          confidence: item.confidence || 3,
          status: 'active'
        });
      } else {
        if (item.examDate !== undefined) ss.examDate = item.examDate ? new Date(item.examDate) : null;
        if (item.targetGoal) ss.targetGoal = item.targetGoal;
        if (item.availableHours) ss.availableHours = item.availableHours;
        if (item.confidence) ss.confidence = item.confidence;
      }
      await ss.save();
      enrolled.push(ss);

      // Initialize StudentProgress for all concepts under this subject if not already existing
      const modules = await Module.find({ subjectId: subjectDoc._id });
      const moduleIds = modules.map((m) => m._id);
      const concepts = await Concept.find({ moduleId: { $in: moduleIds } });
      for (const c of concepts) {
        const exists = await StudentProgress.findOne({ userId: req.userId, conceptId: c._id });
        if (!exists) {
          await StudentProgress.create({
            userId: req.userId,
            conceptId: c._id,
            status: 'not_started',
            reviewStage: 0,
            revisionCount: 0
          });
        }
      }
    }

    res.status(201).json({ success: true, enrolledCount: enrolled.length, enrolled });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/subjects
 * Returns student's enrolled syllabus subjects with modules, concepts, and progress.
 */
exports.getSubjects = async (req, res, next) => {
  try {
    const subjects = await getStudentSyllabusSubjects(req.userId);
    res.json(subjects);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/subjects/concepts/:conceptId/progress
 * Updates concept status (e.g. 'mastered', 'learned', 'not_started') in StudentProgress.
 * Uses the same progressService as task completion — single source of truth.
 */
exports.updateConceptProgress = async (req, res, next) => {
  try {
    const { conceptId } = req.params;
    const { status } = req.body;
    const validStatuses = ['not_started', 'in_progress', 'completed', 'learned', 'needs_revision', 'mastered'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` });
    }

    const { updateProgress } = require('../services/progressService');
    const progress = await updateProgress(req.userId, conceptId, { manualStatus: status || 'not_started' });
    res.json(progress);
  } catch (err) {
    next(err);
  }
};

// Legacy fallback methods (preserved for safety)
exports.createSubject = async (req, res, next) => {
  try {
    const { name, examDate, difficulty, confidence, topics } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const legacy = await LegacySubject.create({
      userId: req.userId,
      name,
      examDate: examDate || null,
      difficulty: difficulty || 3,
      confidence: confidence || 3,
      topics: (topics || []).map((t) => ({ name: t, status: 'not_started', reviewStage: 0, revisionCount: 0 }))
    });
    res.status(201).json(legacy);
  } catch (err) {
    next(err);
  }
};

exports.updateSubject = async (req, res, next) => {
  try {
    const { name, examDate, difficulty, confidence, addTopics } = req.body;
    // Check StudentSubject first
    const ss = await StudentSubject.findOne({ _id: req.params.id, userId: req.userId });
    if (ss) {
      if (examDate !== undefined) ss.examDate = examDate ? new Date(examDate) : null;
      if (confidence !== undefined) ss.confidence = confidence;
      await ss.save();
      return res.json(ss);
    }
    const legacy = await LegacySubject.findOne({ _id: req.params.id, userId: req.userId });
    if (legacy) {
      if (name !== undefined) legacy.name = name;
      if (examDate !== undefined) legacy.examDate = examDate;
      if (difficulty !== undefined) legacy.difficulty = difficulty;
      if (confidence !== undefined) legacy.confidence = confidence;
      if (Array.isArray(addTopics)) {
        addTopics.forEach((t) => legacy.topics.push({ name: t, status: 'not_started', reviewStage: 0, revisionCount: 0 }));
      }
      await legacy.save();
      return res.json(legacy);
    }
    res.status(404).json({ error: 'Subject not found' });
  } catch (err) {
    next(err);
  }
};

exports.updateTopicStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const legacy = await LegacySubject.findOne({ _id: req.params.id, userId: req.userId });
    if (!legacy) return res.status(404).json({ error: 'Subject not found' });
    const topic = legacy.topics.find((t) => t.name === req.params.topicName);
    if (!topic) return res.status(404).json({ error: 'Topic not found on this subject' });
    topic.status = status;
    await legacy.save();
    res.json(legacy);
  } catch (err) {
    next(err);
  }
};

exports.deleteSubject = async (req, res, next) => {
  try {
    const r1 = await StudentSubject.deleteOne({ _id: req.params.id, userId: req.userId });
    const r2 = await LegacySubject.deleteOne({ _id: req.params.id, userId: req.userId });
    if (r1.deletedCount === 0 && r2.deletedCount === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    res.json({ message: 'Subject deleted' });
  } catch (err) {
    next(err);
  }
};
