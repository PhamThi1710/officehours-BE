module.exports = (sequelize, Sequelize) => {
  const AvailabilityRule = sequelize.define(
    "availability_rule",
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
      // Exactly one of day_of_week / specific_date is set (enforced by a DB
      // CHECK constraint, see the migration). 0 = Sunday .. 6 = Saturday,
      // matching JS Date#getDay().
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
    },
    {
      tableName: "availability_rules",
      underscored: true,
    }
  );

  return AvailabilityRule;
};
