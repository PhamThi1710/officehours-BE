const { DateTime } = require("luxon");
const { QueryTypes } = require("sequelize");
const db = require("../models/index");
const { PROFESSOR_STATUS } = require("../constants/professorStatus");
const { BOOKING_STATUS, PAYMENT_STATUS, ACTIVE_BOOKING_STATUSES } = require("../constants/bookingStatus");
const { SESSION_TYPE } = require("../constants/sessionType");
const { parseHHmm } = require("../utils/slotGenerator");
const { getUpcomingInstances } = require("../utils/offlineClassInstances");
const { geocodeAddress, GeocodeError } = require("../utils/geocoding");
const { parsePagination, toPaginatedResponse } = require("../utils/pagination");
const { toBookingResponse } = require("./booking.controller");

const ProfessorProfile = db.ProfessorProfile;
const OfflineClass = db.OfflineClass;
const Booking = db.Booking;
const User = db.User;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RADIUS_KM = 25;

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

// Validates the create/update body shape shared by both endpoints. Returns
// an error message string, or null if the body is valid.
function validateOfflineClassBody(body) {
  const { title, address, capacity, price, day_of_week, specific_date, start_time, end_time, valid_from, valid_until } = body;

  if (!title || !String(title).trim()) return "title is required";
  if (!address || !String(address).trim()) return "address is required";
  if (!Number.isInteger(capacity) || capacity <= 0) return "capacity must be a positive integer";
  if (typeof price !== "number" || price < 0) return "price must be a non-negative number";

  const hasDayOfWeek = day_of_week !== undefined && day_of_week !== null;
  const hasSpecificDate = specific_date !== undefined && specific_date !== null;
  if (hasDayOfWeek === hasSpecificDate) return "Provide exactly one of day_of_week or specific_date";
  if (hasDayOfWeek && (!Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6)) {
    return "day_of_week must be an integer 0 (Sun) to 6 (Sat)";
  }
  if (hasSpecificDate && !DATE_REGEX.test(specific_date)) return "specific_date must be in YYYY-MM-DD format";
  if (!start_time || !end_time) return "start_time and end_time are required";
  const timeError = validateTimeRange(start_time, end_time);
  if (timeError) return timeError;
  if (valid_from && !DATE_REGEX.test(valid_from)) return "valid_from must be in YYYY-MM-DD format";
  if (valid_until && !DATE_REGEX.test(valid_until)) return "valid_until must be in YYYY-MM-DD format";

  return null;
}

function toOfflineClassResponse(offlineClass, { instances } = {}) {
  return {
    id: offlineClass.id,
    professor_id: offlineClass.professor_id,
    title: offlineClass.title,
    description: offlineClass.description,
    address: offlineClass.address,
    latitude: offlineClass.latitude !== null ? Number(offlineClass.latitude) : null,
    longitude: offlineClass.longitude !== null ? Number(offlineClass.longitude) : null,
    capacity: offlineClass.capacity,
    price: offlineClass.price,
    day_of_week: offlineClass.day_of_week,
    specific_date: offlineClass.specific_date,
    start_time: offlineClass.start_time,
    end_time: offlineClass.end_time,
    valid_from: offlineClass.valid_from,
    valid_until: offlineClass.valid_until,
    is_active: offlineClass.is_active,
    professor: offlineClass.professor
      ? {
          id: offlineClass.professor.id,
          headline: offlineClass.professor.headline,
          user: offlineClass.professor.user
            ? {
                id: offlineClass.professor.user.id,
                full_name: offlineClass.professor.user.full_name,
                avatar_url: offlineClass.professor.user.avatar_url,
              }
            : undefined,
        }
      : undefined,
    instances: instances || undefined,
  };
}

function toNearbyResponse(row) {
  const instances = getUpcomingInstances({ offlineClass: row, professorTimezone: row.professor_timezone });
  return {
    id: row.id,
    professor_id: row.professor_id,
    title: row.title,
    description: row.description,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    capacity: row.capacity,
    price: row.price,
    distance_km: Number(row.distance_km),
    professor: {
      headline: row.professor_headline,
      full_name: row.professor_name,
      avatar_url: row.professor_avatar_url,
    },
    next_instance: instances[0] || null,
  };
}

