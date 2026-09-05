// ============================================================================
// SCHEDULING ENGINE
// ----------------------------------------------------------------------------
// This is the deterministic core of the whole product. No AI call happens
// anywhere in this file. Given a student's subjects and a day's capacity,
// it decides: which topics to study today, in what order, for how long, and
// WHY (a plain-English reason, generated from the same numbers used to
// rank it — not from an LLM). This is what you explain in the interview.
// ============================================================================

const { diffDays, minutesToHHMM } = require('../utils/dateUtils');

const SPACED_INTERVALS = [1, 3, 7, 14]; // simplified spaced repetition, not full Anki
const DEFAULT_BLOCK_MINUTES = 45;
const DEFAULT_BREAK_MINUTES = 15;
const MAX_BLOCKS_PER_SUBJECT_FIRST_PASS = 2; // keeps a day varied instead of one subject hogging it all

const WEIGHTS = {
  examUrgency: 0.4,
  difficulty: 0.2,
  weakness: 0.25,
  remainingWork: 0.15
};

const ENERGY_CAPACITY_MULTIPLIER = { high: 1.15, normal: 1, low: 0.7 };

/**
 * Builds a raw list of "candidate" (subject, topic) pairs worth studying on targetDate,
 * before any scoring or time allocation happens.
 */
function buildCandidates(subjects, targetDate) {
  const candidates = [];

  subjects.forEach((subject) => {
    const examDaysLeft = subject.examDate ? diffDays(targetDate, new Date(subject.examDate)) : null;
    const totalTopics = subject.topics.length || 1;
    const notMastered = subject.topics.filter((t) => t.status !== 'mastered').length;
    const remainingPercent = (notMastered / totalTopics) * 100;
    const weakness = 6 - (subject.confidence || 3); // confidence 1-5 -> weakness 1-5

    subject.topics.forEach((topic) => {
      if (topic.status === 'mastered') return; // fully done, nothing to schedule

      let type;
      const daysSinceStudied = topic.lastStudiedDate
        ? diffDays(new Date(topic.lastStudiedDate), targetDate)
        : null;

      if (topic.status === 'not_started') {
        type = 'LEARN';
      } else {
        const interval = SPACED_INTERVALS[Math.min(topic.reviewStage || 0, SPACED_INTERVALS.length - 1)];
        if (daysSinceStudied === null || daysSinceStudied >= interval) {
          type = 'REVISE';
        } else {
          return; // not due for revision yet — skip today
        }
      }

      // Exam within 2 days and topic already covered at least once? Switch to test mode.
      if (examDaysLeft !== null && examDaysLeft <= 2 && topic.status !== 'not_started') {
        type = 'MOCK_TEST';
      }

      candidates.push({
        subject,
        topic,
        type,
        examDaysLeft,
        weakness,
        remainingPercent,
        daysSinceStudied
      });
    });
  });

  return candidates;
}

/** Deterministic, human-readable explanation for why a task was scheduled. */
function buildReason(c) {
  const parts = [];
  if (c.examDaysLeft !== null) {
    parts.push(`Exam in ${c.examDaysLeft} day${c.examDaysLeft === 1 ? '' : 's'}`);
  }
  if (c.weakness >= 4) parts.push('weak topic');
  if (c.type === 'REVISE') {
    parts.push(`not reviewed in ${c.daysSinceStudied ?? '∞'} day${c.daysSinceStudied === 1 ? '' : 's'}`);
  }
  if (c.type === 'MOCK_TEST') parts.push('exam approaching — test yourself');
  if (c.remainingPercent >= 60) parts.push('large syllabus remaining');
  return parts.length ? parts.join(' • ') : 'Keeping steady progress on this subject';
}

