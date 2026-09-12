const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'studyflow_default_jwt_secret_dev_key';

module.exports = async function identifyUser(req, res, next) {
  try {
    let userId = null;
    let authUser = null;

    // 1. Check for Bearer token in Authorization header
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
        authUser = decoded;
      } catch (err) {
        return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
      }
    }

    // 2. Unauthenticated check
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required. Please log in or continue as guest.'
      });
    }

    req.userId = userId;
    req.user = authUser;
    req.isGuest = Boolean(authUser?.isGuest || (typeof userId === 'string' && userId.startsWith('guest_')));

    // Only registered users get lastSeen updated in User collection
    if (!req.isGuest) {
      User.findOneAndUpdate(
        { userId },
        { userId, lastSeen: new Date() },
        { upsert: true, setDefaultsOnInsert: true }
      ).catch(err => console.error('Failed to update user lastSeen:', err.message));
    }

    next();
  } catch (err) {
    next(err);
  }
};
