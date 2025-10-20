// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { pool } = require('../db');
const emailService = require('../services/emailService');

const router = express.Router();

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

console.log('🔐 Auth Routes - Production Environment:');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✓ Set' : '✗ Missing');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✓ Set' : '✗ Missing');

// Constants
const TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const PASSWORD_MIN_LENGTH = 6;

// In-memory storage for pre-registrations
const preRegistrations = new Map();
const memberPreRegistrations = new Map();

// Utility Functions
const generateTeamCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const generateNumericCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const validatePassword = (password) => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return 'Password must be at least 6 characters long';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must include at least 1 special character';
  }
  return null;
};

const cleanupExpiredEntries = (map, type) => {
  const now = Date.now();
  for (const [token, data] of map.entries()) {
    if (now > data.expires) {
      map.delete(token);
      console.log(`🧹 Cleaned up expired ${type} pre-registration for: ${data.email}`);
    }
  }
};

// Middleware
const validateRequiredFields = (fields) => (req, res, next) => {
  const missingFields = fields.filter(field => !req.body[field]);
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      error: 'All fields are required', 
      missing: missingFields 
    });
  }
  next();
};

// ===============================
// LEADER REGISTRATION FLOW
// ===============================

router.post('/send-verification', 
  validateRequiredFields(['email', 'name', 'password', 'teamName']),
  async (req, res) => {
    try {
      const { email, name, password, teamName } = req.body;
      
      // Password validation
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }

      // Check if email already exists
      const userExists = await pool.query(
        'SELECT id FROM users WHERE email = $1', 
        [email]
      );
      if (userExists.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Generate tokens and store pre-registration
      const verificationToken = generateVerificationToken();
      const numericCode = generateNumericCode();
      
      preRegistrations.set(verificationToken, {
        email, name, password, teamName, numericCode,
        expires: Date.now() + TOKEN_EXPIRY
      });

      console.log(`📧 Sending verification to ${email} with code: ${numericCode}`);
      
      // Send verification email
      const emailResult = await emailService.sendVerificationEmail(
        email, name, verificationToken, numericCode
      );

      res.json({
        success: true,
        message: 'Verification sent successfully',
        verificationToken,
        emailSent: emailResult.success,
        emailMethod: emailResult.method
      });

    } catch (error) {
      console.error('❌ Send verification error:', error);
      res.status(500).json({ error: 'Failed to send verification' });
    }
  }
);

