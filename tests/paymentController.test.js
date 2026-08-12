const { PassThrough } = require("stream");

const mockSessionsCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  }))
);

jest.mock("../models/index", () => ({
  Booking: { findByPk: jest.fn(), update: jest.fn() },
  Payment: { findOne: jest.fn(), create: jest.fn() },
  ProfessorProfile: {},
  User: {},
}));
jest.mock("../utils/mailer");

const db = require("../models/index");
const mailer = require("../utils/mailer");
const paymentController = require("../controllers/payment.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

function makeStreamRes() {
  const res = new PassThrough();
  res.setHeader = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const PENDING_UNPAID_BOOKING = {
  id: "booking-1",
  student_id: "student-1",
  status: "pending",
  payment_status: "unpaid",
  price: 25,
  professor: { id: "profile-1", user_id: "prof-user-1", headline: "Algorithms", user: { full_name: "Prof X" } },
  student: { full_name: "Student Y", email: "y@school.edu" },
  createdAt: new Date("2026-08-12T00:00:00Z"),
  start_at: new Date("2026-08-17T09:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("paymentController.createCheckoutSession", () => {
  it("404s when the booking doesn't exist", async () => {
    db.Booking.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await paymentController.createCheckoutSession(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("403s a student who doesn't own the booking", async () => {
    db.Booking.findByPk.mockResolvedValue(PENDING_UNPAID_BOOKING);
    const req = { params: { id: "booking-1" }, authUser: { id: "someone-else" } };
    const res = makeRes();

    await paymentController.createCheckoutSession(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("400s a booking that isn't pending/unpaid", async () => {
    db.Booking.findByPk.mockResolvedValue({ ...PENDING_UNPAID_BOOKING, status: "confirmed", payment_status: "paid" });
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await paymentController.createCheckoutSession(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("400s a free booking (nothing to check out)", async () => {
    db.Booking.findByPk.mockResolvedValue({ ...PENDING_UNPAID_BOOKING, price: 0 });
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await paymentController.createCheckoutSession(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a Stripe session and a new Payment row on first checkout", async () => {
    db.Booking.findByPk.mockResolvedValue(PENDING_UNPAID_BOOKING);
    db.Payment.findOne.mockResolvedValue(null);
    mockSessionsCreate.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/cs_test_123" });

    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await paymentController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "payment", metadata: { booking_id: "booking-1" } })
    );
    expect(db.Payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ booking_id: "booking-1", stripe_checkout_session_id: "cs_test_123", amount: 25 })
    );
    expect(res.json).toHaveBeenCalledWith({ checkout_url: "https://checkout.stripe.com/cs_test_123" });
  });

  it("reuses and updates the existing Payment row on a retried checkout", async () => {
    db.Booking.findByPk.mockResolvedValue(PENDING_UNPAID_BOOKING);
    const existingPayment = { stripe_checkout_session_id: "cs_old", status: "pending", save: jest.fn().mockResolvedValue() };
    db.Payment.findOne.mockResolvedValue(existingPayment);
    mockSessionsCreate.mockResolvedValue({ id: "cs_test_new", url: "https://checkout.stripe.com/cs_test_new" });

    const req = { params: { id: "booking-1" }, authUser: { id: "student-1" } };
    const res = makeRes();

    await paymentController.createCheckoutSession(req, res);

    expect(db.Payment.create).not.toHaveBeenCalled();
    expect(existingPayment.stripe_checkout_session_id).toBe("cs_test_new");
    expect(existingPayment.save).toHaveBeenCalled();
  });
});

describe("paymentController.handleWebhook", () => {
  it("400s on an invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const req = { headers: { "stripe-signature": "bad" }, rawBody: Buffer.from("{}") };
    const res = makeRes();

    await paymentController.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.Booking.findByPk).not.toHaveBeenCalled();
  });

  it("marks the payment paid, confirms the booking, and emails both parties on checkout.session.completed", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", payment_intent: "pi_123" } },
    });
    const payment = { booking_id: "booking-1", status: "pending", save: jest.fn().mockResolvedValue() };
    db.Payment.findOne.mockResolvedValue(payment);
    const booking = {
      ...PENDING_UNPAID_BOOKING,
      professor: { id: "profile-1", user_id: "prof-user-1", user: { full_name: "Prof X", email: "profx@school.edu" } },
      student: { full_name: "Student Y", email: "y@school.edu" },
      save: jest.fn().mockResolvedValue(),
    };
    db.Booking.findByPk.mockResolvedValue(booking);

    const req = { headers: {}, rawBody: Buffer.from("{}") };
    const res = makeRes();

    await paymentController.handleWebhook(req, res);

    expect(payment.status).toBe("paid");
    expect(payment.stripe_payment_intent_id).toBe("pi_123");
    expect(booking.status).toBe("confirmed");
    expect(booking.payment_status).toBe("paid");
    expect(booking.save).toHaveBeenCalled();
    expect(mailer.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "y@school.edu" }));
    expect(mailer.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "profx@school.edu" }));
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("is idempotent — a session already marked paid is not reprocessed", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", payment_intent: "pi_123" } },
    });
    const payment = { booking_id: "booking-1", status: "paid", save: jest.fn().mockResolvedValue() };
    db.Payment.findOne.mockResolvedValue(payment);

    const req = { headers: {}, rawBody: Buffer.from("{}") };
    const res = makeRes();

    await paymentController.handleWebhook(req, res);

    expect(payment.save).not.toHaveBeenCalled();
    expect(db.Booking.findByPk).not.toHaveBeenCalled();
    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });

  it("ignores event types it doesn't handle", async () => {
    mockConstructEvent.mockReturnValue({ type: "payment_intent.created", data: { object: {} } });
    const req = { headers: {}, rawBody: Buffer.from("{}") };
    const res = makeRes();

    await paymentController.handleWebhook(req, res);

    expect(db.Booking.findByPk).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});

describe("paymentController.getInvoice", () => {
  it("404s when the booking doesn't exist", async () => {
    db.Booking.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" }, authUser: { id: "student-1", role: "student" } };
    const res = makeRes();

    await paymentController.getInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403s a user with no relation to the booking", async () => {
    db.Booking.findByPk.mockResolvedValue(PENDING_UNPAID_BOOKING);
    const req = { params: { id: "booking-1" }, authUser: { id: "someone-else", role: "student" } };
    const res = makeRes();

    await paymentController.getInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("400s when the booking hasn't been paid (and isn't free)", async () => {
    db.Booking.findByPk.mockResolvedValue(PENDING_UNPAID_BOOKING);
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1", role: "student" } };
    const res = makeRes();

    await paymentController.getInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("streams a PDF with the right headers for a paid booking", async () => {
    db.Booking.findByPk.mockResolvedValue({ ...PENDING_UNPAID_BOOKING, payment_status: "paid" });
    const req = { params: { id: "booking-1" }, authUser: { id: "student-1", role: "student" } };
    const res = makeStreamRes();

    await paymentController.getInvoice(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", expect.stringContaining("invoice-booking-1.pdf"));
  });
});
