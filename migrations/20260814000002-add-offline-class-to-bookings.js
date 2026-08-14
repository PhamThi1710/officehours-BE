"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("bookings", "offline_class_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "offline_classes", key: "id" },
      onDelete: "SET NULL",
    });

    await queryInterface.addColumn("bookings", "session_type", {
      type: Sequelize.ENUM("video", "offline"),
      allowNull: false,
      defaultValue: "video",
    });

    // Offline (in-person) bookings have no video call to join.
    await queryInterface.changeColumn("bookings", "video_room_slug", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Narrow the existing 1:1-slot exclusivity guard to video bookings only
    // — an offline class has a capacity and deliberately allows multiple
    // students to hold the same (professor_id, start_at); that limit is
    // enforced in the offline-classes booking controller instead, under a
    // row lock on the offline_classes row.
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS uniq_active_booking_per_slot;`);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uniq_active_video_booking_per_slot
      ON bookings (professor_id, start_at)
      WHERE status IN ('pending', 'confirmed') AND offline_class_id IS NULL;
    `);

    await queryInterface.addIndex("bookings", ["offline_class_id", "start_at"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex("bookings", ["offline_class_id", "start_at"]);

    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS uniq_active_video_booking_per_slot;`);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uniq_active_booking_per_slot
      ON bookings (professor_id, start_at)
      WHERE status IN ('pending', 'confirmed');
    `);

    await queryInterface.changeColumn("bookings", "video_room_slug", {
      type: Sequelize.STRING,
      allowNull: false,
    });

    await queryInterface.removeColumn("bookings", "session_type");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_bookings_session_type";`);
    await queryInterface.removeColumn("bookings", "offline_class_id");
  },
};
