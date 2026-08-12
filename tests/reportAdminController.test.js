jest.mock("../models/index", () => ({
  Booking: { findAll: jest.fn(), count: jest.fn(), sum: jest.fn() },
  Payout: { sum: jest.fn() },
}));

const db = require("../models/index");
const reportAdminController = require("../controllers/admin/report-admin.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("reportAdminController.getBookingsReport", () => {
  it("shapes status counts into an object and defaults to a 30 day window", async () => {
    db.Booking.findAll
      .mockResolvedValueOnce([
        { status: "completed", count: "5" },
        { status: "cancelled", count: "2" },
      ])
      .mockResolvedValueOnce([{ day: "2026-08-10T00:00:00.000Z", count: "3" }]);
    db.Booking.count.mockResolvedValue(7);

    const req = { query: {} };
    const res = makeRes();

    await reportAdminController.getBookingsReport(req, res);

    expect(res.json).toHaveBeenCalledWith({
      total_bookings: 7,
      by_status: { completed: 5, cancelled: 2 },
      daily: [{ date: "2026-08-10T00:00:00.000Z", count: 3 }],
      period_days: 30,
    });
  });

  it("clamps an out-of-range days param to 365", async () => {
    db.Booking.findAll.mockResolvedValue([]);
    db.Booking.count.mockResolvedValue(0);

    const req = { query: { days: "99999" } };
    const res = makeRes();

    await reportAdminController.getBookingsReport(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.period_days).toBe(365);
  });

  it("falls back to 30 days on an invalid days param", async () => {
    db.Booking.findAll.mockResolvedValue([]);
    db.Booking.count.mockResolvedValue(0);

    const req = { query: { days: "not-a-number" } };
    const res = makeRes();

    await reportAdminController.getBookingsReport(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.period_days).toBe(30);
  });
});

describe("reportAdminController.getRevenueReport", () => {
  it("defaults null sums to 0 and maps daily revenue", async () => {
    db.Booking.sum.mockResolvedValue(null);
    db.Booking.findAll.mockResolvedValue([{ day: "2026-08-11T00:00:00.000Z", revenue: "42.50" }]);
    db.Payout.sum.mockResolvedValue(null);

    const req = { query: {} };
    const res = makeRes();

    await reportAdminController.getRevenueReport(req, res);

    expect(res.json).toHaveBeenCalledWith({
      total_revenue_paid: 0,
      total_payouts_pending: 0,
      total_payouts_paid: 0,
      daily_revenue: [{ date: "2026-08-11T00:00:00.000Z", revenue: 42.5 }],
      period_days: 30,
    });
  });

  it("passes through real sums when present", async () => {
    db.Booking.sum.mockResolvedValue(500);
    db.Booking.findAll.mockResolvedValue([]);
    db.Payout.sum.mockResolvedValueOnce(120).mockResolvedValueOnce(380);

    const req = { query: {} };
    const res = makeRes();

    await reportAdminController.getRevenueReport(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ total_revenue_paid: 500, total_payouts_pending: 120, total_payouts_paid: 380 })
    );
  });
});
