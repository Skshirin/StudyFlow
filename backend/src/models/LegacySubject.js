const mongoose = require('mongoose');

// Preserved copy of the V1 per-user Subject schema with embedded topics.
// Points to 'legacy_subjects' collection to prevent collision with the V2 shared catalog.
const legacyTopicStateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: {
    type: String,
    enum: ['not_started', 'learned', 'needs_revision', 'mastered'],
    default: 'not_started'
  },
  lastStudiedDate: { type: Date, default: null },
  reviewStage: { type: Number, default: 0 },
  revisionCount: { type: Number, default: 0 }
}, { _id: false });

const legacySubjectSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  examDate: { type: Date, default: null },
  difficulty: { type: Number, min: 1, max: 5, default: 3 },
  confidence: { type: Number, min: 1, max: 5, default: 3 },
  topics: [legacyTopicStateSchema],
  createdAt: { type: Date, default: Date.now }
}, { collection: 'legacy_subjects' });

module.exports = mongoose.model('LegacySubject', legacySubjectSchema);
