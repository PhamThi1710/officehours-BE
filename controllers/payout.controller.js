const db = require("../models/index");
const { PAYOUT_STATUS } = require("../constants/payoutStatus");
const { parsePagination, toPaginatedResponse } = require("../utils/pagination");

const ProfessorProfile = db.ProfessorProfile;
const Payout = db.Payout;
const User = db.User;

function toPayoutResponse(payout) {
  return {
    id: payout.id,
    professor_id: payout.professor_id,
    booking_id: payout.booking_id,
    amount: payout.amount,
    status: payout.status,
    paid_at: payout.paid_at,
    created_at: payout.createdAt,
    professor: payout.professor
      ? {
          id: payout.professor.id,
          headline: payout.professor.headline,
          user: payout.professor.user
            ? { id: payout.professor.user.id, full_name: payout.professor.user.full_name, email: payout.professor.user.email }
            : undefined,
        }
      : undefined,
  };
}

// GET /api/professors/me/payouts — professor role only
exports.listMine = async (req, res) => {
  try {
    const profile = await ProfessorProfile.findOne({ where: { user_id: req.authUser.id } });
    if (!profile) {
      return res.status(404).json({ message: "No professor profile yet — apply first" });
    }

    const { status } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = { professor_id: profile.id };
    if (status) {
      if (!Object.values(PAYOUT_STATUS).includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${Object.values(PAYOUT_STATUS).join(", ")}` });
      }
      where.status = status;
    }

    const [result, totalPending, totalPaid] = await Promise.all([
      Payout.findAndCountAll({ where, order: [["createdAt", "DESC"]], limit, offset }),
      Payout.sum("amount", { where: { professor_id: profile.id, status: PAYOUT_STATUS.PENDING } }),
      Payout.sum("amount", { where: { professor_id: profile.id, status: PAYOUT_STATUS.PAID_SIMULATED } }),
    ]);

    return res.json({
      ...toPaginatedResponse(result, { page, limit }, toPayoutResponse),
      summary: {
        total_pending: totalPending || 0,
        total_paid: totalPaid || 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/payouts?status=&professor_id=
exports.listAll = async (req, res) => {
  try {
    const { status, professor_id } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = {};
    if (status) {
      if (!Object.values(PAYOUT_STATUS).includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${Object.values(PAYOUT_STATUS).join(", ")}` });
      }
      where.status = status;
    }
    if (professor_id) where.professor_id = professor_id;

    const result = await Payout.findAndCountAll({
      where,
      include: [
        {
          model: ProfessorProfile,
          as: "professor",
          attributes: ["id", "headline"],
          include: [{ model: User, as: "user", attributes: ["id", "full_name", "email"] }],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toPayoutResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/payouts/:id/mark-paid
exports.markPaid = async (req, res) => {
  try {
    const payout = await Payout.findByPk(req.params.id);
    if (!payout) {
      return res.status(404).json({ message: "Payout not found" });
    }
    if (payout.status === PAYOUT_STATUS.PAID_SIMULATED) {
      return res.status(400).json({ message: "Payout is already marked paid" });
    }

    payout.status = PAYOUT_STATUS.PAID_SIMULATED;
    payout.paid_at = new Date();
    await payout.save();

    return res.json({ payout: toPayoutResponse(payout) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
