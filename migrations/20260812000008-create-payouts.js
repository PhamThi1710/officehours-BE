"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("payouts", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      professor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "professor_profiles", key: "id" },
        onDelete: "CASCADE",
      },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "bookings", key: "id" },
        onDelete: "CASCADE",
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("pending", "paid_simulated"),
        allowNull: false,
        defaultValue: "pending",
      },
      paid_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("payouts", ["professor_id", "status"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("payouts");
  },
};
