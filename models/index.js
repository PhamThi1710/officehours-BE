// Some environments (WSL2 behind Windows' NAT is a common one) resolve a
// host to both A and AAAA records but have no actual outbound IPv6 route.
// The real fix here is disabling Node's "Happy Eyeballs" autoSelectFamily
// (net.setDefaultAutoSelectFamily, default true since Node 18.13): its
// racing/staggered multi-address connect attempts can end up ETIMEDOUT in
// this kind of environment even though a plain single-address connect to
// the exact same IP succeeds instantly — verified directly against Neon.
// ipv4first is kept as a harmless secondary safety net.
require("dns").setDefaultResultOrder("ipv4first");
const net = require("net");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

const { Sequelize } = require("sequelize");
const dbConfig = require("../config/db.config");

const sequelize = new Sequelize(dbConfig.url, {
  dialect: dbConfig.dialect,
  dialectOptions: dbConfig.dialectOptions,
  logging: dbConfig.logging,
  pool: dbConfig.pool,
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.User = require("./user.model")(sequelize, Sequelize);
db.RefreshToken = require("./refresh_token.model")(sequelize, Sequelize);
db.ProfessorProfile = require("./professor_profile.model")(sequelize, Sequelize);
db.AvailabilityRule = require("./availability_rule.model")(sequelize, Sequelize);
db.AvailabilityException = require("./availability_exception.model")(sequelize, Sequelize);
db.OfflineClass = require("./offline_class.model")(sequelize, Sequelize);
db.Booking = require("./booking.model")(sequelize, Sequelize);
db.Payment = require("./payment.model")(sequelize, Sequelize);
db.Payout = require("./payout.model")(sequelize, Sequelize);
db.Review = require("./review.model")(sequelize, Sequelize);
db.Faq = require("./faq.model")(sequelize, Sequelize);
db.SupportTicket = require("./support_ticket.model")(sequelize, Sequelize);
db.ChatMessage = require("./chat_message.model")(sequelize, Sequelize);

db.User.hasMany(db.RefreshToken, { foreignKey: "user_id", as: "refreshTokens" });
db.RefreshToken.belongsTo(db.User, { foreignKey: "user_id", as: "user" });

db.User.hasOne(db.ProfessorProfile, { foreignKey: "user_id", as: "professorProfile" });
db.ProfessorProfile.belongsTo(db.User, { foreignKey: "user_id", as: "user" });

db.ProfessorProfile.hasMany(db.AvailabilityRule, { foreignKey: "professor_id", as: "availabilityRules" });
db.AvailabilityRule.belongsTo(db.ProfessorProfile, { foreignKey: "professor_id", as: "professor" });

db.ProfessorProfile.hasMany(db.AvailabilityException, { foreignKey: "professor_id", as: "availabilityExceptions" });
db.AvailabilityException.belongsTo(db.ProfessorProfile, { foreignKey: "professor_id", as: "professor" });

db.ProfessorProfile.hasMany(db.OfflineClass, { foreignKey: "professor_id", as: "offlineClasses" });
db.OfflineClass.belongsTo(db.ProfessorProfile, { foreignKey: "professor_id", as: "professor" });

db.User.hasMany(db.Booking, { foreignKey: "student_id", as: "bookingsAsStudent" });
db.Booking.belongsTo(db.User, { foreignKey: "student_id", as: "student" });

db.ProfessorProfile.hasMany(db.Booking, { foreignKey: "professor_id", as: "bookings" });
db.Booking.belongsTo(db.ProfessorProfile, { foreignKey: "professor_id", as: "professor" });

db.OfflineClass.hasMany(db.Booking, { foreignKey: "offline_class_id", as: "bookings" });
db.Booking.belongsTo(db.OfflineClass, { foreignKey: "offline_class_id", as: "offlineClass" });

db.Booking.hasOne(db.Payment, { foreignKey: "booking_id", as: "payment" });
db.Payment.belongsTo(db.Booking, { foreignKey: "booking_id", as: "booking" });

db.ProfessorProfile.hasMany(db.Payout, { foreignKey: "professor_id", as: "payouts" });
db.Payout.belongsTo(db.ProfessorProfile, { foreignKey: "professor_id", as: "professor" });

db.Booking.hasOne(db.Payout, { foreignKey: "booking_id", as: "payout" });
db.Payout.belongsTo(db.Booking, { foreignKey: "booking_id", as: "booking" });

db.Booking.hasOne(db.Review, { foreignKey: "booking_id", as: "review" });
db.Review.belongsTo(db.Booking, { foreignKey: "booking_id", as: "booking" });

db.User.hasMany(db.Review, { foreignKey: "student_id", as: "reviewsAsStudent" });
db.Review.belongsTo(db.User, { foreignKey: "student_id", as: "student" });

db.ProfessorProfile.hasMany(db.Review, { foreignKey: "professor_id", as: "reviews" });
db.Review.belongsTo(db.ProfessorProfile, { foreignKey: "professor_id", as: "professor" });

db.User.hasMany(db.SupportTicket, { foreignKey: "user_id", as: "supportTickets" });
db.SupportTicket.belongsTo(db.User, { foreignKey: "user_id", as: "user" });

db.Booking.hasMany(db.ChatMessage, { foreignKey: "booking_id", as: "chatMessages" });
db.ChatMessage.belongsTo(db.Booking, { foreignKey: "booking_id", as: "booking" });

db.User.hasMany(db.ChatMessage, { foreignKey: "sender_id", as: "sentChatMessages" });
db.ChatMessage.belongsTo(db.User, { foreignKey: "sender_id", as: "sender" });

module.exports = db;
