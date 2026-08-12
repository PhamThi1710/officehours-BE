process.env.JWT_ACCESS_SECRET = "test-secret";

jest.mock("../models/index", () => ({
  ChatMessage: { create: jest.fn() },
}));
jest.mock("../utils/bookingChatAccess", () => ({ getBookingForChat: jest.fn() }));

const jwt = require("jsonwebtoken");
const db = require("../models/index");
const { getBookingForChat } = require("../utils/bookingChatAccess");
const { authenticateSocket, registerHandlers, roomName } = require("../ws/chatServer");

function makeFakeIo() {
  const emit = jest.fn();
  return { to: jest.fn(() => ({ emit })), _emit: emit };
}

function makeFakeSocket(userId) {
  const handlers = {};
  return {
    user: { id: userId },
    on: jest.fn((event, cb) => {
      handlers[event] = cb;
    }),
    join: jest.fn(),
    handlers,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("authenticateSocket", () => {
  it("rejects a connection with no token", (done) => {
    const socket = { handshake: { auth: {} } };
    authenticateSocket(socket, (err) => {
      expect(err).toBeInstanceOf(Error);
      done();
    });
  });

  it("rejects an invalid token", (done) => {
    const socket = { handshake: { auth: { token: "not-a-real-token" } } };
    authenticateSocket(socket, (err) => {
      expect(err).toBeInstanceOf(Error);
      done();
    });
  });

  it("attaches socket.user for a valid token", (done) => {
    const token = jwt.sign({ sub: "user-1", role: "student", email: "s@school.edu" }, "test-secret");
    const socket = { handshake: { auth: { token } } };
    authenticateSocket(socket, (err) => {
      expect(err).toBeUndefined();
      expect(socket.user).toEqual({ id: "user-1", role: "student", email: "s@school.edu" });
      done();
    });
  });
});

describe("registerHandlers — join-booking", () => {
  it("joins the room and acks ok when allowed", async () => {
    getBookingForChat.mockResolvedValue({ allowed: true });
    const io = makeFakeIo();
    const socket = makeFakeSocket("student-1");
    registerHandlers(io, socket);
    const ack = jest.fn();

    await socket.handlers["join-booking"]({ bookingId: "booking-1" }, ack);

    expect(socket.join).toHaveBeenCalledWith(roomName("booking-1"));
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it("does not join and acks not-ok when disallowed", async () => {
    getBookingForChat.mockResolvedValue({ allowed: false });
    const io = makeFakeIo();
    const socket = makeFakeSocket("stranger");
    registerHandlers(io, socket);
    const ack = jest.fn();

    await socket.handlers["join-booking"]({ bookingId: "booking-1" }, ack);

    expect(socket.join).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });
});

describe("registerHandlers — send-message", () => {
  it("rejects an empty/whitespace-only message without touching the DB", async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket("student-1");
    registerHandlers(io, socket);
    const ack = jest.fn();

    await socket.handlers["send-message"]({ bookingId: "booking-1", message: "   " }, ack);

    expect(db.ChatMessage.create).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("rejects when the sender isn't allowed to chat on this booking", async () => {
    getBookingForChat.mockResolvedValue({ allowed: false });
    const io = makeFakeIo();
    const socket = makeFakeSocket("stranger");
    registerHandlers(io, socket);
    const ack = jest.fn();

    await socket.handlers["send-message"]({ bookingId: "booking-1", message: "hi" }, ack);

    expect(db.ChatMessage.create).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("persists the message and broadcasts it to the booking room", async () => {
    getBookingForChat.mockResolvedValue({ allowed: true });
    db.ChatMessage.create.mockResolvedValue({ id: "msg-1", createdAt: "2026-08-17T09:00:00.000Z" });
    const io = makeFakeIo();
    const socket = makeFakeSocket("student-1");
    registerHandlers(io, socket);
    const ack = jest.fn();

    await socket.handlers["send-message"]({ bookingId: "booking-1", message: "  hello  " }, ack);

    expect(db.ChatMessage.create).toHaveBeenCalledWith({
      booking_id: "booking-1",
      sender_id: "student-1",
      message: "hello",
    });
    expect(io.to).toHaveBeenCalledWith(roomName("booking-1"));
    expect(io._emit).toHaveBeenCalledWith(
      "new-message",
      expect.objectContaining({ id: "msg-1", booking_id: "booking-1", sender_id: "student-1", message: "hello" })
    );
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });
});
