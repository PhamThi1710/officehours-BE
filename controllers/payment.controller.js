const Stripe = require("stripe");
const PDFDocument = require("pdfkit");
const db = require("../models/index");
const { ROLES } = require("../constants/roles");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/bookingStatus");
const { PAYMENT_RECORD_STATUS } = require("../constants/paymentRecordStatus");
const { sendEmail } = require("../utils/mailer");
const { studentPaymentSuccessEmail, professorBookingConfirmedEmail } = require("../utils/emailTemplates");

const Booking = db.Booking;
const Payment = db.Payment;
const ProfessorProfile = db.ProfessorProfile;
const User = db.User;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

const BOOKING_WITH_PARTIES = [
  { model: ProfessorProfile, as: "professor", include: [{ model: User, as: "user" }] },
  { model: User, as: "student" },
];

// POST /api/bookings/:id/checkout-session — student (owner) only. Creates a
// Stripe test-mode Checkout Session for a priced, still-unpaid booking.
// Re-usable on retry: a Payment row already exists for this booking, its
// session id just gets refreshed.
exports.createCheckoutSession = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: BOOKING_WITH_PARTIES });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.student_id !== req.authUser.id) {
      return res.status(403).json({ message: "Not allowed to pay for this booking" });
    }
    if (booking.status !== BOOKING_STATUS.PENDING || booking.payment_status !== PAYMENT_STATUS.UNPAID) {
      return res.status(400).json({ message: "This booking isn't awaiting payment" });
    }
    if (Number(booking.price) <= 0) {
      return res.status(400).json({ message: "This booking is free and needs no checkout session" });
    }

    const professorName = booking.professor?.user?.full_name || "professor";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(booking.price) * 100),
            product_data: { name: `OfficeHours session with ${professorName}` },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/bookings/${booking.id}?checkout=success`,
      cancel_url: `${process.env.FRONTEND_URL}/bookings/${booking.id}?checkout=cancelled`,
      metadata: { booking_id: booking.id },
    });

    let payment = await Payment.findOne({ where: { booking_id: booking.id } });
    if (payment) {
      payment.stripe_checkout_session_id = session.id;
      payment.status = PAYMENT_RECORD_STATUS.PENDING;
      await payment.save();
    } else {
      payment = await Payment.create({
        booking_id: booking.id,
        stripe_checkout_session_id: session.id,
        amount: booking.price,
        currency: "usd",
        status: PAYMENT_RECORD_STATUS.PENDING,
      });
    }

    return res.json({ checkout_url: session.url });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/webhooks/stripe — no JWT; authenticity comes from the Stripe
// signature instead. Requires the raw request body (see server.js), which
// is why this route must not run through the JSON body parser first.
exports.handleWebhook = async (req, res) => {
  let event;
  try {
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const payment = await Payment.findOne({ where: { stripe_checkout_session_id: session.id } });

      // Idempotent: Stripe retries webhook delivery, so a session already
      // marked paid must not be processed twice.
      if (payment && payment.status !== PAYMENT_RECORD_STATUS.PAID) {
        payment.status = PAYMENT_RECORD_STATUS.PAID;
        payment.stripe_payment_intent_id = session.payment_intent;
        await payment.save();

        const booking = await Booking.findByPk(payment.booking_id, { include: BOOKING_WITH_PARTIES });
        if (booking) {
          booking.status = BOOKING_STATUS.CONFIRMED;
          booking.payment_status = PAYMENT_STATUS.PAID;
          await booking.save();

          notifyPaymentSuccess(booking).catch((err) => {
            console.error("[email] payment-success notification failed:", err.message);
          });
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Fire-and-forget, same reasoning as booking.controller.js#notifyBookingCreated.
async function notifyPaymentSuccess(booking) {
  const professorName = booking.professor?.user?.full_name || "the professor";
  const studentName = booking.student?.full_name || "the student";
  await Promise.all([
    sendEmail({ to: booking.student?.email, ...studentPaymentSuccessEmail({ booking, professorName }) }),
    sendEmail({ to: booking.professor?.user?.email, ...professorBookingConfirmedEmail({ booking, studentName }) }),
  ]);
}

// GET /api/bookings/:id/invoice — owner student/professor/admin only, and
// only once the booking is actually paid (or free). Generated on the fly
// with pdfkit and streamed straight to the response — nothing is stored.
exports.getInvoice = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: BOOKING_WITH_PARTIES });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isOwnerStudent = booking.student_id === req.authUser.id;
    const isOwnerProfessor = booking.professor && booking.professor.user_id === req.authUser.id;
    const isAdmin = req.authUser.role === ROLES.ADMIN;
    if (!isOwnerStudent && !isOwnerProfessor && !isAdmin) {
      return res.status(403).json({ message: "Not allowed to access this invoice" });
    }

    if (![PAYMENT_STATUS.PAID, PAYMENT_STATUS.FREE].includes(booking.payment_status)) {
      return res.status(400).json({ message: "Invoice is only available once a booking is paid or free" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${booking.id}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text("OfficeHours", { align: "left" });
    doc.fontSize(10).fillColor("#555").text("Invoice", { align: "left" });
    doc.moveDown(2);

    doc.fillColor("#000").fontSize(10);
    doc.text(`Invoice #: ${booking.id}`);
    doc.text(`Issued: ${new Date(booking.createdAt).toUTCString()}`);
    doc.moveDown();

    doc.text(`Student: ${booking.student?.full_name || ""} (${booking.student?.email || ""})`);
    doc.text(`Professor: ${booking.professor?.user?.full_name || ""}`);
    doc.text(`Session: ${booking.professor?.headline || ""}`);
    doc.text(`Scheduled: ${new Date(booking.start_at).toUTCString()}`);
    doc.moveDown();

    const isFree = Number(booking.price) === 0;
    doc.fontSize(14).text(`Amount: $${Number(booking.price).toFixed(2)}${isFree ? " (free session)" : ""}`);
    doc.fontSize(10).fillColor("#555").text(`Payment status: ${booking.payment_status}`);

    doc.end();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
