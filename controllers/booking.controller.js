const { randomUUID } = require("crypto");
const { DateTime } = require("luxon");
const db = require("../models/index");
const { ROLES } = require("../constants/roles");
const { PROFESSOR_STATUS } = require("../constants/professorStatus");
const { BOOKING_STATUS, PAYMENT_STATUS, ACTIVE_BOOKING_STATUSES } = require("../constants/bookingStatus");
const { PAYOUT_STATUS } = require("../constants/payoutStatus");
const { generateAvailableSlots } = require("../utils/slotGenerator");
const { parsePagination, toPaginatedResponse } = require("../utils/pagination");
const { sendEmail } = require("../utils/mailer");
const { studentBookingCreatedEmail, professorNewBookingEmail } = require("../utils/emailTemplates");

const ProfessorProfile = db.ProfessorProfile;
const AvailabilityRule = db.AvailabilityRule;
const AvailabilityException = db.AvailabilityException;
const Booking = db.Booking;
const Payout = db.Payout;
const Review = db.Review;
const User = db.User;

const PROFESSOR_INCLUDE = {
  model: ProfessorProfile,
  as: "professor",
  attributes: ["id", "headline", "user_id"],
  include: [{ model: User, as: "user", attributes: ["id", "full_name", "avatar_url"] }],
};
const STUDENT_INCLUDE = { model: User, as: "student", attributes: ["id", "full_name", "avatar_url"] };
const REVIEW_INCLUDE = { model: Review, as: "review", attributes: ["id", "rating", "comment"] };

function toBookingResponse(booking) {
  return {
    id: booking.id,
    student_id: booking.student_id,
    professor_id: booking.professor_id,
    start_at: booking.start_at,
    end_at: booking.end_at,
    status: booking.status,
    price: booking.price,
    payment_status: booking.payment_status,
    video_room_slug: booking.video_room_slug,
    cancel_reason: booking.cancel_reason,
    professor: booking.professor
      ? {
          id: booking.professor.id,
          headline: booking.professor.headline,
          user: booking.professor.user
            ? { id: booking.professor.user.id, full_name: booking.professor.user.full_name, avatar_url: booking.professor.user.avatar_url }
            : undefined,
        }
      : undefined,
    student: booking.student
      ? { id: booking.student.id, full_name: booking.student.full_name, avatar_url: booking.student.avatar_url }
      : undefined,
    review: booking.review ? { id: booking.review.id, rating: booking.review.rating, comment: booking.review.comment } : null,
  };
}

