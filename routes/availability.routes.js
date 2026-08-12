const express = require("express");
const availabilityController = require("../controllers/availability.controller");
const { verifyToken, isProfessor } = require("../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();

  router.post("/me/availability-rules", verifyToken, isProfessor, availabilityController.createRule);
  router.get("/me/availability-rules", verifyToken, isProfessor, availabilityController.listRules);
  router.delete("/me/availability-rules/:ruleId", verifyToken, isProfessor, availabilityController.deleteRule);

  router.post("/me/exceptions", verifyToken, isProfessor, availabilityController.createException);
  router.get("/me/exceptions", verifyToken, isProfessor, availabilityController.listExceptions);
  router.delete("/me/exceptions/:exceptionId", verifyToken, isProfessor, availabilityController.deleteException);

  router.get("/:id/slots", availabilityController.getSlots);

  app.use("/api/professors", router);
};
