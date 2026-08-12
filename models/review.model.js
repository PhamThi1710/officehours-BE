module.exports = (sequelize, Sequelize) => {
  const Review = sequelize.define(
    "review",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
      },
      student_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      professor_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      rating: {
        type: Sequelize.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 5 },
      },
      comment: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "reviews",
      underscored: true,
    }
  );

  return Review;
};
