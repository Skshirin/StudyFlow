// ============================================================================
// PLAN HEALTH (V2.0 — Unified with Feasibility Engine)
// ----------------------------------------------------------------------------
// Deterministic assessment of whether the student's remaining syllabus fits
// in the time left before their nearest exam, incorporating targetGoal,
// concept estimated study minutes, and shortfall analysis.
// ============================================================================

const { assessFeasibility } = require('./feasibilityEngine');

function computePlanHealth(subjects, today = new Date(), dailyCapacityMinutes = 120) {
  const feasibility = assessFeasibility({ subjects, dailyCapacityMinutes, today });

  return {
    status: feasibility.trafficLight, // 'green' | 'yellow' | 'red' for backwards compatibility
    feasibilityStatus: feasibility.status, // 'ON_TRACK' | 'TIGHT' | 'AT_RISK' | 'EMERGENCY'
    message: feasibility.message,
    requiredMinutes: feasibility.totalRequiredMinutes,
    availableMinutes: feasibility.totalAvailableMinutes,
    shortfallMinutes: feasibility.shortfallMinutes,
    shortfallHours: feasibility.shortfallHours,
    requiredHours: feasibility.requiredHours,
    availableHours: feasibility.availableHours,
    earliestExamDays: feasibility.earliestExamDays,
    ratio: feasibility.ratio,
    skippedConcepts: feasibility.skippedConcepts,
    postponedConcepts: feasibility.postponedConcepts
  };
}

module.exports = { computePlanHealth };