// POST /api/offline-classes — professor only. Geocodes the address
// server-side before saving, mirroring availability.controller.js#createRule
// for validation/ownership conventions.
exports.create = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const error = validateOfflineClassBody(req.body);
    if (error) return res.status(400).json({ message: error });

    const { title, description, address, capacity, price, day_of_week, specific_date, start_time, end_time, valid_from, valid_until } = req.body;

    let geocoded;
    try {
      geocoded = await geocodeAddress(address);
    } catch (err) {
      if (err instanceof GeocodeError) return res.status(422).json({ message: err.message });
      throw err;
    }

    const hasDayOfWeek = day_of_week !== undefined && day_of_week !== null;

    const offlineClass = await OfflineClass.create({
      professor_id: profile.id,
      title: String(title).trim(),
      description: description || null,
      address,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      geocoded_at: new Date(),
      capacity,
      price,
      day_of_week: hasDayOfWeek ? day_of_week : null,
      specific_date: hasDayOfWeek ? null : specific_date,
      start_time,
      end_time,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
    });

    return res.status(201).json({ offline_class: toOfflineClassResponse(offlineClass) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/offline-classes/:id — professor (owner) only. Full-body update
// (same shape as create); only re-geocodes when the address text actually
// changed, so routine edits (price, capacity, schedule) never hit Nominatim.
exports.update = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const offlineClass = await OfflineClass.findOne({ where: { id: req.params.id, professor_id: profile.id } });
    if (!offlineClass) return res.status(404).json({ message: "Offline class not found" });

    const error = validateOfflineClassBody(req.body);
    if (error) return res.status(400).json({ message: error });

    const { title, description, address, capacity, price, day_of_week, specific_date, start_time, end_time, valid_from, valid_until } = req.body;

    if (address !== offlineClass.address) {
      let geocoded;
      try {
        geocoded = await geocodeAddress(address);
      } catch (err) {
        if (err instanceof GeocodeError) return res.status(422).json({ message: err.message });
        throw err;
      }
      offlineClass.address = address;
      offlineClass.latitude = geocoded.latitude;
      offlineClass.longitude = geocoded.longitude;
      offlineClass.geocoded_at = new Date();
    }

    const hasDayOfWeek = day_of_week !== undefined && day_of_week !== null;

    offlineClass.title = String(title).trim();
    offlineClass.description = description || null;
    offlineClass.capacity = capacity;
    offlineClass.price = price;
    offlineClass.day_of_week = hasDayOfWeek ? day_of_week : null;
    offlineClass.specific_date = hasDayOfWeek ? null : specific_date;
    offlineClass.start_time = start_time;
    offlineClass.end_time = end_time;
    offlineClass.valid_from = valid_from || null;
    offlineClass.valid_until = valid_until || null;

    await offlineClass.save();

    return res.json({ offline_class: toOfflineClassResponse(offlineClass) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /api/offline-classes/:id — professor (owner) only. Soft delete so
// existing bookings/history stay intact, matching how the app avoids hard
// deletes elsewhere.
exports.remove = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const [count] = await OfflineClass.update(
      { is_active: false },
      { where: { id: req.params.id, professor_id: profile.id } }
    );
    if (!count) return res.status(404).json({ message: "Offline class not found" });

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/offline-classes/mine — professor only
exports.listMine = async (req, res) => {
  try {
    const profile = await findOwnProfileOr404(req, res);
    if (!profile) return;

    const classes = await OfflineClass.findAll({
      where: { professor_id: profile.id },
      order: [["created_at", "DESC"]],
    });

    return res.json({ offline_classes: classes.map((c) => toOfflineClassResponse(c)) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/offline-classes/:id — public detail page: class fields +
// professor summary + upcoming instances with capacity_remaining.
exports.getById = async (req, res) => {
  try {
    const offlineClass = await OfflineClass.findOne({
      where: { id: req.params.id, is_active: true },
      include: [
        {
          model: ProfessorProfile,
          as: "professor",
          where: { status: PROFESSOR_STATUS.APPROVED },
          include: [{ model: User, as: "user", attributes: ["id", "full_name", "avatar_url"] }],
        },
      ],
    });
    if (!offlineClass) return res.status(404).json({ message: "Offline class not found" });

    const instances = getUpcomingInstances({ offlineClass, professorTimezone: offlineClass.professor.timezone });
    const startIsos = instances.map((i) => i.start_at);

    const bookingCounts = startIsos.length
      ? await Booking.findAll({
          attributes: ["start_at", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"]],
          where: { offline_class_id: offlineClass.id, start_at: startIsos, status: ACTIVE_BOOKING_STATUSES },
          group: ["start_at"],
          raw: true,
        })
      : [];
    const countByIso = new Map(bookingCounts.map((r) => [new Date(r.start_at).toISOString(), Number(r.count)]));

    const instancesWithCapacity = instances.map((i) => ({
      ...i,
      capacity_remaining: Math.max(0, offlineClass.capacity - (countByIso.get(i.start_at) || 0)),
    }));

    return res.json({ offline_class: toOfflineClassResponse(offlineClass, { instances: instancesWithCapacity }) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/offline-classes/nearby?lat=&lng=&radius_km= — public. Distance is
// computed directly in SQL with the Haversine formula (no PostGIS — dataset
// is small, per the feature spec) via a bound-parameter raw query.
exports.nearby = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = req.query.radius_km !== undefined ? Number(req.query.radius_km) : DEFAULT_RADIUS_KM;

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ message: "lat must be a number between -90 and 90" });
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ message: "lng must be a number between -180 and 180" });
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return res.status(400).json({ message: "radius_km must be a positive number" });
    }

    const { page, limit, offset } = parsePagination(req.query);

    const baseFrom = `
      FROM (
        SELECT oc.*, pp.headline AS professor_headline, pp.timezone AS professor_timezone,
               u.full_name AS professor_name, u.avatar_url AS professor_avatar_url,
               6371 * acos(
                 LEAST(1, GREATEST(-1,
                   cos(radians($1)) * cos(radians(oc.latitude)) * cos(radians(oc.longitude) - radians($2))
                   + sin(radians($1)) * sin(radians(oc.latitude))
                 ))
               ) AS distance_km
        FROM offline_classes oc
        JOIN professor_profiles pp ON pp.id = oc.professor_id
        JOIN users u ON u.id = pp.user_id
        WHERE oc.is_active = true AND pp.status = 'approved'
          AND oc.latitude IS NOT NULL AND oc.longitude IS NOT NULL
      ) sub
      WHERE distance_km <= $3
    `;

    const [rows, countRows] = await Promise.all([
      db.sequelize.query(`SELECT * ${baseFrom} ORDER BY distance_km ASC LIMIT $4 OFFSET $5`, {
        bind: [lat, lng, radiusKm, limit, offset],
        type: QueryTypes.SELECT,
      }),
      db.sequelize.query(`SELECT COUNT(*) AS total ${baseFrom}`, {
        bind: [lat, lng, radiusKm],
        type: QueryTypes.SELECT,
      }),
    ]);

    return res.json(
      toPaginatedResponse({ rows, count: Number(countRows[0].total) }, { page, limit }, toNearbyResponse)
    );
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/geocode?address= — public, funneled through the cached/throttled
// geocodeAddress. Used by the professor's live pin preview and the
// student's manual city/address search fallback.
exports.geocode = async (req, res) => {
  try {
    const { address } = req.query;
    if (!address || !String(address).trim()) {
      return res.status(400).json({ message: "address query param is required" });
    }
    const geocoded = await geocodeAddress(address);
    return res.json(geocoded);
  } catch (err) {
    if (err instanceof GeocodeError) return res.status(422).json({ message: err.message });
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/offline-classes/:id/book — student only. Recomputes the class's
// legitimate upcoming instances server-side (never trusts a client-supplied
// end_at) and enforces capacity under a row lock, the offline-class analog
// of booking.controller.js#create's slot re-derivation + partial unique
// index. See migrations/20260814000002-add-offline-class-to-bookings.js for
// why capacity can't be enforced by a unique index here.
exports.book = async (req, res) => {
  try {
    const { start_at } = req.body;
    if (!start_at) return res.status(400).json({ message: "start_at is required" });

    const requestedStart = DateTime.fromISO(start_at, { zone: "utc" });
    if (!requestedStart.isValid) {
      return res.status(400).json({ message: "start_at must be a valid ISO 8601 datetime" });
    }

    const offlineClass = await OfflineClass.findOne({
      where: { id: req.params.id, is_active: true },
      include: [{ model: ProfessorProfile, as: "professor", where: { status: PROFESSOR_STATUS.APPROVED } }],
    });
    if (!offlineClass) return res.status(404).json({ message: "Offline class not found" });

    const instances = getUpcomingInstances({ offlineClass, professorTimezone: offlineClass.professor.timezone });
    const requestedStartIso = requestedStart.toUTC().toISO();
    const matchedInstance = instances.find((i) => i.start_at === requestedStartIso);
    if (!matchedInstance) return res.status(409).json({ message: "That class session is not available" });

    const t = await db.sequelize.transaction();
    try {
      // Locks the class row so concurrent booking attempts for the same
      // instance serialize on the capacity check below instead of racing.
      await OfflineClass.findByPk(offlineClass.id, { transaction: t, lock: db.Sequelize.Transaction.LOCK.UPDATE });

      const activeCount = await Booking.count({
        where: { offline_class_id: offlineClass.id, start_at: matchedInstance.start_at, status: ACTIVE_BOOKING_STATUSES },
        transaction: t,
      });
      if (activeCount >= offlineClass.capacity) {
        await t.rollback();
        return res.status(409).json({ message: "This class session is full" });
      }

      const isFree = Number(offlineClass.price) === 0;
      const booking = await Booking.create(
        {
          student_id: req.authUser.id,
          professor_id: offlineClass.professor_id,
          offline_class_id: offlineClass.id,
          session_type: SESSION_TYPE.OFFLINE,
          start_at: matchedInstance.start_at,
          end_at: matchedInstance.end_at,
          status: isFree ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING,
          price: offlineClass.price,
          payment_status: isFree ? PAYMENT_STATUS.FREE : PAYMENT_STATUS.UNPAID,
          video_room_slug: null,
        },
        { transaction: t }
      );

      await t.commit();
      return res.status(201).json({ booking: toBookingResponse(booking) });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
