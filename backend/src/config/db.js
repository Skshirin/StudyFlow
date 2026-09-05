const mongoose = require('mongoose');

let cachedPromise = null;

module.exports = async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!cachedPromise) {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not defined.');
    }
    cachedPromise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    }).catch(err => {
      cachedPromise = null;
      throw err;
    });
  }

  return cachedPromise;
};
