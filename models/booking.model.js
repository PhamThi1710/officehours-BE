const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/bookingStatus");

module.exports = (sequelize, Sequelize) => {
  const Booking = sequelize.define(
    "booking",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      student_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      professor_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      start_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      end_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(...Object.values(BOOKING_STATUS)),
        allowNull: false,
        defaultValue: BOOKING_STATUS.PENDING,
      },
      // Snapshot of the professor's price_per_session at booking time, so a
      // later price change never rewrites the cost of an existing booking.
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      payment_status: {
        type: Sequelize.ENUM(...Object.values(PAYMENT_STATUS)),
        allowNull: false,
        defaultValue: PAYMENT_STATUS.UNPAID,
      },
      video_room_slug: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      cancelled_by: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      cancel_reason: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      reminder_sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "bookings",
      underscored: true,
    }
  );

  return Booking;
};
