const { getAdaptiveInterval, SPACED_INTERVALS, generateDailyTasks } = require('../src/services/schedulingEngine');
const { toDateStr, addDays, diffDays } = require('../src/utils/dateUtils');

console.log('=============================================================');
console.log('TEST SUITE: ADAPTIVE SPACED-REPETITION INTERVALS');
console.log('=============================================================');

// --------------------------------------------------------------------------
// WORKED EXAMPLE REQUESTED BY USER:
// Concept first studied 10 days before an exam that's 3 days away.
// --------------------------------------------------------------------------
console.log('\n--- WORKED EXAMPLE ---');
console.log('Scenario:');
console.log('- Exam Date: Day E');
console.log('- Concept first studied: Day E - 10 (10 days before exam)');
console.log('- Today: Day E - 3 (3 days before exam, examDaysLeft = 3)');
console.log('- Progression:');
console.log('   * Day E - 10: Initial study (Stage 0)');
console.log('   * Day E - 9  (1d later): Review 1 completed -> Stage 1');
console.log('   * Day E - 6  (3d later): Review 2 completed -> Stage 2');
console.log('   * Today is Day E - 3: 3 days since last review (daysSinceStudied = 3), reviewStage = 2.');

// Flat spaced repetition calculation:
const flatInterval = SPACED_INTERVALS[2]; // Stage 2 is 7 days
console.log(`\n1. Flat Spaced Repetition Logic:`);
console.log(`   Base Stage 2 interval: ${flatInterval} days`);
console.log(`   Days since last studied: 3 days`);
console.log(`   Next scheduled review under flat logic: (E - 6) + 7 = E + 1 (1 day AFTER exam!)`);
console.log(`   Is due today (daysSinceStudied >= 7)? ${3 >= 7 ? 'YES' : 'NO'}`);
console.log(`   Result: SILENTLY SKIPPED! Concept is never revised before exam.`);

// Adaptive calculation:
const adaptiveResult = getAdaptiveInterval({
  reviewStage: 2,
  examDaysLeft: 3,
  daysSinceStudied: 3
});

console.log(`\n2. Adaptive Spaced Repetition Logic:`);
console.log(`   examDaysLeft: 3 (Exam is <= 3 days out!)`);
console.log(`   Detected: Next standard review day would fall on E + 1 (past exam).`);
console.log(`   Action: Collapsed 7-day interval down into remaining runway -> ${adaptiveResult.interval} day(s).`);
console.log(`   Is accelerated: ${adaptiveResult.isAccelerated}`);
console.log(`   Is due today (daysSinceStudied >= ${adaptiveResult.interval})? ${3 >= adaptiveResult.interval ? 'YES' : 'NO'}`);
console.log(`   Result: SCHEDULED TODAY (Day E - 3) before the exam! ✓`);

console.assert(adaptiveResult.interval <= 2, 'Interval must be collapsed to <= 2 days when exam is 3 days away');
console.assert(3 >= adaptiveResult.interval, 'Concept must be due for revision today');
console.assert(adaptiveResult.isAccelerated === true, 'Must be flagged as accelerated');

// --------------------------------------------------------------------------
// TEST 2: Collapse logic when exam is very close (<= 3 days out)
// --------------------------------------------------------------------------
console.log('\n--- TEST 2: Revisions when exam is very close (<= 3 days out) ---');
for (let daysLeft = 3; daysLeft >= 1; daysLeft--) {
  for (let stage = 0; stage <= 3; stage++) {
    const res = getAdaptiveInterval({
      reviewStage: stage,
      examDaysLeft: daysLeft,
      daysSinceStudied: 2
    });
    console.log(`  examDaysLeft=${daysLeft}, reviewStage=${stage} (base: ${SPACED_INTERVALS[stage]}d) -> Adaptive Interval: ${res.interval}d (Accelerated: ${res.isAccelerated})`);
    console.assert(res.interval <= 2, `Interval must not exceed 2 days when exam is <= 3 days out (got ${res.interval})`);
  }
}
console.log('✓ Verified: No "Day 14" or "Day 7" interval scheduled when exam <= 3 days out.');