// Verify leader email with numeric code (manual verification)
router.post('/verify-email-code', async (req, res) => {
  let client;
  try {
    const { code } = req.body;

    console.log(`🔍 Verifying leader email with code: ${code}`);

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    if (code.length !== 6 || !/^\d+$/.test(code)) {
      return res.status(400).json({ error: 'Invalid verification code format' });
    }

    // Find the pre-registration data that matches the code
    let matchingToken = null;
    let preRegData = null;

    for (const [token, data] of preRegistrations.entries()) {
      if (data.numericCode === code) {
        // Check if token is still valid
        if (Date.now() <= data.expires) {
          matchingToken = token;
          preRegData = data;
          break;
        } else {
          // Clean up expired token
          preRegistrations.delete(token);
        }
      }
    }

    if (!preRegData) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    const { email, name, password, teamName } = preRegData;

    // Final user existence check
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      preRegistrations.delete(matchingToken);
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Generate team code
    const teamCode = generateTeamCode();
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if team code already exists (unlikely but possible)
      let finalTeamCode = teamCode;
      let teamExists = await client.query('SELECT id FROM teams WHERE team_code = $1', [finalTeamCode]);
      let attempts = 0;
      
      while (teamExists.rows.length > 0 && attempts < 5) {
        finalTeamCode = generateTeamCode();
        teamExists = await client.query('SELECT id FROM teams WHERE team_code = $1', [finalTeamCode]);
        attempts++;
      }

      if (teamExists.rows.length > 0) {
        throw new Error('Failed to generate unique team code');
      }

      // Create team first - USING CORRECT SCHEMA (without created_by)
      const teamResult = await client.query(
        `INSERT INTO teams (team_code, team_name, created_at) 
         VALUES ($1, $2, NOW()) 
         RETURNING team_code, team_name`,
        [finalTeamCode, teamName]
      );

      // Create user as leader
      const userResult = await client.query(
        `INSERT INTO users (email, password, name, role, team_code, status, email_verified, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
         RETURNING id, email, name, role, team_code, status, email_verified`,
        [email, hashedPassword, name, 'leader', finalTeamCode, 'approved', true]
      );

      // Update team with leader_id
      await client.query(
        'UPDATE teams SET leader_id = $1 WHERE team_code = $2',
        [userResult.rows[0].id, finalTeamCode]
      );

      await client.query('COMMIT');

      console.log(`✅ Leader registration completed via code for: ${name}. Team: ${teamName} (${finalTeamCode})`);

      // Send team code email to leader
      let emailResult;
      try {
        emailResult = await emailService.sendTeamCodeToLeader(
          email, 
          name, 
          finalTeamCode, 
          teamName
        );
        console.log(`📧 Team code email result:`, {
          success: emailResult.success,
          method: emailResult.method
        });
      } catch (emailError) {
        console.error('❌ Failed to send team code email:', emailError.message);
        emailResult = { 
          success: false, 
          method: 'failed',
          message: 'Failed to send email'
        };
      }

      // Clean up pre-registration data
      preRegistrations.delete(matchingToken);

      res.json({
        success: true,
        message: 'Team created successfully!',
        user: userResult.rows[0],
        teamCode: finalTeamCode,
        teamName: teamName,
        emailSent: emailResult.success,
        emailMethod: emailResult.method
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Database error during leader registration:', error);
      res.status(500).json({ 
        error: 'Internal server error during registration',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } finally {
      if (client) client.release();
    }

  } catch (error) {
    console.error('❌ Verify email code error:', error);
    res.status(500).json({ 
      error: 'Internal server error during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify leader email token and complete registration
router.post('/verify-email', async (req, res) => {
  let client;
  try {
    const { token } = req.body;

    console.log(`🔍 Verifying leader token: ${token}`);

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Check pre-registration data
    const preRegData = preRegistrations.get(token);
    if (!preRegData) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Check token expiry
    if (Date.now() > preRegData.expires) {
      preRegistrations.delete(token);
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    const { email, name, password, teamName } = preRegData;

    // Final user existence check
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      preRegistrations.delete(token);
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Generate team code
    const teamCode = generateTeamCode();
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if team code already exists (unlikely but possible)
      let finalTeamCode = teamCode;
      let teamExists = await client.query('SELECT id FROM teams WHERE team_code = $1', [finalTeamCode]);
      let attempts = 0;
      
      while (teamExists.rows.length > 0 && attempts < 5) {
        finalTeamCode = generateTeamCode();
        teamExists = await client.query('SELECT id FROM teams WHERE team_code = $1', [finalTeamCode]);
        attempts++;
      }

      if (teamExists.rows.length > 0) {
        throw new Error('Failed to generate unique team code');
      }

      // Create team first - USING CORRECT SCHEMA (without created_by)
      const teamResult = await client.query(
        `INSERT INTO teams (team_code, team_name, created_at) 
         VALUES ($1, $2, NOW()) 
         RETURNING team_code, team_name`,
        [finalTeamCode, teamName]
      );

      // Create user as leader
      const userResult = await client.query(
        `INSERT INTO users (email, password, name, role, team_code, status, email_verified, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
         RETURNING id, email, name, role, team_code, status, email_verified`,
        [email, hashedPassword, name, 'leader', finalTeamCode, 'approved', true]
      );

      // Update team with leader_id
      await client.query(
        'UPDATE teams SET leader_id = $1 WHERE team_code = $2',
        [userResult.rows[0].id, finalTeamCode]
      );

      await client.query('COMMIT');

      console.log(`✅ Leader registration completed for: ${name}. Team: ${teamName} (${finalTeamCode})`);

      // Send team code email to leader
      let emailResult;
      try {
        emailResult = await emailService.sendTeamCodeToLeader(
          email, 
          name, 
          finalTeamCode, 
          teamName
        );
        console.log(`📧 Team code email result:`, {
          success: emailResult.success,
          method: emailResult.method
        });
      } catch (emailError) {
        console.error('❌ Failed to send team code email:', emailError.message);
        emailResult = { 
          success: false, 
          method: 'failed',
          message: 'Failed to send email'
        };
      }

      // Clean up pre-registration data
      preRegistrations.delete(token);

      res.json({
        success: true,
        message: 'Team created successfully!',
        user: userResult.rows[0],
        teamCode: finalTeamCode,
        teamName: teamName,
        emailSent: emailResult.success,
        emailMethod: emailResult.method
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Database error during leader registration:', error);
      res.status(500).json({ 
        error: 'Internal server error during registration',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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

router.post('/send-member-verification',
  validateRequiredFields(['email', 'name', 'password', 'teamCode']),
  async (req, res) => {
    try {
      const { email, name, password, teamCode } = req.body;
      
      // Password validation
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }

      // Check if team exists
      const teamExists = await pool.query(
        'SELECT team_name FROM teams WHERE team_code = $1', 
        [teamCode]
      );
      if (teamExists.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid team code' });
      }

      const teamName = teamExists.rows[0].team_name;
      
      // Check if user already exists
      const userExists = await pool.query(
        'SELECT id FROM users WHERE email = $1', 
        [email]
      );
      if (userExists.rows.length > 0) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }

      // Generate tokens and store pre-registration
      const verificationToken = generateVerificationToken();
      const numericCode = generateNumericCode();
      
      memberPreRegistrations.set(verificationToken, {
        email, name, password, teamCode, teamName, numericCode,
        expires: Date.now() + TOKEN_EXPIRY
      });

      console.log(`📧 Sending member verification to ${email} with code: ${numericCode}`);
      
      const emailResult = await emailService.sendMemberVerificationEmail(
        email, name, teamName, verificationToken, numericCode
      );

      res.json({
        success: true,
        message: 'Verification sent successfully',
        teamName,
        verificationToken,
        emailSent: emailResult.success,
        emailMethod: emailResult.method
      });

    } catch (error) {
      console.error('❌ Send member verification error:', error);
      res.status(500).json({ error: 'Failed to send verification' });
    }
  }
);

// Verify member email token and complete registration
router.post('/verify-member-email', async (req, res) => {
  let client;
  try {
    const { token } = req.body;

    console.log(`🔍 Verifying member token: ${token}`);

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Check pre-registration data
    const preRegData = memberPreRegistrations.get(token);
    if (!preRegData) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Check token expiry
    if (Date.now() > preRegData.expires) {
      memberPreRegistrations.delete(token);
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    const { email, name, password, teamCode, teamName } = preRegData;

    // Final user existence check
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      memberPreRegistrations.delete(token);
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    
    client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (email, password, name, role, team_code, status, email_verified, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
         RETURNING id, email, name, role, team_code, status, email_verified`,
        [email, hashedPassword, name, 'member', teamCode, 'pending', true]
      );

      console.log(`✅ Member registration completed for: ${name}. Status: pending approval`);

      // Notify team leader
      const leaderResult = await client.query(
        'SELECT email, name FROM users WHERE team_code = $1 AND role = $2',
        [teamCode, 'leader']
      );

      if (leaderResult.rows.length > 0) {
        const leader = leaderResult.rows[0];
        console.log(`📧 New member request: ${name} (${email}) wants to join team ${teamName}`);
        
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

      await client.query('COMMIT');

      // Clean up pre-registration data
      memberPreRegistrations.delete(token);

      res.json({
        success: true,
        message: 'Member registration successful! Please wait for team leader approval.',
        user: userResult.rows[0],
        teamName
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Database error during member registration:', error);
      res.status(500).json({ 
        error: 'Internal server error during registration',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } finally {
      if (client) client.release();
    }

  } catch (error) {
    console.error('❌ Verify member email error:', error);
    res.status(500).json({ 
      error: 'Internal server error during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ===============================
// AUTHENTICATION & USER MANAGEMENT
// ===============================

router.post('/login',
  validateRequiredFields(['email', 'password', 'teamCode']),
  async (req, res) => {
    try {
      const { email, password, teamCode } = req.body;

      console.log(`🔐 Login attempt: ${email}, Team: ${teamCode}`);

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

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        console.log('❌ Login failed: Invalid password');
        return res.status(401).json({ error: 'Invalid email, password, or team code' });
      }

      // Check member status
      if (user.role === 'member') {
        if (user.status === 'pending') {
          return res.status(403).json({ 
            error: 'Your membership is pending approval from the team leader' 
          });
        } else if (user.status === 'rejected') {
          return res.status(403).json({ 
            error: 'Your membership request was rejected. Please contact your team leader.' 
          });
        }
      }

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

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

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
  }
);

// ... Rest of the file (team management, utility endpoints) remains the same

router.post('/check-member-status',
  validateRequiredFields(['email', 'teamCode']),
  async (req, res) => {
    try {
      const { email, teamCode } = req.body;

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

      // Leaders can always login
      if (user.role === 'leader') {
        return res.json({
          canLogin: true,
          status: 'approved',
          role: 'leader',
          name: user.name,
          email_verified: user.email_verified
        });
      }

      // Members have specific status checks
      if (user.role === 'member') {
        const statusResponses = {
          unverified: {
            canLogin: false,
            status: 'unverified',
            message: 'Please verify your email address before logging in',
            name: user.name
          },
          pending: {
            canLogin: false,
            status: 'pending',
            message: 'Membership pending approval from team leader',
            name: user.name
          },
          rejected: {
            canLogin: false,
            status: 'rejected',
            message: 'Membership request rejected by team leader',
            name: user.name
          },
          approved: {
            canLogin: true,
            status: 'approved',
            role: 'member',
            name: user.name,
            email_verified: user.email_verified
          }
        };

        if (!user.email_verified) {
          return res.json(statusResponses.unverified);
        }
        return res.json(statusResponses[user.status] || statusResponses.unverified);
      }

      return res.json({
        canLogin: false,
        message: 'Unable to login'
      });

    } catch (error) {
      console.error('❌ Check member status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ===============================
// TEAM MANAGEMENT
// ===============================

// Get team members (approved members only)
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

// Get pending approval requests
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

// Get rejected members
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
router.post('/approve-member',
  validateRequiredFields(['userId', 'teamCode', 'approvedBy']),
  async (req, res) => {
    let client;
    try {
      const { userId, teamCode, approvedBy } = req.body;

      console.log(`✅ Approving member: ${userId} in team ${teamCode} by ${approvedBy}`);

      client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update user status
        const result = await client.query(
          `UPDATE users 
           SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW() 
           WHERE id = $3 AND team_code = $4 AND role = $5 
           RETURNING *`,
          ['approved', approvedBy, userId, teamCode, 'member']
        );

        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'User not found or already processed' });
        }

        // Get leader and team info
        const [leaderResult, teamResult] = await Promise.all([
          client.query('SELECT name FROM users WHERE id = $1', [approvedBy]),
          client.query('SELECT team_name FROM teams WHERE team_code = $1', [teamCode])
        ]);

        const approvedMember = result.rows[0];
        const leaderName = leaderResult.rows[0]?.name || 'Team Leader';
        const teamName = teamResult.rows[0]?.team_name || 'Your Team';

        await client.query('COMMIT');

        // Send approval email
        console.log(`📧 Sending approval email to ${approvedMember.email}...`);
        const emailResult = await emailService.sendMemberApprovalNotification(
          approvedMember.email, 
          approvedMember.name, 
          leaderName, 
          teamName
        );

        console.log(`📧 Approval email result:`, {
          success: emailResult.success,
          method: emailResult.method,
          message: emailResult.message
        });

        res.json({
          message: 'Member approved successfully', 
          user: approvedMember,
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
      console.error('❌ Approve member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Reject a member
router.post('/reject-member',
  validateRequiredFields(['userId', 'teamCode', 'rejectedBy']),
  async (req, res) => {
    let client;
    try {
      const { userId, teamCode, rejectedBy } = req.body;

      console.log(`❌ Rejecting member: ${userId} in team ${teamCode} by ${rejectedBy}`);

      client = await pool.connect();
      try {
        await client.query('BEGIN');

        const result = await client.query(
          `UPDATE users 
           SET status = $1, rejected_by = $2, rejected_at = NOW(), updated_at = NOW() 
           WHERE id = $3 AND team_code = $4 AND role = $5 
           RETURNING *`,
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
  }
);

// Approve previously rejected member
router.post('/approve-rejected-member',
  validateRequiredFields(['userId', 'teamCode', 'approvedBy']),
  async (req, res) => {
    let client;
    try {
      const { userId, teamCode, approvedBy } = req.body;

      console.log(`✅ Re-approving rejected member: ${userId} in team ${teamCode}`);

      client = await pool.connect();
      try {
        await client.query('BEGIN');

        const result = await client.query(
          `UPDATE users 
           SET status = $1, approved_by = $2, approved_at = NOW(), 
               rejected_by = NULL, rejected_at = NULL, updated_at = NOW() 
           WHERE id = $3 AND team_code = $4 AND status = $5 AND role = $6 
           RETURNING *`,
          ['approved', approvedBy, userId, teamCode, 'rejected', 'member']
        );

        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Rejected member not found or already processed' });
        }

        // Get leader and team info
        const [leaderResult, teamResult] = await Promise.all([
          client.query('SELECT name FROM users WHERE id = $1', [approvedBy]),
          client.query('SELECT team_name FROM teams WHERE team_code = $1', [teamCode])
        ]);

        const approvedMember = result.rows[0];
        const leaderName = leaderResult.rows[0]?.name || 'Team Leader';
        const teamName = teamResult.rows[0]?.team_name || 'Your Team';

        await client.query('COMMIT');

        // Send approval email
        console.log(`📧 Sending re-approval email to ${approvedMember.email}...`);
        const emailResult = await emailService.sendMemberApprovalNotification(
          approvedMember.email, 
          approvedMember.name, 
          leaderName, 
          teamName
        );

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
  }
);

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
  let client;
  try {
    const { teamCode, memberId } = req.params;
    const { leaderId } = req.body;

    if (!leaderId) {
      return res.status(400).json({ error: 'Leader ID is required' });
    }

    console.log(`🗑️ Deleting member: ${memberId} from team: ${teamCode} by leader: ${leaderId}`);

    // Verify requester is team leader
    const leaderCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND team_code = $2 AND role = $3',
      [leaderId, teamCode, 'leader']
    );

    if (leaderCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only team leader can delete members' });
    }

    // Prevent self-deletion
    if (parseInt(memberId) === parseInt(leaderId)) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Check if member exists
    const memberCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND team_code = $2 AND role = $3',
      [memberId, teamCode, 'member']
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in your team' });
    }

    client = await pool.connect();
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

// ===============================
// UTILITY & DEBUGGING ENDPOINTS
// ===============================

// Test email endpoint
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

// Debug pre-registrations
router.get('/test-pre-registrations', (req, res) => {
  const formatPreRegs = (map) => Array.from(map.entries()).map(([token, data]) => ({
    token: token.substring(0, 8) + '...',
    email: data.email,
    name: data.name,
    teamName: data.teamName || data.teamName,
    numericCode: data.numericCode,
    expiresIn: Math.round((data.expires - Date.now()) / 60000) + ' minutes'
  }));

  res.json({
    leaderPreRegistrations: preRegistrations.size,
    memberPreRegistrations: memberPreRegistrations.size,
    leaderPreRegs: formatPreRegs(preRegistrations),
    memberPreRegs: formatPreRegs(memberPreRegistrations)
  });
});

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

// Cleanup expired pre-registrations
setInterval(() => cleanupExpiredEntries(preRegistrations, 'leader'), 60 * 60 * 1000);
setInterval(() => cleanupExpiredEntries(memberPreRegistrations, 'member'), 60 * 60 * 1000);

module.exports = router;
