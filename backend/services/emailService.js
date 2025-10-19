// backend/services/emailService.js
const nodemailer = require('nodemailer');
const path = require('path');

// Load environment variables from parent directory
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

console.log('📧 Email Service - Environment check:');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✓ Set' : '✗ Missing');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '***' + process.env.EMAIL_PASS.slice(-4) : '✗ Missing');
console.log('APP_URL:', process.env.APP_URL || 'http://localhost:3000');

// Enhanced email transporter with better error handling and retry logic
const createTransporter = () => {
    // If no email configuration, return null for console fallback
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('❌ Email service not configured. Check EMAIL_USER and EMAIL_PASS in .env file.');
        return null;
    }

    // Enhanced configuration for different email services
    const serviceConfigs = {
        gmail: {
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            // Gmail specific settings
            pool: true,
            maxConnections: 5,
            maxMessages: 10
        },
        outlook: {
            host: 'smtp-mail.outlook.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                ciphers: 'SSLv3'
            }
        },
        yahoo: {
            host: 'smtp.mail.yahoo.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        },
        custom: {
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: process.env.EMAIL_PORT || 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        }
    };

    // Determine which configuration to use with better detection
    let config;
    const emailUser = process.env.EMAIL_USER.toLowerCase();
    
    if (process.env.EMAIL_SERVICE && serviceConfigs[process.env.EMAIL_SERVICE]) {
        config = serviceConfigs[process.env.EMAIL_SERVICE];
        console.log(`📧 Using specified email service: ${process.env.EMAIL_SERVICE}`);
    } else if (process.env.EMAIL_HOST) {
        config = serviceConfigs.custom;
        console.log(`📧 Using custom SMTP: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
    } else if (emailUser.includes('gmail.com')) {
        config = serviceConfigs.gmail;
        console.log('📧 Auto-detected Gmail service');
    } else if (emailUser.includes('outlook.com') || emailUser.includes('hotmail.com') || emailUser.includes('live.com')) {
        config = serviceConfigs.outlook;
        console.log('📧 Auto-detected Outlook/Hotmail service');
    } else if (emailUser.includes('yahoo.com')) {
        config = serviceConfigs.yahoo;
        console.log('📧 Auto-detected Yahoo service');
    } else {
        config = serviceConfigs.gmail;
        console.log('📧 Using default Gmail service configuration');
    }

    console.log(`📧 Email user: ${process.env.EMAIL_USER}`);

    try {
        const transporter = nodemailer.createTransport(config);
        
        // Add event listeners for better debugging
        transporter.on('token', (token) => {
            console.log('📧 New access token generated');
        });

        return transporter;
    } catch (error) {
        console.error('❌ Failed to create email transporter:', error.message);
        return null;
    }
};

// Email service functions with enhanced error handling
const emailService = {
    // Test email configuration with detailed diagnostics
    async testConnection() {
        try {
            console.log('🔌 Testing email connection...');
            const transporter = createTransporter();
            
            if (!transporter) {
                return { 
                    success: false, 
                    message: 'Email service not configured. Check EMAIL_USER and EMAIL_PASS in .env file.',
                    configured: false
                };
            }

            console.log('🔌 Verifying SMTP connection...');
            await transporter.verify();
            console.log('✅ Email connection test: SUCCESS');
            
            return { 
                success: true, 
                message: 'Email service is ready and configured correctly.',
                configured: true
            };
        } catch (error) {
            console.error('❌ Email connection test: FAILED', error.message);
            
            // Provide specific troubleshooting tips
            let troubleshooting = '';
            if (error.code === 'EAUTH') {
                troubleshooting = 'Check your email credentials (EMAIL_USER and EMAIL_PASS)';
            } else if (error.code === 'ECONNECTION') {
                troubleshooting = 'Check your network connection and SMTP server settings';
            } else if (error.code === 'ETIMEDOUT') {
                troubleshooting = 'Connection timeout. Check your SMTP server and port';
            }
            
            return { 
                success: false, 
                message: `Email service configuration error: ${error.message}`,
                troubleshooting: troubleshooting,
                configured: true
            };
        }
    },

    // Send verification email with retry logic
    async sendVerificationEmail(userEmail, userName, verificationToken) {
        const maxRetries = 2;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`📧 Preparing verification email for: ${userEmail} (Attempt ${attempt}/${maxRetries})`);
                const transporter = createTransporter();
                
                // If no email configuration, log to console
                if (!transporter) {
                    const message = `Email service not configured. Verification token for ${userName} (${userEmail}): ${verificationToken}`;
                    console.log(`📧 ${message}`);
                    return { 
                        success: true, 
                        method: 'console',
                        message: message,
                        verificationToken: verificationToken
                    };
                }

                // Test connection first
                if (attempt === 1) {
                    console.log('🔌 Verifying email server connection...');
                    await transporter.verify();
                    console.log('✅ Email server connection verified');
                }

                const appUrl = process.env.APP_URL || 'http://localhost:3000';
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
                                * {
                                    margin: 0;
                                    padding: 0;
                                    box-sizing: border-box;
                                }
                                body { 
                                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                                    line-height: 1.6; 
                                    color: #333; 
                                    background: #f8f9fa;
                                    max-width: 600px; 
                                    margin: 0 auto; 
                                    padding: 0;
                                }
                                .container {
                                    background: white;
                                    border-radius: 12px;
                                    overflow: hidden;
                                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                                    margin: 20px;
                                }
                                .header { 
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                    color: white; 
                                    padding: 40px 30px; 
                                    text-align: center; 
                                }
                                .header h1 {
                                    font-size: 28px;
                                    font-weight: 700;
                                    margin-bottom: 10px;
                                }
                                .content { 
                                    padding: 40px 30px; 
                                }
                                .greeting {
                                    font-size: 18px;
                                    margin-bottom: 20px;
                                    color: #333;
                                }
                                .verification-code {
                                    background: linear-gradient(135deg, #667eea, #764ba2);
                                    color: white;
                                    padding: 20px;
                                    border-radius: 10px;
                                    text-align: center;
                                    margin: 20px 0;
                                    font-family: 'Courier New', monospace;
                                    font-size: 18px;
                                    font-weight: bold;
                                }
                                .verify-button {
                                    display: block;
                                    width: 200px;
                                    margin: 30px auto;
                                    padding: 12px 24px;
                                    background: linear-gradient(135deg, #28a745, #20c997);
                                    color: white;
                                    text-decoration: none;
                                    border-radius: 6px;
                                    text-align: center;
                                    font-weight: 600;
                                    font-size: 16px;
                                }
                                .footer { 
                                    text-align: center; 
                                    margin-top: 30px; 
                                    color: #666; 
                                    font-size: 14px;
                                    padding-top: 20px;
                                    border-top: 1px solid #e9ecef;
                                }
                                .warning {
                                    background: #fff3cd;
                                    border: 1px solid #ffeaa7;
                                    color: #856404;
                                    padding: 15px;
                                    border-radius: 6px;
                                    margin: 15px 0;
                                    font-size: 14px;
                                }
                                .info-box {
                                    background: #e7f3ff;
                                    border: 1px solid #b3d9ff;
                                    padding: 15px;
                                    border-radius: 6px;
                                    margin: 15px 0;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="header">
                                    <h1>Verify Your Email</h1>
                                    <p>Complete your WizDesk registration</p>
                                </div>
                                
                                <div class="content">
                                    <div class="greeting">
                                        Hello <strong>${userName}</strong>,
                                    </div>
                                    
                                    <p>Thank you for starting your registration with WizDesk! To complete your team leader registration, please verify your email address.</p>
                                    
                                    <div class="warning">
                                        <strong>⚠️ Important:</strong> This verification link will expire in 1 hour.
                                    </div>
                                    
                                    <a href="${verificationLink}" class="verify-button">
                                        Verify Email Address
                                    </a>
                                    
                                    <div class="info-box">
                                        <p><strong>Can't click the button?</strong> Copy and paste this link in your browser:</p>
                                        <p style="word-break: break-all; font-size: 12px; color: #666;">${verificationLink}</p>
                                    </div>
                                    
                                    <p style="text-align: center; color: #666; margin-top: 10px;">
                                        Or use this verification code manually: <br>
                                        <span class="verification-code">${verificationToken}</span>
                                    </p>
                                    
                                    <p>If you didn't request this registration, please ignore this email.</p>
                                </div>
                                
                                <div class="footer">
                                    <p>This is an automated message from WizDesk. Please do not reply to this email.</p>
                                </div>
                            </div>
                        </body>
                        </html>
                    `,
                    text: `
Verify Your Email - WizDesk Registration

Hello ${userName},

Thank you for starting your registration with WizDesk! To complete your team leader registration, please verify your email address.

VERIFICATION LINK:
${verificationLink}

MANUAL VERIFICATION CODE:
${verificationToken}

⚠️ Important: This verification link will expire in 1 hour.

If you didn't request this registration, please ignore this email.

This is an automated message from WizDesk. Please do not reply to this email.
                    `
                };

                console.log(`📤 Sending verification email to ${userEmail}...`);
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ Verification email sent to ${userEmail} (Message ID: ${info.messageId})`);
                
                return { 
                    success: true, 
                    method: 'email', 
                    messageId: info.messageId,
                    message: `Verification email sent successfully to ${userEmail}`,
                    verificationToken: verificationToken
                };
                
            } catch (error) {
                lastError = error;
                console.error(`❌ Verification email attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxRetries) {
                    console.log(`🔄 Retrying in 2 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
            }
        }
        
        // All retries failed
        console.error('❌ All verification email attempts failed');
        
        // Fallback: log the verification token with clear instructions
        console.log(`\n📧 EMAIL FAILED - VERIFICATION TOKEN:\n`);
        console.log(`   User: ${userName} (${userEmail})`);
        console.log(`   Verification Token: ${verificationToken}`);
        console.log(`   Please provide this token to complete registration`);
        console.log(`   Or visit: ${process.env.APP_URL || 'http://localhost:3000'}/verify-email.html\n`);
        
        return { 
            success: false, 
            method: 'console_fallback',
            error: lastError?.message,
            verificationToken: verificationToken,
            message: `Email failed after ${maxRetries} attempts. Verification token: ${verificationToken}`
        };
    },

    // Send team code to leader with enhanced template
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

            // Test connection first
            console.log('🔌 Verifying email server connection...');
            await transporter.verify();
            console.log('✅ Email server connection verified');

            const appUrl = process.env.APP_URL || 'http://localhost:3000';

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
                            * {
                                margin: 0;
                                padding: 0;
                                box-sizing: border-box;
                            }
                            body { 
                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                                line-height: 1.6; 
                                color: #333; 
                                background: #f8f9fa;
                                max-width: 600px; 
                                margin: 0 auto; 
                                padding: 0;
                            }
                            .container {
                                background: white;
                                border-radius: 12px;
                                overflow: hidden;
                                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                                margin: 20px;
                            }
                            .header { 
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                color: white; 
                                padding: 40px 30px; 
                                text-align: center; 
                            }
                            .header h1 {
                                font-size: 28px;
                                font-weight: 700;
                                margin-bottom: 10px;
                            }
                            .header p {
                                font-size: 16px;
                                opacity: 0.9;
                            }
                            .content { 
                                padding: 40px 30px; 
                            }
                            .greeting {
                                font-size: 18px;
                                margin-bottom: 20px;
                                color: #333;
                            }
                            .team-info {
                                background: #f8f9fa;
                                padding: 20px;
                                border-radius: 8px;
                                margin: 20px 0;
                                border-left: 4px solid #667eea;
                            }
                            .team-code-container { 
                                background: linear-gradient(135deg, #667eea, #764ba2); 
                                padding: 25px; 
                                border-radius: 10px; 
                                text-align: center; 
                                margin: 25px 0;
                                color: white;
                            }
                            .team-code { 
                                font-size: 32px;
                                font-weight: 700;
                                letter-spacing: 2px;
                                font-family: 'Courier New', monospace;
                                text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
                            }
                            .steps {
                                background: #e7f3ff;
                                padding: 20px;
                                border-radius: 8px;
                                margin: 20px 0;
                            }
                            .steps h3 {
                                color: #667eea;
                                margin-bottom: 15px;
                                font-size: 18px;
                            }
                            .steps ol {
                                padding-left: 20px;
                            }
                            .steps li {
                                margin-bottom: 8px;
                                line-height: 1.5;
                            }
                            .login-button {
                                display: block;
                                width: 200px;
                                margin: 30px auto;
                                padding: 12px 24px;
                                background: linear-gradient(135deg, #667eea, #764ba2);
                                color: white;
                                text-decoration: none;
                                border-radius: 6px;
                                text-align: center;
                                font-weight: 600;
                                font-size: 16px;
                            }
                            .footer { 
                                text-align: center; 
                                margin-top: 30px; 
                                color: #666; 
                                font-size: 14px;
                                padding-top: 20px;
                                border-top: 1px solid #e9ecef;
                            }
                            .warning {
                                background: #fff3cd;
                                border: 1px solid #ffeaa7;
                                color: #856404;
                                padding: 15px;
                                border-radius: 6px;
                                margin: 15px 0;
                                font-size: 14px;
                            }
                            .highlight {
                                background: #fff3cd;
                                padding: 10px;
                                border-radius: 5px;
                                margin: 10px 0;
                                text-align: center;
                                font-weight: 600;
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
                                <div class="greeting">
                                    Hello <strong>${leaderName}</strong>,
                                </div>
                                
                                <p>Thank you for registering as a team leader on WizDesk! Your team <strong>"${teamName}"</strong> has been created successfully.</p>
                                
                                <div class="team-info">
                                    <p><strong>Team Details:</strong></p>
                                    <p><strong>Team Name:</strong> ${teamName}</p>
                                    <p><strong>Your Role:</strong> Team Leader</p>
                                    <p><strong>Email:</strong> ${leaderEmail}</p>
                                </div>

                                <div class="warning">
                                    <strong>⚠️ Important:</strong> Save this team code and share it with your team members. They will need it to join your team.
                                </div>
                                
                                <div class="team-code-container">
                                    <div style="margin-bottom: 10px; font-size: 16px; opacity: 0.9;">Your Team Code</div>
                                    <div class="team-code">${teamCode}</div>
                                    <div style="margin-top: 10px; font-size: 14px; opacity: 0.8;">Share this code with your team members</div>
                                </div>

                                <div class="highlight">
                                    🔗 Share this link with your team: ${appUrl}/member-register.html
                                </div>
                                
                                <div class="steps">
                                    <h3>🚀 Next Steps:</h3>
                                    <ol>
                                        <li><strong>Share the team code</strong> with your team members</li>
                                        <li><strong>Team members register</strong> using your team code at: ${appUrl}/member-register.html</li>
                                        <li><strong>Approve member requests</strong> from your leader dashboard</li>
                                        <li><strong>Create tasks</strong> and assign them to team members</li>
                                        <li><strong>Track progress</strong> and manage your team efficiently</li>
                                    </ol>
                                </div>
                                
                                <a href="${appUrl}" class="login-button">
                                    Login to Dashboard
                                </a>
                                
                                <p style="text-align: center; color: #666; margin-top: 10px;">
                                    You can now login and start managing your team!
                                </p>
                            </div>
                            
                            <div class="footer">
                                <p>This is an automated message from WizDesk. Please do not reply to this email.</p>
                                <p>If you have any questions, please contact our support team.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
🎉 Welcome to WizDesk!

Hello ${leaderName},

Thank you for registering as a team leader on WizDesk! Your team "${teamName}" has been created successfully.

IMPORTANT: Save this team code and share it with your team members. They will need it to join your team.

YOUR TEAM CODE: ${teamCode}

Team Details:
- Team Name: ${teamName}
- Your Role: Team Leader
- Your Email: ${leaderEmail}

Share this registration link with your team members:
${appUrl}/member-register.html

Next Steps:
1. Share the team code with your team members
2. Team members register using your team code at: ${appUrl}/member-register.html
3. Approve member requests from your leader dashboard
4. Create tasks and assign them to team members
5. Track progress and manage your team efficiently

Login to your dashboard: ${appUrl}

This is an automated message from WizDesk. Please do not reply to this email.
                `
            };

            console.log(`📤 Sending team code email to ${leaderEmail}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Team code email sent to ${leaderEmail} (Message ID: ${info.messageId})`);
            
            return { 
                success: true, 
                method: 'email', 
                messageId: info.messageId,
                message: `Team code email sent successfully to ${leaderEmail}`,
                teamCode: teamCode
            };
            
        } catch (error) {
            console.error('❌ Team code email failed:', error.message);
            
            // Enhanced fallback with clear instructions
            console.log(`\n📧 EMAIL FAILED - IMPORTANT TEAM CODE:\n`);
            console.log(`   Team Leader: ${leaderName} (${leaderEmail})`);
            console.log(`   Team Name: ${teamName}`);
            console.log(`   TEAM CODE: ${teamCode}`);
            console.log(`   Registration URL: ${process.env.APP_URL || 'http://localhost:3000'}/member-register.html`);
            console.log(`   Please share this information with ${leaderName} manually\n`);
            
            return { 
                success: false, 
                method: 'console_fallback',
                error: error.message,
                teamCode: teamCode,
                message: `Email failed. Team code: ${teamCode}. Share this with team members.`
            };
        }
    },

    // Send member verification email
    async sendMemberVerificationEmail(userEmail, userName, teamName, verificationToken) {
        const maxRetries = 2;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`📧 Preparing member verification email for: ${userEmail} (Attempt ${attempt}/${maxRetries})`);
                const transporter = createTransporter();
                
                // If no email configuration, log to console
                if (!transporter) {
                    const message = `Email service not configured. Member verification token for ${userName} (${userEmail}): ${verificationToken}`;
                    console.log(`📧 ${message}`);
                    return { 
                        success: true, 
                        method: 'console',
                        message: message,
                        verificationToken: verificationToken
                    };
                }

                // Test connection first
                if (attempt === 1) {
                    console.log('🔌 Verifying email server connection...');
                    await transporter.verify();
                    console.log('✅ Email server connection verified');
                }

                const appUrl = process.env.APP_URL || 'http://localhost:3000';
                const verificationLink = `${appUrl}/verify-member-email.html?token=${verificationToken}`;

                const mailOptions = {
                    from: {
                        name: 'WizDesk Team',
                        address: process.env.EMAIL_USER
                    },
                    to: userEmail,
                    subject: `Verify Your Email - Join ${teamName} on WizDesk`,
                    html: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="utf-8">
                            <style>
                                * {
                                    margin: 0;
                                    padding: 0;
                                    box-sizing: border-box;
                                }
                                body { 
                                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                                    line-height: 1.6; 
                                    color: #333; 
                                    background: #f8f9fa;
                                    max-width: 600px; 
                                    margin: 0 auto; 
                                    padding: 0;
                                }
                                .container {
                                    background: white;
                                    border-radius: 12px;
                                    overflow: hidden;
                                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                                    margin: 20px;
                                }
                                .header { 
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                    color: white; 
                                    padding: 40px 30px; 
                                    text-align: center; 
                                }
                                .header h1 {
                                    font-size: 28px;
                                    font-weight: 700;
                                    margin-bottom: 10px;
                                }
                                .content { 
                                    padding: 40px 30px; 
                                }
                                .greeting {
                                    font-size: 18px;
                                    margin-bottom: 20px;
                                    color: #333;
                                }
                                .team-info {
                                    background: #f8f9fa;
                                    padding: 20px;
                                    border-radius: 8px;
                                    margin: 20px 0;
                                    border-left: 4px solid #667eea;
                                }
                                .verification-code {
                                    background: linear-gradient(135deg, #667eea, #764ba2);
                                    color: white;
                                    padding: 20px;
                                    border-radius: 10px;
                                    text-align: center;
                                    margin: 20px 0;
                                    font-family: 'Courier New', monospace;
                                    font-size: 18px;
                                    font-weight: bold;
                                }
                                .verify-button {
                                    display: block;
                                    width: 200px;
                                    margin: 30px auto;
                                    padding: 12px 24px;
                                    background: linear-gradient(135deg, #28a745, #20c997);
                                    color: white;
                                    text-decoration: none;
                                    border-radius: 6px;
                                    text-align: center;
                                    font-weight: 600;
                                    font-size: 16px;
                                }
                                .footer { 
                                    text-align: center; 
                                    margin-top: 30px; 
                                    color: #666; 
                                    font-size: 14px;
                                    padding-top: 20px;
                                    border-top: 1px solid #e9ecef;
                                }
                                .warning {
                                    background: #fff3cd;
                                    border: 1px solid #ffeaa7;
                                    color: #856404;
                                    padding: 15px;
                                    border-radius: 6px;
                                    margin: 15px 0;
                                    font-size: 14px;
                                }
                                .info-box {
                                    background: #e7f3ff;
                                    border: 1px solid #b3d9ff;
                                    padding: 15px;
                                    border-radius: 6px;
                                    margin: 15px 0;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="header">
                                    <h1>Join Your Team</h1>
                                    <p>Verify your email to complete registration</p>
                                </div>
                                
                                <div class="content">
                                    <div class="greeting">
                                        Hello <strong>${userName}</strong>,
                                    </div>
                                    
                                    <div class="team-info">
                                        <p><strong>Team Details:</strong></p>
                                        <p><strong>Team Name:</strong> ${teamName}</p>
                                        <p><strong>Your Role:</strong> Team Member</p>
                                    </div>
                                    
                                    <p>Thank you for joining <strong>${teamName}</strong> on WizDesk! To complete your registration, please verify your email address.</p>
                                    
                                    <div class="warning">
                                        <strong>⚠️ Important:</strong> This verification link will expire in 1 hour.
                                    </div>
                                    
                                    <a href="${verificationLink}" class="verify-button">
                                        Verify Email Address
                                    </a>
                                    
                                    <div class="info-box">
                                        <p><strong>Can't click the button?</strong> Copy and paste this link in your browser:</p>
                                        <p style="word-break: break-all; font-size: 12px; color: #666;">${verificationLink}</p>
                                    </div>
                                    
                                    <p style="text-align: center; color: #666; margin-top: 10px;">
                                        Or use this verification code manually: <br>
                                        <span class="verification-code">${verificationToken}</span>
                                    </p>
                                    
                                    <p>After verification, your team leader will need to approve your membership before you can access the team dashboard.</p>
                                    
                                    <p>If you didn't request to join this team, please ignore this email.</p>
                                </div>
                                
                                <div class="footer">
                                    <p>This is an automated message from WizDesk. Please do not reply to this email.</p>
                                </div>
                            </div>
                        </body>
                        </html>
                    `,
                    text: `
Join Your Team - WizDesk Registration

Hello ${userName},

Thank you for joining ${teamName} on WizDesk! To complete your registration, please verify your email address.

Team Details:
- Team Name: ${teamName}
- Your Role: Team Member

VERIFICATION LINK:
${verificationLink}

MANUAL VERIFICATION CODE:
${verificationToken}

⚠️ Important: This verification link will expire in 1 hour.

After verification, your team leader will need to approve your membership before you can access the team dashboard.

If you didn't request to join this team, please ignore this email.

This is an automated message from WizDesk. Please do not reply to this email.
                    `
                };

                console.log(`📤 Sending member verification email to ${userEmail}...`);
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ Member verification email sent to ${userEmail} (Message ID: ${info.messageId})`);
                
                return { 
                    success: true, 
                    method: 'email', 
                    messageId: info.messageId,
                    message: `Member verification email sent successfully to ${userEmail}`,
                    verificationToken: verificationToken
                };
                
            } catch (error) {
                lastError = error;
                console.error(`❌ Member verification email attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxRetries) {
                    console.log(`🔄 Retrying in 2 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
            }
        }
        
        // All retries failed
        console.error('❌ All member verification email attempts failed');
        
        // Fallback: log the verification token with clear instructions
        console.log(`\n📧 EMAIL FAILED - MEMBER VERIFICATION TOKEN:\n`);
        console.log(`   User: ${userName} (${userEmail})`);
        console.log(`   Team: ${teamName}`);
        console.log(`   Verification Token: ${verificationToken}`);
        console.log(`   Please provide this token to complete registration\n`);
        
        return { 
            success: false, 
            method: 'console_fallback',
            error: lastError?.message,
            verificationToken: verificationToken,
            message: `Email failed after ${maxRetries} attempts. Verification token: ${verificationToken}`
        };
    },

    // Send member approval notification
    async sendMemberApprovalNotification(memberEmail, memberName, leaderName, teamName) {
        try {
            console.log(`📧 Preparing to send approval email to: ${memberEmail}`);
            const transporter = createTransporter();
            
            if (!transporter) {
                const message = `Email service not configured. Approval notification for ${memberName}`;
                console.log(`📧 ${message}`);
                return { 
                    success: true, 
                    method: 'console',
                    message: message 
                };
            }

            await transporter.verify();

            const appUrl = process.env.APP_URL || 'http://localhost:3000';

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
                            * {
                                margin: 0;
                                padding: 0;
                                box-sizing: border-box;
                            }
                            body { 
                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                                line-height: 1.6; 
                                color: #333; 
                                background: #f8f9fa;
                                max-width: 600px; 
                                margin: 0 auto; 
                                padding: 0;
                            }
                            .container {
                                background: white;
                                border-radius: 12px;
                                overflow: hidden;
                                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                                margin: 20px;
                            }
                            .header { 
                                background: linear-gradient(135deg, #28a745, #20c997); 
                                color: white; 
                                padding: 40px 30px; 
                                text-align: center; 
                            }
                            .header h1 {
                                font-size: 28px;
                                font-weight: 700;
                                margin-bottom: 10px;
                            }
                            .content { 
                                padding: 40px 30px; 
                            }
                            .greeting {
                                font-size: 18px;
                                margin-bottom: 20px;
                                color: #333;
                            }
                            .approval-info {
                                background: #d4edda;
                                padding: 20px;
                                border-radius: 8px;
                                margin: 20px 0;
                                border-left: 4px solid #28a745;
                            }
                            .login-button {
                                display: block;
                                width: 200px;
                                margin: 30px auto;
                                padding: 12px 24px;
                                background: linear-gradient(135deg, #28a745, #20c997);
                                color: white;
                                text-decoration: none;
                                border-radius: 6px;
                                text-align: center;
                                font-weight: 600;
                                font-size: 16px;
                            }
                            .footer { 
                                text-align: center; 
                                margin-top: 30px; 
                                color: #666; 
                                font-size: 14px;
                                padding-top: 20px;
                                border-top: 1px solid #e9ecef;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>✅ Membership Approved!</h1>
                                <p>Welcome to the team!</p>
                            </div>
                            
                            <div class="content">
                                <div class="greeting">
                                    Hello <strong>${memberName}</strong>,
                                </div>
                                
                                <div class="approval-info">
                                    <p><strong>Great news!</strong> Your membership request for team <strong>"${teamName}"</strong> has been approved by <strong>${leaderName}</strong>.</p>
                                </div>
                                
                                <p>You are now an official member of the team and can start working on assigned tasks.</p>
                                <p>Access your dashboard to view tasks, update progress, and collaborate with your team.</p>
                                
                                <a href="${appUrl}" class="login-button">
                                    Login to Dashboard
                                </a>
                                
                                <p style="text-align: center; color: #666; margin-top: 10px;">
                                    Start contributing to your team's success!
                                </p>
                            </div>
                            
                            <div class="footer">
                                <p>This is an automated message from WizDesk. Please do not reply to this email.</p>
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

Login to your dashboard: ${process.env.APP_URL || 'http://localhost:3000'}

Start contributing to your team's success!

This is an automated message from WizDesk. Please do not reply to this email.
                `
            };

            console.log(`📤 Sending approval email to ${memberEmail}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Approval email sent to ${memberEmail} (Message ID: ${info.messageId})`);
            
            return { 
                success: true, 
                method: 'email', 
                messageId: info.messageId,
                message: `Approval notification sent to ${memberEmail}`
            };
            
        } catch (error) {
            console.error('❌ Approval email failed:', error.message);
            console.log(`📧 Approval notification failed for ${memberName} (${memberEmail})`);
            
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

            await transporter.verify();

            const appUrl = process.env.APP_URL || 'http://localhost:3000';

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
                            * {
                                margin: 0;
                                padding: 0;
                                box-sizing: border-box;
                            }
                            body { 
                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                                line-height: 1.6; 
                                color: #333; 
                                background: #f8f9fa;
                                max-width: 600px; 
                                margin: 0 auto; 
                                padding: 0;
                            }
                            .container {
                                background: white;
                                border-radius: 12px;
                                overflow: hidden;
                                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                                margin: 20px;
                            }
                            .header { 
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                color: white; 
                                padding: 40px 30px; 
                                text-align: center; 
                            }
                            .header h1 {
                                font-size: 28px;
                                font-weight: 700;
                                margin-bottom: 10px;
                            }
                            .content { 
                                padding: 40px 30px; 
                            }
                            .greeting {
                                font-size: 18px;
                                margin-bottom: 20px;
                                color: #333;
                            }
                            .member-info {
                                background: #e7f3ff;
                                padding: 20px;
                                border-radius: 8px;
                                margin: 20px 0;
                                border-left: 4px solid #667eea;
                            }
                            .action-button {
                                display: block;
                                width: 250px;
                                margin: 30px auto;
                                padding: 12px 24px;
                                background: linear-gradient(135deg, #667eea, #764ba2);
                                color: white;
                                text-decoration: none;
                                border-radius: 6px;
                                text-align: center;
                                font-weight: 600;
                                font-size: 16px;
                            }
                            .footer { 
                                text-align: center; 
                                margin-top: 30px; 
                                color: #666; 
                                font-size: 14px;
                                padding-top: 20px;
                                border-top: 1px solid #e9ecef;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>👤 New Member Request</h1>
                                <p>Action required for team ${teamName}</p>
                            </div>
                            
                            <div class="content">
                                <div class="greeting">
                                    Hello <strong>${leaderName}</strong>,
                                </div>
                                
                                <p>A new member has requested to join your team <strong>${teamName}</strong>.</p>
                                
                                <div class="member-info">
                                    <p><strong>Member Details:</strong></p>
                                    <p><strong>Name:</strong> ${memberName}</p>
                                    <p><strong>Email:</strong> ${memberEmail}</p>
                                    <p><strong>Status:</strong> Pending Approval</p>
                                </div>
                                
                                <p>Please review and approve or reject this member request in your leader dashboard.</p>
                                
                                <a href="${appUrl}/leader-dashboard.html" class="action-button">
                                    Review Member Requests
                                </a>
                                
                                <p style="text-align: center; color: #666; margin-top: 10px;">
                                    Manage your team members from the leader dashboard.
                                </p>
                            </div>
                            
                            <div class="footer">
                                <p>This is an automated message from WizDesk. Please do not reply to this email.</p>
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

This is an automated message from WizDesk. Please do not reply to this email.
                `
            };

            console.log(`📤 Sending new member notification to ${leaderEmail}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ New member notification sent to ${leaderEmail} (Message ID: ${info.messageId})`);
            
            return { 
                success: true, 
                method: 'email', 
                messageId: info.messageId,
                message: `New member notification sent to ${leaderEmail}`
            };
            
        } catch (error) {
            console.error('❌ New member notification failed:', error.message);
            console.log(`📧 New member notification failed for ${leaderName} (${leaderEmail})`);
            
            return { 
                success: false, 
                method: 'console_fallback',
                error: error.message,
                message: `New member notification failed for ${leaderEmail}`
            };
        }
    },

    // Send password reset email
    async sendPasswordResetEmail(userEmail, userName, resetToken) {
        try {
            console.log(`📧 Preparing to send password reset email to: ${userEmail}`);
            const transporter = createTransporter();
            
            if (!transporter) {
                console.log(`📧 Email service not configured. Password reset for ${userName}`);
                return { success: true, method: 'console' };
            }

            await transporter.verify();

            const appUrl = process.env.APP_URL || 'http://localhost:3000';
            const resetLink = `${appUrl}/reset-password?token=${resetToken}`;

            const mailOptions = {
                from: {
                    name: 'WizDesk Team',
                    address: process.env.EMAIL_USER
                },
                to: userEmail,
                subject: 'WizDesk - Password Reset Request',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: linear-gradient(135deg, #dc3545, #e83e8c); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                            .reset-button { display: block; width: 200px; margin: 20px auto; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 6px; text-align: center; font-weight: 600; }
                            .warning { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 6px; margin: 15px 0; font-size: 14px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>🔒 Password Reset</h1>
                        </div>
                        <div class="content">
                            <p>Hello <strong>${userName}</strong>,</p>
                            <p>We received a request to reset your password for your WizDesk account.</p>
                            <a href="${resetLink}" class="reset-button">Reset Password</a>
                            <div class="warning">
                                <strong>Note:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
                            </div>
                            <p>Best regards,<br>The WizDesk Team</p>
                        </div>
                    </body>
                    </html>
                `
            };

            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Password reset email sent to ${userEmail}`);
            
            return { success: true, method: 'email', messageId: info.messageId };
            
        } catch (error) {
            console.error('❌ Password reset email failed:', error.message);
            return { success: false, error: error.message };
        }
    }
};

module.exports = emailService;
