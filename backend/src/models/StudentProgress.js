const mongoose = require('mongoose');

// Per-student concept progress & spaced-repetition tracking.
// Primary scheduling driver: `status` (discrete mastery state for candidate selection and remaining work).
// `completionPercentage` is derived from `status` (or explicit granular progress) to ensure single-source-of-truth.
const studentProgressSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  conceptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Concept',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'needs_revision', 'mastered'],
    default: 'not_started'
  },
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  confidence: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  lastStudiedAt: {
    type: Date,
    default: null
  },
  reviewStage: {
    type: Number,
    min: 0,
    max: 3,
    default: 0 // Index into SPACED_INTERVALS [1, 3, 7, 14] in schedulingEngine
  },
  revisionCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Ensure completionPercentage stays aligned with status if not explicitly overridden
studentProgressSchema.pre('save', function (next) {
  if (this.isModified('status') && !this.isModified('completionPercentage')) {
    if (this.status === 'not_started') this.completionPercentage = 0;
    else if (this.status === 'in_progress' && this.completionPercentage === 0) this.completionPercentage = 25;
    else if (this.status === 'completed' || this.status === 'needs_revision') this.completionPercentage = 75;
    else if (this.status === 'mastered') this.completionPercentage = 100;
  }
  next();
});

// A student has exactly one progress record per concept
studentProgressSchema.index({ userId: 1, conceptId: 1 }, { unique: true });

module.exports = mongoose.model('StudentProgress', studentProgressSchema);
