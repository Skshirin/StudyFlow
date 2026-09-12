const Subject = require('../models/Subject');
const LegacySubject = require('../models/LegacySubject');
const StudentSubject = require('../models/StudentSubject');
const Module = require('../models/Module');
const Concept = require('../models/Concept');
const StudentProgress = require('../models/StudentProgress');

/**
 * Loads a student's subjects with full syllabus modules, concepts, and progress records.
 * Falls back to legacy Subject records if no StudentSubject enrollment exists.
 */
async function getStudentSyllabusSubjects(userId) {
  const studentSubjects = await StudentSubject.find({ userId }).populate('subjectId').lean();

  if (studentSubjects.length > 0) {
    const result = [];
    for (const ss of studentSubjects) {
      if (!ss.subjectId) continue;
      const subjectDoc = ss.subjectId;

      const modules = await Module.find({ subjectId: subjectDoc._id }).sort({ order: 1 }).lean();
      const moduleIds = modules.map((m) => m._id);

      const concepts = await Concept.find({ moduleId: { $in: moduleIds } }).sort({ order: 1 }).lean();
      const conceptIds = concepts.map((c) => c._id);

      const progressDocs = await StudentProgress.find({ userId, conceptId: { $in: conceptIds } }).lean();

      const progressMap = {};
      progressDocs.forEach((p) => {
        progressMap[p.conceptId.toString()] = p;
      });

      let completedConceptsCount = 0;
      const conceptsByModule = {};
      concepts.forEach((c) => {
        const mid = c.moduleId.toString();
        if (!conceptsByModule[mid]) conceptsByModule[mid] = [];
        const prog = progressMap[c._id.toString()];
        const status = prog?.status || 'not_started';
        if (status === 'mastered') {
          completedConceptsCount++;
        }
        conceptsByModule[mid].push({
          ...c,
          status,
          reviewStage: prog?.reviewStage || 0,
          progress: prog
        });
      });

      const populatedModules = modules.map((m) => ({
        ...m,
        concepts: conceptsByModule[m._id.toString()] || []
      }));

      result.push({
        _id: subjectDoc._id,
        name: subjectDoc.name,
        code: subjectDoc.code,
        credits: subjectDoc.credits,
        studentSubject: ss,
        examDate: ss.examDate,
        confidence: ss.confidence,
        targetGoal: ss.targetGoal || 'SCORE_WELL',
        availableHours: ss.availableHours,
        modules: populatedModules,
        completedConcepts: completedConceptsCount,
        totalConcepts: concepts.length,
        progressMap
      });
    }
    return result;
  }

  // Fallback to legacy Subject models (with embedded topics) if present
  const legacy = await LegacySubject.find({ userId }).lean();
  if (legacy.length > 0) return legacy;

  return await Subject.find({ userId }).lean();
}

module.exports = {
  getStudentSyllabusSubjects
};
