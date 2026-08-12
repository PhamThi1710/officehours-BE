jest.mock("../models/index", () => ({
  Booking: { findByPk: jest.fn() },
  ProfessorProfile: {},
}));
jest.mock("../utils/videoToken", () => ({ signVideoToken: jest.fn() }));
jest.mock("../utils/iceServers", () => ({ getIceServers: jest.fn() }));

const db = require("../models/index");
const { signVideoToken } = require("../utils/videoToken");
const { getIceServers } = require("../utils/iceServers");
const videoController = require("../controllers/video.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeBooking(overrides) {
  const now = Date.now();
  return {
    id: "booking-1",
    student_id: "student-1",
    status: "confirmed",
    start_at: new Date(now + 5 * 60 * 1000), // starts in 5 min — inside the 10 min join window
    end_at: new Date(now + 35 * 60 * 1000),
    video_room_slug: "room-slug-1",
    professor: { id: "profile-1", user_id: "prof-user-1" },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  signVideoToken.mockReturnValue("signed-video-token");
  getIceServers.mockReturnValue([{ urls: "stun:stun.l.google.com:19302" }]);
});

describe("videoController.getRoomInfo", () => {
  it("404s when the booking doesn't exist", async () => {
    db.Booking.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await videoController.getRoomInfo(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403s a user who is neither the student nor the professor", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking());
    const req = { params: { id: "booking-1" }, authUser: { id: "stranger" } };
    const res = makeRes();

    await videoController.getRoomInfo(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("400s when the booking isn't confirmed", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking({ status: "pending" }));
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await videoController.getRoomInfo(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("400s when it's too early to join", async () => {
    const now = Date.now();
    db.Booking.findByPk.mockResolvedValue(
      makeBooking({ start_at: new Date(now + 60 * 60 * 1000), end_at: new Date(now + 90 * 60 * 1000) })
    );
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await videoController.getRoomInfo(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(signVideoToken).not.toHaveBeenCalled();
  });

  it("400s when the session has already ended", async () => {
    const now = Date.now();
    db.Booking.findByPk.mockResolvedValue(
      makeBooking({ start_at: new Date(now - 90 * 60 * 1000), end_at: new Date(now - 60 * 60 * 1000) })
    );
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await videoController.getRoomInfo(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns a room token + ICE servers for the student inside the join window", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking());
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await videoController.getRoomInfo(req, res);

    expect(signVideoToken).toHaveBeenCalledWith({ bookingId: "booking-1", userId: "student-1" });
    expect(res.json).toHaveBeenCalledWith({
      room_slug: "room-slug-1",
      video_token: "signed-video-token",
      ws_path: "/ws/video",
      ice_servers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  });

  it("also allows the owning professor to join", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking());
    const req = { params: { id: "booking-1" }, authUser: { id: "prof-user-1" } };
    const res = makeRes();

    await videoController.getRoomInfo(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(signVideoToken).toHaveBeenCalledWith({ bookingId: "booking-1", userId: "prof-user-1" });
  });
});
