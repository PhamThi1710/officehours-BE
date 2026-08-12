const db = require("../../models/index");
const { parsePagination, toPaginatedResponse } = require("../../utils/pagination");
const { BOOKING_STATUS } = require("../../constants/bookingStatus");
const { toBookingResponse, BOOKING_INCLUDES } = require("../booking.controller");

const Booking = db.Booking;

// GET /api/admin/bookings — cross-user oversight list, filterable by
// status/professor_id/student_id. The single-booking GET (owner-or-admin)
// already exists at /api/bookings/:id; this fills the "browse all" gap.
exports.list = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = {};

    if (req.query.status) {
      if (!Object.values(BOOKING_STATUS).includes(req.query.status)) {
        return res.status(400).json({ message: `status must be one of: ${Object.values(BOOKING_STATUS).join(", ")}` });
      }
      where.status = req.query.status;
    }
    if (req.query.professor_id) where.professor_id = req.query.professor_id;
    if (req.query.student_id) where.student_id = req.query.student_id;

    const result = await Booking.findAndCountAll({
      where,
      include: BOOKING_INCLUDES,
      order: [["start_at", "DESC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toBookingResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
