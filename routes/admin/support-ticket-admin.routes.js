const express = require("express");
const supportTicketAdminController = require("../../controllers/admin/support-ticket-admin.controller");
const { verifyToken, isAdmin } = require("../../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();
  router.use(verifyToken, isAdmin);

  router.get("/", supportTicketAdminController.list);
  router.get("/:id", supportTicketAdminController.getById);
  router.patch("/:id", supportTicketAdminController.update);

  app.use("/api/admin/support-tickets", router);
};
