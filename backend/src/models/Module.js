const mongoose = require('mongoose');

// Shared catalog model: Modules belonging to a shared Subject.
const moduleSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  order: {
    type: Number,
    required: true
  },
  hours: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Enforce unique module name and order per subject
moduleSchema.index({ subjectId: 1, name: 1 }, { unique: true });
moduleSchema.index({ subjectId: 1, order: 1 });

module.exports = mongoose.model('Module', moduleSchema);
