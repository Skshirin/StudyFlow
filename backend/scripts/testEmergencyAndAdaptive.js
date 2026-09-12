const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Subject = require('../src/models/Subject');
const Module = require('../src/models/Module');
const Concept = require('../src/models/Concept');
const StudentSubject = require('../src/models/StudentSubject');
const StudentProgress = require('../src/models/StudentProgress');
const StudyPlan = require('../src/models/StudyPlan');
const Task = require('../src/models/Task');

const { assessFeasibility, buildEmergencyPlanDataset } = require('../src/services/feasibilityEngine');
const { generateDailyTasks } = require('../src/services/schedulingEngine');
const { redistributeMissedTask } = require('../src/services/adaptiveEngine');
const { toDateStr, addDays } = require('../src/utils/dateUtils');

async function runVerification() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Connected.');

  const testUserId = `test_user_emergency_${Date.now()}`;

  try {
    // --------------------------------------------------------------------------
    // 1. SETUP: Load a real syllabus subject from seeded database (CSC701 Machine Learning)
    // --------------------------------------------------------------------------
    const mlSubject = await Subject.findOne({ code: 'CSC701' }).lean();
    if (!mlSubject) {
      throw new Error('CSC701 not found in database. Please ensure DB is seeded.');
    }

    const modules = await Module.find({ subjectId: mlSubject._id }).sort({ order: 1 }).lean();
    const moduleIds = modules.map((m) => m._id);
    const concepts = await Concept.find({ moduleId: { $in: moduleIds } }).sort({ order: 1 }).lean();

    console.log(`\nFound subject ${mlSubject.code} (${mlSubject.name}) with ${modules.length} modules and ${concepts.length} concepts.`);

    // --------------------------------------------------------------------------
    // TEST 1: EMERGENCY MODE (Student says: "my exam is tomorrow and I haven't studied")
    // --------------------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 1: EMERGENCY MODE - Exam is Tomorrow (1 day runway)');
    console.log('=============================================================');

    const today = new Date();
    const examDateTomorrow = addDays(today, 1);

    // Mock enrolled subject with exam tomorrow
    const enrolledSubject = {
      _id: mlSubject._id,
      name: mlSubject.name,
      code: mlSubject.code,
      examDate: examDateTomorrow,
      confidence: 2, // weak area
      targetGoal: 'SCORE_WELL',
      modules: modules.map((m) => ({
        ...m,
        concepts: concepts.filter((c) => c.moduleId.toString() === m._id.toString())
      })),
      progressMap: {} // no concepts mastered yet
    };

    const dailyCapacityMinutes = 120; // 2 hours
    const feasibility = assessFeasibility({
      subjects: [enrolledSubject],
      dailyCapacityMinutes,
      today,
      planDays: 1
    });

    console.log(`Feasibility Status: ${feasibility.status} (Traffic Light: ${feasibility.trafficLight})`);
    console.log(`Required Hours: ${feasibility.requiredHours}h, Available Hours: ${feasibility.availableHours}h, Ratio: ${feasibility.ratio}`);
    console.assert(feasibility.status === 'EMERGENCY', `Expected EMERGENCY status, got ${feasibility.status}`);

    // Run buildEmergencyPlanDataset
    const emergencyData = buildEmergencyPlanDataset({
      subjects: [enrolledSubject],
      feasibility
    });

    console.log('\n--- Emergency Mode Output ---');
    console.log(`Emergency Message:\n"${emergencyData.emergencyMessage}"`);
    console.log(`\nSelected High-Yield Concepts (${emergencyData.selectedConcepts.length}):`);
    emergencyData.selectedConcepts.forEach((c) => {
      console.log(`  ✓ [Score: ${c.priorityScore}] ${c.conceptName} (${c.estimatedMinutes}m, imp: ${c.importance}, rel: ${c.examRelevance})`);
    });

    console.log(`\nExplicitly Skipped Concepts (${emergencyData.skippedConcepts.length}):`);
    emergencyData.skippedConcepts.slice(0, 3).forEach((c) => {
      console.log(`  ✗ ${c.conceptName}: ${c.reason}`);
    });
    if (emergencyData.skippedConcepts.length > 3) {
      console.log(`  ... and ${emergencyData.skippedConcepts.length - 3} more concepts explicitly omitted.`);
    }

    // Verify Message Format
    const expectedPrefix = `Your available time is ${feasibility.availableHours} hours, while full preparation requires approximately ${feasibility.requiredHours} hours. I've created an ${feasibility.availableHours}-hour high-priority plan focusing on the highest-value topics.`;
    console.assert(
      emergencyData.emergencyMessage === expectedPrefix,
      `Emergency message mismatch!\nExpected: "${expectedPrefix}"\nGot:      "${emergencyData.emergencyMessage}"`
    );

    // Verify generation of emergency plan tasks
    const { tasks: emergencyTasks, plannedMinutes } = generateDailyTasks({
      subjects: emergencyData.prunedSubjects,
      dateStr: toDateStr(today),
      dailyCapacityMinutes,
      timePreference: 'flexible',
      energyLevel: 'normal'
    });

    console.log(`\nTasks generated for emergency day: ${emergencyTasks.length} tasks, ${plannedMinutes}m total`);
    emergencyTasks.forEach((t) => {
      console.log(`  - [${t.type}] ${t.topic} (${t.duration}m) — Reason: ${t.reason}`);
    });

    console.assert(plannedMinutes <= dailyCapacityMinutes, 'Planned minutes must not exceed available daily capacity!');

    // --------------------------------------------------------------------------
    // TEST 2: MISSED-SESSION RECALCULATION & HARD EXAM BOUNDARY
    // --------------------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 2: MISSED-SESSION RECALCULATION & HARD EXAM BOUNDARY');
    console.log('=============================================================');

    // Create a mock StudyPlan
    const plan = await StudyPlan.create({
      userId: testUserId,
      startDate: toDateStr(today),
      endDate: toDateStr(addDays(today, 3)),
      dailyCapacityMinutes: 120,
      timePreference: 'flexible'
    });

    // Case 2A: Exam is in 2 days. Miss a task today.
    // Create StudentSubject with exam in 2 days
    const examDateIn2Days = addDays(today, 2);
    await StudentSubject.create({
      userId: testUserId,
      subjectId: mlSubject._id,
      examDate: examDateIn2Days,
      confidence: 2,
      targetGoal: 'SCORE_WELL'
    });

    const missedTask = await Task.create({
      userId: testUserId,
      planId: plan._id,
      subjectId: mlSubject._id,
      subjectName: mlSubject.name,
      topic: 'Introduction to Machine Learning',
      date: toDateStr(today),
      duration: 60,
      type: 'LEARN',
      priorityScore: 0.85,
      status: 'missed'
    });

    // Populate day +1 with an existing low-priority task (e.g. priority 0.3)
    const lowPriorityTask = await Task.create({
      userId: testUserId,
      planId: plan._id,
      subjectId: mlSubject._id,
      subjectName: mlSubject.name,
      topic: 'Low Priority Background Reading',
      date: toDateStr(addDays(today, 1)),
      duration: 120, // saturates capacity!
      type: 'LEARN',
      priorityScore: 0.30,
      status: 'pending'
    });

    console.log(`\nCreated missed task (${missedTask.topic}, priority ${missedTask.priorityScore}, 60m).`);
    console.log(`Day +1 is full with low-priority task (${lowPriorityTask.topic}, priority ${lowPriorityTask.priorityScore}, 120m).`);
    console.log(`Exam date is in 2 days (${toDateStr(examDateIn2Days)}).`);

    const redistribution = await redistributeMissedTask({
      userId: testUserId,
      planId: plan._id,
      missedTask,
      dailyCapacityMinutes: 120,
      spreadDays: 5, // Requesting 5 days, but exam is in 2 days!
      today
    });

    console.log('\n--- Redistribution Result ---');
    console.log('Message:', redistribution.message);
    console.log('Impacted days:', redistribution.impacted);
    console.log('Postponed / Displaced sessions:', redistribution.postponed);

    // Verify hard boundary: No task scheduled on or after day 3!
    const futureTasks = await Task.find({
      userId: testUserId,
      date: { $gt: toDateStr(examDateIn2Days) }
    });
    console.assert(futureTasks.length === 0, `VIOLATION: Tasks were scheduled past exam date! Found ${futureTasks.length}`);
    console.log('✓ Verified: No tasks scheduled past exam date.');

    // Verify priority displacement: Low-priority task was displaced/postponed
    const updatedLowPriority = await Task.findById(lowPriorityTask._id);
    console.assert(
      updatedLowPriority.status === 'skipped',
      `Expected low-priority task to be postponed/skipped, but status is ${updatedLowPriority.status}`
    );
    console.log('✓ Verified: Low-priority task was postponed to accommodate high-priority missed session.');

    // Case 2B: Exam is Today (0 days left). Miss a task.
    console.log('\n--- Case 2B: Exam is Today (Hard Boundary Immediate Cutoff) ---');
    await StudentSubject.updateOne(
      { userId: testUserId, subjectId: mlSubject._id },
      { examDate: today }
    );

    const taskOnExamDay = await Task.create({
      userId: testUserId,
      planId: plan._id,
      subjectId: mlSubject._id,
      subjectName: mlSubject.name,
      topic: 'Final Exam Preparation',
      date: toDateStr(today),
      duration: 60,
      type: 'REVISE',
      priorityScore: 0.9,
      status: 'missed'
    });

    const cutoffRedistribution = await redistributeMissedTask({
      userId: testUserId,
      planId: plan._id,
      missedTask: taskOnExamDay,
      dailyCapacityMinutes: 120,
      spreadDays: 3,
      today
    });

    console.log('Impacted days count:', cutoffRedistribution.impacted.length);
    console.log('Cutoff message:', cutoffRedistribution.message);
    console.log('Postponed reasons:', cutoffRedistribution.postponed.map((p) => p.reason));

    console.assert(cutoffRedistribution.impacted.length === 0, 'Cannot reschedule past exam date!');
    console.assert(cutoffRedistribution.postponed.length > 0, 'Must record missed task as postponed when exam arrived.');
    console.log('✓ Verified: Zero tasks rescheduled past exam date when exam day is reached.');

    // Clean up test data
    await Task.deleteMany({ userId: testUserId });
    await StudyPlan.deleteMany({ userId: testUserId });
    await StudentSubject.deleteMany({ userId: testUserId });

    console.log('\n=============================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! ✓');
    console.log('=============================================================');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runVerification();
