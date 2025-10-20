// backend/services/emailService.js
const nodemailer = require('nodemailer');
const path = require('path');

// Load environment variables once from your main entry file (index.js) is best practice,
// but this ensures it works standalone.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { EMAIL_USER, EMAIL_PASS, EMAIL_SERVICE, EMAIL_HOST, EMAIL_PORT, APP_URL } = process.env;

// Set a default APP_URL for local development if not specified
const appUrl = APP_URL || 'http://localhost:3000';

console.log('📧 Email Service - Environment check:');
console.log('EMAIL_USER:', EMAIL_USER ? '✓ Set' : '✗ Missing');
console.log('EMAIL_PASS:', EMAIL_PASS ? '✓ Set' : '✗ Missing');
console.log('APP_URL:', appUrl);


// --- 1. Centralized Email Templates ---
const templates = {
    leaderVerification: {
        subject: 'Verify Your Email - WizDesk Registration',
        html: `
            <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:'Segoe UI',sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa}.container{background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);margin:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:40px 30px;text-align:center}.header h1{font-size:28px;font-weight:700;margin-bottom:10px}.content{padding:40px 30px}.greeting{font-size:18px;margin-bottom:20px;color:#333}.verify-button{display:block;width:200px;margin:30px auto;padding:12px 24px;background:linear-gradient(135deg,#28a745,#20c997);color:white!important;text-decoration:none;border-radius:6px;text-align:center;font-weight:600;font-size:16px}.footer{text-align:center;margin-top:30px;color:#666;font-size:14px;padding-top:20px;border-top:1px solid #e9ecef}.warning{background:#fff3cd;border:1px solid #ffeaa7;color:#856404;padding:15px;border-radius:6px;margin:15px 0;font-size:14px}.info-box{background:#e7f3ff;border:1px solid #b3d9ff;padding:15px;border-radius:6px;margin:15px 0}.verification-code{background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:20px;border-radius:10px;text-align:center;margin:20px 0;font-family:'Courier New',monospace;font-size:18px;font-weight:bold}</style></head><body><div class="container"><div class="header"><h1>Verify Your Email</h1><p>Complete your WizDesk registration</p></div><div class="content"><div class="greeting">Hello <strong>{{userName}}</strong>,</div><p>Thank you for starting your registration with WizDesk! To complete your team leader registration, please verify your email address.</p><div class="warning"><strong>⚠️ Important:</strong> This verification link will expire in 1 hour.</div><a href="{{verificationLink}}" class="verify-button">Verify Email Address</a><div class="info-box"><p><strong>Can't click the button?</strong> Copy and paste this link in your browser:</p><p style="word-break:break-all;font-size:12px;color:#666">{{verificationLink}}</p></div><p style="text-align:center;color:#666;margin-top:10px">Or use this verification code manually:<br><span class="verification-code">{{verificationToken}}</span></p><p>If you didn't request this registration, please ignore this email.</p></div><div class="footer"><p>This is an automated message from WizDesk. Please do not reply to this email.</p></div></div></body></html>
        `,
        text: `Verify Your Email - WizDesk Registration\n\nHello {{userName}},\n\nThank you for starting your registration with WizDesk! To complete your team leader registration, please verify your email address.\n\nVERIFICATION LINK:\n{{verificationLink}}\n\nMANUAL VERIFICATION CODE:\n{{verificationToken}}\n\n⚠️ Important: This verification link will expire in 1 hour.\n\nIf you didn't request this registration, please ignore this email.\nThis is an automated message from WizDesk. Please do not reply to this email.`
    },
    teamCode: {
        subject: (teamName) => `🎉 Welcome to WizDesk - Your Team Code for ${teamName}`,
        html: `
            <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:'Segoe UI',sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa}.container{background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);margin:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:40px 30px;text-align:center}.header h1{font-size:28px;font-weight:700;margin-bottom:10px}.header p{font-size:16px;opacity:0.9}.content{padding:40px 30px}.greeting{font-size:18px;margin-bottom:20px;color:#333}.team-info{background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #667eea}.team-code-container{background:linear-gradient(135deg,#667eea,#764ba2);padding:25px;border-radius:10px;text-align:center;margin:25px 0;color:white}.team-code{font-size:32px;font-weight:700;letter-spacing:2px;font-family:'Courier New',monospace;text-shadow:1px 1px 2px rgba(0,0,0,0.3)}.steps{background:#e7f3ff;padding:20px;border-radius:8px;margin:20px 0}.steps h3{color:#667eea;margin-bottom:15px;font-size:18px}.steps ol{padding-left:20px}.steps li{margin-bottom:8px;line-height:1.5}.login-button{display:block;width:200px;margin:30px auto;padding:12px 24px;background:linear-gradient(135deg,#667eea,#764ba2);color:white!important;text-decoration:none;border-radius:6px;text-align:center;font-weight:600;font-size:16px}.footer{text-align:center;margin-top:30px;color:#666;font-size:14px;padding-top:20px;border-top:1px solid #e9ecef}.warning{background:#fff3cd;border:1px solid #ffeaa7;color:#856404;padding:15px;border-radius:6px;margin:15px 0;font-size:14px}.highlight{background:#fff3cd;padding:10px;border-radius:5px;margin:10px 0;text-align:center;font-weight:600}</style></head><body><div class="container"><div class="header"><h1>🎉 Welcome to WizDesk!</h1><p>Your team has been created successfully</p></div><div class="content"><div class="greeting">Hello <strong>{{leaderName}}</strong>,</div><p>Thank you for registering as a team leader on WizDesk! Your team <strong>"{{teamName}}"</strong> has been created successfully.</p><div class="team-info"><p><strong>Team Details:</strong></p><p><strong>Team Name:</strong> {{teamName}}</p><p><strong>Your Role:</strong> Team Leader</p><p><strong>Email:</strong> {{leaderEmail}}</p></div><div class="warning"><strong>⚠️ Important:</strong> Save this team code and share it with your team members. They will need it to join your team.</div><div class="team-code-container"><div style="margin-bottom:10px;font-size:16px;opacity:0.9">Your Team Code</div><div class="team-code">{{teamCode}}</div><div style="margin-top:10px;font-size:14px;opacity:0.8">Share this code with your team members</div></div><div class="highlight">🔗 Share this link with your team: {{appUrl}}/member-register.html</div><div class="steps"><h3>🚀 Next Steps:</h3><ol><li><strong>Share the team code</strong> with your team members</li><li><strong>Team members register</strong> using your team code at: {{appUrl}}/member-register.html</li><li><strong>Approve member requests</strong> from your leader dashboard</li><li><strong>Create tasks</strong> and assign them to team members</li><li><strong>Track progress</strong> and manage your team efficiently</li></ol></div><a href="{{appUrl}}" class="login-button">Login to Dashboard</a><p style="text-align:center;color:#666;margin-top:10px">You can now login and start managing your team!</p></div><div class="footer"><p>This is an automated message from WizDesk. Please do not reply to this email.</p><p>If you have any questions, please contact our support team.</p></div></div></body></html>
        `,
        text: `🎉 Welcome to WizDesk!\n\nHello {{leaderName}},\n\nYour team "{{teamName}}" has been created successfully.\n\nIMPORTANT: Save this team code and share it with your team members.\n\nYOUR TEAM CODE: {{teamCode}}\n\nShare this registration link with your team members:\n{{appUrl}}/member-register.html\n\nLogin to your dashboard: {{appUrl}}`
    },
    memberVerification: {
        subject: (teamName) => `Verify Your Email - Join ${teamName} on WizDesk`,
        html: `
            <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:'Segoe UI',sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa}.container{background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);margin:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:40px 30px;text-align:center}.header h1{font-size:28px;font-weight:700;margin-bottom:10px}.content{padding:40px 30px}.greeting{font-size:18px;margin-bottom:20px;color:#333}.verify-button{display:block;width:200px;margin:30px auto;padding:12px 24px;background:linear-gradient(135deg,#28a745,#20c997);color:white!important;text-decoration:none;border-radius:6px;text-align:center;font-weight:600;font-size:16px}.footer{text-align:center;margin-top:30px;color:#666;font-size:14px;padding-top:20px;border-top:1px solid #e9ecef}.warning{background:#fff3cd;border:1px solid #ffeaa7;color:#856404;padding:15px;border-radius:6px;margin:15px 0;font-size:14px}.info-box{background:#e7f3ff;border:1px solid #b3d9ff;padding:15px;border-radius:6px;margin:15px 0}.verification-code{background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:20px;border-radius:10px;text-align:center;margin:20px 0;font-family:'Courier New',monospace;font-size:18px;font-weight:bold}</style></head><body><div class="container"><div class="header"><h1>Join Your Team</h1><p>Verify your email to complete registration</p></div><div class="content"><div class="greeting">Hello <strong>{{userName}}</strong>,</div><p>Thank you for joining <strong>{{teamName}}</strong> on WizDesk! To complete your registration, please verify your email address.</p><div class="warning"><strong>⚠️ Important:</strong> This verification link will expire in 1 hour.</div><a href="{{verificationLink}}" class="verify-button">Verify Email Address</a><div class="info-box"><p><strong>Can't click the button?</strong> Copy and paste this link in your browser:</p><p style="word-break:break-all;font-size:12px;color:#666">{{verificationLink}}</p></div><p style="text-align:center;color:#666;margin-top:10px">Or use this verification code manually:<br><span class="verification-code">{{verificationToken}}</span></p><p>After verification, your team leader will need to approve your membership.</p><p>If you didn't request to join this team, please ignore this email.</p></div><div class="footer"><p>This is an automated message from WizDesk. Please do not reply to this email.</p></div></div></body></html>
        `,
        text: `Join Your Team - WizDesk Registration\n\nHello {{userName}},\n\nThank you for joining {{teamName}} on WizDesk! Please verify your email.\n\nVERIFICATION LINK:\n{{verificationLink}}\n\nMANUAL VERIFICATION CODE:\n{{verificationToken}}\n\n⚠️ This link expires in 1 hour.`
    },
    memberApproval: {
        subject: (teamName) => `✅ Membership Approved - Welcome to ${teamName}`,
        html: `
            <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:'Segoe UI',sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa}.container{background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);margin:20px}.header{background:linear-gradient(135deg,#28a745,#20c997);color:white;padding:40px 30px;text-align:center}.header h1{font-size:28px;font-weight:700;margin-bottom:10px}.content{padding:40px 30px}.greeting{font-size:18px;margin-bottom:20px;color:#333}.approval-info{background:#d4edda;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #28a745}.login-button{display:block;width:200px;margin:30px auto;padding:12px 24px;background:linear-gradient(135deg,#28a745,#20c997);color:white!important;text-decoration:none;border-radius:6px;text-align:center;font-weight:600;font-size:16px}.footer{text-align:center;margin-top:30px;color:#666;font-size:14px;padding-top:20px;border-top:1px solid #e9ecef}</style></head><body><div class="container"><div class="header"><h1>✅ Membership Approved!</h1><p>Welcome to the team!</p></div><div class="content"><div class="greeting">Hello <strong>{{memberName}}</strong>,</div><div class="approval-info"><p><strong>Great news!</strong> Your membership request for team <strong>"{{teamName}}"</strong> has been approved by <strong>{{leaderName}}</strong>.</p></div><p>You are now an official member of the team and can start working on assigned tasks.</p><p>Access your dashboard to view tasks, update progress, and collaborate with your team.</p><a href="{{appUrl}}" class="login-button">Login to Dashboard</a><p style="text-align:center;color:#666;margin-top:10px">Start contributing to your team's success!</p></div><div class="footer"><p>This is an automated message from WizDesk. Please do not reply to this email.</p></div></div></body></html>
        `,
        text: `✅ Membership Approved!\n\nHello {{memberName}},\n\nGreat news! Your membership request for team "{{teamName}}" has been approved by {{leaderName}}.\n\nYou can now login to your dashboard: {{appUrl}}`
    },
    newMemberNotice: {
        subject: (teamName) => `👤 New Member Request for ${teamName}`,
        html: `
            <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:'Segoe UI',sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa}.container{background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);margin:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:40px 30px;text-align:center}.header h1{font-size:28px;font-weight:700;margin-bottom:10px}.content{padding:40px 30px}.greeting{font-size:18px;margin-bottom:20px;color:#333}.member-info{background:#e7f3ff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #667eea}.action-button{display:block;width:250px;margin:30px auto;padding:12px 24px;background:linear-gradient(135deg,#667eea,#764ba2);color:white!important;text-decoration:none;border-radius:6px;text-align:center;font-weight:600;font-size:16px}.footer{text-align:center;margin-top:30px;color:#666;font-size:14px;padding-top:20px;border-top:1px solid #e9ecef}</style></head><body><div class="container"><div class="header"><h1>👤 New Member Request</h1><p>Action required for team {{teamName}}</p></div><div class="content"><div class="greeting">Hello <strong>{{leaderName}}</strong>,</div><p>A new member has requested to join your team <strong>{{teamName}}</strong>.</p><div class="member-info"><p><strong>Member Details:</strong></p><p><strong>Name:</strong> {{memberName}}</p><p><strong>Email:</strong> {{memberEmail}}</p><p><strong>Status:</strong> Pending Approval</p></div><p>Please review and approve or reject this member request in your leader dashboard.</p><a href="{{appUrl}}/leader-dashboard.html" class="action-button">Review Member Requests</a><p style="text-align:center;color:#666;margin-top:10px">Manage your team members from the leader dashboard.</p></div><div class="footer"><p>This is an automated message from WizDesk. Please do not reply to this email.</p></div></div></body></html>
        `,
        text: `New Member Request - {{teamName}}\n\nHello {{leaderName}},\n\nA new member has requested to join your team {{teamName}}.\n\nMember Details:\n- Name: {{memberName}}\n- Email: {{memberEmail}}\n\nPlease review this request in your leader dashboard:\n{{appUrl}}/leader-dashboard.html`
    }
};


