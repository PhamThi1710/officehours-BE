const express = require("express");
const professorAdminController = require("../../controllers/admin/professor-admin.controller");
const { verifyToken, isAdmin } = require("../../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();
  router.use(verifyToken, isAdmin);

  router.get("/", professorAdminController.list);
  router.get("/:id", professorAdminController.getById);
  router.patch("/:id/approve", professorAdminController.approve);
  router.patch("/:id/reject", professorAdminController.reject);

  app.use("/api/admin/professors", router);
};
