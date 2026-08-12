const BOOKING_STATUS = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
});

// A slot is "taken" for double-booking purposes while a booking sits in
// either of these — cancelled/completed bookings free the slot back up.
const ACTIVE_BOOKING_STATUSES = [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED];

const PAYMENT_STATUS = Object.freeze({
  UNPAID: "unpaid",
  PAID: "paid",
  REFUNDED: "refunded",
  FREE: "free",
});

module.exports = { BOOKING_STATUS, ACTIVE_BOOKING_STATUSES, PAYMENT_STATUS };
