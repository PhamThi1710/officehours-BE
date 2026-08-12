const express = require("express");
const videoController = require("../controllers/video.controller");
const { verifyToken } = require("../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();
  router.get("/:id/video-room", verifyToken, videoController.getRoomInfo);
  app.use("/api/bookings", router);
};
