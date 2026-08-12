"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("bookings", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      student_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      professor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "professor_profiles", key: "id" },
        onDelete: "CASCADE",
      },
      start_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      end_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("pending", "confirmed", "completed", "cancelled", "no_show"),
        allowNull: false,
        defaultValue: "pending",
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      payment_status: {
        type: Sequelize.ENUM("unpaid", "paid", "refunded", "free"),
        allowNull: false,
        defaultValue: "unpaid",
      },
      video_room_slug: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      cancelled_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      cancel_reason: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("bookings", ["student_id"]);
    await queryInterface.addIndex("bookings", ["professor_id", "start_at"]);

    // The actual double-booking guard: only one pending/confirmed booking can
    // hold a given (professor, start_at) at a time. Cancelled/completed rows
    // are excluded so a freed-up or past slot can be booked again. A plain
    // (non-partial) unique index would wrongly block that.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uniq_active_booking_per_slot
      ON bookings (professor_id, start_at)
      WHERE status IN ('pending', 'confirmed');
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("bookings");
  },
};
