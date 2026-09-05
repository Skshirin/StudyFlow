const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, default: 'Student', trim: true },
  email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
  password: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
