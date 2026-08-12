const cron = require("node-cron");
const { Op } = require("sequelize");
const db = require("../models/index");
const { BOOKING_STATUS } = require("../constants/bookingStatus");
const { sendEmail } = require("../utils/mailer");
const { bookingReminderEmail } = require("../utils/emailTemplates");

const Booking = db.Booking;
const ProfessorProfile = db.ProfessorProfile;
const User = db.User;

// Runs every 15 minutes and reminds anyone whose confirmed session starts
// within the next hour. Since the job only fires every 15 minutes, a given
// booking's reminder can go out anywhere from ~45 to ~60 minutes ahead of
// time depending on cron alignment — acceptable slack for a "heads up"
// email. reminder_sent_at is what keeps a booking from being reminded twice
// across runs.
const REMINDER_WINDOW_MINUTES = 60;

async function sendDueReminders(now = new Date()) {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

  const dueBookings = await Booking.findAll({
    where: {
      status: BOOKING_STATUS.CONFIRMED,
      reminder_sent_at: null,
      start_at: { [Op.gte]: now, [Op.lte]: windowEnd },
    },
    include: [
      { model: ProfessorProfile, as: "professor", include: [{ model: User, as: "user" }] },
      { model: User, as: "student" },
    ],
  });

  for (const booking of dueBookings) {
    const professorName = booking.professor?.user?.full_name || "the professor";
    const studentName = booking.student?.full_name || "the student";

    await Promise.all([
      sendEmail({
        to: booking.student?.email,
        ...bookingReminderEmail({ booking, counterpartName: professorName }),
      }),
      sendEmail({
        to: booking.professor?.user?.email,
        ...bookingReminderEmail({ booking, counterpartName: studentName }),
      }),
    ]);

    booking.reminder_sent_at = new Date();
    await booking.save();
  }

  return dueBookings.length;
}

function start() {
  cron.schedule("*/15 * * * *", () => {
    sendDueReminders().catch((err) => console.error("[bookingReminders] job run failed:", err.message));
  });
}

module.exports = { start, sendDueReminders, REMINDER_WINDOW_MINUTES };
