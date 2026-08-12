const useSSL = (process.env.DB_SSL || "true") === "true";

module.exports = {
  url: process.env.DATABASE_URL,
  dialect: "postgres",
  dialectOptions: useSSL
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {},
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};
