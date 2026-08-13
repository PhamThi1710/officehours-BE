const { Op } = require("sequelize");
const db = require("../models/index");
const { PROFESSOR_STATUS } = require("../constants/professorStatus");
const { parsePagination, toPaginatedResponse } = require("../utils/pagination");

const ProfessorProfile = db.ProfessorProfile;
const User = db.User;

const PUBLIC_USER_ATTRIBUTES = ["id", "full_name", "avatar_url"];

function toPublicProfile(profile) {
  return {
    id: profile.id,
    user_id: profile.user_id,
    headline: profile.headline,
    bio: profile.bio,
    subjects: profile.subjects,
    price_per_session: profile.price_per_session,
    session_duration_default: profile.session_duration_default,
    timezone: profile.timezone,
    rating_avg: profile.rating_avg,
    total_reviews: profile.total_reviews,
    total_sessions: profile.total_sessions,
    user: profile.user
      ? { id: profile.user.id, full_name: profile.user.full_name, avatar_url: profile.user.avatar_url }
      : undefined,
  };
}

exports.toPublicProfile = toPublicProfile;

function toOwnerProfile(profile) {
  return {
    ...toPublicProfile(profile),
    status: profile.status,
    rejection_reason: profile.rejection_reason,
  };
}

// POST /api/professors/apply — professor role only
exports.apply = async (req, res) => {
  try {
    const { headline, bio, subjects, price_per_session, session_duration_default, timezone } = req.body;

    if (!headline || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ message: "headline and a non-empty subjects array are required" });
    }

    if (price_per_session !== undefined && Number(price_per_session) < 0) {
      return res.status(400).json({ message: "price_per_session cannot be negative" });
    }

    const existing = await ProfessorProfile.findOne({ where: { user_id: req.authUser.id } });
    if (existing) {
      return res.status(409).json({ message: "You already have a professor profile" });
    }

    const profile = await ProfessorProfile.create({
      user_id: req.authUser.id,
      headline,
      bio,
      subjects,
      price_per_session: price_per_session ?? 0,
      session_duration_default: session_duration_default ?? 30,
      timezone: timezone || "UTC",
      status: PROFESSOR_STATUS.PENDING,
    });

    return res.status(201).json({ professor: toOwnerProfile(profile) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/professors/me — professor role only
exports.getMe = async (req, res) => {
  try {
    const profile = await ProfessorProfile.findOne({
      where: { user_id: req.authUser.id },
      include: [{ model: User, as: "user", attributes: PUBLIC_USER_ATTRIBUTES }],
    });

    if (!profile) {
      return res.status(404).json({ message: "No professor profile yet — apply first" });
    }

    return res.json({ professor: toOwnerProfile(profile) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/professors/me — professor role only. Editing does not reset
// approval status; admins can always re-review from the approval queue.
exports.updateMe = async (req, res) => {
  try {
    const profile = await ProfessorProfile.findOne({ where: { user_id: req.authUser.id } });
    if (!profile) {
      return res.status(404).json({ message: "No professor profile yet — apply first" });
    }

    const { headline, bio, subjects, price_per_session, session_duration_default, timezone } = req.body;

    if (subjects !== undefined && (!Array.isArray(subjects) || subjects.length === 0)) {
      return res.status(400).json({ message: "subjects must be a non-empty array" });
    }
    if (price_per_session !== undefined && Number(price_per_session) < 0) {
      return res.status(400).json({ message: "price_per_session cannot be negative" });
    }

    if (headline !== undefined) profile.headline = headline;
    if (bio !== undefined) profile.bio = bio;
    if (subjects !== undefined) profile.subjects = subjects;
    if (price_per_session !== undefined) profile.price_per_session = price_per_session;
    if (session_duration_default !== undefined) profile.session_duration_default = session_duration_default;
    if (timezone !== undefined) profile.timezone = timezone;

    await profile.save();
    return res.json({ professor: toOwnerProfile(profile) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/professors — public, approved professors only
exports.list = async (req, res) => {
  try {
    const { subject, search } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = { status: PROFESSOR_STATUS.APPROVED };
    if (subject) {
      where.subjects = { [Op.contains]: [subject] };
    }
    if (search) {
      where.headline = { [Op.iLike]: `%${search}%` };
    }

    const result = await ProfessorProfile.findAndCountAll({
      where,
      include: [{ model: User, as: "user", attributes: PUBLIC_USER_ATTRIBUTES }],
      order: [["rating_avg", "DESC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toPublicProfile));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/professors/:id — public, approved professors only
exports.getById = async (req, res) => {
  try {
    const profile = await ProfessorProfile.findOne({
      where: { id: req.params.id, status: PROFESSOR_STATUS.APPROVED },
      include: [{ model: User, as: "user", attributes: PUBLIC_USER_ATTRIBUTES }],
    });

    if (!profile) {
      return res.status(404).json({ message: "Professor not found" });
    }

    return res.json({ professor: toPublicProfile(profile) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
