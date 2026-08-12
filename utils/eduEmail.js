// Accepts host.edu and host.edu.<cc> (e.g. .edu.vn, .edu.au) — no real
// registrar/MX lookup, this is a format check only per product decision.
const EDU_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.edu(\.[a-z]{2,})?$/i;

function isEduEmail(email) {
  return EDU_EMAIL_REGEX.test(String(email || "").trim());
}

module.exports = { isEduEmail, EDU_EMAIL_REGEX };
