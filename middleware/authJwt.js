const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth.config");
const { ROLES } = require("../constants/roles");

function verifyToken(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "No access token provided" });
  }

  jwt.verify(token, authConfig.accessTokenSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Access token is invalid or expired" });
    }
    req.authUser = { id: decoded.sub, role: decoded.role, email: decoded.email };
    next();
  });
}

// For endpoints open to guests that should still recognize a logged-in
// caller when possible (e.g. support tickets) — never blocks the request;
// a missing, malformed, or expired token just leaves req.authUser unset.
function attachUserIfPresent(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next();
  }

  jwt.verify(token, authConfig.accessTokenSecret, (err, decoded) => {
    if (!err) {
      req.authUser = { id: decoded.sub, role: decoded.role, email: decoded.email };
    }
    next();
  });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.authUser || !allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({ message: "Insufficient role for this resource" });
    }
    next();
  };
}

const isAdmin = requireRole(ROLES.ADMIN);
const isProfessor = requireRole(ROLES.PROFESSOR);
const isStudent = requireRole(ROLES.STUDENT);

function isSelfOrAdmin(paramName = "id") {
  return (req, res, next) => {
    if (req.authUser.role === ROLES.ADMIN || req.authUser.id === req.params[paramName]) {
      return next();
    }
    return res.status(403).json({ message: "Not allowed to access this resource" });
  };
}

module.exports = { verifyToken, attachUserIfPresent, requireRole, isAdmin, isProfessor, isStudent, isSelfOrAdmin };
