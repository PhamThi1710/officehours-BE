const express = require("express");
const paymentController = require("../controllers/payment.controller");
const { verifyToken, isStudent } = require("../middleware/authJwt");

module.exports = (app) => {
  const bookingsRouter = express.Router();
  bookingsRouter.post("/:id/checkout-session", verifyToken, isStudent, paymentController.createCheckoutSession);
  bookingsRouter.get("/:id/invoice", verifyToken, paymentController.getInvoice);
  app.use("/api/bookings", bookingsRouter);

  const webhooksRouter = express.Router();
  webhooksRouter.post("/stripe", paymentController.handleWebhook);
  app.use("/api/webhooks", webhooksRouter);
};
