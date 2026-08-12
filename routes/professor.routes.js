const express = require("express");
const professorController = require("../controllers/professor.controller");
const { verifyToken, isProfessor } = require("../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();

  router.get("/", professorController.list);
  router.get("/me", verifyToken, isProfessor, professorController.getMe);
  router.post("/apply", verifyToken, isProfessor, professorController.apply);
  router.patch("/me", verifyToken, isProfessor, professorController.updateMe);
  router.get("/:id", professorController.getById);

  app.use("/api/professors", router);
};
