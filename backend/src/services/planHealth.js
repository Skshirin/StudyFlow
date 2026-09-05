// ============================================================================
// PLAN HEALTH
// ----------------------------------------------------------------------------
// A single traffic-light signal (green/yellow/red) telling the student whether
// their remaining syllabus fits in the time they have left before their
// nearest exam. Entirely deterministic — no AI call.
// ============================================================================

const { diffDays } = require('../utils/dateUtils');

const AVG_MINUTES_PER_TOPIC = 90; // rough effort estimate: learn + a couple of revisions

function computePlanHealth(subjects, today, dailyCapacityMinutes = 120) {
  let requiredMinutes = 0;
  let earliestExamDays = null;

  subjects.forEach((s) => {
    const remainingTopics = s.topics.filter((t) => t.status !== 'mastered').length;
    requiredMinutes += remainingTopics * AVG_MINUTES_PER_TOPIC;

    if (s.examDate) {
      const days = diffDays(today, new Date(s.examDate));
      if (earliestExamDays === null || days < earliestExamDays) earliestExamDays = days;
    }
  });

  if (earliestExamDays === null) {
    return {
      status: 'green',
      message: 'No upcoming exams — steady, low-pressure pace.',
      requiredMinutes,
      availableMinutes: null,
      earliestExamDays: null
    };
  }

  const availableMinutes = Math.max(earliestExamDays, 0) * dailyCapacityMinutes;
  const ratio = requiredMinutes / Math.max(availableMinutes, 1);

  let status, message;
  if (ratio <= 0.8) {
    status = 'green';
    message = 'On track. Your remaining syllabus comfortably fits your available time.';
  } else if (ratio <= 1.05) {
    status = 'yellow';
    message = 'Getting tight. Consider a bit more daily time or trimming lower-priority topics.';
  } else {
    const extraHours = Math.round(((requiredMinutes - availableMinutes) / 60) * 10) / 10;
    status = 'red';
    message = `At risk. Your plan has roughly ${extraHours} extra hours of work versus available time — increase daily capacity or reduce syllabus scope.`;
  }

  return { status, message, requiredMinutes, availableMinutes, earliestExamDays };
}

module.exports = { computePlanHealth, AVG_MINUTES_PER_TOPIC };
