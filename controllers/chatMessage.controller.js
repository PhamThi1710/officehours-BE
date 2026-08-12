const db = require("../models/index");
const { getBookingForChat } = require("../utils/bookingChatAccess");
const { parsePagination, toPaginatedResponse } = require("../utils/pagination");

const ChatMessage = db.ChatMessage;
const User = db.User;

function toMessageResponse(msg) {
  return {
    id: msg.id,
    booking_id: msg.booking_id,
    sender_id: msg.sender_id,
    message: msg.message,
    created_at: msg.createdAt,
    sender: msg.sender ? { id: msg.sender.id, full_name: msg.sender.full_name } : undefined,
  };
}

// GET /api/bookings/:id/messages — chat history; live delivery happens over
// Socket.io (ws/chatServer.js), this is just for loading a booking's chat
// on page load. Oldest-first, same pagination shape as the rest of the API.
exports.list = async (req, res) => {
  try {
    const { booking, allowed } = await getBookingForChat(req.params.id, req.authUser.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to view this chat" });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const result = await ChatMessage.findAndCountAll({
      where: { booking_id: booking.id },
      include: [{ model: User, as: "sender", attributes: ["id", "full_name"] }],
      order: [["createdAt", "ASC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toMessageResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
