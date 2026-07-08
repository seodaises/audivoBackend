'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { sendContactNotification } = require('./emailService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Length caps — basic abuse guard for a public, pre-auth endpoint.
const LIMITS = {
  name: 120,
  email: 255,
  subject: 200,
  message: 5000,
};
// POST /api/contact — public. Validates, stores the message, then emails the support inbox. Storage is the source of truth (admin dashboard reads it); the email is a best-effort notification and never blocks a successful save.
const submitContact = async ({ name, email, subject, message, userId = null }) => {
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim();
  const cleanSubject = String(subject || '').trim();
  const cleanMessage = String(message || '').trim();

  if (!cleanName) throw new ApiError(400, 'name is required');
  if (!cleanEmail) throw new ApiError(400, 'email is required');
  if (!cleanMessage) throw new ApiError(400, 'message is required');

  if (!EMAIL_RE.test(cleanEmail)) throw new ApiError(400, 'A valid email is required');

  if (cleanName.length > LIMITS.name) throw new ApiError(400, 'name is too long');
  if (cleanEmail.length > LIMITS.email) throw new ApiError(400, 'email is too long');
  if (cleanSubject.length > LIMITS.subject) throw new ApiError(400, 'subject is too long');
  if (cleanMessage.length > LIMITS.message) throw new ApiError(400, 'message is too long');

  const row = await db.ContactMessage.create({
    name: cleanName,
    email: cleanEmail,
    subject: cleanSubject || null,
    message: cleanMessage,
    user_id: userId,
    status: 'new',
  });

  // Best-effort email — a delivery failure must not fail the submission.
  let emailDelivery = { sent: false };
  try {
    emailDelivery = await sendContactNotification({
      name: cleanName,
      email: cleanEmail,
      subject: cleanSubject,
      message: cleanMessage,
    });
  } catch (err) {
    console.error('Contact notification email failed:', err.message);
  }

  return { id: row.id, received: true, emailDelivery };
};

module.exports = { submitContact };