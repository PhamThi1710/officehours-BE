const express = require("express");
const bookingController = require("../controllers/booking.controller");
const { verifyToken, isStudent, isProfessor } = require("../middleware/authJwt");

module.exports = (app) => {
  const bookingsRouter = express.Router();
  bookingsRouter.use(verifyToken);

  bookingsRouter.post("/", isStudent, bookingController.create);
  bookingsRouter.get("/me", isStudent, bookingController.listMine);
  bookingsRouter.get("/:id", bookingController.getById);
  bookingsRouter.patch("/:id/cancel", bookingController.cancel);
  bookingsRouter.patch("/:id/complete", bookingController.complete);

  app.use("/api/bookings", bookingsRouter);

  const professorBookingsRouter = express.Router();
  professorBookingsRouter.get("/me/bookings", verifyToken, isProfessor, bookingController.listForProfessor);

  app.use("/api/professors", professorBookingsRouter);
};
