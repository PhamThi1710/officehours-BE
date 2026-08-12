const ROLES = Object.freeze({
  STUDENT: "student",
  PROFESSOR: "professor",
  ADMIN: "admin",
});

const SELF_REGISTERABLE_ROLES = [ROLES.STUDENT, ROLES.PROFESSOR];

module.exports = { ROLES, SELF_REGISTERABLE_ROLES };
