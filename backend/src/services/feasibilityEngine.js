// ============================================================================
// FEASIBILITY ENGINE
// ----------------------------------------------------------------------------
// Runs BEFORE generating a plan to mathematically determine whether the
// student's targetGoal and required syllabus work can fit within the time
// available before the exam.
//
// States:
// - ON_TRACK   (required <= 80% of available)
// - TIGHT      (80% < required <= 105% of available)
// - AT_RISK    (105% < required <= 130% of available)
// - EMERGENCY  (> 130% of available, or exam <= 2 days with required > available)
// ============================================================================

const { diffDays } = require('../utils/dateUtils');

/**
 * Evaluates feasibility of the study plan given syllabus data, targetGoal, and capacity.
 *
 * @param {Object} params
 * @param {Array} params.subjects - Enrolled subjects with modules, concepts, and progress
 * @param {Number} params.dailyCapacityMinutes - Base daily study capacity (min)
 * @param {Date} [params.today=new Date()] - Reference date
 * @param {Number} [params.planDays=14] - Horizon in days if no exam date specified
 * @returns {Object} Feasibility assessment details
 */
function assessFeasibility({ subjects, dailyCapacityMinutes = 120, today = new Date(), planDays = 14 }) {
  let totalRequiredMinutes = 0;
  let earliestExamDays = null;
  const skippedConcepts = [];
  const allEligibleConcepts = [];

  subjects.forEach((subj) => {
    const isSyllabus = Array.isArray(subj.modules) && subj.modules.length > 0;
    const examDate = subj.examDate || subj.studentSubject?.examDate || null;
    const targetGoal = (subj.targetGoal || subj.studentSubject?.targetGoal || 'SCORE_WELL').toUpperCase();

    if (examDate) {
      const days = Math.max(diffDays(today, new Date(examDate)), 0);
      if (earliestExamDays === null || days < earliestExamDays) {
        earliestExamDays = days;
      }
    }

    if (isSyllabus) {
      subj.modules.forEach((mod) => {
        (mod.concepts || []).forEach((concept) => {
          const prog = (subj.progressMap && (subj.progressMap[concept._id?.toString()] || subj.progressMap[concept.name])) ||
                       (Array.isArray(subj.progress) && subj.progress.find((p) => p.conceptId?.toString() === concept._id?.toString())) ||
                       concept.progress;

          const status = prog?.status || 'not_started';
          if (status === 'mastered' || status === 'completed') {
            return; // Already completed, 0 additional required minutes
          }

          const estMinutes = concept.estimatedStudyMinutes || 60;
          const relevance = concept.examRelevance ?? 2;
          const importance = concept.importance ?? 2;

          // Goal-aware filtering
          if (targetGoal === 'PASS') {
            // PASS: Only high examRelevance + high importance, weak areas, and prerequisite concepts
            const isPrereq = (mod.order === 1 && concept.order === 1);
            const isHighValue = relevance >= 2 || importance >= 2;

            if (!isHighValue && !isPrereq) {
              skippedConcepts.push({
                subjectId: subj._id,
                subjectName: subj.name,
                conceptId: concept._id,
                conceptName: concept.name,
                moduleName: mod.name,
                estimatedMinutes: estMinutes,
                reason: 'Skipped under PASS goal: low exam relevance and low importance'
              });
              return; // Do not count into required minutes for PASS
            }
          }

          totalRequiredMinutes += estMinutes;
          allEligibleConcepts.push({
            subjectId: subj._id,
            subjectName: subj.name,
            conceptId: concept._id,
            conceptName: concept.name,
            moduleName: mod.name,
            estimatedMinutes: estMinutes,
            importance,
            examRelevance: relevance,
            difficulty: concept.difficulty ?? 2,
            confidence: prog?.confidence || subj.confidence || subj.studentSubject?.confidence || 3,
            status,
            reviewStage: prog?.reviewStage || 0,
            targetGoal,
            examDays: earliestExamDays
          });
        });
      });
    } else if (Array.isArray(subj.topics)) {
      // Legacy topic-based subject
      const remainingTopics = subj.topics.filter((t) => t.status !== 'mastered');
      totalRequiredMinutes += remainingTopics.length * 90;
    }
  });

  // Effective days horizon: respect requested planDays if provided or earliestExamDays
  const effectiveDays = (earliestExamDays !== null && planDays)
    ? Math.min(earliestExamDays, planDays)
    : (earliestExamDays !== null ? earliestExamDays : (planDays || 14));
  const totalAvailableMinutes = Math.max(effectiveDays, 1) * dailyCapacityMinutes;

  const ratio = totalRequiredMinutes / Math.max(totalAvailableMinutes, 1);
  const shortfallMinutes = Math.max(totalRequiredMinutes - totalAvailableMinutes, 0);

  const requiredHours = Math.round((totalRequiredMinutes / 60) * 10) / 10;
  const availableHours = Math.round((totalAvailableMinutes / 60) * 10) / 10;
  const shortfallHours = Math.round((shortfallMinutes / 60) * 10) / 10;

  let status;
  let trafficLight;

  if (ratio <= 0.80) {
    status = 'ON_TRACK';
    trafficLight = 'green';
  } else if (ratio <= 1.05) {
    status = 'TIGHT';
    trafficLight = 'yellow';
  } else if (ratio <= 1.30 && effectiveDays > 2) {
    status = 'AT_RISK';
    trafficLight = 'red';
  } else {
    status = 'EMERGENCY';
    trafficLight = 'red';
  }

  // Determine postponed concepts if there is a shortfall
  const postponedConcepts = [];
  if (shortfallMinutes > 0 && allEligibleConcepts.length > 0) {
    // Sort eligible concepts ascending by priority (lowest importance/relevance first)
    const sortedLowPriority = [...allEligibleConcepts].sort((a, b) => {
      const scoreA = a.examRelevance * 2 + a.importance * 2 - a.difficulty;
      const scoreB = b.examRelevance * 2 + b.importance * 2 - b.difficulty;
      return scoreA - scoreB;
    });

    let accumulatedPostponedMin = 0;
    for (const c of sortedLowPriority) {
      if (accumulatedPostponedMin >= shortfallMinutes) break;
      postponedConcepts.push({
        conceptId: c.conceptId,
        conceptName: c.conceptName,
        moduleName: c.moduleName,
        estimatedMinutes: c.estimatedMinutes,
        reason: 'Postponed: outside available time capacity before exam deadline'
      });
      accumulatedPostponedMin += c.estimatedMinutes;
    }
  }

  // Build explicit human-readable explanation
  let message;
  if (status === 'ON_TRACK') {
    message = earliestExamDays === null
      ? 'No upcoming exams — steady, low-pressure pace.'
      : `On track. Your required syllabus (${requiredHours}h) comfortably fits within available study time (${availableHours}h).`;
  } else {
    message = `Required: ${requiredHours}h, Available: ${availableHours}h, Shortage: ${shortfallHours}h.`;
    if (status === 'TIGHT') {
      message += ' Plan is tight with little buffer for delays. Consider adding daily study time.';
    } else if (status === 'AT_RISK') {
      message += ` Plan is at risk. Approximately ${postponedConcepts.length} concept(s) cannot be fully completed before exam.`;
    } else if (status === 'EMERGENCY') {
      message += ` Critical shortfall. Significant syllabus scope must be trimmed or daily capacity sharply increased.`;
    }
  }

  return {
    status,
    trafficLight,
    totalRequiredMinutes,
    totalAvailableMinutes,
    shortfallMinutes,
    shortfallHours,
    requiredHours,
    availableHours,
    ratio: Number(ratio.toFixed(2)),
    earliestExamDays,
    emergencyMode: status === 'EMERGENCY',
    message,
    skippedConcepts,
    postponedConcepts,
    allEligibleConcepts
  };
}

