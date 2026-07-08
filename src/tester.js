const transporter = require('/mailer.js').transporter;

await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: 'azharkhawlah@gmail.com',
    subject: 'Test Email',
    html: '<h1>Hello from Audivo!</h1><p>This is a test email.</p>',
  });