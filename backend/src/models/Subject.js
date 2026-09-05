const mongoose = require('mongoose');

// One entry per topic inside a subject. This is where spaced-repetition state lives.
const topicStateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: {
    type: String,
    enum: ['not_started', 'learned', 'needs_revision', 'mastered'],
    default: 'not_started'
  },
  lastStudiedDate: { type: Date, default: null },
  reviewStage: { type: Number, default: 0 },     // index into SPACED_INTERVALS in schedulingEngine.js
  revisionCount: { type: Number, default: 0 }    // how many times this topic has been revised
}, { _id: false });

const subjectSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  examDate: { type: Date, default: null },        // null = regular/non-exam subject
  difficulty: { type: Number, min: 1, max: 5, default: 3 },
  confidence: { type: Number, min: 1, max: 5, default: 3 }, // weakness = 6 - confidence
  topics: [topicStateSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Subject', subjectSchema);
