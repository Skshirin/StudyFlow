const mongoose = require('mongoose');

// Per-student subject enrollment & goals.
const studentSubjectSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  examDate: {
    type: Date,
    default: null
  },
  confidence: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  targetGoal: {
    type: String,
    enum: ['PASS', 'SCORE_WELL', 'TOP', 'EMERGENCY', 'TARGETED_IMPROVEMENT', 'BALANCED'],
    default: 'SCORE_WELL'
  },
  availableHours: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// A student can only enroll once in a given subject
studentSubjectSchema.index({ userId: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model('StudentSubject', studentSubjectSchema);
