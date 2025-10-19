// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const emailService = require('../services/emailService');
const router = express.Router();
const path = require('path');

// Load environment variables from parent directory
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

console.log('🔐 Auth Routes - Environment check:');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✓ Set' : '✗ Missing');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✓ Set' : '✗ Missing');

// Generate team code
const generateTeamCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Generate verification token
const generateVerificationToken = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Store pre-registration data temporarily
const preRegistrations = new Map();
const memberPreRegistrations = new Map();

// ===============================
// LEADER REGISTRATION FLOW
// ===============================

// Send verification email for leader pre-registration
router.post('/send-verification', async (req, res) => {
  try {
    const { email, name, password, teamName } = req.body;

    console.log(`📧 Leader pre-registration verification request for: ${email}`);

    if (!email || !name || !password || !teamName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return res.status(400).json({ error: 'Password must include at least 1 special character' });
    }

    // Check if email already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate verification token
    const verificationToken = generateVerificationToken();
    
    // Store pre-registration data (expires in 1 hour)
    preRegistrations.set(verificationToken, {
      email,
      name,
      password,
      teamName,
      timestamp: Date.now(),
      expires: Date.now() + (60 * 60 * 1000) // 1 hour
    });

    // Send verification email
    console.log(`📧 Sending verification email to ${email}...`);
    const emailResult = await emailService.sendVerificationEmail(email, name, verificationToken);

    // Clean up old pre-registrations
    cleanupExpiredPreRegistrations();

    res.json({
      success: true,
      message: 'Verification email sent successfully',
      emailSent: emailResult.success,
      emailMethod: emailResult.method,
      verificationToken: emailResult.verificationToken
    });

  } catch (error) {
    console.error('❌ Send verification error:', error);
    res.status(500).json({ 
      error: 'Failed to send verification email',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify email token and automatically complete leader registration
router.post('/verify-email', async (req, res) => {
  let client;
  try {
    const { token } = req.body;

    console.log(`🔍 Verifying leader token and completing registration: ${token}`);

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Check if pre-registration data exists
    const preRegData = preRegistrations.get(token);
    
    if (!preRegData) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Check if token has expired
    if (Date.now() > preRegData.expires) {
      preRegistrations.delete(token);
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    const { email, name, password, teamName } = preRegData;

    // Double check if user already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      preRegistrations.delete(token);
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate team code
    const teamCode = generateTeamCode();
    console.log(`🎯 Generated team code: ${teamCode} for team: ${teamName}`);

    // Start transaction
    client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create user with approved status for leader and email_verified flag
      const userResult = await client.query(
        'INSERT INTO users (email, password, name, role, team_code, status, email_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [email, hashedPassword, name, 'leader', teamCode, 'approved', true]
      );

      // Create team
      await client.query(
        'INSERT INTO teams (team_code, team_name, leader_id) VALUES ($1, $2, $3)',
        [teamCode, teamName, userResult.rows[0].id]
      );

      await client.query('COMMIT');
      
      console.log(`✅ Database records created for leader: ${name}`);
      
      // Remove used pre-registration data
      preRegistrations.delete(token);
      
      // Send team code email to leader
      console.log(`📧 Attempting to send team code email to ${email}...`);
      const emailResult = await emailService.sendTeamCodeToLeader(email, name, teamCode, teamName);
      
      console.log('📧 Email sending result:', {
        success: emailResult.success,
        method: emailResult.method,
        message: emailResult.message
      });

      // Prepare response
      const response = {
        success: true,
        message: 'Team leader registration successful!',
        teamCode: teamCode,
        user: {
          id: userResult.rows[0].id,
          email: userResult.rows[0].email,
          name: userResult.rows[0].name,
          role: userResult.rows[0].role,
          team_code: userResult.rows[0].team_code,
          status: userResult.rows[0].status,
          email_verified: userResult.rows[0].email_verified
        },
        emailSent: emailResult.success,
        emailMethod: emailResult.method,
        emailMessage: emailResult.message
      };

      // If email failed, include team code in message
      if (!emailResult.success) {
        response.importantNote = `Please save this team code: ${teamCode}. Email delivery failed.`;
      }

      res.json(response);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Transaction error:', error);
      throw error;
    } finally {
      if (client) client.release();
    }

  } catch (error) {
    console.error('❌ Verify email error:', error);
    res.status(500).json({ 
      error: 'Internal server error during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ===============================
// MEMBER REGISTRATION FLOW
// ===============================

// Send verification email for member pre-registration
router.post('/send-member-verification', async (req, res) => {
  try {
    const { email, name, password, teamCode } = req.body;

    console.log(`📧 Member pre-registration verification request for: ${email}, Team: ${teamCode}`);

    if (!email || !name || !password || !teamCode) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return res.status(400).json({ error: 'Password must include at least 1 special character' });
    }

    // Check if team exists
    const teamExists = await pool.query(
      'SELECT * FROM teams WHERE team_code = $1',
      [teamCode]
    );
    
    if (teamExists.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid team code' });
    }

    const teamName = teamExists.rows[0].team_name;

    // Check if user already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Generate verification token
    const verificationToken = generateVerificationToken();
    
    // Store pre-registration data (expires in 1 hour)
    memberPreRegistrations.set(verificationToken, {
      email,
      name,
      password,
      teamCode,
      teamName,
      timestamp: Date.now(),
      expires: Date.now() + (60 * 60 * 1000) // 1 hour
    });

    // Send verification email
    console.log(`📧 Sending member verification email to ${email}...`);
    const emailResult = await emailService.sendMemberVerificationEmail(email, name, teamName, verificationToken);

    // Clean up old pre-registrations
    cleanupExpiredMemberPreRegistrations();

    res.json({
      success: true,
      message: 'Verification email sent successfully',
      emailSent: emailResult.success,
      emailMethod: emailResult.method,
      verificationToken: emailResult.verificationToken,
      teamName: teamName
    });

  } catch (error) {
    console.error('❌ Send member verification error:', error);
    res.status(500).json({ 
      error: 'Failed to send verification email',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify member email token and complete registration
router.post('/verify-member-email', async (req, res) => {
  try {
    const { token } = req.body;

    console.log(`🔍 Verifying member token and completing registration: ${token}`);

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Check if pre-registration data exists
    const preRegData = memberPreRegistrations.get(token);
    
    if (!preRegData) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Check if token has expired
    if (Date.now() > preRegData.expires) {
      memberPreRegistrations.delete(token);
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    const { email, name, password, teamCode, teamName } = preRegData;

    // Double check if user already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      memberPreRegistrations.delete(token);
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with pending status and email verified
    const userResult = await pool.query(
      'INSERT INTO users (email, password, name, role, team_code, status, email_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, name, role, team_code, status, email_verified',
      [email, hashedPassword, name, 'member', teamCode, 'pending', true]
    );

    console.log(`✅ Member registration completed for: ${name}. Status: pending approval`);

    // Remove used pre-registration data
    memberPreRegistrations.delete(token);

    // Notify team leader
    const leaderResult = await pool.query(
      'SELECT email, name FROM users WHERE team_code = $1 AND role = $2',
      [teamCode, 'leader']
    );

    if (leaderResult.rows.length > 0) {
      const leader = leaderResult.rows[0];
      console.log(`📧 New member request: ${name} (${email}) wants to join team ${teamName}`);
      
      // Send notification to leader
      try {
        await emailService.sendNewMemberNotificationToLeader(
          leader.email, 
          leader.name, 
          name, 
          email, 
          teamName
        );
      } catch (emailError) {
        console.error('❌ Failed to send leader notification:', emailError.message);
      }
    }

    res.json({
      success: true,
      message: 'Member registration successful! Please wait for team leader approval.',
      user: userResult.rows[0],
      teamName: teamName
    });

  } catch (error) {
    console.error('❌ Verify member email error:', error);
    res.status(500).json({ 
      error: 'Internal server error during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ===============================
// LEGACY MEMBER REGISTRATION (for backward compatibility)
// ===============================

// Register as Team Member (legacy endpoint - without email verification)
router.post('/register-member', async (req, res) => {
  try {
    const { email, password, name, teamCode } = req.body;
    
    console.log(`👤 Legacy member registration attempt: ${name} (${email}), Team Code: ${teamCode}`);
    
    // Validate required fields
    if (!email || !password || !name || !teamCode) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return res.status(400).json({ error: 'Password must include at least 1 special character' });
    }

    // Check if team exists
    const teamExists = await pool.query(
      'SELECT * FROM teams WHERE team_code = $1',
      [teamCode]
    );
    
    if (teamExists.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid team code' });
    }

    // Get team name
    const teamName = teamExists.rows[0].team_name;

    // Check if user already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with pending status (email not verified for legacy)
    const userResult = await pool.query(
      'INSERT INTO users (email, password, name, role, team_code, status, email_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, name, role, team_code, status, email_verified',
      [email, hashedPassword, name, 'member', teamCode, 'pending', false]
    );

    console.log(`✅ Legacy member registration completed for: ${name}. Status: pending approval`);

    // Notify team leader
    const leaderResult = await pool.query(
      'SELECT email, name FROM users WHERE team_code = $1 AND role = $2',
      [teamCode, 'leader']
    );

    if (leaderResult.rows.length > 0) {
      const leader = leaderResult.rows[0];
      console.log(`📧 New member request: ${name} (${email}) wants to join team ${teamName}`);
    }

    res.json({ 
      message: 'Registration successful! Please wait for team leader approval.',
      user: userResult.rows[0],
      teamName: teamName
    });
  } catch (error) {
    console.error('❌ Member registration error:', error);
    res.status(500).json({ 
      error: 'Internal server error during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ===============================
// AUTHENTICATION & USER MANAGEMENT
// ===============================

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, teamCode } = req.body;

    console.log(`🔐 Login attempt: ${email}, Team: ${teamCode}`);

    // Validate required fields
    if (!email || !password || !teamCode) {
      return res.status(400).json({ error: 'Email, password, and team code are required' });
    }

    // Find user
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND team_code = $2',
      [email, teamCode]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Login failed: Invalid credentials');
      return res.status(401).json({ error: 'Invalid email, password, or team code' });
    }

    const user = userResult.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('❌ Login failed: Invalid password');
      return res.status(401).json({ error: 'Invalid email, password, or team code' });
    }

    // Check member status
    if (user.role === 'member' && user.status !== 'approved') {
      if (user.status === 'pending') {
        console.log('❌ Login failed: Member pending approval');
        return res.status(403).json({ 
          error: 'Your membership is pending approval from the team leader' 
        });
      } else if (user.status === 'rejected') {
        console.log('❌ Login failed: Member rejected');
        return res.status(403).json({ 
          error: 'Your membership request was rejected. Please contact your team leader.' 
        });
      }
    }

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role,
        teamCode: user.team_code
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`✅ Login successful: ${user.name} (${user.role})`);

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error during login',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Check member status before login
router.post('/check-member-status', async (req, res) => {
  try {
    const { email, teamCode } = req.body;

    if (!email || !teamCode) {
      return res.status(400).json({ error: 'Email and team code are required' });
    }

    const result = await pool.query(
      `SELECT id, name, email, role, status, email_verified
       FROM users 
       WHERE email = $1 AND team_code = $2`,
      [email, teamCode]
    );

    if (result.rows.length === 0) {
      return res.json({
        canLogin: false,
        message: 'No account found with these credentials'
      });
    }

    const user = result.rows[0];

    // For leaders, always allow login
    if (user.role === 'leader') {
      return res.json({
        canLogin: true,
        status: 'approved',
        role: 'leader',
        name: user.name,
        email_verified: user.email_verified
      });
    }

    // For members, check status and email verification
    if (user.role === 'member') {
      if (!user.email_verified) {
        return res.json({
          canLogin: false,
          status: 'unverified',
          message: 'Please verify your email address before logging in',
          name: user.name
        });
      } else if (user.status === 'pending') {
        return res.json({
          canLogin: false,
          status: 'pending',
          message: 'Membership pending approval from team leader',
          name: user.name
        });
      } else if (user.status === 'rejected') {
        return res.json({
          canLogin: false,
          status: 'rejected',
          message: 'Membership request rejected by team leader',
          name: user.name
        });
      } else if (user.status === 'approved') {
        return res.json({
          canLogin: true,
          status: 'approved',
          role: 'member',
          name: user.name,
          email_verified: user.email_verified
        });
      }
    }

    // Default deny
    return res.json({
      canLogin: false,
      message: 'Unable to login'
    });

  } catch (error) {
    console.error('❌ Check member status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// TEAM MANAGEMENT
// ===============================

// Get team members (ONLY approved members - EXCLUDE LEADERS)
router.get('/team/:teamCode/all-members', async (req, res) => {
  try {
    const { teamCode } = req.params;

    const result = await pool.query(
      `SELECT id, name, email, role, status, created_at, email_verified,
              (SELECT COUNT(*) FROM subtasks s WHERE s.assigned_to = users.id) as assigned_tasks,
              (SELECT COUNT(*) FROM subtasks s WHERE s.assigned_to = users.id AND s.status = 'completed') as completed_tasks
       FROM users 
       WHERE team_code = $1 AND role = 'member' AND status = 'approved'
       ORDER BY created_at DESC`,
      [teamCode]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get team members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending approval requests for a team (ONLY pending members - EXCLUDE LEADERS)
router.get('/team/:teamCode/pending-requests', async (req, res) => {
  try {
    const { teamCode } = req.params;

    const result = await pool.query(
      `SELECT id, name, email, created_at, email_verified 
       FROM users 
       WHERE team_code = $1 AND status = 'pending' AND role = 'member'
       ORDER BY created_at DESC`,
      [teamCode]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get pending requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get rejected members for a team (ONLY rejected members - EXCLUDE LEADERS)
router.get('/team/:teamCode/rejected-members', async (req, res) => {
  try {
    const { teamCode } = req.params;

    const result = await pool.query(
      `SELECT id, name, email, created_at, updated_at, email_verified 
       FROM users 
       WHERE team_code = $1 AND status = 'rejected' AND role = 'member'
       ORDER BY updated_at DESC`,
      [teamCode]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get rejected members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve a member
router.post('/approve-member', async (req, res) => {
  let client;
  try {
    const { userId, teamCode, approvedBy } = req.body;

    if (!userId || !teamCode || !approvedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`✅ Approving member: ${userId} in team ${teamCode} by ${approvedBy}`);

    client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update user status to approved
      const result = await client.query(
        'UPDATE users SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $3 AND team_code = $4 AND role = $5 RETURNING *',
        ['approved', approvedBy, userId, teamCode, 'member']
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found or already processed' });
      }

      // Get leader and team info for email
      const leaderResult = await client.query(
        'SELECT name FROM users WHERE id = $1',
        [approvedBy]
      );

      const teamResult = await client.query(
        'SELECT team_name FROM teams WHERE team_code = $1',
        [teamCode]
      );

      const approvedMember = result.rows[0];
      const leaderName = leaderResult.rows[0]?.name || 'Team Leader';
      const teamName = teamResult.rows[0]?.team_name || 'Your Team';

      await client.query('COMMIT');

      // Send approval notification email
      console.log(`📧 Attempting to send approval email to ${approvedMember.email}...`);
      const emailResult = await emailService.sendMemberApprovalNotification(
        approvedMember.email, 
        approvedMember.name, 
        leaderName, 
        teamName
      );

      console.log(`📧 Approval email result for ${approvedMember.email}:`, {
        success: emailResult.success,
        method: emailResult.method,
        message: emailResult.message
      });

      const response = {
        message: 'Member approved successfully', 
        user: approvedMember,
        emailSent: emailResult.success,
        emailMethod: emailResult.method
      };

      res.json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (client) client.release();
    }
  } catch (error) {
    console.error('❌ Approve member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject a member
router.post('/reject-member', async (req, res) => {
  try {
    const { userId, teamCode, rejectedBy } = req.body;

    if (!userId || !teamCode || !rejectedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`❌ Rejecting member: ${userId} in team ${teamCode} by ${rejectedBy}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update user status to rejected
      const result = await client.query(
        'UPDATE users SET status = $1, rejected_by = $2, rejected_at = NOW(), updated_at = NOW() WHERE id = $3 AND team_code = $4 AND role = $5 RETURNING *',
        ['rejected', rejectedBy, userId, teamCode, 'member']
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found or already processed' });
      }

      await client.query('COMMIT');

      res.json({ 
        message: 'Member request rejected', 
        user: result.rows[0] 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Reject member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve a previously rejected member
router.post('/approve-rejected-member', async (req, res) => {
  let client;
  try {
    const { userId, teamCode, approvedBy } = req.body;

    if (!userId || !teamCode || !approvedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`✅ Re-approving rejected member: ${userId} in team ${teamCode}`);

    client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update user status from rejected to approved
      const result = await client.query(
        'UPDATE users SET status = $1, approved_by = $2, approved_at = NOW(), rejected_by = NULL, rejected_at = NULL, updated_at = NOW() WHERE id = $3 AND team_code = $4 AND status = $5 AND role = $6 RETURNING *',
        ['approved', approvedBy, userId, teamCode, 'rejected', 'member']
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Rejected member not found or already processed' });
      }

      // Get leader and team info for email
      const leaderResult = await client.query(
        'SELECT name FROM users WHERE id = $1',
        [approvedBy]
      );

      const teamResult = await client.query(
        'SELECT team_name FROM teams WHERE team_code = $1',
        [teamCode]
      );

      const approvedMember = result.rows[0];
      const leaderName = leaderResult.rows[0]?.name || 'Team Leader';
      const teamName = teamResult.rows[0]?.team_name || 'Your Team';

      await client.query('COMMIT');

      // Send approval notification email
      console.log(`📧 Attempting to send re-approval email to ${approvedMember.email}...`);
      const emailResult = await emailService.sendMemberApprovalNotification(
        approvedMember.email, 
        approvedMember.name, 
        leaderName, 
        teamName
      );

      console.log(`📧 Re-approval email result for ${approvedMember.email}:`, {
        success: emailResult.success,
        method: emailResult.method,
        message: emailResult.message
      });

      res.json({ 
        message: 'Member approved successfully', 
        user: result.rows[0],
        emailSent: emailResult.success,
        emailMethod: emailResult.method
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (client) client.release();
    }
  } catch (error) {
    console.error('❌ Approve rejected member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete rejected member permanently
router.delete('/delete-rejected-member/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND status = $2 AND role = $3 RETURNING *',
      [userId, 'rejected', 'member']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rejected member not found' });
    }

    console.log(`🗑️ Deleted rejected member: ${userId}`);

    res.json({ 
      message: 'Rejected member deleted permanently', 
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('❌ Delete rejected member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete team member (leader only)
router.delete('/team/:teamCode/member/:memberId', async (req, res) => {
  try {
    const { teamCode, memberId } = req.params;
    const { leaderId } = req.body;

    if (!leaderId) {
      return res.status(400).json({ error: 'Leader ID is required' });
    }

    console.log(`🗑️ Deleting member: ${memberId} from team: ${teamCode} by leader: ${leaderId}`);

    // Verify requester is team leader
    const leaderCheck = await pool.query(
      'SELECT id, role FROM users WHERE id = $1 AND team_code = $2 AND role = $3',
      [leaderId, teamCode, 'leader']
    );

    if (leaderCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only team leader can delete members' });
    }

    // Prevent leader from deleting themselves
    if (parseInt(memberId) === parseInt(leaderId)) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Check if member exists and belongs to the team
    const memberCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND team_code = $2 AND role = $3',
      [memberId, teamCode, 'member']
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in your team' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove member from assigned subtasks
      await client.query(
        'UPDATE subtasks SET assigned_to = NULL, status = $1 WHERE assigned_to = $2',
        ['available', memberId]
      );

      // Delete member
      await client.query('DELETE FROM users WHERE id = $1', [memberId]);

      await client.query('COMMIT');

      res.json({ message: 'Member deleted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Delete member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get basic team members (for backward compatibility)
router.get('/team/:teamCode/members', async (req, res) => {
  try {
    const { teamCode } = req.params;
    
    const membersResult = await pool.query(
      'SELECT id, name, email, role, created_at, email_verified FROM users WHERE team_code = $1 AND role = $2 AND status = $3 ORDER BY name',
      [teamCode, 'member', 'approved']
    );

    res.json(membersResult.rows);
  } catch (error) {
    console.error('❌ Get team members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// UTILITY & DEBUGGING ENDPOINTS
// ===============================

// Test email endpoint (for debugging)
router.get('/test-email', async (req, res) => {
  try {
    console.log('📧 Testing email service endpoint...');
    const testResult = await emailService.testConnection();
    res.json(testResult);
  } catch (error) {
    console.error('❌ Email test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test pre-registration endpoint (for debugging)
router.get('/test-pre-registrations', (req, res) => {
  const activePreRegs = Array.from(preRegistrations.entries()).map(([token, data]) => ({
    token: token.substring(0, 8) + '...',
    email: data.email,
    name: data.name,
    teamName: data.teamName,
    expiresIn: Math.round((data.expires - Date.now()) / 60000) + ' minutes'
  }));

  const activeMemberPreRegs = Array.from(memberPreRegistrations.entries()).map(([token, data]) => ({
    token: token.substring(0, 8) + '...',
    email: data.email,
    name: data.name,
    teamCode: data.teamCode,
    teamName: data.teamName,
    expiresIn: Math.round((data.expires - Date.now()) / 60000) + ' minutes'
  }));

  res.json({
    leaderPreRegistrations: preRegistrations.size,
    memberPreRegistrations: memberPreRegistrations.size,
    leaderPreRegs: activePreRegs,
    memberPreRegs: activeMemberPreRegs
  });
});

// Clean up expired pre-registrations
function cleanupExpiredPreRegistrations() {
  const now = Date.now();
  for (const [token, data] of preRegistrations.entries()) {
    if (now > data.expires) {
      preRegistrations.delete(token);
      console.log(`🧹 Cleaned up expired leader pre-registration for: ${data.email}`);
    }
  }
}

function cleanupExpiredMemberPreRegistrations() {
  const now = Date.now();
  for (const [token, data] of memberPreRegistrations.entries()) {
    if (now > data.expires) {
      memberPreRegistrations.delete(token);
      console.log(`🧹 Cleaned up expired member pre-registration for: ${data.email}`);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredPreRegistrations, 60 * 60 * 1000);
setInterval(cleanupExpiredMemberPreRegistrations, 60 * 60 * 1000);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Auth API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    leaderPreRegistrations: preRegistrations.size,
    memberPreRegistrations: memberPreRegistrations.size
  });
});

module.exports = router;