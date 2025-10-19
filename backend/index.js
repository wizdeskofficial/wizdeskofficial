// backend/index.js
const express = require('express');
const path = require('path');
const { initDb } = require('./db');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/performance', require('./routes/performance'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/register-leader', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/register-leader.html'));
});

app.get('/register-member', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/member-register.html'));
});

app.get('/leader-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/leader-dashboard.html'));
});

app.get('/member-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/member-dashboard.html'));
});

// Start server
async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log('✅ Server running on port', PORT);
      console.log('🌐 Open http://localhost:' + PORT);
    });
  } catch (error) {
    console.error('❌ Server failed to start:', error.message);
    process.exit(1);
  }
}

start();