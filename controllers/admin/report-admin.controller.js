const { Op, fn, col } = require("sequelize");
const db = require("../../models/index");
const { PAYMENT_STATUS } = require("../../constants/bookingStatus");
const { PAYOUT_STATUS } = require("../../constants/payoutStatus");

const Booking = db.Booking;
const Payout = db.Payout;

const DAY_TRUNC = () => fn("date_trunc", "day", col("created_at"));

function parseDaysParam(query) {
  const days = parseInt(query.days, 10);
  return Number.isInteger(days) && days > 0 ? Math.min(days, 365) : 30;
}

// GET /api/admin/reports/bookings?days=30
exports.getBookingsReport = async (req, res) => {
  try {
    const days = parseDaysParam(req.query);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [statusCounts, dailyCounts, totalBookings] = await Promise.all([
      Booking.findAll({
        attributes: ["status", [fn("COUNT", col("id")), "count"]],
        group: ["status"],
        raw: true,
      }),
      Booking.findAll({
        attributes: [
          [DAY_TRUNC(), "day"],
          [fn("COUNT", col("id")), "count"],
        ],
        where: { created_at: { [Op.gte]: since } },
        group: [DAY_TRUNC()],
        order: [[DAY_TRUNC(), "ASC"]],
        raw: true,
      }),
      Booking.count(),
    ]);

    return res.json({
      total_bookings: totalBookings,
      by_status: statusCounts.reduce((acc, row) => {
        acc[row.status] = Number(row.count);
        return acc;
      }, {}),
      daily: dailyCounts.map((row) => ({ date: row.day, count: Number(row.count) })),
      period_days: days,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/reports/revenue?days=30
exports.getRevenueReport = async (req, res) => {
  try {
    const days = parseDaysParam(req.query);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalRevenuePaid, dailyRevenue, totalPayoutsPending, totalPayoutsPaid] = await Promise.all([
      Booking.sum("price", { where: { payment_status: PAYMENT_STATUS.PAID } }),
      Booking.findAll({
        attributes: [
          [DAY_TRUNC(), "day"],
          [fn("SUM", col("price")), "revenue"],
        ],
        where: { payment_status: PAYMENT_STATUS.PAID, created_at: { [Op.gte]: since } },
        group: [DAY_TRUNC()],
        order: [[DAY_TRUNC(), "ASC"]],
        raw: true,
      }),
      Payout.sum("amount", { where: { status: PAYOUT_STATUS.PENDING } }),
      Payout.sum("amount", { where: { status: PAYOUT_STATUS.PAID_SIMULATED } }),
    ]);

    return res.json({
      total_revenue_paid: totalRevenuePaid || 0,
      total_payouts_pending: totalPayoutsPending || 0,
      total_payouts_paid: totalPayoutsPaid || 0,
      daily_revenue: dailyRevenue.map((row) => ({ date: row.day, revenue: Number(row.revenue) })),
      period_days: days,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
