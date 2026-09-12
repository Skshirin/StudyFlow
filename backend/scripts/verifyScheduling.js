const { generateDailyTasks } = require('../src/services/schedulingEngine');

// 1. Syllabus Subject: 6 modules (matches CSC701 Machine Learning)
const syllabusSubject = {
  _id: 'sub_ml_701',
  name: 'Machine Learning',
  code: 'CSC701',
  examDate: '2026-09-16',
  confidence: 2, // weakness = 4 (weak topic)
  targetGoal: 'SCORE_WELL',
  modules: [
    {
      _id: 'm1',
      name: 'Introduction to Machine Learning',
      order: 1,
      concepts: [
        {
          _id: 'c1',
          name: 'ML Types & Overview',
          importance: 2,
          difficulty: 1, // Easy: 30 min, should NOT be duplicated in pass 2
          examRelevance: 2,
          estimatedStudyMinutes: 30
        }
      ]
    },
    { _id: 'm2', name: 'Regression and Trees', order: 2, concepts: [] },
    { _id: 'm3', name: 'Ensemble Learning', order: 3, concepts: [] },
    {
      _id: 'm4',
      name: 'Learning with Classification',
      order: 4,
      concepts: [
        {
          _id: 'c2',
          name: 'Support Vector Machine (SVM)',
          importance: 3,
          difficulty: 3, // Hard: 150 min, can span multiple blocks in pass 2
          examRelevance: 3,
          estimatedStudyMinutes: 150
        }
      ]
    },
    { _id: 'm5', name: 'Dimensionality Reduction', order: 5, concepts: [] },
    { _id: 'm6', name: 'Reinforcement Learning', order: 6, concepts: [] }
  ]
};

console.log('=== TEST 1: SYLLABUS SUBJECT (Daily Capacity = 180 min) ===');
const resSyllabus = generateDailyTasks({
  subjects: [syllabusSubject],
  dateStr: '2026-09-14',
  dailyCapacityMinutes: 180,
  timePreference: 'morning'
});

console.log('Total tasks generated:', resSyllabus.tasks.length);
console.log('Planned study minutes:', resSyllabus.plannedMinutes);
console.log('Tasks list:');
resSyllabus.tasks.forEach((t, i) => {
  console.log(`  [${i + 1}] ${t.startTime} - ${t.topic} (${t.duration}m, ${t.type}) | Score: ${t.priorityScore} | Reason: "${t.reason}"`);
});

const c1Count = resSyllabus.tasks.filter((t) => t.topic === 'ML Types & Overview').length;
const svmCount = resSyllabus.tasks.filter((t) => t.topic === 'Support Vector Machine (SVM)').length;
console.log(`\nDedup Verification:`);
console.log(`- 'ML Types & Overview' (diff=1): ${c1Count} session (Expected: 1, strictly no pass-2 duplicates)`);
console.log(`- 'Support Vector Machine (SVM)' (diff=3): ${svmCount} sessions (Expected: 2, multi-block span for hard concepts with remaining work)`);

console.log('\n=== TEST 2: LEGACY SUBJECT (Daily Capacity = 60 min) ===');
const legacySubject = {
  _id: 'leg_history_01',
  name: 'World History',
  difficulty: 3,
  confidence: 4,
  topics: [
    { name: 'Industrial Revolution', status: 'not_started' }
  ]
};

const resLegacy = generateDailyTasks({
  subjects: [legacySubject],
  dateStr: '2026-09-14',
  dailyCapacityMinutes: 60,
  timePreference: 'morning'
});

console.log('Total tasks generated:', resLegacy.tasks.length);
console.log('Planned study minutes:', resLegacy.plannedMinutes);
console.log('Tasks list:');
resLegacy.tasks.forEach((t, i) => {
  console.log(`  [${i + 1}] ${t.startTime} - ${t.topic} (${t.duration}m, ${t.type}) | Score: ${t.priorityScore} | Reason: "${t.reason}"`);
});
