const db = require("../../models/index");
const { SUPPORT_TICKET_STATUS } = require("../../constants/supportTicketStatus");
const { parsePagination, toPaginatedResponse } = require("../../utils/pagination");
const { sendEmail } = require("../../utils/mailer");
const { supportTicketReplyEmail } = require("../../utils/emailTemplates");

const SupportTicket = db.SupportTicket;
const User = db.User;

function toAdminTicketResponse(ticket) {
  return {
    id: ticket.id,
    email: ticket.email,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    admin_reply: ticket.admin_reply,
    replied_at: ticket.replied_at,
    created_at: ticket.createdAt,
    user: ticket.user ? { id: ticket.user.id, full_name: ticket.user.full_name } : undefined,
  };
}

// GET /api/admin/support-tickets?status=
exports.list = async (req, res) => {
  try {
    const { status } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = {};
    if (status) {
      if (!Object.values(SUPPORT_TICKET_STATUS).includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${Object.values(SUPPORT_TICKET_STATUS).join(", ")}` });
      }
      where.status = status;
    }

    const result = await SupportTicket.findAndCountAll({
      where,
      include: [{ model: User, as: "user", attributes: ["id", "full_name"] }],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toAdminTicketResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/support-tickets/:id
exports.getById = async (req, res) => {
  try {
    const ticket = await SupportTicket.findByPk(req.params.id, {
      include: [{ model: User, as: "user", attributes: ["id", "full_name"] }],
    });
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found" });
    }
    return res.json({ ticket: toAdminTicketResponse(ticket) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/support-tickets/:id — set admin_reply and/or status.
// Replying auto-bumps a still-"open" ticket to "in_progress" unless the
// caller explicitly sets a different status in the same request.
exports.update = async (req, res) => {
  try {
    const ticket = await SupportTicket.findByPk(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Support ticket not found" });
    }

    const { status, admin_reply } = req.body;
    if (status !== undefined && !Object.values(SUPPORT_TICKET_STATUS).includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${Object.values(SUPPORT_TICKET_STATUS).join(", ")}` });
    }

    const isReplying = admin_reply !== undefined && admin_reply !== null && admin_reply !== "";
    if (admin_reply !== undefined) {
      ticket.admin_reply = admin_reply;
      ticket.replied_at = new Date();
    }

    if (status !== undefined) {
      ticket.status = status;
    } else if (isReplying && ticket.status === SUPPORT_TICKET_STATUS.OPEN) {
      ticket.status = SUPPORT_TICKET_STATUS.IN_PROGRESS;
    }

    await ticket.save();

    if (isReplying) {
      sendEmail({ to: ticket.email, ...supportTicketReplyEmail({ ticket }) }).catch((err) => {
        console.error("[email] support-ticket-reply notification failed:", err.message);
      });
    }

    return res.json({ ticket: toAdminTicketResponse(ticket) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
