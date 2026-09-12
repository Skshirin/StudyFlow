require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../src/models/Task');
const StudyPlan = require('../src/models/StudyPlan');
const { resequenceDayBreaks } = require('../src/services/schedulingEngine');
const { toDateStr, addDays } = require('../src/utils/dateUtils');
const { parseIntent } = require('../src/services/intentParser');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const testUserId = 'test_break_user_' + Date.now();
  const todayStr = toDateStr(new Date());
  const tomorrowStr = toDateStr(addDays(new Date(), 1));

  const plan = await StudyPlan.create({
    userId: testUserId,
    startDate: todayStr,
    endDate: toDateStr(addDays(new Date(), 13)),
    dailyCapacityMinutes: 135,
    targetGoal: 'SCORE_WELL'
  });

  console.log('\n--- TEST 1: 0 study sessions -> 0 breaks ---');
  // Add 2 orphan breaks with no study sessions
  await Task.create([
    {
      userId: testUserId,
      planId: plan._id,
      topic: 'Break',
      date: todayStr,
      duration: 10,
      type: 'BREAK',
      status: 'pending'
    },
    {
      userId: testUserId,
      planId: plan._id,
      topic: 'Break',
      date: todayStr,
      duration: 10,
      type: 'BREAK',
      status: 'pending'
    }
  ]);

  await resequenceDayBreaks(testUserId, todayStr);
  const tasksAfterTest1 = await Task.find({ userId: testUserId, date: todayStr });
  if (tasksAfterTest1.length === 0) {
    console.log('✓ PASS: All orphan breaks were removed when 0 study sessions exist.');
  } else {
    console.error('✗ FAIL: Found tasks when 0 study sessions should have 0 breaks:', tasksAfterTest1);
    process.exit(1);
  }

  console.log('\n--- TEST 2: 1 study session -> 0 breaks ---');
  await Task.create({
    userId: testUserId,
    planId: plan._id,
    topic: 'Concept 1',
    date: todayStr,
    duration: 45,
    type: 'LEARN',
    status: 'pending'
  });

  await resequenceDayBreaks(testUserId, todayStr);
  const tasksAfterTest2 = await Task.find({ userId: testUserId, date: todayStr }).sort({ startTime: 1 });
  const breakCount2 = tasksAfterTest2.filter(t => t.type === 'BREAK').length;
  if (breakCount2 === 0 && tasksAfterTest2.length === 1) {
    console.log('✓ PASS: Exactly 1 session has 0 breaks (no lonely breaks).');
  } else {
    console.error('✗ FAIL: Expected 0 breaks with 1 session, got:', breakCount2);
    process.exit(1);
  }

  console.log('\n--- TEST 3: Add session (2 study sessions) -> Exactly 1 break in between ---');
  await Task.create({
    userId: testUserId,
    planId: plan._id,
    topic: 'Concept 2',
    date: todayStr,
    duration: 45,
    type: 'LEARN',
    status: 'pending'
  });

  await resequenceDayBreaks(testUserId, todayStr);
  const tasksAfterTest3 = await Task.find({ userId: testUserId, date: todayStr }).sort({ startTime: 1 });
  const sequence3 = tasksAfterTest3.map(t => t.type);
  console.log('Sequence for 2 study sessions:', sequence3.join(' -> '));
  if (sequence3.join(',') === 'LEARN,BREAK,LEARN') {
    console.log('✓ PASS: Exactly 1 break interleaved between 2 study sessions.');
  } else {
    console.error('✗ FAIL: Expected LEARN,BREAK,LEARN, got:', sequence3);
    process.exit(1);
  }

  console.log('\n--- TEST 4: 3 study sessions -> Exactly 2 breaks interleaved ---');
  await Task.create({
    userId: testUserId,
    planId: plan._id,
    topic: 'Concept 3',
    date: todayStr,
    duration: 45,
    type: 'PRACTICE',
    status: 'pending'
  });

  await resequenceDayBreaks(testUserId, todayStr);
  const tasksAfterTest4 = await Task.find({ userId: testUserId, date: todayStr }).sort({ startTime: 1 });
  const sequence4 = tasksAfterTest4.map(t => t.type);
  console.log('Sequence for 3 study sessions:', sequence4.join(' -> '));
  const breakCount4 = tasksAfterTest4.filter(t => t.type === 'BREAK').length;
  const studyCount4 = tasksAfterTest4.filter(t => t.type !== 'BREAK').length;
  const isProperlyInterleaved = tasksAfterTest4.every((t, i) => {
    if (i % 2 === 1) return t.type === 'BREAK';
    return t.type !== 'BREAK';
  });

  if (studyCount4 === 3 && breakCount4 === 2 && isProperlyInterleaved) {
    console.log('✓ PASS: Exactly 2 breaks cleanly interleaved among 3 study sessions.');
  } else {
    console.error('✗ FAIL: Interleaving check failed:', { studyCount4, breakCount4, sequence: sequence4 });
    process.exit(1);
  }

  console.log('\n--- TEST 5: Intent parser "add a session" detection ---');
  const parsedAdd1 = parseIntent('add a session');
  const parsedAdd2 = parseIntent('add session for Machine Learning');
  const parsedAdd3 = parseIntent('add another session');
  if (parsedAdd1?.intent === 'ADD_SESSION' && parsedAdd2?.intent === 'ADD_SESSION' && parsedAdd3?.intent === 'ADD_SESSION') {
    console.log('✓ PASS: All "add session" phrases parsed as ADD_SESSION.');
  } else {
    console.error('✗ FAIL: ADD_SESSION parsing failed:', { parsedAdd1, parsedAdd2, parsedAdd3 });
    process.exit(1);
  }

  // Cleanup
  await Task.deleteMany({ userId: testUserId });
  await StudyPlan.deleteMany({ userId: testUserId });
  await mongoose.disconnect();
  console.log('\n🎉 ALL BREAK REQUIREMENTS VERIFIED SUCCESSFULLY!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
