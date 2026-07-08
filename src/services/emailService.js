'use strict';

const nodemailer = require('nodemailer');
const ApiError = require('../utils/ApiError');

const isProduction = process.env.NODE_ENV === 'production';

const getVerificationUrl = (token) => {
  const baseUrl =
    process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

  return `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
};

const getTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    if (isProduction) {
      throw new ApiError(500, 'Email service is not configured');
    }

    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

const sendVerificationEmail = async ({ to, token }) => {
  const verificationUrl = getVerificationUrl(token);
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`Email verification link for ${to}: ${verificationUrl}`);
    return { sent: false, verificationUrl };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Verify your Audivo email',
    text: `Welcome to Audivo. Verify your email here: ${verificationUrl}`,
    html: `
      <p>Welcome to Audivo.</p>
      <p>Verify your email by opening this link:</p>
      <p><a href="${verificationUrl}">${verificationUrl}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });

  return { sent: true };
};
// Reset links point at the FRONTEND (a form to type a new password), not the API.
const getResetUrl = (token) => {
  const frontendUrl =
    process.env.FRONTEND_BASE_URL ||
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}`;
  return `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
};

// Mirrors sendVerificationEmail's contract: { sent: false, resetUrl } in dev.
const sendResetPasswordEmail = async ({ to, token }) => {
  const resetUrl = getResetUrl(token);
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`Password reset link for ${to}: ${resetUrl}`);
    return { sent: false, resetUrl };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Reset your Audivo password',
    text: `Reset your Audivo password here: ${resetUrl}`,
    html: `
      <p>We received a request to reset your Audivo password.</p>
      <p>Reset it by opening this link:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 24 hours. If you didn't request this, ignore this email.</p>
    `,
  });

  return { sent: true };
};
// Login link for a freshly created account — points at the frontend login page.
const getLoginUrl = () => {
  const frontendUrl =
    process.env.FRONTEND_BASE_URL ||
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}`;
  return `${frontendUrl}/login`;
};

// Emails a newly created admin their one-time credentials. Same dev contract as the other mailers: { sent: false, loginUrl } when SMTP isn't configured.
const sendTempPasswordEmail = async ({ to, tempPassword, displayName }) => {
  const loginUrl = getLoginUrl();
  const transporter = getTransporter();
  const name = displayName || 'there';

  if (!transporter) {
    console.log(`Temp password for ${to}: ${tempPassword} (login: ${loginUrl})`);
    return { sent: false, loginUrl };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Your Audivo admin account',
    text:
      `Hi ${name},\n\n` +
      `An Audivo admin account has been created for you.\n\n` +
      `Email: ${to}\n` +
      `Temporary password: ${tempPassword}\n\n` +
      `Sign in here: ${loginUrl}\n` +
      `You'll be asked to set a new password the first time you log in.`,
    html: `
      <p>Hi ${name},</p>
      <p>An Audivo admin account has been created for you.</p>
      <p><strong>Email:</strong> ${to}<br/>
         <strong>Temporary password:</strong> ${tempPassword}</p>
      <p>Sign in here: <a href="${loginUrl}">${loginUrl}</a></p>
      <p>You'll be asked to set a new password the first time you log in.</p>
    `,
  });

  return { sent: true };
};

// Where contact-form submissions are delivered. Falls back to the SMTP user so dev setups don't need extra config.
const getSupportInbox = () =>
  process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;

// Notifies the support inbox of a new contact-form submission. The visitor's address is set as replyTo so support can answer them directly. Same dev contract as the other mailers: { sent: false } when SMTP isn't configured.
const sendContactNotification = async ({ name, email, subject, message }) => {
  const transporter = getTransporter();
  const inbox = getSupportInbox();
  const safeSubject = subject && subject.trim() ? subject.trim() : '(no subject)';

  if (!transporter || !inbox) {
    console.log(`Contact form from ${name} <${email}> [${safeSubject}]: ${message}`);
    return { sent: false };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: inbox,
    replyTo: email,
    subject: `Audivo contact: ${safeSubject}`,
    text:
      `New contact-form submission.\n\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `Subject: ${safeSubject}\n\n` +
      `Message:\n${message}\n`,
    html: `
      <p>New contact-form submission.</p>
      <p><strong>Name:</strong> ${name}<br/>
         <strong>Email:</strong> ${email}<br/>
         <strong>Subject:</strong> ${safeSubject}</p>
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-wrap">${message}</p>
    `,
  });

  return { sent: true };
};

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendTempPasswordEmail,
  sendContactNotification,
};