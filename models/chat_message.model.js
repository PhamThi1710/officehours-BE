module.exports = (sequelize, Sequelize) => {
  const ChatMessage = sequelize.define(
    "chat_message",
    {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      sender_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
    },
    {
      tableName: "chat_messages",
      underscored: true,
      updatedAt: false,
    }
  );

  return ChatMessage;
};
