// backend/services/emailService.js
const nodemailer = require('nodemailer');
const path = require('path');

// Load environment variables properly for production
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

console.log('📧 Email Service - Environment check:');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✓ Set' : '✗ Missing');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '***' + process.env.EMAIL_PASS.slice(-4) : '✗ Missing');
console.log('APP_URL:', process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000');

// Enhanced email transporter for cloud deployment
const createTransporter = () => {
    // If no email configuration, return null for console fallback
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('❌ Email service not configured. Check EMAIL_USER and EMAIL_PASS environment variables.');
        return null;
    }

    // Get app URL for production
    const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
    console.log('🌐 Using App URL:', appUrl);

    // Enhanced configuration for production
    const config = {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        // Production optimizations
        pool: true,
        maxConnections: 3,
        maxMessages: 10,
        rateDelta: 1000,
        rateLimit: 5,
        // Better timeout settings for production
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        // TLS options for production
        tls: {
            rejectUnauthorized: false
        }
    };

    console.log(`📧 Email Configuration: ${config.host}:${config.port}`);

    try {
        const transporter = nodemailer.createTransport(config);
        
        // Verify connection on startup
        transporter.verify((error, success) => {
            if (error) {
                console.error('❌ Email transporter verification failed:', error.message);
            } else {
                console.log('✅ Email transporter ready for production');
            }
        });
        
        return transporter;
    } catch (error) {
        console.error('❌ Failed to create email transporter:', error.message);
        return null;
    }
};

