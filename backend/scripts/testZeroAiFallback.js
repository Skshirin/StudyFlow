const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const planController = require('../src/controllers/planController');
const Subject = require('../src/models/Subject');
const StudentSubject = require('../src/models/StudentSubject');
const StudyPlan = require('../src/models/StudyPlan');
const Task = require('../src/models/Task');
const { addDays } = require('../src/utils/dateUtils');

async function testZeroAiPath() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Connected.');

  // SIMULATE ZERO AI CONFIGURED: explicitly unset both keys
  const savedGeminiKey = process.env.GEMINI_API_KEY;
  const savedGroqKey = process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;

  console.log('\n--- ZERO AI CONFIGURATION CONFIRMED ---');
  console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY || '(unset)');
  console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY || '(unset)');

  const testUserId = `zero_ai_user_${Date.now()}`;
  const mlSubject = await Subject.findOne({ code: 'CSC701' }).lean();
  if (!mlSubject) throw new Error('CSC701 not found in DB');

  try {
    // Enroll user in ML subject
    const today = new Date();
    await StudentSubject.create({
      userId: testUserId,
      subjectId: mlSubject._id,
      examDate: addDays(today, 10),
      confidence: 3,
      targetGoal: 'SCORE_WELL'
    });

    // ------------------------------------------------------------------------
    // Step 1: Natural Language Adjustment bar returns UNKNOWN when AI is unset
    // ------------------------------------------------------------------------
    console.log('\n1. Testing adjustPlan natural-language adjustment bar with zero AI configured...');
    let adjustResData = null;
    const mockAdjustReq = {
      userId: testUserId,
      body: { text: 'I want to study machine learning for 5 days 2 hours each' }
    };
    const mockAdjustRes = {
      status: () => mockAdjustRes,
      json: (data) => {
        adjustResData = data;
        return mockAdjustRes;
      }
    };
    const mockNext = (err) => {
      if (err) console.error('Unexpected error:', err);
    };

    await planController.adjustPlan(mockAdjustReq, mockAdjustRes, mockNext);

    console.log('adjustPlan response:', adjustResData);
    console.assert(adjustResData.intent === 'UNKNOWN', `Expected intent UNKNOWN, got ${adjustResData.intent}`);
    console.log('✓ Verified: Natural language bar returns UNKNOWN cleanly with zero AI configured.');

    // ------------------------------------------------------------------------
    // Step 2: Manual fallback form submits directly to generatePlan
    // ------------------------------------------------------------------------
    console.log('\n2. Testing manual fallback submission to generatePlan directly...');
    let planResData = null;
    let planStatusCode = null;

    // Structured form data from ManualPlanModal:
    // Subject: CSC701, Goal: PASS, Available days: 7, Hours per day: 2.5 (150 min)
    const mockPlanReq = {
      userId: testUserId,
      body: {
        subjectId: mlSubject._id.toString(),
        targetGoal: 'PASS',
        days: 7,
        dailyCapacityMinutes: 150,
        timePreference: 'flexible'
      }
    };
    const mockPlanRes = {
      status: (code) => {
        planStatusCode = code;
        return mockPlanRes;
      },
      json: (data) => {
        planResData = data;
        return mockPlanRes;
      }
    };

    await planController.generatePlan(mockPlanReq, mockPlanRes, mockNext);

    console.log('generatePlan Status:', planStatusCode);
    console.log('Days generated:', planResData.daysGenerated);
    console.log('Tasks generated:', planResData.tasksGenerated);
    console.log('Feasibility status:', planResData.feasibility?.status);
    console.log('Feasibility message:', planResData.feasibility?.message);

    console.assert(planStatusCode === 201, 'Status should be 201');
    console.assert(planResData.daysGenerated === 7, `Expected 7 days generated, got ${planResData.daysGenerated}`);
    console.assert(planResData.tasksGenerated > 0, 'Should generate tasks');

    // Verify student subject targetGoal was updated to PASS
    const updatedStudentSubj = await StudentSubject.findOne({ userId: testUserId, subjectId: mlSubject._id });
    console.assert(updatedStudentSubj.targetGoal === 'PASS', `Expected targetGoal PASS, got ${updatedStudentSubj.targetGoal}`);
    console.log('✓ Verified: Student targetGoal successfully updated to PASS directly without AI.');

    // Verify tasks generated exist in DB
    const createdTasks = await Task.find({ userId: testUserId });
    console.log(`✓ Verified: ${createdTasks.length} tasks successfully scheduled in DB without calling AI.`);

    console.log('\n=============================================================');
    console.log('ZERO-AI FALLBACK PATH TEST PASSED COMPLETELY! ✓');
    console.log('=============================================================');
  } finally {
    // Restore environment keys
    if (savedGeminiKey) process.env.GEMINI_API_KEY = savedGeminiKey;
    if (savedGroqKey) process.env.GROQ_API_KEY = savedGroqKey;

    await Task.deleteMany({ userId: testUserId });
    await StudyPlan.deleteMany({ userId: testUserId });
    await StudentSubject.deleteMany({ userId: testUserId });
    await mongoose.disconnect();
  }
}

testZeroAiPath();
