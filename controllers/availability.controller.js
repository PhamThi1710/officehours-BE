const db = require("../models/index");
const { PROFESSOR_STATUS } = require("../constants/professorStatus");
const { ACTIVE_BOOKING_STATUSES } = require("../constants/bookingStatus");
const { generateAvailableSlots, parseHHmm } = require("../utils/slotGenerator");

const ProfessorProfile = db.ProfessorProfile;
const AvailabilityRule = db.AvailabilityRule;
const AvailabilityException = db.AvailabilityException;
const Booking = db.Booking;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateTimeRange(startTime, endTime) {
  try {
    parseHHmm(startTime);
    parseHHmm(endTime);
  } catch {
    return "start_time and end_time must be in HH:mm format";
  }
  if (startTime >= endTime) {
    return "start_time must be before end_time";
  }
  return null;
}

async function findOwnProfileOr404(req, res) {
  const profile = await ProfessorProfile.findOne({ where: { user_id: req.authUser.id } });
  if (!profile) {
    res.status(404).json({ message: "No professor profile yet — apply first" });
    return null;
  }
  return profile;
}

// POST /api/professors/me/availability-rules
exports.createRule = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const {
      day_of_week,
      specific_date,
      start_time,
      end_time,
      slot_duration_minutes,
      valid_from,
      valid_until,
    } = req.body;

    const hasDayOfWeek = day_of_week !== undefined && day_of_week !== null;
    const hasSpecificDate = specific_date !== undefined && specific_date !== null;

    if (hasDayOfWeek === hasSpecificDate) {
      return res.status(400).json({ message: "Provide exactly one of day_of_week or specific_date" });
    }
    if (hasDayOfWeek && (!Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6)) {
      return res.status(400).json({ message: "day_of_week must be an integer 0 (Sun) to 6 (Sat)" });
    }
    if (hasSpecificDate && !DATE_REGEX.test(specific_date)) {
      return res.status(400).json({ message: "specific_date must be in YYYY-MM-DD format" });
    }
    if (!start_time || !end_time) {
      return res.status(400).json({ message: "start_time and end_time are required" });
    }
    const timeError = validateTimeRange(start_time, end_time);
    if (timeError) {
      return res.status(400).json({ message: timeError });
    }
    if (!Number.isInteger(slot_duration_minutes) || slot_duration_minutes <= 0) {
      return res.status(400).json({ message: "slot_duration_minutes must be a positive integer" });
    }
    if (valid_from && !DATE_REGEX.test(valid_from)) {
      return res.status(400).json({ message: "valid_from must be in YYYY-MM-DD format" });
    }
    if (valid_until && !DATE_REGEX.test(valid_until)) {
      return res.status(400).json({ message: "valid_until must be in YYYY-MM-DD format" });
    }

    const rule = await AvailabilityRule.create({
      professor_id: profile.id,
      day_of_week: hasDayOfWeek ? day_of_week : null,
      specific_date: hasSpecificDate ? specific_date : null,
      start_time,
      end_time,
      slot_duration_minutes,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
    });

    return res.status(201).json({ rule });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/professors/me/availability-rules
exports.listRules = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const rules = await AvailabilityRule.findAll({
      where: { professor_id: profile.id },
      order: [["day_of_week", "ASC"], ["specific_date", "ASC"]],
    });

    return res.json({ rules });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /api/professors/me/availability-rules/:ruleId
exports.deleteRule = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const deleted = await AvailabilityRule.destroy({
      where: { id: req.params.ruleId, professor_id: profile.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: "Availability rule not found" });
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/professors/me/exceptions
exports.createException = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const { date, reason } = req.body;
    if (!date || !DATE_REGEX.test(date)) {
      return res.status(400).json({ message: "date must be in YYYY-MM-DD format" });
    }

    const exception = await AvailabilityException.create({
      professor_id: profile.id,
      date,
      reason: reason || null,
    });

    return res.status(201).json({ exception });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/professors/me/exceptions
exports.listExceptions = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const exceptions = await AvailabilityException.findAll({
      where: { professor_id: profile.id },
      order: [["date", "ASC"]],
    });

    return res.json({ exceptions });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /api/professors/me/exceptions/:exceptionId
exports.deleteException = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const deleted = await AvailabilityException.destroy({
      where: { id: req.params.exceptionId, professor_id: profile.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: "Exception not found" });
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/professors/:id/slots?date=YYYY-MM-DD
exports.getSlots = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !DATE_REGEX.test(date)) {
      return res.status(400).json({ message: "date query param is required in YYYY-MM-DD format" });
    }

    const profile = await ProfessorProfile.findOne({
      where: { id: req.params.id, status: PROFESSOR_STATUS.APPROVED },
    });
    if (!profile) {
      return res.status(404).json({ message: "Professor not found" });
    }

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
      dateStr: date,
      professorTimezone: profile.timezone,
      rules,
      exceptions,
      bookedStartTimesUtc,
    });

    return res.json({ professor_id: profile.id, date, timezone: profile.timezone, slots });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
