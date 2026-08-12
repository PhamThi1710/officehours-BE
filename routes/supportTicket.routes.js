const express = require("express");
const supportTicketController = require("../controllers/supportTicket.controller");
const { verifyToken, attachUserIfPresent } = require("../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();
  router.post("/", attachUserIfPresent, supportTicketController.create);
  router.get("/me", verifyToken, supportTicketController.listMine);
  app.use("/api/support-tickets", router);
};
