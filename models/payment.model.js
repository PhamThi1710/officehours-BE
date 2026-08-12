const { PAYMENT_RECORD_STATUS } = require("../constants/paymentRecordStatus");

module.exports = (sequelize, Sequelize) => {
  const Payment = sequelize.define(
    "payment",
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
      stripe_checkout_session_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      stripe_payment_intent_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "usd",
      },
      status: {
        type: Sequelize.ENUM(...Object.values(PAYMENT_RECORD_STATUS)),
        allowNull: false,
        defaultValue: PAYMENT_RECORD_STATUS.PENDING,
      },
    },
    {
      tableName: "payments",
      underscored: true,
    }
  );

  return Payment;
};
