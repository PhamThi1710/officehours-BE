"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("offline_classes", {
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
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      latitude: {
        type: Sequelize.DECIMAL(9, 6),
        allowNull: true,
      },
      longitude: {
        type: Sequelize.DECIMAL(9, 6),
        allowNull: true,
      },
      geocoded_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      capacity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
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

    await queryInterface.addIndex("offline_classes", ["professor_id"]);
    await queryInterface.addIndex("offline_classes", ["latitude", "longitude"]);

    // Same convention as availability_rules: exactly one of day_of_week
    // (recurring) / specific_date (one-off) must be set.
    await queryInterface.sequelize.query(`
      ALTER TABLE offline_classes
      ADD CONSTRAINT chk_offline_classes_one_date_type
      CHECK (
        (day_of_week IS NOT NULL AND specific_date IS NULL)
        OR (day_of_week IS NULL AND specific_date IS NOT NULL)
      );
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE offline_classes
      ADD CONSTRAINT chk_offline_classes_capacity_positive
      CHECK (capacity > 0);
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("offline_classes");
  },
};
