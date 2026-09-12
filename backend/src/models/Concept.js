const mongoose = require('mongoose');

// Shared catalog model: Concepts belonging to a shared Module.
const conceptSchema = new mongoose.Schema({
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  importance: {
    type: Number,
    min: 1,
    max: 3,
    default: 2
  },
  difficulty: {
    type: Number,
    min: 1,
    max: 3,
    default: 2
  },
  examRelevance: {
    type: Number,
    min: 1,
    max: 3,
    default: 2
  },
  estimatedStudyMinutes: {
    type: Number,
    default: 60
  },
  order: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Enforce uniqueness of concept name per module
conceptSchema.index({ moduleId: 1, name: 1 }, { unique: true });
conceptSchema.index({ moduleId: 1, order: 1 });

module.exports = mongoose.model('Concept', conceptSchema);
