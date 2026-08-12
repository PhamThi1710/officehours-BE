jest.mock("../models/index", () => ({
  ChatMessage: { findAndCountAll: jest.fn() },
  User: {},
}));
jest.mock("../utils/bookingChatAccess", () => ({ getBookingForChat: jest.fn() }));

const db = require("../models/index");
const { getBookingForChat } = require("../utils/bookingChatAccess");
const chatMessageController = require("../controllers/chatMessage.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("chatMessageController.list", () => {
  it("404s when the booking doesn't exist", async () => {
    getBookingForChat.mockResolvedValue({ booking: null, allowed: false });
    const req = { params: { id: "missing" }, authUser: { id: "user-1" }, query: {} };
    const res = makeRes();

    await chatMessageController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403s when the caller isn't a party (or the booking is cancelled)", async () => {
    getBookingForChat.mockResolvedValue({ booking: { id: "booking-1" }, allowed: false });
    const req = { params: { id: "booking-1" }, authUser: { id: "stranger" }, query: {} };
    const res = makeRes();

    await chatMessageController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns paginated, oldest-first chat history", async () => {
    getBookingForChat.mockResolvedValue({ booking: { id: "booking-1" }, allowed: true });
    db.ChatMessage.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" }, query: {} };
    const res = makeRes();

    await chatMessageController.list(req, res);

    const callArgs = db.ChatMessage.findAndCountAll.mock.calls[0][0];
    expect(callArgs.where).toEqual({ booking_id: "booking-1" });
    expect(callArgs.order).toEqual([["createdAt", "ASC"]]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ items: [], total: 0 }));
  });
});
