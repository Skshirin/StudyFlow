// ============================================================================
// SCHEDULING ENGINE (V2.0 — Syllabus-Aware & Legacy Compatible)
// ----------------------------------------------------------------------------
// This is the deterministic core of the whole product. No AI call happens
// anywhere in this file. Given a student's subjects (either V2 syllabus-backed
// with modules/concepts/progress or V1 embedded topics) and daily capacity,
// it decides: which topics/concepts to study today, in what order, for how long,
// and WHY (a plain-English reason with syllabus facts, generated from numbers).
// ============================================================================

const { diffDays, minutesToHHMM } = require('../utils/dateUtils');

const SPACED_INTERVALS = [1, 3, 7, 14]; // Spaced repetition intervals (days)

/**
 * Computes an adaptive spaced-repetition interval respecting StudentSubject.examDate.
 *
 * Rules:
 * 1. Standard base intervals: [1, 3, 7, 14] days based on reviewStage (0-3).
 * 2. If examDate is very close (<= 3 days out):
 *    Collapses remaining revisions into whatever days are left before the exam
 *    (e.g., collapses to 1-2 days, no "Day 14" waiting).
 * 3. If a concept's next scheduled revision day would fall after examDate:
 *    Pulls it earlier instead of skipping it silently, compressing the interval
 *    so revision completes before the exam.
 *
 * @param {Object} params
 * @param {Number} [params.reviewStage=0] - Current review stage (0-3)
 * @param {Number|null} [params.examDaysLeft=null] - Days until exam from targetDate
 * @param {Number|null} [params.daysSinceStudied=null] - Days elapsed since last study/review
 * @returns {{ interval: Number, isAccelerated: Boolean }}
 */
function getAdaptiveInterval({ reviewStage = 0, examDaysLeft = null, daysSinceStudied = null }) {
  const baseInterval = SPACED_INTERVALS[Math.min(reviewStage, SPACED_INTERVALS.length - 1)];

  if (examDaysLeft === null || examDaysLeft <= 0) {
    return { interval: baseInterval, isAccelerated: false };
  }

  // 1. If exam is very close (<= 3 days out), collapse intervals completely
  if (examDaysLeft <= 3) {
    // Under 3 days left: collapse remaining revisions into whatever days are left
    const collapsed = Math.max(1, Math.min(baseInterval, examDaysLeft === 3 && reviewStage <= 1 ? 2 : 1));
    const isAccelerated = collapsed < baseInterval;
    return { interval: collapsed, isAccelerated };
  }

  // 2. If next standard revision day would fall after examDate, pull it earlier
  if (daysSinceStudied !== null) {
    const daysUntilStandardDue = baseInterval - daysSinceStudied;
    if (daysUntilStandardDue >= examDaysLeft) {
      // Standard interval would fall on or after examDate; compress into remaining runway
      const remainingRunway = Math.max(1, examDaysLeft - 1);
      const stagesLeft = Math.max(1, 4 - reviewStage);
      const compressed = Math.max(1, Math.floor(remainingRunway / stagesLeft));
      const effectiveInterval = Math.min(baseInterval, compressed);
      return { interval: effectiveInterval, isAccelerated: true };
    }
  }

  // Also check if base interval itself exceeds remaining pre-exam days
  if (baseInterval >= examDaysLeft) {
    const compressed = Math.max(1, Math.floor(examDaysLeft / 2));
    return { interval: compressed, isAccelerated: true };
  }

  return { interval: baseInterval, isAccelerated: false };
}

const DEFAULT_BLOCK_MINUTES = 45;
const DEFAULT_BREAK_MINUTES = 15;
const MAX_BLOCKS_PER_SUBJECT_FIRST_PASS = 2; // Keeps a day varied instead of one subject hogging it

// Weights for normalized priority scoring
const SYLLABUS_WEIGHTS = {
  examUrgency: 0.25,
  examRelevance: 0.20,
  importance: 0.20,
  weakness: 0.20,
  remainingWork: 0.15
};

const LEGACY_WEIGHTS = {
  examUrgency: 0.40,
  difficulty: 0.20,
  weakness: 0.25,
  remainingWork: 0.15
};

const ENERGY_CAPACITY_MULTIPLIER = { high: 1.15, normal: 1, low: 0.7 };

/**
 * Computes a multiplier based on StudentSubject.targetGoal (PASS, SCORE_WELL, TOP).
 *
 * - PASS: High examRelevance & importance, weak areas first, prerequisite concepts. Zero for low-value topics.
 * - SCORE_WELL: High & medium importance/relevance boosted, revision layered in.
 * - TOP: Comprehensive syllabus coverage (no filtering).
 *
 * @param {String} targetGoal - 'PASS' | 'SCORE_WELL' | 'TOP'
 * @param {Object} candidate - Candidate item containing concept, weakness, moduleInfo, type
 * @returns {Number} Multiplier
 */
