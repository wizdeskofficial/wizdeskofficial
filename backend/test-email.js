require('dotenv').config(); // Load environment variables
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function testEmail() {
  try {
    console.log('Testing email configuration...');
    console.log('Email User:', process.env.EMAIL_USER);
    
    // Send test email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send to yourself
      subject: '🚀 WizDesk Email Test',
      text: 'This is a test email from WizDesk. If you receive this, your email configuration is working correctly!',
      html: '<h2>WizDesk Email Test</h2><p>This is a test email from WizDesk. If you receive this, your email configuration is working correctly!</p>'
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    
  } catch (error) {
    console.error('❌ Error sending email:');
    console.error('Error details:', error);
    
    // Common error diagnostics
    if (error.code === 'EAUTH') {
      console.log('🔐 Authentication failed - check your app password');
    } else if (error.code === 'ECONNECTION') {
      console.log('🌐 Connection failed - check network/ports');
    }
  }
}

testEmail();