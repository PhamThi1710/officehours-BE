const db = require("../models/index");
const { BOOKING_STATUS } = require("../constants/bookingStatus");
const { signVideoToken } = require("../utils/videoToken");
const { getIceServers } = require("../utils/iceServers");
const { WS_PATH } = require("../ws/videoSignalling");

const Booking = db.Booking;
const ProfessorProfile = db.ProfessorProfile;

const JOIN_EARLY_MINUTES = 10;

const PARTY_INCLUDE = [{ model: ProfessorProfile, as: "professor", attributes: ["id", "user_id"] }];

// GET /api/bookings/:id/video-room — either party to a confirmed booking can
// fetch a room token, but only in the window from JOIN_EARLY_MINUTES before
// start_at through end_at (no joining a room hours early or after it's over).
exports.getRoomInfo = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: PARTY_INCLUDE });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isStudent = booking.student_id === req.authUser.id;
    const isProfessor = booking.professor && booking.professor.user_id === req.authUser.id;
    if (!isStudent && !isProfessor) {
      return res.status(403).json({ message: "Not allowed to join this session" });
    }

    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
      return res.status(400).json({ message: "This session isn't confirmed" });
    }

    const now = new Date();
    const joinOpensAt = new Date(new Date(booking.start_at).getTime() - JOIN_EARLY_MINUTES * 60 * 1000);
    if (now < joinOpensAt) {
      return res.status(400).json({ message: `The video room opens ${JOIN_EARLY_MINUTES} minutes before the session starts` });
    }
    if (now > new Date(booking.end_at)) {
      return res.status(400).json({ message: "This session has already ended" });
    }

    const videoToken = signVideoToken({ bookingId: booking.id, userId: req.authUser.id });

    return res.json({
      room_slug: booking.video_room_slug,
      video_token: videoToken,
      ws_path: WS_PATH,
      ice_servers: getIceServers(),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