function computeGoalWeight(targetGoal, candidate) {
  if (!targetGoal) return 1.0;
  const goal = targetGoal.toUpperCase();
  const concept = candidate.concept;
  if (!concept) return 1.0;

  const relevance = concept.examRelevance ?? 2;
  const importance = concept.importance ?? 2;
  const isWeak = (candidate.weakness || 0) >= 4;
  const isPrereq = (candidate.moduleInfo?.order === 1 && concept.order === 1);

  if (goal === 'PASS') {
    // PASS: low-value concepts receive 0 multiplier — stricter than before
    if (relevance < 2 && importance < 2 && !isPrereq) {
      return 0.0;
    }
    let weight = 1.0;
    if (relevance === 3 && importance === 3) weight *= 1.5;
    else if (relevance === 3 || importance === 3) weight *= 1.25;
    if (isWeak) weight *= 1.3; // Weak areas first
    if (isPrereq) weight *= 1.2; // Essential prerequisite
    return weight;
  }

  if (goal === 'SCORE_WELL') {
    let weight = 1.0;
    if (importance >= 2 && relevance >= 2) weight *= 1.25;
    if (candidate.type === 'REVISE' || candidate.type === 'PRACTICE') weight *= 1.25;
    if (importance === 1 && relevance === 1) weight *= 0.6;
    return weight;
  }

  if (goal === 'TOP') {
    return 1.0;
  }

  return 1.0;
}

/**
 * Builds candidate (subject, concept/topic) items worth studying on targetDate.
 * Supports both:
 * 1. New syllabus shape (StudentSubject + populated Subject/Modules/Concepts + StudentProgress)
 * 2. Legacy shape (Subject with embedded topics)
 */
