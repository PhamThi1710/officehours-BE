const express = require("express");
const payoutController = require("../controllers/payout.controller");
const { verifyToken, isProfessor, isAdmin } = require("../middleware/authJwt");

module.exports = (app) => {
  const professorPayoutsRouter = express.Router();
  professorPayoutsRouter.get("/me/payouts", verifyToken, isProfessor, payoutController.listMine);
  app.use("/api/professors", professorPayoutsRouter);

  const adminPayoutsRouter = express.Router();
  adminPayoutsRouter.use(verifyToken, isAdmin);
  adminPayoutsRouter.get("/", payoutController.listAll);
  adminPayoutsRouter.patch("/:id/mark-paid", payoutController.markPaid);
  app.use("/api/admin/payouts", adminPayoutsRouter);
};
