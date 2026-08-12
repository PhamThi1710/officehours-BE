require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../models/index");
const { waitForDb } = require("./waitForDb");

(async () => {
  try {
    await waitForDb(db.sequelize);

    const email = process.env.SEED_ADMIN_EMAIL || "admin@officehours.dev";
    const existing = await db.User.findOne({ where: { email } });
    if (existing) {
      console.log("ALREADY_EXISTS", existing.email, existing.id);
      process.exit(0);
    }
    const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!", 10);
    const admin = await db.User.create({
      email,
      password_hash: passwordHash,
      role: "admin",
      full_name: "OfficeHours Admin",
      auth_provider: "local",
      is_edu_email: false,
      is_email_verified: true,
    });
    console.log("CREATED", admin.email, admin.id);
    process.exit(0);
  } catch (err) {
    console.error("SEED_ERROR", err.name, err.message);
    process.exit(1);
  }
})();
