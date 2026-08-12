const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth.config");

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    authConfig.accessTokenSecret,
    { expiresIn: authConfig.accessTokenExpiresIn }
  );
}

// Refresh tokens are opaque random strings, not JWTs — only their SHA-256
// hash is stored, so a leaked DB dump alone can't be replayed as a token.
function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + authConfig.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000
  );
  return { token, tokenHash, expiresAt };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { signAccessToken, generateRefreshToken, hashToken };
