const { SUPPORT_TICKET_STATUS } = require("../constants/supportTicketStatus");

module.exports = (sequelize, Sequelize) => {
  const SupportTicket = sequelize.define(
    "support_ticket",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true, // null for guest submissions
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      subject: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(...Object.values(SUPPORT_TICKET_STATUS)),
        allowNull: false,
        defaultValue: SUPPORT_TICKET_STATUS.OPEN,
      },
      admin_reply: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      replied_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "support_tickets",
      underscored: true,
    }
  );

  return SupportTicket;
};
