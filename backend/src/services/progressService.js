// ============================================================================
// PROGRESS SERVICE — Single Source of Truth
// ----------------------------------------------------------------------------
// The ONE place that writes StudentProgress.status. All screens/controllers
// must call updateProgress() — no inline writes anywhere else.
// ============================================================================

const StudentProgress = require('../models/StudentProgress');

/**
 * Updates a student's progress for a concept.
 *
 * Two modes:
 * 1. Task completion (taskType + feedback): applies spaced-repetition logic
 * 2. Manual override (manualStatus): directly sets status (e.g., from ConceptDetail page)
 *
 * @param {string} userId
 * @param {string|ObjectId} conceptId
 * @param {Object} opts
 * @param {string} [opts.taskType]      - 'LEARN' | 'REVISE' | 'MOCK_TEST'
 * @param {string} [opts.feedback]      - 'easy' | 'normal' | 'difficult'
 * @param {string} [opts.manualStatus]  - 'not_started' | 'in_progress' | 'completed' | 'needs_revision' | 'mastered'
 * @returns {Promise<Object>} The saved StudentProgress document
 */
async function updateProgress(userId, conceptId, opts = {}) {
  const { taskType, feedback = 'normal', manualStatus } = opts;

  let progress = await StudentProgress.findOne({ userId, conceptId });
  if (!progress) {
    progress = new StudentProgress({ userId, conceptId });
  }

  if (manualStatus) {
    // ── Manual override path (ConceptDetail "Mark as Mastered", etc.) ──
    progress.status = manualStatus;
    progress.lastStudiedAt = new Date();

    if (manualStatus === 'mastered') {
      progress.reviewStage = Math.min(Math.max(progress.reviewStage, 3), 3);
    } else if (manualStatus === 'not_started') {
      progress.reviewStage = 0;
      progress.revisionCount = 0;
      progress.completionPercentage = 0;
    }
  } else if (taskType) {
    // ── Task completion path (Today page complete, with spaced-rep) ──
    progress.lastStudiedAt = new Date();

    if (taskType === 'LEARN') {
      progress.status = 'completed';
      progress.reviewStage = 0;
      progress.revisionCount = 0;
    } else if (taskType === 'REVISE' || taskType === 'MOCK_TEST' || taskType === 'PRACTICE') {
      progress.revisionCount = (progress.revisionCount || 0) + 1;

      let stageChange = 1;
      if (feedback === 'difficult') stageChange = 0;
      if (feedback === 'easy') stageChange = 2;
      progress.reviewStage = Math.min((progress.reviewStage || 0) + stageChange, 3);

      progress.status = 'needs_revision';
      if (progress.revisionCount >= 3 && progress.reviewStage >= 3) {
        progress.status = 'mastered';
      }
    }
  }

  await progress.save();
  return progress;
}

module.exports = { updateProgress };
