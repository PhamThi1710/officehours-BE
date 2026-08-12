const express = require("express");
const chatMessageController = require("../controllers/chatMessage.controller");
const { verifyToken } = require("../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();
  router.get("/:id/messages", verifyToken, chatMessageController.list);
  app.use("/api/bookings", router);
};
