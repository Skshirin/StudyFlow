const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudyPlan', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null }, // null for BREAK tasks
  subjectName: { type: String, default: null },
  topic: { type: String, required: true },
  date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
  startTime: { type: String, default: null },           // 'HH:MM', null when not yet resequenced
  duration: { type: Number, required: true },           // minutes
  type: {
    type: String,
    enum: ['LEARN', 'PRACTICE', 'REVISE', 'MOCK_TEST', 'REVIEW_MISTAKES', 'BREAK'],
    required: true
  },
  priorityScore: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'completed', 'missed', 'skipped'],
    default: 'pending'
  },
  reason: { type: String, default: '' } // deterministic "why today?" explanation, no AI needed
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
