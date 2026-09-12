const { assessFeasibility } = require('../src/services/feasibilityEngine');
const { generateDailyTasks } = require('../src/services/schedulingEngine');

// Sample test subject with high, medium, and low value concepts
const sampleSubject = {
  _id: 'sub_ml_01',
  name: 'Machine Learning',
  code: 'CSC701',
  examDate: '2026-09-20', // 8 days away
  confidence: 2, // Weak subject
  targetGoal: 'PASS',
  modules: [
    {
      _id: 'm1',
      name: 'Introduction',
      order: 1,
      concepts: [
        {
          _id: 'c1',
          name: 'ML Foundational Prerequisites',
          importance: 2,
          difficulty: 1,
          examRelevance: 2,
          estimatedStudyMinutes: 45,
          order: 1
        },
        {
          _id: 'c2',
          name: 'Minor Historical Trivia',
          importance: 1,
          difficulty: 1,
          examRelevance: 1,
          estimatedStudyMinutes: 30,
          order: 2
        }
      ]
    },
    {
      _id: 'm2',
      name: 'Core Classification & SVM',
      order: 2,
      concepts: [
        {
          _id: 'c3',
          name: 'Support Vector Machines',
          importance: 3,
          difficulty: 3,
          examRelevance: 3,
          estimatedStudyMinutes: 120,
          order: 1
        },
        {
          _id: 'c4',
          name: 'Decision Trees & CART',
          importance: 3,
          difficulty: 2,
          examRelevance: 3,
          estimatedStudyMinutes: 90,
          order: 2
        }
      ]
    }
  ]
};

console.log('=== TEST 1: PASS GOAL (Skips low-value concepts) ===');
const feasibilityPass = assessFeasibility({
  subjects: [{ ...sampleSubject, targetGoal: 'PASS' }],
  dailyCapacityMinutes: 60,
  today: new Date('2026-09-12'),
  planDays: 8
});

console.log('Feasibility Status:', feasibilityPass.status);
console.log('Traffic Light:', feasibilityPass.trafficLight);
console.log('Required Hours:', feasibilityPass.requiredHours, 'Available Hours:', feasibilityPass.availableHours);
console.log('Message:', feasibilityPass.message);
console.log('Skipped Concepts:', feasibilityPass.skippedConcepts.map((c) => `${c.conceptName} (${c.reason})`));

const tasksPass = generateDailyTasks({
  subjects: [{ ...sampleSubject, targetGoal: 'PASS' }],
  dateStr: '2026-09-14',
  dailyCapacityMinutes: 120
});
console.log('Scheduled concepts for PASS:');
tasksPass.tasks.filter((t) => t.type !== 'BREAK').forEach((t) => {
  console.log(`- ${t.topic} (${t.duration}m) | Score: ${t.priorityScore} | Reason: "${t.reason}"`);
});

console.log('\n=== TEST 2: EMERGENCY FEASIBILITY (Extreme Shortfall) ===');
// Exam in 2 days, 15 hours required vs 2 hours available
const emergencySubject = {
  ...sampleSubject,
  examDate: '2026-09-14', // 2 days away
  targetGoal: 'FULL_PREPARATION'
};
const feasibilityEmergency = assessFeasibility({
  subjects: [emergencySubject],
  dailyCapacityMinutes: 60, // 60 min * 2 days = 120 min available (2h) vs ~4.75h required
  today: new Date('2026-09-12'),
  planDays: 2
});

console.log('Feasibility Status:', feasibilityEmergency.status);
console.log('Traffic Light:', feasibilityEmergency.trafficLight);
console.log('Required Hours:', feasibilityEmergency.requiredHours, 'Available Hours:', feasibilityEmergency.availableHours, 'Shortage:', feasibilityEmergency.shortfallHours);
console.log('Message:', feasibilityEmergency.message);
console.log('Postponed Concepts:', feasibilityEmergency.postponedConcepts.map((c) => `${c.conceptName} (${c.estimatedMinutes}m)`));

console.log('\n=== TEST 3: ON_TRACK FEASIBILITY (Comfortable Pace) ===');
const feasibilityOnTrack = assessFeasibility({
  subjects: [{ ...sampleSubject, targetGoal: 'SCORE_WELL', examDate: '2026-10-12' }], // 30 days away
  dailyCapacityMinutes: 120,
  today: new Date('2026-09-12')
});
console.log('Feasibility Status:', feasibilityOnTrack.status);
console.log('Traffic Light:', feasibilityOnTrack.trafficLight);
console.log('Message:', feasibilityOnTrack.message);
