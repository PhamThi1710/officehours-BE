const express = require("express");
const faqController = require("../controllers/faq.controller");

module.exports = (app) => {
  const router = express.Router();
  router.get("/", faqController.list);
  app.use("/api/faqs", router);
};
