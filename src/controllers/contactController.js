'use strict';
const contactService = require('../services/contactService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// POST /api/contact — public contact form (no auth). Conceptually the
// reactivation path for Listeners/Artists deactivated after 30 days of
// inactivity, but open to anyone.
const submit = catchAsync(async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  const result = await contactService.submitContact({ name, email, subject, message });
  return success(res, 201, 'Thanks — your message has been received', result);
});

module.exports = { submit };