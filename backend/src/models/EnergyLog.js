const mongoose = require('mongoose');

const energyLogSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  date: { type: String, required: true },
  level: { type: String, enum: ['high', 'normal', 'low'], default: 'normal' }
});

energyLogSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('EnergyLog', energyLogSchema);
