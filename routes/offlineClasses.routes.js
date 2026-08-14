const express = require("express");
const offlineClassesController = require("../controllers/offlineClasses.controller");
const { verifyToken, isProfessor, isStudent } = require("../middleware/authJwt");

module.exports = (app) => {
  const router = express.Router();

  router.post("/", verifyToken, isProfessor, offlineClassesController.create);
  router.get("/mine", verifyToken, isProfessor, offlineClassesController.listMine);
  router.get("/nearby", offlineClassesController.nearby);
  router.get("/:id", offlineClassesController.getById);
  router.patch("/:id", verifyToken, isProfessor, offlineClassesController.update);
  router.delete("/:id", verifyToken, isProfessor, offlineClassesController.remove);
  router.post("/:id/book", verifyToken, isStudent, offlineClassesController.book);

  app.use("/api/offline-classes", router);

  // Shared geocoding lookup — used by the professor's live address pin
  // preview and the student's manual city/address search fallback.
  app.get("/api/geocode", offlineClassesController.geocode);
};
