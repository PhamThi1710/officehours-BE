const express = require("express");
const faqAdminController = require("../../controllers/admin/faq-admin.controller");
const { verifyToken, isAdmin } = require("../../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();
  router.use(verifyToken, isAdmin);

  router.get("/", faqAdminController.list);
  router.post("/", faqAdminController.create);
  router.patch("/:id", faqAdminController.update);
  router.delete("/:id", faqAdminController.remove);

  app.use("/api/admin/faqs", router);
};
