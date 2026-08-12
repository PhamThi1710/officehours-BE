const { WebSocketServer } = require("ws");
const { parse } = require("url");
const { verifyVideoToken } = require("../utils/videoToken");

const WS_PATH = "/ws/video";
const MAX_PARTICIPANTS_PER_ROOM = 2; // 1:1 sessions only — see README for the group-session note.

// bookingId -> Map<userId, ws>. In-memory by design: a single Render
// instance holds every open call, and a dropped process just drops
// in-progress calls (acceptable for a portfolio deployment) rather than
// needing a shared store across instances.
const rooms = new Map();

function broadcastToRoom(room, senderId, payload) {
  const data = JSON.stringify(payload);
  for (const [participantId, socket] of room.entries()) {
    if (participantId === senderId) continue;
    if (socket.readyState === socket.OPEN) {
      socket.send(data);
    }
  }
}

// The actual relay logic, kept separate from attach()'s HTTP-upgrade
// plumbing so it can be unit-tested with plain EventEmitter stand-ins
// instead of a real WebSocketServer/socket.
function handleConnection(ws, { bookingId, userId }) {
  let room = rooms.get(bookingId);
  if (!room) {
    room = new Map();
    rooms.set(bookingId, room);
  }

  if (room.size >= MAX_PARTICIPANTS_PER_ROOM && !room.has(userId)) {
    ws.close(4001, "Room is full");
    return;
  }

  // Same user reconnecting (refresh, flaky network) replaces their old socket.
  const existing = room.get(userId);
  if (existing && existing !== ws) {
    existing.close(4000, "Replaced by a new connection");
  }
  room.set(userId, ws);

  broadcastToRoom(room, userId, { type: "peer-joined", userId });

  // The server never inspects offer/answer/ice-candidate payloads — it just
  // tags the sender and relays to the other participant(s) verbatim.
  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    broadcastToRoom(room, userId, { ...message, from: userId });
  });

  ws.on("close", () => {
    if (room.get(userId) === ws) {
      room.delete(userId);
    }
    if (room.size === 0) {
      rooms.delete(bookingId);
    } else {
      broadcastToRoom(room, userId, { type: "peer-left", userId });
    }
  });
}

function attach(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url, true);
    if (pathname !== WS_PATH) {
      // Not ours — leave the socket alone so another "upgrade" listener on
      // this same http.Server (e.g. Socket.io's chat server, Phase 11) gets
      // a chance to handle it. Node fires every registered "upgrade"
      // listener for every upgrade request; destroying here would kill
      // upgrades meant for someone else.
      return;
    }

    let payload;
    try {
      payload = verifyVideoToken(query.token);
    } catch {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, payload);
    });
  });

  return wss;
}

module.exports = { attach, handleConnection, rooms, WS_PATH, MAX_PARTICIPANTS_PER_ROOM };
