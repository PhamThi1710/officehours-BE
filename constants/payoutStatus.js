// Simulated payout ledger — no real money ever moves. "paid_simulated" just
// means an admin marked it as disbursed.
const PAYOUT_STATUS = Object.freeze({
  PENDING: "pending",
  PAID_SIMULATED: "paid_simulated",
});

module.exports = { PAYOUT_STATUS };
