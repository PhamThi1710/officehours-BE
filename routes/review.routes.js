const express = require("express");
const reviewController = require("../controllers/review.controller");
const { verifyToken, isStudent } = require("../middleware/authJwt");

module.exports = (app) => {
  const bookingsRouter = express.Router();
  bookingsRouter.post("/:id/review", verifyToken, isStudent, reviewController.create);
  app.use("/api/bookings", bookingsRouter);

  const professorsRouter = express.Router();
  professorsRouter.get("/:id/reviews", reviewController.listForProfessor);
  app.use("/api/professors", professorsRouter);

  const reviewsRouter = express.Router();
  reviewsRouter.use(verifyToken);
  reviewsRouter.patch("/:id", reviewController.update);
  reviewsRouter.delete("/:id", reviewController.remove);
  app.use("/api/reviews", reviewsRouter);
};
