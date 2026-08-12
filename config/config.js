// sequelize-cli config (separate from db.config.js, which the running app
// uses) — cli only understands this exact {env: {...}} shape.
require("dotenv").config();

// See models/index.js for the full explanation — same fix needed here since
// sequelize-cli (migrate/seed) loads this file directly, not models/index.js.
require("dns").setDefaultResultOrder("ipv4first");
const net = require("net");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

const useSSL = (process.env.DB_SSL || "true") === "true";

const base = {
  use_env_variable: "DATABASE_URL",
  dialect: "postgres",
  dialectOptions: useSSL ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

module.exports = {
  development: base,
  test: base,
  production: base,
};
