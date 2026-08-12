const { PROFESSOR_STATUS } = require("../constants/professorStatus");

module.exports = (sequelize, Sequelize) => {
  const ProfessorProfile = sequelize.define(
    "professor_profile",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
      },
      headline: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      subjects: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      price_per_session: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      session_duration_default: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30,
      },
      timezone: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "UTC",
      },
      status: {
        type: Sequelize.ENUM(...Object.values(PROFESSOR_STATUS)),
        allowNull: false,
        defaultValue: PROFESSOR_STATUS.PENDING,
      },
      rejection_reason: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      rating_avg: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_reviews: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_sessions: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "professor_profiles",
      underscored: true,
    }
  );

  return ProfessorProfile;
};
