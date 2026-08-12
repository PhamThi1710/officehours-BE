const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const db = require("../models/index");
const authConfig = require("../config/auth.config");
const { isEduEmail } = require("../utils/eduEmail");
const { signAccessToken, generateRefreshToken, hashToken } = require("../utils/authTokens");
const { ROLES, SELF_REGISTERABLE_ROLES } = require("../constants/roles");

const User = db.User;
const RefreshToken = db.RefreshToken;
const googleClient = new OAuth2Client(authConfig.googleClientId);

async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();

  await RefreshToken.create({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return { accessToken, refreshToken };
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    is_edu_email: user.is_edu_email,
  };
}

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { email, password, full_name, role } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ message: "email, password and full_name are required" });
    }

    if (!SELF_REGISTERABLE_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${SELF_REGISTERABLE_ROLES.join(", ")}` });
    }

    if (!isEduEmail(email)) {
      return res.status(400).json({ message: "A valid .edu email is required to register" });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password_hash: passwordHash,
      full_name,
      role,
      auth_provider: "local",
      is_edu_email: true,
    });

    const tokens = await issueTokenPair(user);
    return res.status(201).json({ user: toPublicUser(user), ...tokens });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !user.password_hash) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const tokens = await issueTokenPair(user);
    return res.json({ user: toPublicUser(user), ...tokens });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/google
// body: { id_token, role } — role only used the first time this Google
// account signs in (i.e. when a new user row is created).
exports.googleAuth = async (req, res) => {
  try {
    const { id_token, role } = req.body;
    if (!id_token) {
      return res.status(400).json({ message: "id_token is required" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: authConfig.googleClientId,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!isEduEmail(email)) {
      return res.status(400).json({ message: "A valid .edu email is required" });
    }

    let user = await User.findOne({ where: { google_id: googleId } });

    if (!user) {
      user = await User.findOne({ where: { email } });
      if (user) {
        // Existing local account signing in with Google for the first time.
        user.google_id = googleId;
        user.auth_provider = "google";
        await user.save();
      } else {
        if (!SELF_REGISTERABLE_ROLES.includes(role)) {
          return res.status(400).json({ message: `role must be one of: ${SELF_REGISTERABLE_ROLES.join(", ")}` });
        }
        user = await User.create({
          email,
          full_name: name,
          avatar_url: picture,
          role,
          auth_provider: "google",
          google_id: googleId,
          is_edu_email: true,
          is_email_verified: true,
        });
      }
    }

    const tokens = await issueTokenPair(user);
    return res.json({ user: toPublicUser(user), ...tokens });
  } catch (err) {
    return res.status(401).json({ message: "Google authentication failed" });
  }
};

// POST /api/auth/refresh
// Rotates the refresh token on every use: the old one is revoked and a new
// one issued, so a stolen-but-unused token becomes worthless the moment the
// legitimate client refreshes again.
exports.refresh = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ message: "refresh_token is required" });
    }

    const tokenHash = hashToken(refresh_token);
    const stored = await RefreshToken.findOne({ where: { token_hash: tokenHash } });

    if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
      return res.status(401).json({ message: "Refresh token is invalid or expired" });
    }

    const user = await User.findByPk(stored.user_id);
    if (!user) {
      return res.status(401).json({ message: "Refresh token is invalid or expired" });
    }

    stored.revoked_at = new Date();
    await stored.save();

    const tokens = await issueTokenPair(user);
    return res.json({ user: toPublicUser(user), ...tokens });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      const tokenHash = hashToken(refresh_token);
      await RefreshToken.update(
        { revoked_at: new Date() },
        { where: { token_hash: tokenHash, revoked_at: null } }
      );
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/me
exports.me = async (req, res) => {
  try {
    const user = await User.findByPk(req.authUser.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
