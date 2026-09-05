const mongoose = require('mongoose');

const studyPlanSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  startDate: { type: String, required: true }, // 'YYYY-MM-DD'
  endDate: { type: String, required: true },
  dailyCapacityMinutes: { type: Number, required: true },
  timePreference: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'flexible'],
    default: 'flexible'
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StudyPlan', studyPlanSchema);
