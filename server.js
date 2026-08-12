require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
// Keeps the raw request body around (req.rawBody) alongside the parsed one,
// since Stripe webhook signature verification needs the exact bytes it sent.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.get("/health", (req, res) => res.json({ status: "ok" }));

require("./routes/auth.routes")(app);
require("./routes/professor.routes")(app);
require("./routes/availability.routes")(app);
require("./routes/booking.routes")(app);
require("./routes/payment.routes")(app);
require("./routes/payout.routes")(app);
require("./routes/review.routes")(app);
require("./routes/video.routes")(app);
require("./routes/faq.routes")(app);
require("./routes/supportTicket.routes")(app);
require("./routes/admin/professor-admin.routes")(app);
require("./routes/admin/report-admin.routes")(app);
require("./routes/admin/faq-admin.routes")(app);
require("./routes/admin/support-ticket-admin.routes")(app);
require("./routes/admin/booking-admin.routes")(app);
require("./routes/chatMessage.routes")(app);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => console.log(`OfficeHours API listening on port ${PORT}`));
  require("./ws/videoSignalling").attach(server);
  require("./ws/chatServer").attach(server);
  require("./jobs/bookingReminders.job").start();
}

module.exports = app;
