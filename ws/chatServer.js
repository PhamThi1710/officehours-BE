const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth.config");
const db = require("../models/index");
const { getBookingForChat } = require("../utils/bookingChatAccess");

const ChatMessage = db.ChatMessage;

function roomName(bookingId) {
  return `booking:${bookingId}`;
}

// Socket.io's handshake (an initial HTTP request before the upgrade) can
// carry auth data a raw browser WebSocket can't — so unlike the video
// signalling socket, chat just reuses the normal short-lived access token
// via `socket.handshake.auth.token`, no separate token type needed.
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("unauthorized"));
  }

  jwt.verify(token, authConfig.accessTokenSecret, (err, decoded) => {
    if (err) {
      return next(new Error("unauthorized"));
    }
    socket.user = { id: decoded.sub, role: decoded.role, email: decoded.email };
    next();
  });
}

function ack(callback, payload) {
  if (typeof callback === "function") callback(payload);
}

// Kept separate from attach()'s server/middleware wiring so it's testable
// with a fake `io`/`socket` pair instead of a live Socket.io server — same
// approach as ws/videoSignalling.js's handleConnection.
function registerHandlers(io, socket) {
  socket.on("join-booking", async ({ bookingId } = {}, callback) => {
    const { allowed } = await getBookingForChat(bookingId, socket.user.id);
    if (!allowed) {
      return ack(callback, { ok: false, message: "Not allowed to join this chat" });
    }
    socket.join(roomName(bookingId));
    ack(callback, { ok: true });
  });

  socket.on("send-message", async ({ bookingId, message } = {}, callback) => {
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) {
      return ack(callback, { ok: false, message: "message is required" });
    }

    const { allowed } = await getBookingForChat(bookingId, socket.user.id);
    if (!allowed) {
      return ack(callback, { ok: false, message: "Not allowed to message in this chat" });
    }

    const saved = await ChatMessage.create({ booking_id: bookingId, sender_id: socket.user.id, message: text });

    io.to(roomName(bookingId)).emit("new-message", {
      id: saved.id,
      booking_id: bookingId,
      sender_id: socket.user.id,
      message: text,
      created_at: saved.createdAt,
    });

    ack(callback, { ok: true });
  });
}

function attach(httpServer) {
  const allowedOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true,
    },
  });

  io.use(authenticateSocket);
  io.on("connection", (socket) => registerHandlers(io, socket));

  return io;
}

module.exports = { attach, registerHandlers, authenticateSocket, roomName };
