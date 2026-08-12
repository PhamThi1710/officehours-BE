module.exports = (sequelize, Sequelize) => {
  const RefreshToken = sequelize.define(
    "refresh_token",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      token_hash: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "refresh_tokens",
      underscored: true,
      updatedAt: false,
    }
  );

  return RefreshToken;
};
