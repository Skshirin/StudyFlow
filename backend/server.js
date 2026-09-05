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

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/subjects', identifyUser, subjectRoutes);
app.use('/api/plan', identifyUser, planRoutes);
app.use('/api/tasks', identifyUser, taskRoutes);

// Optional: serve the built frontend (frontend/dist copied into ./public)
// so backend + frontend can deploy as a single Render/Railway service.
// In local dev, just skip this and run the Vite dev server separately —
// see the top-level README for both workflows.
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

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
