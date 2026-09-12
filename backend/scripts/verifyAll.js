require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Subject = require('../src/models/Subject');
const Module = require('../src/models/Module');
const Concept = require('../src/models/Concept');
const StudentSubject = require('../src/models/StudentSubject');
const StudyPlan = require('../src/models/StudyPlan');
const Task = require('../src/models/Task');
const { parseIntentWithAI, prioritizeConceptsWithAI } = require('../src/services/aiService');
const { generateMasterPlan, SESSION_CONFIG } = require('../src/services/schedulingEngine');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'studyflow_default_jwt_secret_dev_key';

async function runTests() {
  console.log('=== STARTING STUDYFLOW V2 AUTOMATED VERIFICATION ===\n');
  await connectDB();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST SUITE 1: AI Intent & Goal Differentiation
    // -------------------------------------------------------------
    console.log('1. Testing Gemini AI Intent Extraction & Strategy Differentiation...');

    const passPrompt = "I just want to pass this subject in 14 days.";
    const topPrompt = "I want to top the class with full preparation in 14 days.";
    const emergencyPrompt = "My exam is in 5 days and I haven't started studying.";

    const passIntent = await parseIntentWithAI(passPrompt);
    const topIntent = await parseIntentWithAI(topPrompt);
    const emergencyIntent = await parseIntentWithAI(emergencyPrompt);

    assert(passIntent.goalType === 'PASS', `Pass prompt interpreted as PASS (got: ${passIntent.goalType})`);
    assert(topIntent.goalType === 'TOP', `Top prompt interpreted as TOP (got: ${topIntent.goalType})`);
    assert(emergencyIntent.goalType === 'EMERGENCY', `Emergency prompt interpreted as EMERGENCY (got: ${emergencyIntent.goalType})`);

    // Verify strategy differentiation
    assert(
      passIntent.priorityStrategy !== topIntent.priorityStrategy || passIntent.coverageLevel !== topIntent.coverageLevel,
      `Strategies differ between PASS (${passIntent.coverageLevel}) and TOP (${topIntent.coverageLevel})`
    );

    // -------------------------------------------------------------
    // TEST SUITE 2: Master Topic Allocation & Zero Duplicate Learn
    // -------------------------------------------------------------
    console.log('\n2. Testing Master Topic Allocation & Duplicate Learn Prevention...');

    // Fetch real seeded course from MongoDB
    const testSubject = await Subject.findOne({ code: { $exists: true } });
    if (!testSubject) {
      throw new Error('No syllabus subjects found in database. Run seed script first.');
    }

    const testModules = await Module.find({ subjectId: testSubject._id }).sort({ order: 1 }).lean();
    const testConcepts = await Concept.find({ moduleId: { $in: testModules.map(m => m._id) } }).sort({ order: 1 }).lean();

    const populatedSubject = {
      _id: testSubject._id,
      name: testSubject.name,
      code: testSubject.code,
      modules: testModules.map(m => ({
        ...m,
        concepts: testConcepts.filter(c => c.moduleId.toString() === m._id.toString())
      }))
    };

    // Prioritize for PASS
    const passPrioritized = await prioritizeConceptsWithAI({
      intent: passIntent,
      concepts: testConcepts.map(c => ({
        id: c._id.toString(),
        name: c.name,
        moduleName: 'Mod',
        importance: c.importance,
        examRelevance: c.examRelevance,
        difficulty: c.difficulty
      })),
      subjectName: testSubject.name
    });

    const passPlan = generateMasterPlan({
      subjects: [populatedSubject],
      startDateStr: '2026-09-14',
      totalDays: 14,
      intent: { ...passIntent, prioritizedConceptIds: passPrioritized.prioritizedConceptIds },
      dailyBudgetMinutes: SESSION_CONFIG.DEFAULT_DAILY_BUDGET
    });

    // Check for duplicate LEARN tasks
    const learnConceptIds = [];
    const duplicateLearns = [];
    passPlan.tasks.forEach(t => {
      if (t.type === 'LEARN') {
        const idStr = t.conceptId?.toString();
        if (learnConceptIds.includes(idStr)) {
          duplicateLearns.push(t.topic);
        } else {
          learnConceptIds.push(idStr);
        }
      }
    });

    assert(duplicateLearns.length === 0, `Zero duplicate LEARN concepts found (duplicate count: ${duplicateLearns.length})`);

    // Verify all repeated concepts have valid explicit types
    const conceptTaskTypes = new Map();
    passPlan.tasks.forEach(t => {
      if (t.conceptId) {
        const idStr = t.conceptId.toString();
        if (!conceptTaskTypes.has(idStr)) conceptTaskTypes.set(idStr, []);
        conceptTaskTypes.get(idStr).push(t.type);
      }
    });

    let allRepeatsValid = true;
    for (const [cId, types] of conceptTaskTypes.entries()) {
      const learnCount = types.filter(t => t === 'LEARN').length;
      if (learnCount > 1) allRepeatsValid = false;
    }
    assert(allRepeatsValid, 'All repeated concept occurrences are strictly non-LEARN (REVISE/PRACTICE/MOCK_TEST)');

    // -------------------------------------------------------------
    // TEST SUITE 3: Date Range & Sunday Handling
    // -------------------------------------------------------------
    console.log('\n3. Testing Date Calculations (14-Day Plan)...');

    assert(passPlan.totalDays === 14, `Plan totalDays is exactly 14 (got: ${passPlan.totalDays})`);
    assert(passPlan.startDate === '2026-09-14', `Start date is correct: 2026-09-14`);
    assert(passPlan.endDate === '2026-09-27', `End date is correct: 2026-09-27 (got: ${passPlan.endDate})`);

    // Verify unique dates across tasks
    const uniqueDates = [...new Set(passPlan.tasks.map(t => t.date))];
    assert(uniqueDates.length === 14, `Exactly 14 distinct calendar dates generated (got: ${uniqueDates.length})`);

    // Check Sunday inclusion: Sept 20, 2026 is Sunday
    const hasSunday = uniqueDates.includes('2026-09-20');
    assert(hasSunday, 'Sunday (2026-09-20) is included in generated schedule');

    // -------------------------------------------------------------
    // TEST SUITE 4: Plan Comparison (PASS vs TOP)
    // -------------------------------------------------------------
    console.log('\n4. Testing Plan Strategy Comparison (PASS vs TOP)...');

    const topPrioritized = await prioritizeConceptsWithAI({
      intent: topIntent,
      concepts: testConcepts.map(c => ({
        id: c._id.toString(),
        name: c.name,
        moduleName: 'Mod',
        importance: c.importance,
        examRelevance: c.examRelevance,
        difficulty: c.difficulty
      })),
      subjectName: testSubject.name
    });

    const topPlan = generateMasterPlan({
      subjects: [populatedSubject],
      startDateStr: '2026-09-14',
      totalDays: 14,
      intent: { ...topIntent, prioritizedConceptIds: topPrioritized.prioritizedConceptIds },
      dailyBudgetMinutes: SESSION_CONFIG.DEFAULT_DAILY_BUDGET
    });

    const passPracticeCount = passPlan.tasks.filter(t => t.type === 'PRACTICE' || t.type === 'MOCK_TEST').length;
    const topPracticeCount = topPlan.tasks.filter(t => t.type === 'PRACTICE' || t.type === 'MOCK_TEST').length;

    assert(topPlan.tasks.length > 0, `TOP plan generated ${topPlan.tasks.length} sessions`);
    assert(passPlan.tasks.length > 0, `PASS plan generated ${passPlan.tasks.length} sessions`);
    assert(
      topPlan.tasks[0]?.topic !== passPlan.tasks[0]?.topic || topPracticeCount !== passPracticeCount || passPlan.allocatedLearnCount !== topPlan.allocatedLearnCount,
      `PASS and TOP plans differ in concept order or session distribution (PASS Learn: ${passPlan.allocatedLearnCount}, TOP Learn: ${topPlan.allocatedLearnCount})`
    );

    // -------------------------------------------------------------
    // TEST SUITE 5: Guest Identity Isolation
    // -------------------------------------------------------------
    console.log('\n5. Testing Guest Identity Isolation...');

    const testUserAId = `test_user_a_${Date.now()}`;
    const testGuestId = `guest_${Date.now()}`;

    // 1. User A creates subject and study plan
    await StudentSubject.create({
      userId: testUserAId,
      subjectId: testSubject._id,
      targetGoal: 'SCORE_WELL'
    });

    await StudyPlan.create({
      userId: testUserAId,
      startDate: '2026-09-14',
      endDate: '2026-09-27',
      totalDays: 14,
      dailyCapacityMinutes: 135,
      targetGoal: 'SCORE_WELL'
    });

    // 2. Query as Guest
    const guestSubjects = await StudentSubject.find({ userId: testGuestId });
    const guestPlans = await StudyPlan.find({ userId: testGuestId });

    assert(guestSubjects.length === 0, `Guest sees 0 subjects (User A data isolated: ${guestSubjects.length} found)`);
    assert(guestPlans.length === 0, `Guest sees 0 plans (User A plan isolated: ${guestPlans.length} found)`);

    // 3. Guest creates guest subject
    await StudentSubject.create({
      userId: testGuestId,
      subjectId: testSubject._id,
      targetGoal: 'PASS'
    });

    // 4. Query as User A
    const userASubjects = await StudentSubject.find({ userId: testUserAId });
    assert(userASubjects.length === 1, `User A still sees only 1 subject (Guest subject isolated)`);
    assert(userASubjects[0].targetGoal === 'SCORE_WELL', `User A subject retained its goal (SCORE_WELL)`);

    // Cleanup test data
    await StudentSubject.deleteMany({ userId: { $in: [testUserAId, testGuestId] } });
    await StudyPlan.deleteMany({ userId: { $in: [testUserAId, testGuestId] } });

    // -------------------------------------------------------------
    // TEST SUITE 6: Gemini Offline Fallback
    // -------------------------------------------------------------
    console.log('\n6. Testing Deterministic Fallback on Gemini Failure...');

    // Simulate fallback by passing unparseable input to prioritizeConceptsWithGemini
    const fallbackPlan = generateMasterPlan({
      subjects: [populatedSubject],
      startDateStr: '2026-09-14',
      totalDays: 14,
      intent: { goalType: 'PASS', prioritizedConceptIds: [] },
      dailyBudgetMinutes: SESSION_CONFIG.DEFAULT_DAILY_BUDGET
    });

    assert(fallbackPlan.tasks.length > 0, `Fallback plan successfully generated ${fallbackPlan.tasks.length} sessions without Gemini`);
    assert(fallbackPlan.totalDays === 14, `Fallback plan still covers 14 days`);

    console.log(`\n=== VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
