const { PAYOUT_STATUS } = require("../constants/payoutStatus");

module.exports = (sequelize, Sequelize) => {
  const Payout = sequelize.define(
    "payout",
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
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(...Object.values(PAYOUT_STATUS)),
        allowNull: false,
        defaultValue: PAYOUT_STATUS.PENDING,
      },
      paid_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "payouts",
      underscored: true,
      updatedAt: false,
    }
  );

  return Payout;
};