/** Scores + normalizes candidates so no single factor dominates. Mutates in place. */
function scoreCandidates(candidates) {
  if (candidates.length === 0) return;

  const rawUrgencies = candidates.map((c) => (c.examDaysLeft === null ? 1 / 30 : 1 / Math.max(c.examDaysLeft, 1)));
  const maxUrgency = Math.max(...rawUrgencies, 1e-6);

  candidates.forEach((c, i) => {
    const urgencyNorm = rawUrgencies[i] / maxUrgency;
    const difficultyNorm = (c.subject.difficulty || 3) / 5;
    const weaknessNorm = c.weakness / 5;
    const remainingNorm = c.remainingPercent / 100;

    c.score =
      WEIGHTS.examUrgency * urgencyNorm +
      WEIGHTS.difficulty * difficultyNorm +
      WEIGHTS.weakness * weaknessNorm +
      WEIGHTS.remainingWork * remainingNorm;

    c.reason = buildReason(c);
  });
}

/** Greedily fills the day's time capacity with the highest-priority candidates. */
function allocateBlocks(candidates, capacity) {
  let remaining = capacity;
  const perSubjectCount = {};
  const chosen = [];

  // First pass: respect the per-subject cap so the day feels varied.
  for (const c of candidates) {
    if (remaining < 20) break;
    const sid = c.subject._id.toString();
    if ((perSubjectCount[sid] || 0) >= MAX_BLOCKS_PER_SUBJECT_FIRST_PASS) continue;
    const duration = Math.min(DEFAULT_BLOCK_MINUTES, remaining);
    chosen.push({ ...c, duration });
    perSubjectCount[sid] = (perSubjectCount[sid] || 0) + 1;
    remaining -= duration;
  }

  // Second pass: if capacity is still free (few subjects, or all caps hit), ignore the cap.
  if (remaining >= 20) {
    for (const c of candidates) {
      if (remaining < 20) break;
      if (chosen.some((x) => x.subject === c.subject && x.topic === c.topic)) continue;
      const duration = Math.min(DEFAULT_BLOCK_MINUTES, remaining);
      chosen.push({ ...c, duration });
      remaining -= duration;
    }
  }

  return chosen;
}

/** Turns allocated blocks into plain task objects with sequenced times, plus break blocks between them. */
function buildTaskDocs(chosen, dateStr, timePreference) {
  const startHour = { morning: 9, afternoon: 14, evening: 18, flexible: 9 }[timePreference] || 9;
  let cursor = startHour * 60;
  const tasks = [];

  chosen.forEach((c, idx) => {
    tasks.push({
      subjectId: c.subject._id,
      subjectName: c.subject.name,
      topic: c.topic.name,
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

/**
 * Main entry point: generates one day's task list.
 * @param {Object} params
 * @param {Array} params.subjects - Mongoose Subject docs (with .topics populated)
 * @param {String} params.dateStr - 'YYYY-MM-DD'
 * @param {Number} params.dailyCapacityMinutes
 * @param {String} params.timePreference - 'morning' | 'afternoon' | 'evening' | 'flexible'
 * @param {String} params.energyLevel - 'high' | 'normal' | 'low'
 */
function generateDailyTasks({ subjects, dateStr, dailyCapacityMinutes, timePreference = 'flexible', energyLevel = 'normal' }) {
  const targetDate = new Date(`${dateStr}T00:00:00`);
  const capacity = Math.round(dailyCapacityMinutes * (ENERGY_CAPACITY_MULTIPLIER[energyLevel] || 1));

  const candidates = buildCandidates(subjects, targetDate);
  scoreCandidates(candidates);
  candidates.sort((a, b) => b.score - a.score);

  const allocated = allocateBlocks(candidates, capacity);
  const tasks = buildTaskDocs(allocated, dateStr, timePreference);

  const plannedMinutes = allocated.reduce((sum, a) => sum + a.duration, 0);

  return { tasks, plannedMinutes, capacityMinutes: capacity };
}

module.exports = {
  generateDailyTasks,
  SPACED_INTERVALS,
  DEFAULT_BLOCK_MINUTES,
  DEFAULT_BREAK_MINUTES,
  ENERGY_CAPACITY_MULTIPLIER
};
