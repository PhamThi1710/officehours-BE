const nodemailer = require("nodemailer");

let cachedTransporter = null;

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return cachedTransporter;
}

// Every caller in this codebase fires this without awaiting it (see
// booking.controller.js, payment.controller.js, jobs/bookingReminders.job.js)
// so a slow or failing SMTP call never delays or breaks the request/job it
// was triggered from — callers attach .catch(logAndIgnore) instead.
async function sendEmail({ to, subject, html }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn(`[mailer] GMAIL_USER/GMAIL_APP_PASSWORD not set — skipping email to ${to} ("${subject}")`);
    return { skipped: true };
  }

  return getTransporter().sendMail({
    from: `"OfficeHours" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

module.exports = { sendEmail };
