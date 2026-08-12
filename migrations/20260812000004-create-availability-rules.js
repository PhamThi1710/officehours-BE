"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("availability_rules", {
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
      day_of_week: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      specific_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      start_time: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      end_time: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      slot_duration_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30,
      },
      valid_from: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      valid_until: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex("availability_rules", ["professor_id"]);

    // Exactly one of day_of_week (recurring) / specific_date (one-off) must be set.
    await queryInterface.sequelize.query(`
      ALTER TABLE availability_rules
      ADD CONSTRAINT chk_availability_rules_one_date_type
      CHECK (
        (day_of_week IS NOT NULL AND specific_date IS NULL)
        OR (day_of_week IS NULL AND specific_date IS NOT NULL)
      );
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("availability_rules");
  },
};