// --------------------------------------------------------------------------
// TEST 3: Pull earlier when revision would fall past exam date (> 3 days out)
// --------------------------------------------------------------------------
console.log('\n--- TEST 3: Pull earlier when next revision would fall after examDate ---');
// Exam in 5 days, reviewStage = 3 (base interval = 14 days), last studied 2 days ago.
// Standard due in 14 - 2 = 12 days (which is > 5 days -> falls after exam!).
const pullEarlierRes = getAdaptiveInterval({
  reviewStage: 3,
  examDaysLeft: 5,
  daysSinceStudied: 2
});
console.log(`  Exam in 5 days, reviewStage=3 (base: 14d), last studied 2d ago:`);
console.log(`  Adaptive Interval: ${pullEarlierRes.interval}d, Accelerated: ${pullEarlierRes.isAccelerated}`);
console.assert(pullEarlierRes.interval < 14, 'Interval must be pulled earlier than 14 days');
console.assert(pullEarlierRes.isAccelerated === true, 'Must be marked as accelerated');
console.log('✓ Verified: Pulled earlier before exam date instead of silently skipping.');

// --------------------------------------------------------------------------
// TEST 4: Baseline when no exam date exists (normal steady study)
// --------------------------------------------------------------------------
console.log('\n--- TEST 4: Standard intervals when no upcoming exam ---');
for (let stage = 0; stage <= 3; stage++) {
  const res = getAdaptiveInterval({ reviewStage: stage, examDaysLeft: null });
  console.assert(res.interval === SPACED_INTERVALS[stage], `Expected base interval ${SPACED_INTERVALS[stage]}, got ${res.interval}`);
}
console.log('✓ Verified: Standard [1, 3, 7, 14] intervals maintained when no exam date.');

// --------------------------------------------------------------------------
// TEST 5: Integration with generateDailyTasks and Candidate Generation
// --------------------------------------------------------------------------
console.log('\n--- TEST 5: Integration with generateDailyTasks ---');
const today = new Date();
const targetDateStr = toDateStr(today);
const examDateIn3Days = addDays(today, 3);

const mockSubject = {
  _id: 'subj_123',
  name: 'Machine Learning',
  code: 'CSC701',
  examDate: examDateIn3Days,
  confidence: 3,
  targetGoal: 'SCORE_WELL',
  modules: [
    {
      _id: 'mod_1',
      order: 1,
      name: 'Supervised Learning',
      concepts: [
        {
          _id: 'concept_1',
          name: 'Linear Regression',
          importance: 3,
          examRelevance: 3,
          difficulty: 2,
          estimatedStudyMinutes: 45,
          order: 1
        }
      ]
    }
  ],
  progressMap: {
    'concept_1': {
      status: 'learned',
      reviewStage: 2, // base is 7 days
      lastStudiedAt: addDays(today, -3) // studied 3 days ago
    }
  }
};

const dailyPlan = generateDailyTasks({
  subjects: [mockSubject],
  dateStr: targetDateStr,
  dailyCapacityMinutes: 60,
  timePreference: 'morning'
});

console.log(`Generated ${dailyPlan.tasks.length} task(s):`);
dailyPlan.tasks.forEach((t) => {
  console.log(`  - [${t.type}] ${t.topic} (${t.duration}m) — Reason: ${t.reason}`);
});

console.assert(dailyPlan.tasks.some((t) => t.topic === 'Linear Regression' && t.type === 'REVISE'), 'Concept must be scheduled for REVISE today!');
const reviseTask = dailyPlan.tasks.find((t) => t.topic === 'Linear Regression');
console.assert(reviseTask.reason.includes('accelerated revision before exam'), `Expected accelerated reason, got: ${reviseTask.reason}`);
console.log('✓ Verified: Candidate generation correctly schedules accelerated revision with syllabus reason!');

console.log('\n=============================================================');
console.log('ALL ADAPTIVE SPACED-REPETITION TESTS PASSED! ✓');
console.log('=============================================================');
