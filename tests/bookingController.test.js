jest.mock("../models/index", () => ({
  ProfessorProfile: { findOne: jest.fn(), increment: jest.fn() },
  AvailabilityRule: { findAll: jest.fn() },
  AvailabilityException: { findAll: jest.fn() },
  Booking: { create: jest.fn(), findAndCountAll: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() },
  Payout: { create: jest.fn() },
  User: {},
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../utils/mailer");

const db = require("../models/index");
const mailer = require("../utils/mailer");
const bookingController = require("../controllers/booking.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const APPROVED_PROFILE = {
  id: "profile-1",
  user_id: "prof-user-1",
  status: "approved",
  timezone: "UTC",
  price_per_session: 0,
  user: { id: "prof-user-1", full_name: "Prof X", email: "profx@school.edu" },
};
// 2026-08-17 is a Monday (day_of_week 1); 09:00-09:30 UTC is a matching slot.
const MONDAY_RULE = {
  is_active: true,
  day_of_week: 1,
  specific_date: null,
  start_time: "09:00",
  end_time: "09:30",
  slot_duration_minutes: 30,
  valid_from: null,
  valid_until: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  db.ProfessorProfile.findOne.mockResolvedValue(APPROVED_PROFILE);
  db.ProfessorProfile.increment.mockResolvedValue();
  db.AvailabilityRule.findAll.mockResolvedValue([MONDAY_RULE]);
  db.AvailabilityException.findAll.mockResolvedValue([]);
  db.Booking.findAll.mockResolvedValue([]);
  db.sequelize.transaction.mockResolvedValue({
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
  });
});

describe("bookingController.create", () => {
  const baseReq = (overrides) => ({
    authUser: { id: "student-1", role: "student", email: "student1@school.edu" },
    body: { professor_id: "profile-1", start_at: "2026-08-17T09:00:00.000Z", ...overrides },
  });

  it("rejects a missing professor_id/start_at", async () => {
    const req = { authUser: { id: "student-1" }, body: {} };
    const res = makeRes();

    await bookingController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.Booking.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed start_at", async () => {
    const req = baseReq({ start_at: "not-a-date" });
    const res = makeRes();

    await bookingController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404s when the professor doesn't exist or isn't approved", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue(null);
    const req = baseReq();
    const res = makeRes();

    await bookingController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("409s when the requested start_at isn't an actual available slot", async () => {
    db.AvailabilityRule.findAll.mockResolvedValue([]); // no rules -> no slots at all
    const req = baseReq();
    const res = makeRes();

    await bookingController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.Booking.create).not.toHaveBeenCalled();
  });

  it("auto-confirms and marks free when price_per_session is 0", async () => {
    db.Booking.create.mockResolvedValue({
      id: "booking-1",
      student_id: "student-1",
      professor_id: "profile-1",
      start_at: "2026-08-17T09:00:00.000Z",
      end_at: "2026-08-17T09:30:00.000Z",
      status: "confirmed",
      price: 0,
      payment_status: "free",
      video_room_slug: "slug",
    });

    const req = baseReq();
    const res = makeRes();

    await bookingController.create(req, res);

    expect(db.Booking.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "confirmed", payment_status: "free", student_id: "student-1", professor_id: "profile-1" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mailer.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "student1@school.edu", subject: expect.stringContaining("confirmed") })
    );
    expect(mailer.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "profx@school.edu", subject: expect.stringContaining("New") })
    );
  });

  it("creates a pending/unpaid booking when the professor charges for sessions", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue({ ...APPROVED_PROFILE, price_per_session: 25 });
    db.Booking.create.mockResolvedValue({ id: "booking-1", status: "pending", payment_status: "unpaid" });

    const req = baseReq();
    const res = makeRes();

    await bookingController.create(req, res);

    expect(db.Booking.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", payment_status: "unpaid", price: 25 })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns 409 when a concurrent request wins the same slot (unique constraint)", async () => {
    const err = new Error("duplicate key");
    err.name = "SequelizeUniqueConstraintError";
    db.Booking.create.mockRejectedValue(err);

    const req = baseReq();
    const res = makeRes();

    await bookingController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("bookingController.cancel", () => {
  function makeBooking(overrides) {
    return {
      id: "booking-1",
      student_id: "student-1",
      status: "confirmed",
      start_at: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
      professor: { id: "profile-1", user_id: "prof-user-1" },
      save: jest.fn().mockResolvedValue(),
      ...overrides,
    };
  }

  it("404s when the booking doesn't exist", async () => {
    db.Booking.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" }, authUser: { id: "student-1", role: "student" }, body: {} };
    const res = makeRes();

    await bookingController.cancel(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403s a user who is neither the student, the owning professor, nor an admin", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking());
    const req = { params: { id: "booking-1" }, authUser: { id: "someone-else", role: "student" }, body: {} };
    const res = makeRes();

    await bookingController.cancel(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("rejects cancelling an already-cancelled booking", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking({ status: "cancelled" }));
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1", role: "student" }, body: {} };
    const res = makeRes();

    await bookingController.cancel(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects cancelling a session that already started", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking({ start_at: new Date(Date.now() - 60 * 60 * 1000) }));
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1", role: "student" }, body: {} };
    const res = makeRes();

    await bookingController.cancel(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("cancels successfully for the owning student and records who cancelled it", async () => {
    const booking = makeBooking();
    db.Booking.findByPk.mockResolvedValue(booking);
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1", role: "student" }, body: { reason: "Change of plans" } };
    const res = makeRes();

    await bookingController.cancel(req, res);

    expect(booking.status).toBe("cancelled");
    expect(booking.cancelled_by).toBe("student-1");
    expect(booking.cancel_reason).toBe("Change of plans");
    expect(booking.save).toHaveBeenCalled();
  });
});

describe("bookingController.complete", () => {
  function makeBooking(overrides) {
    return {
      id: "booking-1",
      student_id: "student-1",
      professor_id: "profile-1",
      status: "confirmed",
      price: 25,
      payment_status: "paid",
      start_at: new Date(Date.now() - 60 * 60 * 1000), // started an hour ago
      professor: { id: "profile-1", user_id: "prof-user-1" },
      save: jest.fn().mockResolvedValue(),
      ...overrides,
    };
  }

  it("403s a student trying to mark their own booking completed", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking());
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1", role: "student" }, body: {} };
    const res = makeRes();

    await bookingController.complete(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("rejects completing a booking that isn't confirmed", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking({ status: "pending" }));
    const req = { params: { id: "booking-1" }, authUser: { id: "prof-user-1", role: "professor" }, body: {} };
    const res = makeRes();

    await bookingController.complete(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects completing a session that hasn't started yet", async () => {
    db.Booking.findByPk.mockResolvedValue(makeBooking({ start_at: new Date(Date.now() + 60 * 60 * 1000) }));
    const req = { params: { id: "booking-1" }, authUser: { id: "prof-user-1", role: "professor" }, body: {} };
    const res = makeRes();

    await bookingController.complete(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("completes successfully and creates a payout for a paid session", async () => {
    const booking = makeBooking();
    db.Booking.findByPk.mockResolvedValue(booking);
    const req = { params: { id: "booking-1" }, authUser: { id: "prof-user-1", role: "professor" }, body: {} };
    const res = makeRes();

    await bookingController.complete(req, res);

    expect(booking.status).toBe("completed");
    expect(booking.save).toHaveBeenCalled();
    expect(db.Payout.create).toHaveBeenCalledWith(
      expect.objectContaining({ professor_id: "profile-1", booking_id: "booking-1", amount: 25, status: "pending" }),
      expect.anything()
    );
    expect(db.ProfessorProfile.increment).toHaveBeenCalledWith(
      "total_sessions",
      expect.objectContaining({ by: 1, where: { id: "profile-1" } })
    );
  });

  it("does not create a payout for a completed free session", async () => {
    const booking = makeBooking({ price: 0, payment_status: "free" });
    db.Booking.findByPk.mockResolvedValue(booking);
    const req = { params: { id: "booking-1" }, authUser: { id: "prof-user-1", role: "professor" }, body: {} };
    const res = makeRes();

    await bookingController.complete(req, res);

    expect(booking.status).toBe("completed");
    expect(db.Payout.create).not.toHaveBeenCalled();
  });

  it("rolls back and returns 500 if creating the payout fails", async () => {
    const booking = makeBooking();
    db.Booking.findByPk.mockResolvedValue(booking);
    const rollback = jest.fn().mockResolvedValue();
    db.sequelize.transaction.mockResolvedValue({ commit: jest.fn().mockResolvedValue(), rollback });
    db.Payout.create.mockRejectedValue(new Error("db exploded"));

    const req = { params: { id: "booking-1" }, authUser: { id: "prof-user-1", role: "professor" }, body: {} };
    const res = makeRes();

    await bookingController.complete(req, res);

    expect(rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