// --- 2. Create and Configure Nodemailer Transporter ---
let transporter; // Re-use the transporter instance for performance

function getTransporter() {
    if (transporter) return transporter;

    if (!EMAIL_USER || !EMAIL_PASS) {
        console.warn('❌ Email service not configured. Will fall back to console logging.');
        return null;
    }
    
    // Auto-detect service based on email or use provided config
    const emailDomain = EMAIL_USER.split('@')[1] || '';
    let serviceConfig = {
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    };

    if (EMAIL_SERVICE) {
        serviceConfig.service = EMAIL_SERVICE;
    } else if (EMAIL_HOST) {
        serviceConfig.host = EMAIL_HOST;
        serviceConfig.port = EMAIL_PORT || 587;
        serviceConfig.secure = (EMAIL_PORT === '465');
    } else if (emailDomain.includes('gmail.com')) {
        serviceConfig.service = 'gmail';
    } else {
        // Fallback to a generic SMTP setup if not detected
        console.warn('📧 Could not auto-detect email provider. Using generic SMTP settings. Please set EMAIL_HOST and EMAIL_PORT for better results.');
        serviceConfig.host = `smtp.${emailDomain}`;
        serviceConfig.port = 587;
        serviceConfig.secure = false;
    }
    
    transporter = nodemailer.createTransport(serviceConfig);
    console.log(`📧 Email transporter created using ${serviceConfig.service || serviceConfig.host}.`);
    return transporter;
}


