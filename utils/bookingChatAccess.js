const db = require("../models/index");
const { BOOKING_STATUS } = require("../constants/bookingStatus");

const Booking = db.Booking;
const ProfessorProfile = db.ProfessorProfile;

// Shared by both transports that touch booking chat — the REST history
// endpoint (controllers/chatMessage.controller.js) and the Socket.io server
// (ws/chatServer.js) — so "who can chat about this booking" is defined
// exactly once. Chat is available to either party any time the booking
// isn't cancelled (before the session for coordination, after for
// follow-up); there's no separate "only before start_at" cutoff.
async function getBookingForChat(bookingId, userId) {
  const booking = await Booking.findByPk(bookingId, {
    include: [{ model: ProfessorProfile, as: "professor", attributes: ["id", "user_id"] }],
  });

  if (!booking) {
    return { booking: null, allowed: false };
  }

  const isStudent = booking.student_id === userId;
  const isProfessor = booking.professor && booking.professor.user_id === userId;
  const allowed = (isStudent || isProfessor) && booking.status !== BOOKING_STATUS.CANCELLED;

  return { booking, allowed };
}

module.exports = { getBookingForChat };
