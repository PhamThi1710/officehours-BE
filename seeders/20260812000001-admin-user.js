"use strict";
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");

module.exports = {
  up: async (queryInterface) => {
    const passwordHash = await bcrypt.hash(
      process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!",
      10
    );

    await queryInterface.bulkInsert("users", [
      {
        id: randomUUID(),
        email: process.env.SEED_ADMIN_EMAIL || "admin@officehours.dev",
        password_hash: passwordHash,
        role: "admin",
        full_name: "OfficeHours Admin",
        auth_provider: "local",
        is_edu_email: false,
        is_email_verified: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete("users", { role: "admin" });
  },
};
