const express = require("express");
const bookingAdminController = require("../../controllers/admin/booking-admin.controller");
const { verifyToken, isAdmin } = require("../../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();
  router.use(verifyToken, isAdmin);

  router.get("/", bookingAdminController.list);

  app.use("/api/admin/bookings", router);
};
