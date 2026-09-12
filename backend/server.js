require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const identifyUser = require('./src/middleware/identifyUser');

const authRoutes = require('./src/routes/authRoutes');
const subjectRoutes = require('./src/routes/subjectRoutes');
const planRoutes = require('./src/routes/planRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const askAiRoutes = require('./src/routes/askAiRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Ensure MongoDB is connected before processing requests (critical for serverless / Vercel)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error:', err.message);
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/subjects', identifyUser, subjectRoutes);
app.use('/api/plan', identifyUser, planRoutes);
app.use('/api/tasks', identifyUser, taskRoutes);
app.use('/api/ask-ai', identifyUser, askAiRoutes);

// Optional: serve static frontend if built into ./public
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong', details: err.message });
});

// Run server listener in local / persistent container mode
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5001;
  connectDB()
    .then(() => {
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => {
      console.error('Initial DB connect error:', err.message);
    });
}

module.exports = app;
