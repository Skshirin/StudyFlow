require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const User = require('../src/models/User');
const Subject = require('../src/models/Subject');
const Module = require('../src/models/Module');
const Concept = require('../src/models/Concept');
const StudentSubject = require('../src/models/StudentSubject');
const StudentProgress = require('../src/models/StudentProgress');
const StudyPlan = require('../src/models/StudyPlan');
const Task = require('../src/models/Task');

const planController = require('../src/controllers/planController');
const taskController = require('../src/controllers/taskController');
const { toDateStr, addDays } = require('../src/utils/dateUtils');

// Helper to mock Express req & res
function createMockReqRes({ body = {}, params = {}, query = {}, userId } = {}) {
  let statusCode = 200;
  let responseData = null;

  const req = {
    body,
    params,
    query,
    userId: userId?.toString()
  };

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    }
  };

  const next = (err) => {
    if (err) throw err;
  };

  return {
    req,
    res,
    next,
    getResponse: () => ({ statusCode, data: responseData })
  };
}

async function runScenario1(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 1: 3 days + PASS goal, using CSC701 Machine Learning');
  console.log('================================================================');

  const requestBody = {
    subject: 'CSC701',
    goal: 'PASS',
    durationDays: 3,
    availableHoursPerDay: 3
  };

  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.generatePlan(req, res, next);
  const response = getResponse();

  const isSuccess = (response.statusCode === 201 || response.statusCode === 200) &&
    response.data.plan &&
    response.data.plan.targetGoal === 'PASS' &&
    response.data.tasksGenerated > 0;

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('RESPONSE SUMMARY:', {
    planId: response.data.plan?._id,
    targetGoal: response.data.plan?.targetGoal,
    daysGenerated: response.data.daysGenerated,
    tasksGenerated: response.data.tasksGenerated,
    feasibilityStatus: response.data.feasibility?.status,
    totalRequiredHours: response.data.feasibility?.totalRequiredHours,
    totalAvailableHours: response.data.feasibility?.totalAvailableHours
  });

  return {
    scenario: '1. 3 days + PASS goal, using CSC701 Machine Learning',
    pass: !!isSuccess,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario2(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 2: 3 days + SCORE_WELL goal, using CSDC7022 Blockchain');
  console.log('================================================================');

  const requestBody = {
    subject: 'CSDC7022',
    goal: 'SCORE_WELL',
    durationDays: 3,
    availableHoursPerDay: 3
  };

  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.generatePlan(req, res, next);
  const response = getResponse();

  const isSuccess = (response.statusCode === 201 || response.statusCode === 200) &&
    response.data.plan &&
    response.data.plan.targetGoal === 'SCORE_WELL' &&
    response.data.tasksGenerated > 0;

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('RESPONSE SUMMARY:', {
    planId: response.data.plan?._id,
    targetGoal: response.data.plan?.targetGoal,
    daysGenerated: response.data.daysGenerated,
    tasksGenerated: response.data.tasksGenerated,
    feasibilityStatus: response.data.feasibility?.status,
    totalRequiredHours: response.data.feasibility?.totalRequiredHours,
    totalAvailableHours: response.data.feasibility?.totalAvailableHours
  });

  return {
    scenario: '2. 3 days + SCORE_WELL goal, using CSDC7022 Blockchain',
    pass: !!isSuccess,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario3(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 3: Full preparation with generous available time, using CSC702 (Big Data Analytics) -> ON_TRACK');
  console.log('================================================================');

  const requestBody = {
    subject: 'CSC702',
    goal: 'FULL_PREPARATION',
    durationDays: 14,
    availableHoursPerDay: 4
  };

  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.generatePlan(req, res, next);
  const response = getResponse();

  const isSuccess = (response.statusCode === 201 || response.statusCode === 200) &&
    response.data.feasibility?.status === 'ON_TRACK';

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('RESPONSE FEASIBILITY:', response.data.feasibility);

  return {
    scenario: '3. Full preparation with generous time (CSC702) -> ON_TRACK',
    pass: !!isSuccess,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario4(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 4: Full preparation with insufficient time, using CSDC7013 (NLP) -> AT_RISK or EMERGENCY');
  console.log('================================================================');

  const requestBody = {
    subject: 'CSDC7013',
    goal: 'FULL_PREPARATION',
    durationDays: 1,
    availableHoursPerDay: 2
  };

  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.generatePlan(req, res, next);
  const response = getResponse();

  const status = response.data.feasibility?.status;
  const message = response.data.feasibility?.message || response.data.emergencyPlanNotice;
  const isShortageExplicit = typeof message === 'string' && (message.includes('hours') || message.includes('shortage') || message.includes('requires'));

  const isSuccess = (status === 'AT_RISK' || status === 'EMERGENCY') && isShortageExplicit;

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('FEASIBILITY STATUS:', status);
  console.log('EXPLICIT SHORTAGE MESSAGE:', message);

  return {
    scenario: '4. Full prep with insufficient time (CSDC7013) -> AT_RISK/EMERGENCY with explicit message',
    pass: !!isSuccess,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario5(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 5: "I only have 2 hours today" -> adjusts today\'s plan down across scheduled subjects');
  console.log('================================================================');

  const todayStr = toDateStr(new Date());
  // Ensure we have a plan in place
  let plan = await StudyPlan.findOne({ userId }).sort({ createdAt: -1 });
  if (!plan) {
    plan = await StudyPlan.create({
      userId,
      startDate: todayStr,
      endDate: toDateStr(addDays(new Date(), 7)),
      dailyCapacityMinutes: 180,
      timePreference: 'flexible',
      targetGoal: 'SCORE_WELL'
    });
  }

  // Ensure we have some scheduled tasks for today (e.g. 4 tasks of 60 mins = 240 mins)
  await Task.deleteMany({ userId, date: todayStr });

  const csc701 = await Subject.findOne({ code: 'CSC701' });
  const csdc7022 = await Subject.findOne({ code: 'CSDC7022' });

  await Task.create([
    {
      userId,
      planId: plan._id,
      subjectId: csc701._id,
      subjectName: csc701.name,
      topic: 'Linear Regression',
      date: todayStr,
      duration: 60,
      type: 'LEARN',
      priorityScore: 0.9,
      status: 'pending'
    },
    {
      userId,
      planId: plan._id,
      subjectId: csc701._id,
      subjectName: csc701.name,
      topic: 'Decision Trees',
      date: todayStr,
      duration: 60,
      type: 'LEARN',
      priorityScore: 0.8,
      status: 'pending'
    },
    {
      userId,
      planId: plan._id,
      subjectId: csdc7022._id,
      subjectName: csdc7022.name,
      topic: 'Consensus Mechanisms',
      date: todayStr,
      duration: 60,
      type: 'LEARN',
      priorityScore: 0.4,
      status: 'pending'
    },
    {
      userId,
      planId: plan._id,
      subjectId: csdc7022._id,
      subjectName: csdc7022.name,
      topic: 'Smart Contracts Intro',
      date: todayStr,
      duration: 60,
      type: 'LEARN',
      priorityScore: 0.3,
      status: 'pending'
    }
  ]);

  const requestBody = { text: 'I only have 2 hours today' };
  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.adjustPlan(req, res, next);
  const response = getResponse();

  // Check remaining active tasks for today: should total <= 120 mins (2 hours)
  const remainingActive = await Task.find({ userId, date: todayStr, status: 'pending' });
  const remainingMinutes = remainingActive.reduce((s, t) => s + t.duration, 0);

  const isSuccess = response.statusCode === 200 &&
    remainingMinutes <= 120 &&
    response.data.removedMinutes > 0;

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('RESPONSE DATA:', {
    message: response.data.message,
    removedMinutes: response.data.removedMinutes,
    remainingMinutes,
    remainingTasksCount: remainingActive.length
  });

  return {
    scenario: '5. "I only have 2 hours today" -> workload reduced across scheduled subjects to <= 2h',
    pass: !!isSuccess,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario6(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 6: Simulate missing yesterday\'s sessions -> confirm priority recalculation, not blind day-shifting');
  console.log('================================================================');

  const yesterdayStr = toDateStr(addDays(new Date(), -1));
  const tomorrowStr = toDateStr(addDays(new Date(), 1));

  const csc701 = await Subject.findOne({ code: 'CSC701' });
  const plan = await StudyPlan.findOne({ userId }).sort({ createdAt: -1 });

  // Create a missed task from yesterday
  const missedTaskDoc = await Task.create({
    userId,
    planId: plan._id,
    subjectId: csc701._id,
    subjectName: csc701.name,
    topic: 'Training/Generalization Error, Bias-Variance Tradeoff',
    date: yesterdayStr,
    duration: 60,
    type: 'LEARN',
    priorityScore: 0.85,
    status: 'pending'
  });

  const { req, res, next, getResponse } = createMockReqRes({
    params: { id: missedTaskDoc._id.toString() },
    userId
  });

  await taskController.missTask(req, res, next);
  const response = getResponse();

  const isRecalculated = response.statusCode === 200 &&
    (response.data.impacted?.length > 0 || response.data.postponed?.length > 0) &&
    response.data.message;

  console.log('REQUEST: POST /api/tasks/' + missedTaskDoc._id.toString() + '/miss');
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('RESPONSE SUMMARY:', {
    message: response.data.message,
    impactedCount: response.data.impacted?.length,
    postponedCount: response.data.postponed?.length,
    missedTaskStatus: response.data.missedTask?.status
  });

  return {
    scenario: '6. Simulate missing yesterday\'s sessions -> priority recalculation confirmed',
    pass: !!isRecalculated,
    request: { taskId: missedTaskDoc._id },
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario7(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 7: "I\'m weak in Ensemble Learning" -> maps to Module 3 concepts under CSC701 and increases priority');
  console.log('================================================================');

  const requestBody = { text: "I'm weak in Ensemble Learning" };
  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.adjustPlan(req, res, next);
  const response = getResponse();

  const csc701 = await Subject.findOne({ code: 'CSC701' });
  const mod3 = await Module.findOne({ subjectId: csc701._id, name: /Ensemble Learning/i });
  const mod3Concepts = await Concept.find({ moduleId: mod3._id });

  // Verify StudentProgress confidence was updated to 1 (weak)
  const progressRecords = await StudentProgress.find({
    userId,
    conceptId: { $in: mod3Concepts.map((c) => c._id) }
  });

  const allConfidenceIs1 = progressRecords.length > 0 && progressRecords.every((p) => p.confidence === 1);
  const resolvedSubjectIsML = response.data.resolved?.subject?.code === 'CSC701' ||
    response.data.resolved?.subject?.name === 'Machine Learning';

  const isSuccess = response.statusCode === 200 &&
    resolvedSubjectIsML &&
    allConfidenceIs1 &&
    response.data.mappedConcepts?.length > 0;

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('MAPPED TO SUBJECT:', response.data.resolved?.subject?.name, `(${response.data.resolved?.subject?.code})`);
  console.log('MAPPED CONCEPTS:', response.data.mappedConcepts);
  console.log('STUDENT PROGRESS UPDATED CONFIDENCE:', progressRecords.map((p) => ({ conceptId: p.conceptId, confidence: p.confidence })));

  return {
    scenario: '7. "I\'m weak in Ensemble Learning" -> maps to CSC701 Module 3 & increases priority',
    pass: !!isSuccess,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario8(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 8: "I\'m weak in Syntax Analysis" -> maps to Module 3 of CSDC7013 specifically, not another subject');
  console.log('================================================================');

  const requestBody = { text: "I'm weak in Syntax Analysis" };
  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.adjustPlan(req, res, next);
  const response = getResponse();

  const resolvedCode = response.data.resolved?.subject?.code;
  const resolvedWeakTopics = response.data.resolved?.weakTopics || [];
  const matchedModName = resolvedWeakTopics[0]?.name || '';

  const isSuccess = response.statusCode === 200 &&
    resolvedCode === 'CSDC7013' &&
    /Syntax Analysis/i.test(matchedModName) &&
    /Module 3/i.test(matchedModName);

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('RESOLVED SUBJECT:', resolvedCode, response.data.resolved?.subject?.name);
  console.log('RESOLVED WEAK TOPICS:', resolvedWeakTopics);

  return {
    scenario: '8. "I\'m weak in Syntax Analysis" -> maps specifically to CSDC7013 Module 3',
    pass: !!isSuccess,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario9(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 9: Non-existent concept in syllabus -> rejection, not hallucination');
  console.log('================================================================');

  const requestBody = { text: "I'm weak in Quantum Teleportation and Subatomic Entanglement" };
  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.adjustPlan(req, res, next);
  const response = getResponse();

  const isRejected = response.data.intent === 'UNKNOWN' ||
    (response.data.droppedWeakTopics && response.data.droppedWeakTopics.length > 0) ||
    (response.data.message && response.data.message.includes('not'));

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('RESPONSE DATA:', response.data);

  return {
    scenario: '9. Ask about non-existent concept -> confirm rejection, not hallucination',
    pass: !!isRejected,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario10(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 10: Malformed input to intent parser -> graceful fallback to manual/UNKNOWN, not crash');
  console.log('================================================================');

  const requestBody = { text: "%%%!!!@@@###$$$^^^&&&***()___+++ 99999999999999999 \\n\\t\\r" };
  const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
  await planController.adjustPlan(req, res, next);
  const response = getResponse();

  const isGraceful = (response.statusCode === 200 || response.statusCode === 400) &&
    (response.data.intent === 'UNKNOWN' || response.data.message);

  console.log('REQUEST:', JSON.stringify(requestBody, null, 2));
  console.log('RESPONSE STATUS:', response.statusCode);
  console.log('RESPONSE DATA:', response.data);

  return {
    scenario: '10. Feed malformed input -> graceful fallback to manual/UNKNOWN without crash',
    pass: !!isGraceful,
    request: requestBody,
    response: response.data,
    statusCode: response.statusCode
  };
}

async function runScenario11(userId) {
  console.log('\n================================================================');
  console.log('SCENARIO 11: Unset GEMINI_API_KEY & GROQ_API_KEY -> full app works across all 4 subjects');
  console.log('================================================================');

  const oldGemini = process.env.GEMINI_API_KEY;
  const oldGroq = process.env.GROQ_API_KEY;

  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;

  const subjects = ['CSC701', 'CSC702', 'CSDC7013', 'CSDC7022'];
  const results = [];

  for (const code of subjects) {
    const requestBody = {
      subject: code,
      goal: 'SCORE_WELL',
      durationDays: 4,
      availableHoursPerDay: 3
    };

    const { req, res, next, getResponse } = createMockReqRes({ body: requestBody, userId });
    await planController.generatePlan(req, res, next);
    const response = getResponse();

    const ok = (response.statusCode === 201 || response.statusCode === 200) &&
      response.data.tasksGenerated > 0;

    results.push({
      subject: code,
      statusCode: response.statusCode,
      tasksGenerated: response.data.tasksGenerated,
      feasibilityStatus: response.data.feasibility?.status,
      ok
    });
  }

  // Restore keys
  if (oldGemini) process.env.GEMINI_API_KEY = oldGemini;
  if (oldGroq) process.env.GROQ_API_KEY = oldGroq;

  const allPassed = results.every((r) => r.ok);

  console.log('ZERO-AI TEST RESULTS ACROSS 4 SUBJECTS:', results);

  return {
    scenario: '11. Zero AI keys configured -> plan generation works across all 4 subjects',
    pass: allPassed,
    request: { subjects, keysConfigured: false },
    response: results,
    statusCode: allPassed ? 200 : 500
  };
}

async function main() {
  await connectDB();

  const userId = 'scenario_runner_test_user';

  // Find or create test runner user
  await User.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        name: 'Scenario Runner',
        email: 'scenario_runner@studyflow.local'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Enroll in all 4 subjects
  const allSyllabusSubjects = await Subject.find({ code: { $in: ['CSC701', 'CSC702', 'CSDC7013', 'CSDC7022'] } });
  for (const s of allSyllabusSubjects) {
    await StudentSubject.findOneAndUpdate(
      { userId, subjectId: s._id },
      {
        $set: {
          examDate: addDays(new Date(), 10),
          confidence: 3,
          targetGoal: 'SCORE_WELL'
        }
      },
      { upsert: true }
    );
  }

  console.log(`\nStarting End-to-End Execution of All 11 Scenarios for User: ${userId}`);

  const scenarioResults = [];

  scenarioResults.push(await runScenario1(userId));
  scenarioResults.push(await runScenario2(userId));
  scenarioResults.push(await runScenario3(userId));
  scenarioResults.push(await runScenario4(userId));
  scenarioResults.push(await runScenario5(userId));
  scenarioResults.push(await runScenario6(userId));
  scenarioResults.push(await runScenario7(userId));
  scenarioResults.push(await runScenario8(userId));
  scenarioResults.push(await runScenario9(userId));
  scenarioResults.push(await runScenario10(userId));
  scenarioResults.push(await runScenario11(userId));

  console.log('\n================================================================');
  console.log('FINAL SUMMARY OF 11 SCENARIOS');
  console.log('================================================================');

  let totalPass = 0;
  scenarioResults.forEach((res, i) => {
    const status = res.pass ? 'PASS [✓]' : 'FAIL [✗]';
    if (res.pass) totalPass++;
    console.log(`${res.scenario}: ${status}`);
  });

  console.log(`\nOVERALL SCORE: ${totalPass} / ${scenarioResults.length} PASSED.`);

  // Write full json report
  const fs = require('fs');
  const reportPath = require('path').resolve(__dirname, 'scenario_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(scenarioResults, null, 2));
  console.log(`Detailed report saved to: ${reportPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Scenario runner encountered fatal error:', err);
  process.exit(1);
});