// --- 3. Private Helper Functions ---

function _generateEmailContent(templateName, data) {
    const template = templates[templateName];
    if (!template) throw new Error(`Email template "${templateName}" not found.`);

    let { subject, html, text } = template;
    
    if (typeof subject === 'function') {
        subject = subject(data.teamName);
    }

    for (const key in data) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        if (html) html = html.replace(regex, data[key]);
        if (text) text = text.replace(regex, data[key]);
    }
    return { subject, html, text };
}

async function _sendEmail(mailOptions) {
    const mailer = getTransporter();

    if (!mailer) {
        console.log('📧 CONSOLE FALLBACK (Email service not configured):');
        console.log(`  To: ${mailOptions.to}`);
        console.log(`  Subject: ${mailOptions.subject}`);
        console.log(`  Body: ${mailOptions.text}`);
        return { success: true, method: 'console', message: 'Logged to console.' };
    }

    try {
        const info = await mailer.sendMail({ from: { name: 'WizDesk Team', address: EMAIL_USER }, ...mailOptions });
        console.log(`✅ Email sent successfully to ${mailOptions.to} (ID: ${info.messageId})`);
        return { success: true, method: 'email', messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Failed to send email to ${mailOptions.to}:`, error.message);
        return { success: false, method: 'email', error: error.message };
    }
}


// --- 4. Public Email Service ---

const emailService = {
    async sendVerificationEmail(to, userName, verificationToken) {
        const content = _generateEmailContent('leaderVerification', {
            userName,
            verificationLink: `${appUrl}/verify-email.html?token=${verificationToken}`,
            verificationToken
        });
        return _sendEmail({ to, ...content });
    },

    async sendTeamCodeToLeader(to, leaderName, teamCode, teamName) {
        const content = _generateEmailContent('teamCode', {
            leaderName, leaderEmail: to, teamCode, teamName, appUrl
        });
        return _sendEmail({ to, ...content });
    },

    async sendMemberVerificationEmail(to, userName, teamName, verificationToken) {
        const content = _generateEmailContent('memberVerification', {
            userName, teamName,
            verificationLink: `${appUrl}/verify-member-email.html?token=${verificationToken}`,
            verificationToken
        });
        return _sendEmail({ to, ...content });
    },

    async sendMemberApprovalNotification(to, memberName, leaderName, teamName) {
        const content = _generateEmailContent('memberApproval', {
            memberName, leaderName, teamName, appUrl
        });
        return _sendEmail({ to, ...content });
    },

    async sendNewMemberNotificationToLeader(to, leaderName, memberName, memberEmail, teamName) {
        const content = _generateEmailContent('newMemberNotice', {
            leaderName, memberName, memberEmail, teamName, appUrl
        });
        return _sendEmail({ to, ...content });
    },
    
    async testConnection() {
        const mailer = getTransporter();
        if (!mailer) return { success: false, message: 'Email service not configured.' };
        
        try {
            await mailer.verify();
            console.log('✅ Email transporter is ready.');
            return { success: true, message: 'Email service is configured correctly.' };
        } catch (error) {
            console.error('❌ Email transporter verification failed:', error.message);
            return { success: false, message: `Email connection failed: ${error.message}` };
        }
    }
};

module.exports = emailService;