// POST /api/bookings — student role only. Re-derives the professor's actual
// available slots for the requested date (rules, exceptions, existing
// bookings) instead of trusting a client-supplied end_at, so a booking can
// only ever land on a slot the professor really offers. The remaining race
// window (between that re-derivation and the INSERT) is closed by the
// partial unique index on (professor_id, start_at) in the bookings table —
// see migrations/20260812000006-create-bookings.js.
exports.create = async (req, res) => {
  try {
    const { professor_id, start_at } = req.body;
    if (!professor_id || !start_at) {
      return res.status(400).json({ message: "professor_id and start_at are required" });
    }

    const requestedStart = DateTime.fromISO(start_at, { zone: "utc" });
    if (!requestedStart.isValid) {
      return res.status(400).json({ message: "start_at must be a valid ISO 8601 datetime" });
    }

    const profile = await ProfessorProfile.findOne({
      where: { id: professor_id, status: PROFESSOR_STATUS.APPROVED },
      include: [{ model: User, as: "user", attributes: ["id", "full_name", "email"] }],
    });
    if (!profile) {
      return res.status(404).json({ message: "Professor not found" });
    }

    const dateStr = requestedStart.setZone(profile.timezone).toFormat("yyyy-LL-dd");

    const [rules, exceptions, activeBookings] = await Promise.all([
      AvailabilityRule.findAll({ where: { professor_id: profile.id, is_active: true } }),
      AvailabilityException.findAll({ where: { professor_id: profile.id } }),
      Booking.findAll({
        where: { professor_id: profile.id, status: ACTIVE_BOOKING_STATUSES },
        attributes: ["start_at"],
      }),
    ]);

    const bookedStartTimesUtc = activeBookings.map((booking) => booking.start_at.toISOString());
    const slots = generateAvailableSlots({
      dateStr,
      professorTimezone: profile.timezone,
      rules,
      exceptions,
      bookedStartTimesUtc,
    });

    const requestedStartIso = requestedStart.toUTC().toISO();
    const matchedSlot = slots.find((slot) => slot.start_at === requestedStartIso);
    if (!matchedSlot) {
      return res.status(409).json({ message: "That slot is not available" });
    }

    const isFree = Number(profile.price_per_session) === 0;

    let booking;
    try {
      booking = await Booking.create({
        student_id: req.authUser.id,
        professor_id: profile.id,
        start_at: matchedSlot.start_at,
        end_at: matchedSlot.end_at,
        status: isFree ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING,
        price: profile.price_per_session,
        payment_status: isFree ? PAYMENT_STATUS.FREE : PAYMENT_STATUS.UNPAID,
        video_room_slug: randomUUID(),
      });
    } catch (err) {
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({ message: "That slot was just booked by someone else" });
      }
      throw err;
    }

    notifyBookingCreated(booking, profile, req.authUser.email).catch((err) => {
      console.error("[email] booking-created notification failed:", err.message);
    });

    return res.status(201).json({ booking: toBookingResponse(booking) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Fire-and-forget: callers never await this, so a slow/broken SMTP call
// can't delay or fail the booking response — see utils/mailer.js.
async function notifyBookingCreated(booking, profile, studentEmail) {
  const professorName = profile.user?.full_name || "the professor";
  await Promise.all([
    sendEmail({ to: studentEmail, ...studentBookingCreatedEmail({ booking, professorName }) }),
    sendEmail({ to: profile.user?.email, ...professorNewBookingEmail({ booking, studentEmail }) }),
  ]);
}

// GET /api/bookings/me — student role only
exports.listMine = async (req, res) => {
  try {
    const { status } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = { student_id: req.authUser.id };
    if (status) {
      if (!Object.values(BOOKING_STATUS).includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${Object.values(BOOKING_STATUS).join(", ")}` });
      }
      where.status = status;
    }

    const result = await Booking.findAndCountAll({
      where,
      include: [PROFESSOR_INCLUDE],
      order: [["start_at", "DESC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toBookingResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/professors/me/bookings — professor role only
exports.listForProfessor = async (req, res) => {
  try {
    const profile = await ProfessorProfile.findOne({ where: { user_id: req.authUser.id } });
    if (!profile) {
      return res.status(404).json({ message: "No professor profile yet — apply first" });
    }

    const { status } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = { professor_id: profile.id };
    if (status) {
      if (!Object.values(BOOKING_STATUS).includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${Object.values(BOOKING_STATUS).join(", ")}` });
      }
      where.status = status;
    }

    const result = await Booking.findAndCountAll({
      where,
      include: [STUDENT_INCLUDE],
      order: [["start_at", "DESC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toBookingResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

async function findBookingForAuthUser(req, res) {
  const booking = await Booking.findByPk(req.params.id, { include: [PROFESSOR_INCLUDE, STUDENT_INCLUDE, REVIEW_INCLUDE] });
  if (!booking) {
    res.status(404).json({ message: "Booking not found" });
    return null;
  }

  const isOwnerStudent = booking.student_id === req.authUser.id;
  const isOwnerProfessor = booking.professor && booking.professor.user_id === req.authUser.id;
  const isAdmin = req.authUser.role === ROLES.ADMIN;

  if (!isOwnerStudent && !isOwnerProfessor && !isAdmin) {
    res.status(403).json({ message: "Not allowed to access this booking" });
    return null;
  }

  return { booking, isOwnerStudent, isOwnerProfessor, isAdmin };
}

// GET /api/bookings/:id
exports.getById = async (req, res) => {
  try {
    const found = await findBookingForAuthUser(req, res);
    if (!found) return;
    return res.json({ booking: toBookingResponse(found.booking) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/bookings/:id/cancel
exports.cancel = async (req, res) => {
  try {
    const found = await findBookingForAuthUser(req, res);
    if (!found) return;
    const { booking, isAdmin } = found;

    if ([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
      return res.status(400).json({ message: `Cannot cancel a ${booking.status} booking` });
    }
    if (!isAdmin && new Date(booking.start_at) <= new Date()) {
      return res.status(400).json({ message: "Cannot cancel a session that has already started" });
    }

    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancelled_by = req.authUser.id;
    booking.cancel_reason = req.body.reason || null;
    await booking.save();

    return res.json({ booking: toBookingResponse(booking) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/bookings/:id/complete — professor (owner) or admin only. A paid
// session earns the professor a payout entry the moment it's marked done;
// free sessions don't (there's nothing to pay out).
exports.complete = async (req, res) => {
  try {
    const found = await findBookingForAuthUser(req, res);
    if (!found) return;
    const { booking, isOwnerProfessor, isAdmin } = found;

    if (!isOwnerProfessor && !isAdmin) {
      return res.status(403).json({ message: "Only the professor or an admin can mark a session completed" });
    }
    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
      return res.status(400).json({ message: "Only a confirmed booking can be marked completed" });
    }
    if (new Date(booking.start_at) > new Date()) {
      return res.status(400).json({ message: "Cannot complete a session that hasn't started yet" });
    }

    const shouldCreatePayout = booking.payment_status === PAYMENT_STATUS.PAID && Number(booking.price) > 0;

    const t = await db.sequelize.transaction();
    try {
      booking.status = BOOKING_STATUS.COMPLETED;
      await booking.save({ transaction: t });

      await ProfessorProfile.increment("total_sessions", {
        by: 1,
        where: { id: booking.professor_id },
        transaction: t,
      });

      if (shouldCreatePayout) {
        await Payout.create(
          {
            professor_id: booking.professor_id,
            booking_id: booking.id,
            amount: booking.price,
            status: PAYOUT_STATUS.PENDING,
          },
          { transaction: t }
        );
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    return res.json({ booking: toBookingResponse(booking) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
