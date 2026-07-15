const { error } = require('../utils/response');

// The error boundary. Two kinds of error arrive here and they must be treateddifferently:
//
//   INTENTIONAL (ApiError) — we threw it, we wrote the message, we chose the status.
//   "Password is incorrect", "Album not found". Safe to send: it says exactly what
//   we meant it to say, and nothing else.
//
//   UNEXPECTED (TypeError, Sequelize errors, anything with no statusCode) — nobody
//   wrote that message for a user's eyes. A Sequelize error will happily tell the
//   client the table name, the column name, and the failing constraint. That is a
//   free map of our schema, handed to whoever poked hardest.
//
// So: below 500, trust the message. At 500 and above, throw it away and send a constant — while still logging the real thing server-side, where we can read it and an attacker can't.
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  // Log EVERY 5xx, including in production. The old code only logged outside production — which meant that in the one environment where you cannot attach a debugger, unexpected errors vanished without a trace. That's backwards: prod is where you need the log most.
  if (statusCode >= 500) {
    console.error('[500]', req.method, req.originalUrl, err);
  } else if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  const message =
    statusCode >= 500
      ? 'Internal server error'
      : err.message || 'Request failed';

  return error(res, statusCode, message);
};

module.exports = errorHandler;