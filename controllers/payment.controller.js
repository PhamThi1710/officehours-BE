const path = require("path");
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

    renderInvoice(res, booking);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const FONTS_DIR = path.join(__dirname, "..", "assets", "fonts");
const COLOR = {
  ink: "#111827",
  muted: "#6b7280",
  faint: "#9ca3af",
  line: "#e5e7eb",
  brand: "#7c3aed",
  brandInk: "#4c1d95",
  onBrand: "#ffffff",
  onBrandMuted: "#ddd6fe",
};

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2;
const COL_MID = PAGE_MARGIN + CONTENT_WIDTH / 2 + 13;

function eyebrow(doc, text, x, y, opts = {}) {
  doc.font("Inter-SemiBold").fontSize(8).fillColor(opts.color || COLOR.muted).text(text, x, y, {
    characterSpacing: 0.8,
    ...opts,
  });
}

function divider(doc, y, x1 = PAGE_MARGIN, x2 = PAGE_MARGIN + CONTENT_WIDTH) {
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(1).strokeColor(COLOR.line).stroke();
}

function formatDateTime(date) {
  return date.toLocaleString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

function formatDate(date) {
  return date.toLocaleString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(date) {
  return date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
}

function renderInvoice(res, booking) {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "LETTER" });
  doc.pipe(res);

  doc.registerFont("Inter", path.join(FONTS_DIR, "Inter-Regular.ttf"));
  doc.registerFont("Inter-Medium", path.join(FONTS_DIR, "Inter-Medium.ttf"));
  doc.registerFont("Inter-SemiBold", path.join(FONTS_DIR, "Inter-SemiBold.ttf"));
  doc.registerFont("Inter-Bold", path.join(FONTS_DIR, "Inter-Bold.ttf"));

  const price = Number(booking.price);
  const isFree = price === 0;
  const issuedAt = new Date(booking.createdAt);
  const startAt = new Date(booking.start_at);
  const endAt = new Date(booking.end_at);
  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  const durationLabel = durationMinutes >= 60 ? `${(durationMinutes / 60).toFixed(durationMinutes % 60 ? 1 : 0)} hr` : `${durationMinutes} min`;

  // --- Header ---
  doc.font("Inter-Bold").fontSize(22).fillColor(COLOR.ink).text("OfficeHours", PAGE_MARGIN, PAGE_MARGIN);
  eyebrow(doc, "TUTORING & OFFICE-HOUR SESSIONS", PAGE_MARGIN, PAGE_MARGIN + 27);

  doc.font("Inter-Bold").fontSize(22).fillColor(COLOR.brand).text("Invoice", PAGE_MARGIN, PAGE_MARGIN, {
    width: CONTENT_WIDTH,
    align: "right",
  });
  eyebrow(doc, isFree ? "FREE SESSION" : "PAID IN FULL", PAGE_MARGIN, PAGE_MARGIN + 27, {
    width: CONTENT_WIDTH,
    align: "right",
  });

  let y = PAGE_MARGIN + 55;
  divider(doc, y);
  y += 18;

  // --- Invoice number / issued ---
  eyebrow(doc, "INVOICE NUMBER", PAGE_MARGIN, y);
  eyebrow(doc, "ISSUED", COL_MID, y);
  y += 13;
  doc.font("Inter-Medium").fontSize(10.5).fillColor(COLOR.ink).text(booking.id, PAGE_MARGIN, y, { width: COL_MID - PAGE_MARGIN - 20 });
  doc.font("Inter-Medium").fontSize(10.5).fillColor(COLOR.ink).text(formatDateTime(issuedAt), COL_MID, y);
  y += 32;
  divider(doc, y);
  y += 18;

  // --- Billed to / instructor ---
  eyebrow(doc, "BILLED TO", PAGE_MARGIN, y);
  eyebrow(doc, "INSTRUCTOR", COL_MID, y);
  y += 14;
  doc.font("Inter-SemiBold").fontSize(12).fillColor(COLOR.ink).text(booking.student?.full_name || "—", PAGE_MARGIN, y, { width: COL_MID - PAGE_MARGIN - 20 });
  doc.font("Inter-SemiBold").fontSize(12).fillColor(COLOR.ink).text(booking.professor?.user?.full_name || "—", COL_MID, y);
  y += 16;
  doc.font("Inter").fontSize(9.5).fillColor(COLOR.muted).text(booking.student?.email || "", PAGE_MARGIN, y, { width: COL_MID - PAGE_MARGIN - 20 });
  doc.font("Inter").fontSize(9.5).fillColor(COLOR.muted).text(booking.professor?.headline || "", COL_MID, y, { width: PAGE_MARGIN + CONTENT_WIDTH - COL_MID });
  y += 38;
  divider(doc, y);
  y += 16;

  // --- Session table ---
  const AMOUNT_COL = PAGE_MARGIN + CONTENT_WIDTH - 100;
  const SCHEDULED_COL = COL_MID;

  eyebrow(doc, "SESSION", PAGE_MARGIN, y);
  eyebrow(doc, "SCHEDULED", SCHEDULED_COL, y);
  eyebrow(doc, "AMOUNT", AMOUNT_COL, y, { width: 100, align: "right" });
  y += 20;
  divider(doc, y - 6);

  doc.font("Inter-SemiBold").fontSize(11.5).fillColor(COLOR.ink).text(booking.professor?.headline || "Office hour session", PAGE_MARGIN, y, {
    width: SCHEDULED_COL - PAGE_MARGIN - 16,
  });
  doc.font("Inter").fontSize(9).fillColor(COLOR.muted).text(
    `${durationLabel} · one-to-one · with ${booking.professor?.user?.full_name || "professor"}`,
    PAGE_MARGIN,
    y + 16,
    { width: SCHEDULED_COL - PAGE_MARGIN - 16 }
  );

  doc.font("Inter-Medium").fontSize(10.5).fillColor(COLOR.ink).text(formatDate(startAt), SCHEDULED_COL, y);
  doc.font("Inter").fontSize(9).fillColor(COLOR.muted).text(formatTime(startAt), SCHEDULED_COL, y + 16);

  doc.font("Inter-SemiBold").fontSize(11.5).fillColor(COLOR.ink).text(isFree ? "Free" : `$${price.toFixed(2)}`, AMOUNT_COL, y, {
    width: 100,
    align: "right",
  });

  y += 46;
  divider(doc, y);
  y += 18;

  // --- Totals ---
  const totalsX = PAGE_MARGIN + CONTENT_WIDTH - 220;
  const totalsWidth = 220;
  doc.font("Inter").fontSize(10).fillColor(COLOR.muted).text("Subtotal", totalsX, y);
  doc.font("Inter-Medium").fontSize(10).fillColor(COLOR.ink).text(isFree ? "$0.00" : `$${price.toFixed(2)}`, totalsX, y, { width: totalsWidth, align: "right" });
  y += 20;
  doc.font("Inter").fontSize(10).fillColor(COLOR.muted).text("Platform fee", totalsX, y);
  doc.font("Inter-Medium").fontSize(10).fillColor(COLOR.ink).text("$0.00", totalsX, y, { width: totalsWidth, align: "right" });
  y += 22;
  divider(doc, y, totalsX, totalsX + totalsWidth);
  y += 14;
  eyebrow(doc, isFree ? "TOTAL" : "TOTAL PAID", totalsX, y + 6);
  doc.font("Inter-Bold").fontSize(20).fillColor(COLOR.brand).text(isFree ? "$0.00" : `$${price.toFixed(2)}`, totalsX, y - 2, {
    width: totalsWidth,
    align: "right",
  });

  // --- Status banner ---
  const bannerY = 590;
  const bannerHeight = 92;
  doc.roundedRect(PAGE_MARGIN, bannerY, CONTENT_WIDTH, bannerHeight, 12).fill(COLOR.brand);

  doc.font("Inter-Bold").fontSize(15).fillColor(COLOR.onBrand).text(
    isFree ? "Free session — no payment needed" : "Paid — no action needed",
    PAGE_MARGIN + 24,
    bannerY + 24
  );
  const banterSubtext = isFree
    ? `Confirmed ${formatDate(issuedAt)}`
    : `Settled ${formatDate(issuedAt)} via Stripe Checkout (test mode) · Receipt sent to ${booking.student?.email || "student"}`;
  doc.font("Inter").fontSize(9.5).fillColor(COLOR.onBrandMuted).text(banterSubtext, PAGE_MARGIN + 24, bannerY + 47, {
    width: CONTENT_WIDTH - 150,
  });

  doc
    .roundedRect(PAGE_MARGIN + CONTENT_WIDTH - 96, bannerY + 30, 72, 30, 6)
    .lineWidth(1.2)
    .strokeColor(COLOR.onBrand)
    .stroke();
  doc.font("Inter-SemiBold").fontSize(10).fillColor(COLOR.onBrand).text(isFree ? "FREE" : "PAID", PAGE_MARGIN + CONTENT_WIDTH - 96, bannerY + 40, {
    width: 72,
    align: "center",
    characterSpacing: 1,
  });

  // --- Footer ---
  const footerY = 730;
  doc.font("Inter").fontSize(8.5).fillColor(COLOR.faint).text("OfficeHours · portfolio project — Stripe payments run in test mode", PAGE_MARGIN, footerY);
  doc.font("Inter").fontSize(8.5).fillColor(COLOR.faint).text(`Invoice ${booking.id.slice(0, 8)} · Page 1 of 1`, PAGE_MARGIN, footerY, {
    width: CONTENT_WIDTH,
    align: "right",
  });

  doc.end();
}
