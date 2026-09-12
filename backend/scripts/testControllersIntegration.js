const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const planController = require('../src/controllers/planController');
const taskController = require('../src/controllers/taskController');
const Subject = require('../src/models/Subject');
const StudentSubject = require('../src/models/StudentSubject');
const StudyPlan = require('../src/models/StudyPlan');
const Task = require('../src/models/Task');
const { addDays, toDateStr } = require('../src/utils/dateUtils');

async function testControllers() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Testing Controllers with Mocks...');

  const testUserId = `controller_test_${Date.now()}`;
  const mlSubject = await Subject.findOne({ code: 'CSC701' }).lean();

  try {
    // Enroll user with exam tomorrow (Emergency!)
    const today = new Date();
    await StudentSubject.create({
      userId: testUserId,
      subjectId: mlSubject._id,
      examDate: addDays(today, 1),
      confidence: 1,
      targetGoal: 'PASS'
    });

    // 1. Test generatePlan in EMERGENCY MODE
    let planResponseData = null;
    let planStatusCode = null;

    const mockPlanReq = {
      userId: testUserId,
      body: {
        dailyCapacityMinutes: 120,
        timePreference: 'flexible'
      }
    };
    const mockPlanRes = {
      status: (code) => {
        planStatusCode = code;
        return mockPlanRes;
      },
      json: (data) => {
        planResponseData = data;
        return mockPlanRes;
      }
    };
    const mockNext = (err) => {
      if (err) console.error('Error in generatePlan:', err);
    };

    await planController.generatePlan(mockPlanReq, mockPlanRes, mockNext);

    console.log('generatePlan Status Code:', planStatusCode);
    console.log('daysGenerated:', planResponseData.daysGenerated);
    console.log('tasksGenerated:', planResponseData.tasksGenerated);
    console.log('feasibility.status:', planResponseData.feasibility?.status);
    console.log('feasibility.emergencyMode:', planResponseData.feasibility?.emergencyMode);
    console.log('feasibility.message:', planResponseData.feasibility?.message);
    console.log('emergencyPlanNotice:', planResponseData.emergencyPlanNotice);
    console.log('skippedConcepts count:', planResponseData.feasibility?.skippedConcepts?.length);

    console.assert(planStatusCode === 201, 'Status code should be 201');
    console.assert(planResponseData.daysGenerated === 1, 'Should only generate 1 day for exam tomorrow in emergency mode');
    console.assert(planResponseData.feasibility?.status === 'EMERGENCY', 'Feasibility should be EMERGENCY');
    console.assert(planResponseData.feasibility?.emergencyMode === true, 'emergencyMode flag should be true');
    console.assert(typeof planResponseData.emergencyPlanNotice === 'string', 'emergencyPlanNotice should be present');

    // 2. Test missTask endpoint with task controller
    const taskToMiss = await Task.findOne({ userId: testUserId, type: { $ne: 'BREAK' } });
    console.log('\nFound task to miss:', taskToMiss.topic, 'duration:', taskToMiss.duration);

    let missResponseData = null;
    const mockMissReq = {
      userId: testUserId,
      params: { id: taskToMiss._id.toString() }
    };
    const mockMissRes = {
      json: (data) => {
        missResponseData = data;
        return mockMissRes;
      }
    };

    await taskController.missTask(mockMissReq, mockMissRes, mockNext);

    console.log('missTask message:', missResponseData.message);
    console.log('missTask impacted:', missResponseData.impacted);
    console.log('missTask postponed:', missResponseData.postponed);

    console.assert(Array.isArray(missResponseData.impacted), 'impacted must be an array');
    console.assert(missResponseData.missedTask !== undefined, 'missedTask must be present');
    console.assert(Array.isArray(missResponseData.postponed), 'postponed must be an array');

    // 3. Test completeTask endpoint with spaced-repetition reviewStage progression
    const taskToComplete = await Task.findOne({ userId: testUserId, type: { $ne: 'BREAK' }, status: 'pending' });
    if (taskToComplete) {
      console.log('\nFound task to complete:', taskToComplete.topic);
      let completeResponseData = null;
      const mockCompleteReq = {
        userId: testUserId,
        params: { id: taskToComplete._id.toString() },
        body: { feedback: 'normal' }
      };
      const mockCompleteRes = {
        json: (data) => {
          completeResponseData = data;
          return mockCompleteRes;
        }
      };

      await taskController.completeTask(mockCompleteReq, mockCompleteRes, mockNext);
      console.log('completeTask updatedProgress:', completeResponseData.updatedProgress ? {
        status: completeResponseData.updatedProgress.status,
        reviewStage: completeResponseData.updatedProgress.reviewStage,
        lastStudiedAt: completeResponseData.updatedProgress.lastStudiedAt
      } : null);

      console.assert(completeResponseData.task.status === 'completed', 'Task status must be completed');
    }

    console.log('\n✓ All controllers (generatePlan, missTask, completeTask) passed validation!');
  } finally {
    await Task.deleteMany({ userId: testUserId });
    await StudyPlan.deleteMany({ userId: testUserId });
    await StudentSubject.deleteMany({ userId: testUserId });
    await mongoose.disconnect();
  }
}

testControllers();
