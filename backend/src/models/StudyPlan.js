const mongoose = require('mongoose');

const studyPlanSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  startDate: { type: String, required: true }, // 'YYYY-MM-DD'
  endDate: { type: String, required: true },
  totalDays: { type: Number, default: 14 },
  dailyCapacityMinutes: { type: Number, default: 135 },
  timePreference: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'flexible'],
    default: 'flexible'
  },
  targetGoal: {
    type: String,
    enum: ['PASS', 'SCORE_WELL', 'FULL_PREPARATION', 'TOP', 'EMERGENCY', 'TARGETED_IMPROVEMENT', 'BALANCED'],
    default: 'SCORE_WELL'
  },
  prompt: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StudyPlan', studyPlanSchema);

