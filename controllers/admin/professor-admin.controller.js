const db = require("../../models/index");
const { PROFESSOR_STATUS } = require("../../constants/professorStatus");
const { parsePagination, toPaginatedResponse } = require("../../utils/pagination");

const ProfessorProfile = db.ProfessorProfile;
const User = db.User;

const OWNER_USER_ATTRIBUTES = ["id", "full_name", "email", "avatar_url"];

function toAdminProfile(profile) {
  return {
    id: profile.id,
    user_id: profile.user_id,
    headline: profile.headline,
    bio: profile.bio,
    subjects: profile.subjects,
    price_per_session: profile.price_per_session,
    session_duration_default: profile.session_duration_default,
    timezone: profile.timezone,
    status: profile.status,
    rejection_reason: profile.rejection_reason,
    rating_avg: profile.rating_avg,
    total_reviews: profile.total_reviews,
    total_sessions: profile.total_sessions,
    created_at: profile.createdAt,
    user: profile.user
      ? { id: profile.user.id, full_name: profile.user.full_name, email: profile.user.email, avatar_url: profile.user.avatar_url }
      : undefined,
  };
}

// GET /api/admin/professors?status=pending
exports.list = async (req, res) => {
  try {
    const { status } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = {};
    if (status) {
      if (!Object.values(PROFESSOR_STATUS).includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${Object.values(PROFESSOR_STATUS).join(", ")}` });
      }
      where.status = status;
    }

    const result = await ProfessorProfile.findAndCountAll({
      where,
      include: [{ model: User, as: "user", attributes: OWNER_USER_ATTRIBUTES }],
      order: [["created_at", "ASC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toAdminProfile));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/professors/:id
exports.getById = async (req, res) => {
  try {
    const profile = await ProfessorProfile.findByPk(req.params.id, {
      include: [{ model: User, as: "user", attributes: OWNER_USER_ATTRIBUTES }],
    });

    if (!profile) {
      return res.status(404).json({ message: "Professor profile not found" });
    }

    return res.json({ professor: toAdminProfile(profile) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/professors/:id/approve
exports.approve = async (req, res) => {
  try {
    const profile = await ProfessorProfile.findByPk(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Professor profile not found" });
    }

    profile.status = PROFESSOR_STATUS.APPROVED;
    profile.rejection_reason = null;
    await profile.save();

    return res.json({ professor: toAdminProfile(profile) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/professors/:id/reject
exports.reject = async (req, res) => {
  try {
    const { reason } = req.body;
    const profile = await ProfessorProfile.findByPk(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Professor profile not found" });
    }

    profile.status = PROFESSOR_STATUS.REJECTED;
    profile.rejection_reason = reason || null;
    await profile.save();

    return res.json({ professor: toAdminProfile(profile) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
