const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'studyflow_default_jwt_secret_dev_key';

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    const newUser = await User.create({
      userId,
      name: name && name.trim() ? name.trim() : 'Student',
      email: normalizedEmail,
      password: hashedPassword,
      createdAt: new Date(),
      lastSeen: new Date()
    });

    const token = jwt.sign(
      { userId: newUser.userId, email: newUser.email, name: newUser.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: {
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    user.lastSeen = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user.userId, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findOne({ userId: req.userId }).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user.userId,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    });
  } catch (err) {
    next(err);
  }
};

exports.createGuestSession = async (req, res, next) => {
  try {
    const guestId = `guest_${crypto.randomUUID()}`;
    const token = jwt.sign(
      { userId: guestId, isGuest: true, name: 'Guest Student' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({
      token,
      user: {
        userId: guestId,
        name: 'Guest Student',
        email: null,
        isGuest: true
      }
    });
  } catch (err) {
    next(err);
  }
};