// Email service functions with shorter codes
const emailService = {
    // Generate shorter verification code (6 digits)
    generateShortCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    },

    // Test email configuration
    async testConnection() {
        try {
            console.log('🔌 Testing email connection...');
            const transporter = createTransporter();
            
            if (!transporter) {
                return { 
                    success: false, 
                    message: 'Email service not configured.',
                    configured: false
                };
            }

            await transporter.verify();
            console.log('✅ Email connection test: SUCCESS');
            
            return { 
                success: true, 
                message: 'Email service is ready for production.',
                configured: true
            };
        } catch (error) {
            console.error('❌ Email connection test: FAILED', error.message);
            return { 
                success: false, 
                message: `Email service error: ${error.message}`,
                configured: true
            };
        }
    },

    // Send verification email with shorter code
    async sendVerificationEmail(userEmail, userName, verificationToken, numericCode) {
        try {
            console.log(`📧 Preparing verification email for: ${userEmail}`);
            const transporter = createTransporter();
            
            // If no email configuration, log to console
            if (!transporter) {
                const message = `Email service not configured. Verification for ${userName}: Code ${numericCode}`;
                console.log(`📧 ${message}`);
                return { 
                    success: true, 
                    method: 'console',
                    message: message,
                    numericCode: numericCode
                };
            }

            const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
            const verificationLink = `${appUrl}/verify-email.html?token=${verificationToken}`;

            const mailOptions = {
                from: {
                    name: 'WizDesk Team',
                    address: process.env.EMAIL_USER
                },
                to: userEmail,
                subject: `Verify Your Email - WizDesk Registration`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #667eea; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; background: #f8f9fa; }
                            .verification-code { 
                                background: #667eea; 
                                color: white; 
                                padding: 15px; 
                                text-align: center; 
                                font-size: 24px; 
                                font-weight: bold; 
                                margin: 20px 0;
                                border-radius: 5px;
                            }
                            .verify-button {
                                display: inline-block;
                                padding: 12px 24px;
                                background: #28a745;
                                color: white;
                                text-decoration: none;
                                border-radius: 5px;
                                margin: 10px 0;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>Verify Your Email</h1>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${userName}</strong>,</p>
                                <p>Thank you for registering with WizDesk! Use the verification code below:</p>
                                
                                <div class="verification-code">
                                    ${numericCode}
                                </div>
                                
                                <p>Or click the button below to verify automatically:</p>
                                <a href="${verificationLink}" class="verify-button">Verify Email</a>
                                
                                <p><small>This code will expire in 1 hour.</small></p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
Verify Your Email - WizDesk Registration

Hello ${userName},

Thank you for registering with WizDesk!

Your verification code: ${numericCode}

Or click this link: ${verificationLink}

This code will expire in 1 hour.
                `
            };

            console.log(`📤 Sending verification email to ${userEmail}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Verification email sent to ${userEmail}`);
            
            return { 
                success: true, 
                method: 'email', 
                messageId: info.messageId,
                numericCode: numericCode
            };
            
        } catch (error) {
            console.error('❌ Verification email failed:', error.message);
            
            // Fallback with shorter code
            console.log(`\n📧 EMAIL FAILED - VERIFICATION CODE:\n`);
            console.log(`   User: ${userName} (${userEmail})`);
            console.log(`   Verification Code: ${numericCode}`);
            
            return { 
                success: false, 
                method: 'console_fallback',
                error: error.message,
                numericCode: numericCode,
                message: `Email failed. Use code: ${numericCode}`
            };
        }
    },

    // Send member verification email with shorter code
    async sendMemberVerificationEmail(userEmail, userName, teamName, verificationToken, numericCode) {
        try {
            console.log(`📧 Preparing member verification email for: ${userEmail}`);
            const transporter = createTransporter();
            
            if (!transporter) {
                const message = `Email service not configured. Member verification for ${userName}: Code ${numericCode}`;
                console.log(`📧 ${message}`);
                return { 
                    success: true, 
                    method: 'console',
                    message: message,
                    numericCode: numericCode
                };
            }

            const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
            const verificationLink = `${appUrl}/verify-member-email.html?token=${verificationToken}`;

            const mailOptions = {
                from: {
                    name: 'WizDesk Team',
                    address: process.env.EMAIL_USER
                },
                to: userEmail,
                subject: `Verify Your Email - Join ${teamName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #667eea; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; background: #f8f9fa; }
                            .verification-code { 
                                background: #667eea; 
                                color: white; 
                                padding: 15px; 
                                text-align: center; 
                                font-size: 24px; 
                                font-weight: bold; 
                                margin: 20px 0;
                                border-radius: 5px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>Join ${teamName}</h1>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${userName}</strong>,</p>
                                <p>You're joining <strong>${teamName}</strong> on WizDesk!</p>
                                
                                <div class="verification-code">
                                    ${numericCode}
                                </div>
                                
                                <p>Or click here to verify: <a href="${verificationLink}">Verify Email</a></p>
                                <p><small>This code will expire in 1 hour.</small></p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
Join ${teamName} - WizDesk

Hello ${userName},

You're joining ${teamName} on WizDesk!

Your verification code: ${numericCode}

Or click: ${verificationLink}

This code will expire in 1 hour.
                `
            };

            console.log(`📤 Sending member verification email to ${userEmail}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Member verification email sent to ${userEmail}`);
            
            return { 
                success: true, 
                method: 'email', 
                messageId: info.messageId,
                numericCode: numericCode
            };
            
        } catch (error) {
            console.error('❌ Member verification email failed:', error.message);
            console.log(`📧 MEMBER VERIFICATION CODE: ${numericCode} for ${userName}`);
            
            return { 
                success: false, 
                method: 'console_fallback',
                error: error.message,
                numericCode: numericCode
            };
        }
    },

    // Send team code to leader
    async sendTeamCodeToLeader(leaderEmail, leaderName, teamCode, teamName) {
        try {
            console.log(`📧 Preparing to send team code email to: ${leaderEmail}`);
            const transporter = createTransporter();
            
            // If no email configuration, log to console
            if (!transporter) {
                const message = `Email service not configured. Team code for ${leaderName} (${leaderEmail}): ${teamCode}`;
                console.log(`📧 ${message}`);
                return { 
                    success: true, 
                    method: 'console',
                    message: message 
                };
            }

            const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

            const mailOptions = {
                from: {
                    name: 'WizDesk Team',
                    address: process.env.EMAIL_USER
                },
                to: leaderEmail,
                subject: `🎉 Welcome to WizDesk - Your Team Code for ${teamName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #667eea; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; background: #f8f9fa; }
                            .team-code { 
                                background: #667eea; 
                                color: white; 
                                padding: 20px; 
                                text-align: center; 
                                font-size: 28px; 
                                font-weight: bold; 
                                margin: 20px 0;
                                border-radius: 5px;
                                letter-spacing: 2px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🎉 Welcome to WizDesk!</h1>
                                <p>Your team has been created successfully</p>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${leaderName}</strong>,</p>
                                <p>Thank you for registering as a team leader on WizDesk! Your team <strong>"${teamName}"</strong> has been created successfully.</p>
                                
                                <div class="team-code">
                                    ${teamCode}
                                </div>
                                
                                <p><strong>Share this code with your team members so they can join your team.</strong></p>
                                <p>Team members can register at: ${appUrl}/member-register.html</p>
                                
                                <p>You can now login and start managing your team!</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
🎉 Welcome to WizDesk!

Hello ${leaderName},

Thank you for registering as a team leader on WizDesk! Your team "${teamName}" has been created successfully.

YOUR TEAM CODE: ${teamCode}

Share this code with your team members so they can join your team.

Team members can register at: ${appUrl}/member-register.html

You can now login and start managing your team!
                `
            };

            console.log(`📤 Sending team code email to ${leaderEmail}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Team code email sent to ${leaderEmail}`);
            
            return { 
                success: true, 
                method: 'email', 
                messageId: info.messageId,
                message: `Team code email sent successfully to ${leaderEmail}`,
                teamCode: teamCode
            };
            
        } catch (error) {
            console.error('❌ Team code email failed:', error.message);
            console.log(`📧 TEAM CODE: ${teamCode} for ${leaderName}`);
            
            return { 
                success: false, 
                method: 'console_fallback',
                error: error.message,
                teamCode: teamCode,
                message: `Email failed. Team code: ${teamCode}`
            };
        }
    },

    // Send member approval notification
    async sendMemberApprovalNotification(memberEmail, memberName, leaderName, teamName) {
        try {
            console.log(`📧 Preparing to send approval email to: ${memberEmail}`);
            const transporter = createTransporter();
            
            if (!transporter) {
                console.log(`📧 Email service not configured. Approval notification for ${memberName}`);
                return { 
                    success: true, 
                    method: 'console',
                    message: 'Email service not configured' 
                };
            }

            const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

            const mailOptions = {
                from: {
                    name: 'WizDesk Team',
                    address: process.env.EMAIL_USER
                },
                to: memberEmail,
                subject: `✅ Membership Approved - Welcome to ${teamName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #28a745; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; background: #f8f9fa; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>✅ Membership Approved!</h1>
                                <p>Welcome to the team!</p>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${memberName}</strong>,</p>
                                <p>Great news! Your membership request for team <strong>"${teamName}"</strong> has been approved by <strong>${leaderName}</strong>.</p>
                                <p>You are now an official member of the team and can start working on assigned tasks.</p>
                                <p>Login to your dashboard: <a href="${appUrl}">${appUrl}</a></p>
                                <p>Start contributing to your team's success!</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
✅ Membership Approved!

Hello ${memberName},

Great news! Your membership request for team "${teamName}" has been approved by ${leaderName}.

You are now an official member of the team and can start working on assigned tasks.

Login to your dashboard: ${appUrl}

Start contributing to your team's success!
                `
            };

            console.log(`📤 Sending approval email to ${memberEmail}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Approval email sent to ${memberEmail}`);
            
            return { 
                success: true, 
                method: 'email', 
                messageId: info.messageId,
                message: `Approval notification sent to ${memberEmail}`
            };
            
        } catch (error) {
            console.error('❌ Approval email failed:', error.message);
            console.log(`📧 Approval notification failed for ${memberName}`);
            
            return { 
                success: false, 
                method: 'console_fallback',
                error: error.message,
                message: `Approval email failed for ${memberEmail}`
            };
        }
    },

    // Send new member notification to leader
    async sendNewMemberNotificationToLeader(leaderEmail, leaderName, memberName, memberEmail, teamName) {
        try {
            console.log(`📧 Preparing new member notification for leader: ${leaderEmail}`);
            const transporter = createTransporter();
            
            if (!transporter) {
                console.log(`📧 Email service not configured. New member notification for ${leaderName}`);
                return { success: true, method: 'console' };
            }

            const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

            const mailOptions = {
                from: {
                    name: 'WizDesk Team',
                    address: process.env.EMAIL_USER
                },
                to: leaderEmail,
                subject: `👤 New Member Request for ${teamName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #667eea; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; background: #f8f9fa; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>👤 New Member Request</h1>
                                <p>Action required for team ${teamName}</p>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${leaderName}</strong>,</p>
                                <p>A new member has requested to join your team <strong>${teamName}</strong>.</p>
                                
                                <p><strong>Member Details:</strong></p>
                                <p><strong>Name:</strong> ${memberName}</p>
                                <p><strong>Email:</strong> ${memberEmail}</p>
                                <p><strong>Status:</strong> Pending Approval</p>
                                
                                <p>Please review and approve or reject this member request in your leader dashboard.</p>
                                <p>Login to review: <a href="${appUrl}/leader-dashboard.html">${appUrl}/leader-dashboard.html</a></p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
New Member Request - ${teamName}

Hello ${leaderName},

A new member has requested to join your team ${teamName}.

Member Details:
- Name: ${memberName}
- Email: ${memberEmail}
- Status: Pending Approval

Please review and approve or reject this member request in your leader dashboard.

Login to review: ${appUrl}/leader-dashboard.html
                `
            };

            console.log(`📤 Sending new member notification to ${leaderEmail}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ New member notification sent to ${leaderEmail}`);
            
            return { 
                success: true, 
                method: 'email', 
                messageId: info.messageId,
                message: `New member notification sent to ${leaderEmail}`
            };
            
        } catch (error) {
            console.error('❌ New member notification failed:', error.message);
            console.log(`📧 New member notification failed for ${leaderName}`);
            
            return { 
                success: false, 
                method: 'console_fallback',
                error: error.message,
                message: `New member notification failed for ${leaderEmail}`
            };
        }
    }
};

module.exports = emailService;
