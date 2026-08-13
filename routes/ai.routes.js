const express = require("express");
const aiController = require("../controllers/ai.controller");

module.exports = (app) => {
  const router = express.Router();

  router.post("/recommend-professor", aiController.recommendProfessor);

  app.use("/api/ai", router);
};
