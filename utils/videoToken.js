const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth.config");

// Short-lived, single-purpose JWT scoped to one booking/user pair — handed
// out by GET /api/bookings/:id/video-room (an authenticated REST call that
// already checked the requester is a party to the booking) and then passed
// on the WebSocket upgrade query string, since a browser WebSocket can't
// send an Authorization header. Reuses JWT_ACCESS_SECRET rather than adding
// another env var; it can't be used against the regular API even if it
// leaked, since its payload shape (bookingId/userId) doesn't match what
// authJwt.verifyToken reads (sub/role/email).
const VIDEO_TOKEN_EXPIRES_IN = "5m";

function signVideoToken({ bookingId, userId }) {
  return jwt.sign({ bookingId, userId }, authConfig.accessTokenSecret, { expiresIn: VIDEO_TOKEN_EXPIRES_IN });
}

function verifyVideoToken(token) {
  const decoded = jwt.verify(token, authConfig.accessTokenSecret);
  return { bookingId: decoded.bookingId, userId: decoded.userId };
}

module.exports = { signVideoToken, verifyVideoToken };
