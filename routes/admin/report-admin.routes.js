const express = require("express");
const reportAdminController = require("../../controllers/admin/report-admin.controller");
const { verifyToken, isAdmin } = require("../../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();
  router.use(verifyToken, isAdmin);

  router.get("/bookings", reportAdminController.getBookingsReport);
  router.get("/revenue", reportAdminController.getRevenueReport);

  app.use("/api/admin/reports", router);
};
