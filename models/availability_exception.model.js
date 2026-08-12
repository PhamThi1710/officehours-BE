module.exports = (sequelize, Sequelize) => {
  const AvailabilityException = sequelize.define(
    "availability_exception",
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
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      reason: {
        type: Sequelize.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "availability_exceptions",
      underscored: true,
      updatedAt: false,
    }
  );

  return AvailabilityException;
};
