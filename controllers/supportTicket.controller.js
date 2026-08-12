const db = require("../models/index");
const { parsePagination, toPaginatedResponse } = require("../utils/pagination");

const SupportTicket = db.SupportTicket;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toTicketResponse(ticket) {
  return {
    id: ticket.id,
    email: ticket.email,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    admin_reply: ticket.admin_reply,
    replied_at: ticket.replied_at,
    created_at: ticket.createdAt,
  };
}

// POST /api/support-tickets — open to guests; attachUserIfPresent (see
// middleware/authJwt.js) links it to an account when the caller happens to
// be logged in, without requiring it.
exports.create = async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    const effectiveEmail = email || req.authUser?.email;

    if (!effectiveEmail || !EMAIL_REGEX.test(effectiveEmail)) {
      return res.status(400).json({ message: "A valid email is required" });
    }
    if (!subject || !message) {
      return res.status(400).json({ message: "subject and message are required" });
    }

    const ticket = await SupportTicket.create({
      user_id: req.authUser?.id || null,
      email: effectiveEmail,
      subject,
      message,
    });

    return res.status(201).json({ ticket: toTicketResponse(ticket) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/support-tickets/me — authenticated only
exports.listMine = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);

    const result = await SupportTicket.findAndCountAll({
      where: { user_id: req.authUser.id },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toTicketResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
