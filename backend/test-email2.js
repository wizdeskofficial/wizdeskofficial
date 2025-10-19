// test-email2.js
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log('📧 Testing email service...');
console.log('Loading .env from:', path.join(__dirname, '..', '.env'));
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '***' + process.env.EMAIL_PASS.slice(-4) : 'Missing');

async function testEmailService() {
    // Check if required environment variables are set
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('❌ Email service not configured properly.');
        console.log('   EMAIL_USER:', process.env.EMAIL_USER ? '✓ Set' : '✗ Missing');
        console.log('   EMAIL_PASS:', process.env.EMAIL_PASS ? '✓ Set' : '✗ Missing');
        return {
            success: false,
            message: 'Email service not configured. Check EMAIL_USER and EMAIL_PASS in .env file.'
        };
    }

    try {
        // Create transporter - FIXED: use createTransport instead of createTransporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Verify connection
        console.log('🔌 Testing connection...');
        await transporter.verify();
        console.log('✓ SMTP connection verified successfully!');

        // Send test email
        console.log('📤 Sending test email...');
        const testEmail = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: 'Test Email from Wiz Desk',
            text: 'This is a test email from your Wiz Desk application!',
            html: '<p>This is a test email from your <b>Wiz Desk</b> application!</p>',
        });

        console.log('✅ Test email sent successfully!');
        console.log('📨 Message ID:', testEmail.messageId);

        return {
            success: true,
            message: 'Email service configured and tested successfully!',
            messageId: testEmail.messageId
        };

    } catch (error) {
        console.log('❌ Email test failed:', error.message);
        
        if (error.code === 'EAUTH') {
            console.log('   🔐 Authentication failed. Check your email and password.');
            console.log('   💡 For Gmail, make sure to use an App Password.');
        } else if (error.code === 'ECONNECTION') {
            console.log('   🌐 Connection failed. Check your internet connection.');
        }
        
        return {
            success: false,
            message: error.message
        };
    }
}

// Run the test
testEmailService().then(result => {
    console.log('\n📋 Final Result:', result.success ? '✅ SUCCESS' : '❌ FAILED');
    console.log('Message:', result.message);
});