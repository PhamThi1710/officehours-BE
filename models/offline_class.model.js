module.exports = (sequelize, Sequelize) => {
  const OfflineClass = sequelize.define(
    "offline_class",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      professor_id: {
        type: Sequelize.UUID,
        allowNull: false,
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
      // Set whenever address is (re-)geocoded — lets an edit that doesn't
      // touch address skip calling Nominatim again, see utils/geocoding.js.
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
      // Exactly one of day_of_week / specific_date is set (enforced by a DB
      // CHECK constraint, see the migration) — same convention as
      // AvailabilityRule. 0 = Sunday .. 6 = Saturday.
      day_of_week: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      specific_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      start_time: {
        type: Sequelize.STRING, // "HH:mm", wall-clock time in the professor's timezone
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
    },
    {
      tableName: "offline_classes",
      underscored: true,
    }
  );

  return OfflineClass;
};