function buildCandidates(subjects, targetDate, scope) {
  const candidates = [];

  subjects.forEach((subj) => {
    // Determine if this is a V2 syllabus subject or a legacy topic-based subject
    const isSyllabus = Array.isArray(subj.modules) && subj.modules.length > 0;
    const examDate = subj.examDate || subj.studentSubject?.examDate || null;
    const examDaysLeft = examDate ? diffDays(targetDate, new Date(examDate)) : null;
    const subjectConfidence = subj.confidence || subj.studentSubject?.confidence || 3;
    const targetGoal = subj.targetGoal || subj.studentSubject?.targetGoal || 'SCORE_WELL';

    if (isSyllabus) {
      // --- V2 SYLLABUS-BACKED PROCESSING ---
      // Apply scope hard-filter: if scope restricts to specific modules, only process those
      let filteredModules = subj.modules;
      if (scope && scope.type === 'MODULE' && Array.isArray(scope.targets) && scope.targets.length > 0) {
        filteredModules = subj.modules.filter((mod) => {
          return scope.targets.some((target) => {
            const targetNorm = target.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            const modName = (mod.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            // Match "Module 3" against "Module 3: Smart Contracts & Solidity"
            return modName.includes(targetNorm) || modName.startsWith(targetNorm);
          });
        });
      }
      const totalModules = filteredModules.length || subj.modules.length;
      let totalConceptsCount = 0;
      let nonMasteredConceptsCount = 0;

      // First pass: calculate subject-level remaining work ratio
      filteredModules.forEach((mod) => {
        (mod.concepts || []).forEach((c) => {
          totalConceptsCount++;
          const prog = (subj.progressMap && (subj.progressMap[c._id.toString()] || subj.progressMap[c.name])) ||
                       (Array.isArray(subj.progress) && subj.progress.find((p) => p.conceptId?.toString() === c._id.toString())) ||
                       c.progress;
          const status = prog?.status || 'not_started';
          if (status !== 'mastered') {
            nonMasteredConceptsCount++;
          }
        });
      });

      const remainingPercent = totalConceptsCount > 0
        ? (nonMasteredConceptsCount / totalConceptsCount) * 100
        : 100;

      // Second pass: build candidate concepts (within scope-filtered modules)
      filteredModules.forEach((mod) => {
        (mod.concepts || []).forEach((concept) => {
          const prog = (subj.progressMap && (subj.progressMap[concept._id.toString()] || subj.progressMap[concept.name])) ||
                       (Array.isArray(subj.progress) && subj.progress.find((p) => p.conceptId?.toString() === concept._id.toString())) ||
                       concept.progress;

          const status = prog?.status || 'not_started';
          if (status === 'mastered') return; // Mastered, skip

          const lastStudiedDate = prog?.lastStudiedAt || null;
          const reviewStage = prog?.reviewStage || 0;
          const daysSinceStudied = lastStudiedDate ? diffDays(new Date(lastStudiedDate), targetDate) : null;

          let type;
          let isAccelerated = false;
          if (status === 'not_started') {
            type = 'LEARN';
          } else {
            const adaptive = getAdaptiveInterval({
              reviewStage,
              examDaysLeft,
              daysSinceStudied
            });
            isAccelerated = adaptive.isAccelerated;

            if (daysSinceStudied === null || daysSinceStudied >= adaptive.interval) {
              type = 'REVISE';
            } else {
              return; // Not due for revision yet
            }
          }

          // Exam approaching switch
          if (examDaysLeft !== null && examDaysLeft <= 2 && status !== 'not_started') {
            type = 'MOCK_TEST';
          }

          // Weakness derived from concept-specific or subject-level confidence
          const conceptConfidence = prog?.confidence || subjectConfidence;
          const weakness = 6 - conceptConfidence; // 1-5 scale -> weakness 1-5

          // Goal-based candidate filtering: PASS skips low relevance & low importance concepts
          if (targetGoal.toUpperCase() === 'PASS') {
            const rel = concept.examRelevance ?? 2;
            const imp = concept.importance ?? 2;
            const isPrereq = (mod.order === 1 && concept.order === 1);
            if (rel < 2 && imp < 2 && !isPrereq) {
              return; // Omit low-value concept under PASS goal
            }
          }

          candidates.push({
            isSyllabus: true,
            subject: {
              _id: subj._id || subj.subjectId?._id || subj.subjectId,
              name: subj.name || subj.subjectId?.name,
              code: subj.code || subj.subjectId?.code
            },
            module: mod,
            isAccelerated,
            concept,
            type,
            examDaysLeft,
            weakness,
            remainingPercent,
            daysSinceStudied,
            targetGoal,
            estimatedMinutes: concept.estimatedStudyMinutes || DEFAULT_BLOCK_MINUTES,
            moduleInfo: {
              order: mod.order,
              totalModules,
              name: mod.name
            }
          });
        });
      });

    } else if (Array.isArray(subj.topics)) {
      // --- V1 LEGACY TOPICS PROCESSING ---
      const totalTopics = subj.topics.length || 1;
      const notMastered = subj.topics.filter((t) => t.status !== 'mastered').length;
      const remainingPercent = (notMastered / totalTopics) * 100;
      const weakness = 6 - subjectConfidence;

      subj.topics.forEach((topic) => {
        if (topic.status === 'mastered') return;

        let type;
        let isAccelerated = false;
        const daysSinceStudied = topic.lastStudiedDate
          ? diffDays(new Date(topic.lastStudiedDate), targetDate)
          : null;

        if (topic.status === 'not_started') {
          type = 'LEARN';
        } else {
          const adaptive = getAdaptiveInterval({
            reviewStage: topic.reviewStage || 0,
            examDaysLeft,
            daysSinceStudied
          });
          isAccelerated = adaptive.isAccelerated;

          if (daysSinceStudied === null || daysSinceStudied >= adaptive.interval) {
            type = 'REVISE';
          } else {
            return;
          }
        }

        if (examDaysLeft !== null && examDaysLeft <= 2 && topic.status !== 'not_started') {
          type = 'MOCK_TEST';
        }

        candidates.push({
          isSyllabus: false,
          isAccelerated,
          subject: subj,
          topic,
          type,
          examDaysLeft,
          weakness,
          remainingPercent,
          daysSinceStudied,
          targetGoal,
          estimatedMinutes: DEFAULT_BLOCK_MINUTES
        });
      });
    }
  });

  return candidates;
}

/** Deterministic, human-readable explanation referencing syllabus facts. */
function buildReason(c) {
  const parts = [];

  if (c.examDaysLeft !== null) {
    parts.push(`Exam in ${c.examDaysLeft} day${c.examDaysLeft === 1 ? '' : 's'}`);
  }

  if (c.isSyllabus) {
    if (c.concept?.importance === 3) {
      parts.push('High importance');
    } else if (c.concept?.importance === 2) {
      parts.push('Medium importance');
    }

    if (c.concept?.examRelevance === 3) {
      parts.push('High exam relevance');
    } else if (c.concept?.examRelevance === 2) {
      parts.push('Medium exam relevance');
    }

    if (c.weakness >= 4) {
      parts.push('weak topic');
    }

    if (c.type === 'REVISE') {
      if (c.isAccelerated) {
        parts.push(`accelerated revision before exam (last reviewed ${c.daysSinceStudied ?? 0}d ago)`);
      } else {
        parts.push(`haven't reviewed since day ${c.daysSinceStudied ?? '∞'}`);
      }
    }

    if (c.type === 'MOCK_TEST') {
      parts.push('exam approaching — test yourself');
    }

    if (c.moduleInfo) {
      parts.push(`Module ${c.moduleInfo.order} of ${c.moduleInfo.totalModules}`);
    } else if (c.remainingPercent >= 60) {
      parts.push('large syllabus remaining');
    }
  } else {
    // Legacy explanation
    if (c.weakness >= 4) parts.push('weak topic');
    if (c.type === 'REVISE') {
      if (c.isAccelerated) {
        parts.push(`accelerated revision before exam (last reviewed ${c.daysSinceStudied ?? 0}d ago)`);
      } else {
        parts.push(`not reviewed in ${c.daysSinceStudied ?? '∞'} day${c.daysSinceStudied === 1 ? '' : 's'}`);
      }
    }
    if (c.type === 'MOCK_TEST') parts.push('exam approaching — test yourself');
    if (c.remainingPercent >= 60) parts.push('large syllabus remaining');
  }

  return parts.length ? parts.join(' • ') : 'Keeping steady progress on this subject';
}

/** Scores + normalizes candidates 0-1 so no single factor dominates. Mutates in place. */
function scoreCandidates(candidates) {
  if (candidates.length === 0) return;

  const rawUrgencies = candidates.map((c) => (c.examDaysLeft === null ? 1 / 30 : 1 / Math.max(c.examDaysLeft, 1)));
  const maxUrgency = Math.max(...rawUrgencies, 1e-6);

  candidates.forEach((c, i) => {
    const urgencyNorm = rawUrgencies[i] / maxUrgency;
    const weaknessNorm = c.weakness / 5;
    const remainingNorm = c.remainingPercent / 100;

    if (c.isSyllabus) {
      const relevanceNorm = (c.concept.examRelevance || 2) / 3;
      const importanceNorm = (c.concept.importance || 2) / 3;

      const baseScore =
        SYLLABUS_WEIGHTS.examUrgency * urgencyNorm +
        SYLLABUS_WEIGHTS.examRelevance * relevanceNorm +
        SYLLABUS_WEIGHTS.importance * importanceNorm +
        SYLLABUS_WEIGHTS.weakness * weaknessNorm +
        SYLLABUS_WEIGHTS.remainingWork * remainingNorm;

      const goalWeight = computeGoalWeight(c.targetGoal, c.concept);
      c.score = baseScore * goalWeight;
    } else {
      // Legacy score formula
      const difficultyNorm = (c.subject.difficulty || 3) / 5;
      c.score =
        LEGACY_WEIGHTS.examUrgency * urgencyNorm +
        LEGACY_WEIGHTS.difficulty * difficultyNorm +
        LEGACY_WEIGHTS.weakness * weaknessNorm +
        LEGACY_WEIGHTS.remainingWork * remainingNorm;
    }

    c.reason = buildReason(c);
  });
}

/**
 * Determines block duration with difficulty awareness:
 * - Easy concepts (difficulty=1): shorter focused sessions (e.g. 30 min max)
 * - Medium concepts (difficulty=2): standard 45 min sessions
 * - Hard concepts (difficulty=3): deeper sessions up to 60 min, can span multiple blocks
 */
function getConceptBlockDuration(c, remainingCapacity) {
  if (!c.isSyllabus) {
    return Math.min(DEFAULT_BLOCK_MINUTES, remainingCapacity);
  }

  const diff = c.concept?.difficulty || 2;
  const totalEst = c.estimatedMinutes || DEFAULT_BLOCK_MINUTES;
  const alreadyAllocated = c.allocatedMinutes || 0;
  const unallocatedEst = Math.max(totalEst - alreadyAllocated, 20);

  let maxSingleBlock;
  if (diff === 1) {
    maxSingleBlock = 30; // Short/focused block for easy concepts
  } else if (diff === 3) {
    maxSingleBlock = 60; // Deeper block for hard concepts
  } else {
    maxSingleBlock = 45; // Standard block for medium concepts
  }

  const desiredDuration = Math.min(unallocatedEst, maxSingleBlock);
  return Math.min(desiredDuration, remainingCapacity);
}

/**
 * Greedily fills the day's time capacity with the highest-priority candidates.
 * Hard concepts (difficulty=3) can span multiple session blocks.
 */
function allocateBlocks(candidates, capacity) {
  let remaining = capacity;
  const perSubjectCount = {};
  const chosen = [];

  // First pass: respect the per-subject cap so the day feels varied.
  for (const c of candidates) {
    if (c.score <= 0) continue;
    if (remaining < 20) break;
    const sid = c.subject._id.toString();
    if ((perSubjectCount[sid] || 0) >= MAX_BLOCKS_PER_SUBJECT_FIRST_PASS) continue;

    const duration = getConceptBlockDuration(c, remaining);
    if (duration < 20) continue;

    chosen.push({ ...c, duration });
    c.allocatedMinutes = (c.allocatedMinutes || 0) + duration;
    perSubjectCount[sid] = (perSubjectCount[sid] || 0) + 1;
    remaining -= duration;
  }

  // Second pass: if capacity is still free, allow additional blocks.
  // Hard concepts (difficulty=3) with leftover unallocated estimated minutes can span an extra block!
  if (remaining >= 20) {
    for (const c of candidates) {
      if (c.score <= 0) continue;
      if (remaining < 20) break;

      const diff = c.concept?.difficulty || 2;
      const isHardWithRemainingWork = c.isSyllabus && diff === 3 && (c.allocatedMinutes || 0) < c.estimatedMinutes;
      const alreadyChosen = chosen.some((x) =>
        x.subject._id?.toString() === c.subject._id?.toString() &&
        (c.isSyllabus
          ? (x.concept?._id?.toString() === c.concept?._id?.toString() || x.concept?.name === c.concept?.name)
          : (typeof x.topic === 'object' ? x.topic?.name === c.topic?.name : x.topic === c.topic))
      );

      if (alreadyChosen && !isHardWithRemainingWork) continue;

      const duration = getConceptBlockDuration(c, remaining);
      if (duration < 20) continue;

      chosen.push({ ...c, duration });
      c.allocatedMinutes = (c.allocatedMinutes || 0) + duration;
      remaining -= duration;
    }
  }

  return chosen;
}

/** Turns allocated blocks into sequenced task objects with break blocks between them. */
function buildTaskDocs(chosen, dateStr, timePreference) {
  const startHour = { morning: 9, afternoon: 14, evening: 18, flexible: 9 }[timePreference] || 9;
  let cursor = startHour * 60;
  const tasks = [];

  chosen.forEach((c, idx) => {
    const topicName = c.isSyllabus ? c.concept.name : c.topic.name;

    tasks.push({
      subjectId: c.subject._id,
      subjectName: c.subject.name,
      topic: topicName,
      conceptId: c.isSyllabus ? c.concept._id : null,
      moduleId: c.isSyllabus ? c.module?._id : null,
      importance: c.isSyllabus ? c.concept?.importance : null,
      examRelevance: c.isSyllabus ? c.concept?.examRelevance : null,
      difficulty: c.isSyllabus ? c.concept?.difficulty : null,
      date: dateStr,
      startTime: minutesToHHMM(cursor),
      duration: c.duration,
      type: c.type,
      priorityScore: Number(c.score.toFixed(3)),
      reason: c.reason,
      status: 'pending'
    });
    cursor += c.duration;

    if (idx < chosen.length - 1) {
      tasks.push({
        subjectId: null,
        subjectName: null,
        topic: 'Break',
        conceptId: null,
        moduleId: null,
        date: dateStr,
        startTime: minutesToHHMM(cursor),
        duration: DEFAULT_BREAK_MINUTES,
        type: 'BREAK',
        priorityScore: 0,
        reason: 'Rest before the next session',
        status: 'pending'
      });
      cursor += DEFAULT_BREAK_MINUTES;
    }
  });

  return tasks;
}

function generateDailyTasks({ subjects, dateStr, dailyCapacityMinutes = 135, timePreference = 'flexible', energyLevel = 'normal', scope = null }) {
  const targetDate = new Date(`${dateStr}T00:00:00`);
  const capacity = Math.round(dailyCapacityMinutes * (ENERGY_CAPACITY_MULTIPLIER[energyLevel] || 1));

  const candidates = buildCandidates(subjects, targetDate, scope);
  scoreCandidates(candidates);
  candidates.sort((a, b) => b.score - a.score);

  const allocated = allocateBlocks(candidates, capacity);
  const tasks = buildTaskDocs(allocated, dateStr, timePreference);

  const plannedMinutes = allocated.reduce((sum, a) => sum + a.duration, 0);

  return { tasks, plannedMinutes, capacityMinutes: capacity };
}

const { toDateStr, addDays } = require('../utils/dateUtils');

const SESSION_CONFIG = {

  LEARN_MINUTES: 45,
  PRACTICE_MINUTES: 45,
  REVISE_MINUTES: 30,
  MOCK_TEST_MINUTES: 45,
  BREAK_MINUTES: 10,
  DEFAULT_DAILY_BUDGET: 135 // ~2-3 core study/practice sessions + breaks
};

/**
 * MASTER TOPIC ALLOCATION ENGINE (V2)
 *
 * Allocates concepts across the full date range (startDate -> endDate inclusive)
 * without duplicate LEARN tasks, with intentional revision, practice, and mock tests.
 */
function generateMasterPlan({
  subjects,
  startDateStr,
  totalDays = 14,
  intent = {},
  timePreference = 'flexible',
  dailyBudgetMinutes = SESSION_CONFIG.DEFAULT_DAILY_BUDGET,
  scope = null
}) {
  const planDays = Math.max(1, Number(totalDays) || 14);
  const baseDate = new Date(`${startDateStr}T00:00:00`);
  const goalType = (intent?.goalType || intent?.goal || 'SCORE_WELL').toUpperCase();
  
  // Merge scope from intent if not passed directly
  const effectiveScope = scope || intent?.scope || null;

  // 1. Gather all concepts across all enrolled subjects
  const allConcepts = [];
  subjects.forEach((subj) => {
    const isSyllabus = Array.isArray(subj.modules) && subj.modules.length > 0;
    const subjectId = subj._id || subj.subjectId?._id || subj.subjectId;
    const subjectName = subj.name || subj.subjectId?.name || 'Subject';
    const subjectCode = subj.code || subj.subjectId?.code || '';

    if (isSyllabus) {
      // Apply scope hard-filter on modules
      let filteredModules = subj.modules;
      if (effectiveScope && effectiveScope.type === 'MODULE' && Array.isArray(effectiveScope.targets) && effectiveScope.targets.length > 0) {
        filteredModules = subj.modules.filter((mod) => {
          return effectiveScope.targets.some((target) => {
            const targetNorm = target.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            const modName = (mod.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            return modName.includes(targetNorm) || modName.startsWith(targetNorm);
          });
        });
      }

      filteredModules.forEach((mod) => {
        (mod.concepts || []).forEach((concept) => {
          const prog = (subj.progressMap && (subj.progressMap[concept._id.toString()] || subj.progressMap[concept.name])) ||
                       (Array.isArray(subj.progress) && subj.progress.find((p) => p.conceptId?.toString() === concept._id.toString())) ||
                       concept.progress;

          const status = prog?.status || 'not_started';
          allConcepts.push({
            id: concept._id.toString(),
            conceptDoc: concept,
            name: concept.name,
            subjectId,
            subjectName,
            subjectCode,
            moduleId: mod._id,
            moduleName: mod.name,
            moduleOrder: mod.order || 1,
            order: concept.order || 1,
            importance: concept.importance ?? 2,
            examRelevance: concept.examRelevance ?? 2,
            difficulty: concept.difficulty ?? 3,
            status,
            confidence: prog?.confidence || 3,
            reviewStage: prog?.reviewStage || 0
          });
        });
      });
    } else if (Array.isArray(subj.topics)) {
      subj.topics.forEach((t, idx) => {
        allConcepts.push({
          id: `${subjectId}_topic_${idx}`,
          name: t.name,
          subjectId,
          subjectName,
          subjectCode,
          moduleId: null,
          moduleName: 'General',
          moduleOrder: 1,
          order: idx + 1,
          importance: 2,
          examRelevance: 2,
          difficulty: 3,
          status: t.status || 'not_started',
          confidence: 3,
          reviewStage: 0
        });
      });
    }
  });

  // 2. Separate concepts already mastered/completed vs those needing learning
  const completedConcepts = allConcepts.filter((c) => c.status === 'mastered' || c.status === 'completed');
  let eligibleForLearn = allConcepts.filter((c) => c.status !== 'mastered' && c.status !== 'completed');
  const skippedConcepts = [];

  // Goal-based candidate filtering for PASS goal: skip low-value non-prerequisite topics
  if (goalType === 'PASS') {
    const essential = [];
    const skipped = [];
    for (const c of eligibleForLearn) {
      const isPrereq = (c.moduleOrder === 1 && c.order === 1);
      const isHighValue = (c.importance >= 2 || c.examRelevance >= 2);
      if (isPrereq || isHighValue) {
        essential.push(c);
      } else {
        skipped.push(c);
      }
    }
    // Only prune if we have enough essential concepts
    if (essential.length > 0) {
      eligibleForLearn = essential;
      skipped.forEach((c) => {
        skippedConcepts.push({
          name: c.name,
          moduleName: c.moduleName,
          reason: `Low exam relevance (${c.examRelevance}/3) and low importance (${c.importance}/3) — skipped under PASS goal`
        });
      });
    }
  }

  // 3. Order eligible concepts according to Gemini AI prioritization or deterministic fallback
  const prioritizedIds = intent?.prioritizedConceptIds || [];
  if (prioritizedIds.length > 0) {
    const idOrderMap = new Map();
    prioritizedIds.forEach((id, index) => idOrderMap.set(id.toString(), index));

    eligibleForLearn.sort((a, b) => {
      const orderA = idOrderMap.has(a.id) ? idOrderMap.get(a.id) : 9999;
      const orderB = idOrderMap.has(b.id) ? idOrderMap.get(b.id) : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.moduleOrder - b.moduleOrder) || (a.order - b.order);
    });
  } else {
    // Deterministic prioritization
    eligibleForLearn.sort((a, b) => {
      if (goalType === 'PASS' || goalType === 'EMERGENCY') {
        const scoreA = a.examRelevance * 3 + a.importance * 2 - a.difficulty * 0.5;
        const scoreB = b.examRelevance * 3 + b.importance * 2 - b.difficulty * 0.5;
        return scoreB - scoreA;
      }
      if (goalType === 'TOP') {
        // Comprehensive coverage: module order first, then by difficulty for depth
        if (a.moduleOrder !== b.moduleOrder) return a.moduleOrder - b.moduleOrder;
        const scoreA = a.difficulty * 2 + a.importance * 2 + a.examRelevance;
        const scoreB = b.difficulty * 2 + b.importance * 2 + b.examRelevance;
        return scoreB - scoreA;
      }
      return (a.moduleOrder - b.moduleOrder) || (a.order - b.order);
    });
  }

  // 4. Day-by-Day Master Topic Allocation
  const allocatedLearnConceptIds = new Set();
  const learnDayByConceptId = new Map();
  const revisionScheduledCounts = new Map();
  const learnedConceptsHistory = [...completedConcepts];

  const allGeneratedTasks = [];
  let nextLearnIndex = 0;

  for (let dayIdx = 0; dayIdx < planDays; dayIdx++) {
    const dateStr = toDateStr(addDays(baseDate, dayIdx));
    let remainingBudget = dailyBudgetMinutes;
    const dayTasks = [];

    const isFinalDay = (dayIdx === planDays - 1);
    const isPenultimateDay = (planDays >= 7 && dayIdx === planDays - 2);

    // --- Special Final / Mock Test Days ---
    if (isFinalDay && (goalType === 'TOP' || goalType === 'SCORE_WELL' || goalType === 'PASS')) {
      // Mock Test & Final Revision
      dayTasks.push({
        subjectId: allConcepts[0]?.subjectId || null,
        subjectName: allConcepts[0]?.subjectName || 'Syllabus',
        topic: 'Full Syllabus Mock Test & Self-Assessment',
        conceptId: null,
        moduleId: null,
        date: dateStr,
        startTime: null,
        duration: SESSION_CONFIG.MOCK_TEST_MINUTES,
        type: 'MOCK_TEST',
        priorityScore: 0.98,
        reason: 'Comprehensive timed assessment to evaluate exam readiness across all learned concepts',
        status: 'pending'
      });
      remainingBudget -= SESSION_CONFIG.MOCK_TEST_MINUTES;

      if (remainingBudget >= SESSION_CONFIG.REVISE_MINUTES) {
        dayTasks.push({
          subjectId: allConcepts[0]?.subjectId || null,
          subjectName: allConcepts[0]?.subjectName || 'Syllabus',
          topic: 'High-Yield Formulae & Key Points Final Review',
          conceptId: null,
          moduleId: null,
          date: dateStr,
          startTime: null,
          duration: SESSION_CONFIG.REVISE_MINUTES,
          type: 'REVISE',
          priorityScore: 0.95,
          reason: 'Rapid final review of essential formulas and definitions before exam',
          status: 'pending'
        });
        remainingBudget -= SESSION_CONFIG.REVISE_MINUTES;
      }
    } else if (isPenultimateDay && goalType === 'TOP') {
      // Practice test for TOP students on Day N-1
      dayTasks.push({
        subjectId: allConcepts[0]?.subjectId || null,
        subjectName: allConcepts[0]?.subjectName || 'Syllabus',
        topic: 'Practice Exam & Difficult Problem Sets',
        conceptId: null,
        moduleId: null,
        date: dateStr,
        startTime: null,
        duration: SESSION_CONFIG.PRACTICE_MINUTES,
        type: 'PRACTICE',
        priorityScore: 0.92,
        reason: 'Targeted high-difficulty question practice to consolidate top-rank mastery',
        status: 'pending'
      });
      remainingBudget -= SESSION_CONFIG.PRACTICE_MINUTES;
    }

    // --- Regular Session Allocation ---
    // 1. Spaced Revision Slot (if any concept is due for revision)
    if (remainingBudget >= SESSION_CONFIG.REVISE_MINUTES) {
      // Find a concept learned 2 to 4 days ago, or an already completed concept needing revision
      const revisionCandidate = learnedConceptsHistory.find((c) => {
        const learnedDay = learnDayByConceptId.get(c.id);
        const daysSinceLearn = learnedDay !== undefined ? dayIdx - learnedDay : 99;
        const revCount = revisionScheduledCounts.get(c.id) || 0;
        return daysSinceLearn >= 2 && revCount < 2;
      });

      if (revisionCandidate) {
        dayTasks.push({
          subjectId: revisionCandidate.subjectId,
          subjectName: revisionCandidate.subjectName,
          topic: `${revisionCandidate.name} — Revision`,
          conceptId: revisionCandidate.conceptDoc?._id || null,
          moduleId: revisionCandidate.moduleId,
          importance: revisionCandidate.importance,
          examRelevance: revisionCandidate.examRelevance,
          difficulty: revisionCandidate.difficulty,
          date: dateStr,
          startTime: null,
          duration: SESSION_CONFIG.REVISE_MINUTES,
          type: 'REVISE',
          priorityScore: 0.88,
          reason: `Spaced revision of ${revisionCandidate.name} to reinforce memory retention`,
          status: 'pending'
        });
        remainingBudget -= SESSION_CONFIG.REVISE_MINUTES;
        revisionScheduledCounts.set(revisionCandidate.id, (revisionScheduledCounts.get(revisionCandidate.id) || 0) + 1);
      }
    }

    // 2. New Concept Learning Slot
    while (remainingBudget >= SESSION_CONFIG.LEARN_MINUTES && nextLearnIndex < eligibleForLearn.length) {
      const learnConcept = eligibleForLearn[nextLearnIndex];
      nextLearnIndex++;

      // Guard against any possibility of duplicate learn
      if (allocatedLearnConceptIds.has(learnConcept.id)) {
        continue;
      }

      allocatedLearnConceptIds.add(learnConcept.id);
      learnDayByConceptId.set(learnConcept.id, dayIdx);
      learnedConceptsHistory.push(learnConcept);

      dayTasks.push({
        subjectId: learnConcept.subjectId,
        subjectName: learnConcept.subjectName,
        topic: learnConcept.name,
        conceptId: learnConcept.conceptDoc?._id || null,
        moduleId: learnConcept.moduleId,
        importance: learnConcept.importance,
        examRelevance: learnConcept.examRelevance,
        difficulty: learnConcept.difficulty,
        date: dateStr,
        startTime: null,
        duration: SESSION_CONFIG.LEARN_MINUTES,
        type: 'LEARN',
        priorityScore: 0.90,
        reason: `Core learning — ${learnConcept.name} (${learnConcept.moduleName})`,
        status: 'pending'
      });
      remainingBudget -= SESSION_CONFIG.LEARN_MINUTES;

      // Limit new concepts per day to 2 so student isn't overloaded
      if (dayTasks.filter((t) => t.type === 'LEARN').length >= 2) {
        break;
      }
    }

    // 3. Practice Slot (especially for TOP, PASS, or when time remains)
    if (remainingBudget >= SESSION_CONFIG.PRACTICE_MINUTES && learnedConceptsHistory.length > 0) {
      // Pick a concept that hasn't had practice yet
      const practiceCandidate = [...learnedConceptsHistory].reverse().find((c) => c.status !== 'break');
      if (practiceCandidate) {
        dayTasks.push({
          subjectId: practiceCandidate.subjectId,
          subjectName: practiceCandidate.subjectName,
          topic: `${practiceCandidate.name} — Practice Questions`,
          conceptId: practiceCandidate.conceptDoc?._id || null,
          moduleId: practiceCandidate.moduleId,
          importance: practiceCandidate.importance,
          examRelevance: practiceCandidate.examRelevance,
          difficulty: practiceCandidate.difficulty,
          date: dateStr,
          startTime: null,
          duration: SESSION_CONFIG.PRACTICE_MINUTES,
          type: 'PRACTICE',
          priorityScore: 0.85,
          reason: `Exam-style question practice for ${practiceCandidate.name}`,
          status: 'pending'
        });
        remainingBudget -= SESSION_CONFIG.PRACTICE_MINUTES;
      }
    }

    // 4. If all concepts are learned early (e.g. 10 concepts across 14 days), fill remaining days with Revision & Practice
    if (dayTasks.length === 0 && learnedConceptsHistory.length > 0) {
      const candidateToReview = learnedConceptsHistory[dayIdx % learnedConceptsHistory.length];
      dayTasks.push({
        subjectId: candidateToReview.subjectId,
        subjectName: candidateToReview.subjectName,
        topic: `${candidateToReview.name} — Topic Review`,
        conceptId: candidateToReview.conceptDoc?._id || null,
        moduleId: candidateToReview.moduleId,
        importance: candidateToReview.importance,
        examRelevance: candidateToReview.examRelevance,
        difficulty: candidateToReview.difficulty,
        date: dateStr,
        startTime: null,
        duration: SESSION_CONFIG.REVISE_MINUTES,
        type: 'REVISE',
        priorityScore: 0.80,
        reason: `Consolidation review of ${candidateToReview.name}`,
        status: 'pending'
      });
      remainingBudget -= SESSION_CONFIG.REVISE_MINUTES;

      if (remainingBudget >= SESSION_CONFIG.PRACTICE_MINUTES) {
        dayTasks.push({
          subjectId: candidateToReview.subjectId,
          subjectName: candidateToReview.subjectName,
          topic: `Previous Year Questions — ${candidateToReview.subjectName}`,
          conceptId: null,
          moduleId: candidateToReview.moduleId,
          date: dateStr,
          startTime: null,
          duration: SESSION_CONFIG.PRACTICE_MINUTES,
          type: 'PRACTICE',
          priorityScore: 0.82,
          reason: `Exam pattern questions and problem sets for ${candidateToReview.subjectName}`,
          status: 'pending'
        });
      }
    }

    // Interleave break blocks between study sessions
    let cursor = 9 * 60;
    if (timePreference === 'evening') cursor = 18 * 60;
    else if (timePreference === 'afternoon') cursor = 14 * 60;

    const sequencedWithBreaks = [];
    dayTasks.forEach((task, idx) => {
      task.startTime = minutesToHHMM(cursor);
      cursor += task.duration;
      sequencedWithBreaks.push(task);

      if (idx < dayTasks.length - 1) {
        sequencedWithBreaks.push({
          subjectId: null,
          subjectName: null,
          topic: 'Break',
          conceptId: null,
          moduleId: null,
          date: dateStr,
          startTime: minutesToHHMM(cursor),
          duration: SESSION_CONFIG.BREAK_MINUTES,
          type: 'BREAK',
          priorityScore: 0,
          reason: 'Rest, hydrate, and prepare for next session',
          status: 'pending'
        });
        cursor += SESSION_CONFIG.BREAK_MINUTES;
      }
    });

    allGeneratedTasks.push(...sequencedWithBreaks);
  }

  const startDate = toDateStr(baseDate);
  const endDate = toDateStr(addDays(baseDate, planDays - 1));

  return {
    startDate,
    endDate,
    totalDays: planDays,
    tasks: allGeneratedTasks,
    allocatedLearnCount: allocatedLearnConceptIds.size,
    totalConceptsAvailable: allConcepts.length,
    goalType,
    skippedConcepts,
    scope: effectiveScope
  };
}

/**
 * Resequences breaks and start times for a specific user on a specific date:
 * - If 0 or 1 study session exists: removes all break tasks on that day (no lonely breaks!).
 * - If >= 2 study sessions exist: removes redundant breaks and ensures exactly ONE
 *   break exists in between each consecutive study session, with continuous start times.
 */
async function resequenceDayBreaks(userId, dateStr) {
  const Task = require('../models/Task');
  const allTasks = await Task.find({ userId, date: dateStr }).sort({ startTime: 1, createdAt: 1 });
  const studySessions = allTasks.filter((t) => t.type !== 'BREAK');

  // If 0 or 1 study session, no breaks should exist
  if (studySessions.length <= 1) {
    await Task.deleteMany({ userId, date: dateStr, type: 'BREAK' });
    return;
  }

  // Delete all existing breaks on this date
  await Task.deleteMany({ userId, date: dateStr, type: 'BREAK' });

  // Get fallback planId if any session is missing planId
  const StudyPlan = require('../models/StudyPlan');
  let defaultPlanId = studySessions.find((s) => s.planId)?.planId;
  if (!defaultPlanId) {
    const p = await StudyPlan.findOne({ userId }).sort({ createdAt: -1 });
    defaultPlanId = p ? p._id : null;
  }

  // Sequentially re-interleave breaks between each study session
  let cursor = 9 * 60;
  if (studySessions[0].startTime) {
    const [h, m] = studySessions[0].startTime.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) cursor = h * 60 + m;
  }

  const breakDuration = SESSION_CONFIG.BREAK_MINUTES || 10;
  for (let i = 0; i < studySessions.length; i++) {
    const session = studySessions[i];
    session.startTime = minutesToHHMM(cursor);
    await session.save();
    cursor += session.duration;

    if (i < studySessions.length - 1) {
      await Task.create({
        userId,
        planId: session.planId || defaultPlanId,
        subjectId: null,
        subjectName: null,
        topic: 'Break',
        conceptId: null,
        moduleId: null,
        date: dateStr,
        startTime: minutesToHHMM(cursor),
        duration: breakDuration,
        type: 'BREAK',
        priorityScore: 0,
        reason: 'Rest, hydrate, and prepare for next session',
        status: 'pending'
      });
      cursor += breakDuration;
    }
  }
}

module.exports = {
  generateDailyTasks,
  generateMasterPlan,
  resequenceDayBreaks,
  SESSION_CONFIG,
  SPACED_INTERVALS,
  getAdaptiveInterval,
  DEFAULT_BLOCK_MINUTES,
  DEFAULT_BREAK_MINUTES,
  ENERGY_CAPACITY_MULTIPLIER,
  SYLLABUS_WEIGHTS,
  LEGACY_WEIGHTS,
  computeGoalWeight
};

