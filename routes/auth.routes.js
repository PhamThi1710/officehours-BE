const express = require("express");
const authController = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();

  router.post("/register", authController.register);
  router.post("/login", authController.login);
  router.post("/google", authController.googleAuth);
  router.post("/refresh", authController.refresh);
  router.post("/logout", authController.logout);
  router.get("/me", verifyToken, authController.me);

  app.use("/api/auth", router);
};
