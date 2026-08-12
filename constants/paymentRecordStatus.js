// Lifecycle of the Stripe transaction itself — distinct from
// bookings.payment_status, which is the booking's own coarser view
// (unpaid/paid/refunded/free).
const PAYMENT_RECORD_STATUS = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
});

module.exports = { PAYMENT_RECORD_STATUS };
