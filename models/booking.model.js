const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/bookingStatus");
const { SESSION_TYPE } = require("../constants/sessionType");

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
      // Null for offline (in-person) bookings — there is no call to join.
      video_room_slug: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      session_type: {
        type: Sequelize.ENUM(...Object.values(SESSION_TYPE)),
        allowNull: false,
        defaultValue: SESSION_TYPE.VIDEO,
      },
      // Set only for session_type = "offline" — see offline_class.model.js.
      offline_class_id: {
        type: Sequelize.UUID,
        allowNull: true,
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
