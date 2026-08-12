module.exports = {
  accessTokenSecret: process.env.JWT_ACCESS_SECRET,
  accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  refreshTokenExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 30),
  googleClientId: process.env.GOOGLE_CLIENT_ID,
};
