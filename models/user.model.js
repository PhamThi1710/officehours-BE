const { ROLES } = require("../constants/roles");

module.exports = (sequelize, Sequelize) => {
  const User = sequelize.define(
    "user",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: true, // null when auth_provider = 'google'
      },
      role: {
        type: Sequelize.ENUM(...Object.values(ROLES)),
        allowNull: false,
        defaultValue: ROLES.STUDENT,
      },
      full_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      avatar_url: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      auth_provider: {
        type: Sequelize.ENUM("local", "google"),
        allowNull: false,
        defaultValue: "local",
      },
      google_id: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },
      is_edu_email: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_email_verified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: "users",
      underscored: true,
    }
  );

  return User;
};