/**
 * Builds an Emergency Mode plan dataset when runway is critically short.
 * Selects only the highest-value concepts that fit the available runway,
 * explicitly documents what is skipped, and reserves remaining buffer for revision.
 */
function buildEmergencyPlanDataset({ subjects, feasibility }) {
  const { totalAvailableMinutes, availableHours, requiredHours, allEligibleConcepts = [] } = feasibility;

  // Check if any concepts across enrolled subjects are in progress/learned and due for revision
  const hasRevisionConcepts = subjects.some((s) => {
    if (!s.progressMap) return false;
    return Object.values(s.progressMap).some((p) => p.status === 'learned' || p.status === 'needs_revision');
  });

  // Rank all eligible concepts by priority score (high relevance & importance, high weakness first)
  const ranked = [...allEligibleConcepts].map((c) => {
    const relNorm = (c.examRelevance || 2) / 3;
    const impNorm = (c.importance || 2) / 3;
    const weakNorm = (6 - (c.confidence || 3)) / 5;
    const priorityScore = Math.round((0.40 * relNorm + 0.35 * impNorm + 0.25 * weakNorm) * 100) / 100;
    return { ...c, priorityScore };
  }).sort((a, b) => b.priorityScore - a.priorityScore);

  // If revision is needed, reserve ~15-20% of capacity for revision/practice sessions;
  // otherwise, use up to 100% of available capacity for high-value new concepts.
  const conceptBudget = hasRevisionConcepts
    ? Math.max(Math.floor(totalAvailableMinutes * 0.85), 30)
    : totalAvailableMinutes;

  let allocatedMinutes = 0;
  const selectedConceptIds = new Set();
  const selectedConcepts = [];
  const emergencySkippedConcepts = [];

  for (const c of ranked) {
    const est = c.estimatedMinutes || 60;
    if (allocatedMinutes + est <= conceptBudget || selectedConcepts.length === 0) {
      selectedConceptIds.add(c.conceptId.toString());
      selectedConcepts.push(c);
      allocatedMinutes += est;
    } else {
      emergencySkippedConcepts.push({
        subjectId: c.subjectId,
        subjectName: c.subjectName,
        conceptId: c.conceptId,
        conceptName: c.conceptName,
        moduleName: c.moduleName,
        estimatedMinutes: est,
        importance: c.importance,
        examRelevance: c.examRelevance,
        priorityScore: c.priorityScore,
        reason: `Skipped in Emergency Mode: time deficit before exam requires focusing solely on highest-yield topics (importance: ${c.importance}/3, exam relevance: ${c.examRelevance}/3)`
      });
    }
  }

  const remainingCapacity = Math.max(totalAvailableMinutes - allocatedMinutes, 0);
  const revisionBufferMinutes = hasRevisionConcepts ? remainingCapacity : 0;

  const emergencyMessage = `Your available time is ${availableHours} hours, while full preparation requires approximately ${requiredHours} hours. I've created an ${availableHours}-hour high-priority plan focusing on the highest-value topics.`;

  // Prune subjects so that only selected concepts (or revision concepts) are fed to scheduling engine
  const prunedSubjects = subjects.map((s) => {
    if (!Array.isArray(s.modules)) return s;
    const prunedModules = s.modules.map((m) => ({
      ...m,
      concepts: (m.concepts || []).filter((c) => {
        // Keep if selected for emergency study
        if (selectedConceptIds.has(c._id.toString())) return true;
        // Also keep if already learned/in progress for revision if capacity remains
        const prog = s.progressMap?.[c._id.toString()];
        return prog && (prog.status === 'learned' || prog.status === 'needs_revision');
      })
    })).filter((m) => m.concepts.length > 0);

    return {
      ...s,
      modules: prunedModules
    };
  });

  return {
    emergencyMessage,
    selectedConcepts,
    skippedConcepts: emergencySkippedConcepts,
    prunedSubjects,
    conceptBudgetMinutes: allocatedMinutes,
    revisionBufferMinutes,
    hasRevisionConcepts
  };
}

module.exports = {
  assessFeasibility,
  buildEmergencyPlanDataset
};
