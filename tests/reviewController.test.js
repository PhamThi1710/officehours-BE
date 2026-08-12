jest.mock("../models/index", () => ({
  Booking: { findByPk: jest.fn() },
  Review: { findOne: jest.fn(), create: jest.fn(), findAndCountAll: jest.fn(), findByPk: jest.fn() },
  ProfessorProfile: { findOne: jest.fn(), update: jest.fn() },
  User: {},
  sequelize: { transaction: jest.fn() },
}));

const db = require("../models/index");
const reviewController = require("../controllers/review.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

const COMPLETED_BOOKING = {
  id: "booking-1",
  student_id: "student-1",
  professor_id: "profile-1",
  status: "completed",
};

beforeEach(() => {
  jest.clearAllMocks();
  db.sequelize.transaction.mockResolvedValue({
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
  });
  db.ProfessorProfile.update.mockResolvedValue();
});

describe("reviewController.create", () => {
  const baseReq = (overrides) => ({
    params: { id: "booking-1" },
    authUser: { id: "student-1" },
    body: { rating: 5, comment: "Great session", ...overrides },
  });

  it("404s when the booking doesn't exist", async () => {
    db.Booking.findByPk.mockResolvedValue(null);
    const req = baseReq();
    const res = makeRes();

    await reviewController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403s a student who wasn't the one booked", async () => {
    db.Booking.findByPk.mockResolvedValue(COMPLETED_BOOKING);
    const req = { ...baseReq(), authUser: { id: "someone-else" } };
    const res = makeRes();

    await reviewController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("400s a booking that isn't completed yet", async () => {
    db.Booking.findByPk.mockResolvedValue({ ...COMPLETED_BOOKING, status: "confirmed" });
    const req = baseReq();
    const res = makeRes();

    await reviewController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects an out-of-range rating", async () => {
    db.Booking.findByPk.mockResolvedValue(COMPLETED_BOOKING);
    const req = baseReq({ rating: 6 });
    const res = makeRes();

    await reviewController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects a non-integer rating", async () => {
    db.Booking.findByPk.mockResolvedValue(COMPLETED_BOOKING);
    const req = baseReq({ rating: 4.5 });
    const res = makeRes();

    await reviewController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("409s when the booking already has a review", async () => {
    db.Booking.findByPk.mockResolvedValue(COMPLETED_BOOKING);
    db.Review.findOne.mockResolvedValueOnce({ id: "existing-review" });
    const req = baseReq();
    const res = makeRes();

    await reviewController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.Review.create).not.toHaveBeenCalled();
  });

  it("creates the review and recalculates the professor's rating", async () => {
    db.Booking.findByPk.mockResolvedValue(COMPLETED_BOOKING);
    db.Review.findOne
      .mockResolvedValueOnce(null) // duplicate check
      .mockResolvedValueOnce({ avg_rating: "5.00", review_count: "1" }); // recalculation aggregate
    db.Review.create.mockResolvedValue({ id: "review-1", booking_id: "booking-1", professor_id: "profile-1", rating: 5, comment: "Great session" });

    const req = baseReq();
    const res = makeRes();

    await reviewController.create(req, res);

    expect(db.Review.create).toHaveBeenCalledWith(
      expect.objectContaining({ booking_id: "booking-1", student_id: "student-1", professor_id: "profile-1", rating: 5 }),
      expect.anything()
    );
    expect(db.ProfessorProfile.update).toHaveBeenCalledWith(
      { rating_avg: "5.00", total_reviews: 1 },
      expect.objectContaining({ where: { id: "profile-1" } })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("409s on a concurrent duplicate review (unique constraint race)", async () => {
    db.Booking.findByPk.mockResolvedValue(COMPLETED_BOOKING);
    db.Review.findOne.mockResolvedValueOnce(null);
    const err = new Error("duplicate");
    err.name = "SequelizeUniqueConstraintError";
    db.Review.create.mockRejectedValue(err);

    const req = baseReq();
    const res = makeRes();

    await reviewController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("reviewController.listForProfessor", () => {
  it("404s when the professor doesn't exist or isn't approved", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue(null);
    const req = { params: { id: "profile-1" }, query: {} };
    const res = makeRes();

    await reviewController.listForProfessor(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns paginated reviews for an approved professor", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue({ id: "profile-1" });
    db.Review.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const req = { params: { id: "profile-1" }, query: {} };
    const res = makeRes();

    await reviewController.listForProfessor(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ items: [], total: 0 }));
  });
});

describe("reviewController.update", () => {
  it("404s when the review doesn't exist", async () => {
    db.Review.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" }, authUser: { id: "student-1" }, body: {} };
    const res = makeRes();

    await reviewController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403s a student who doesn't own the review", async () => {
    db.Review.findByPk.mockResolvedValue({ id: "review-1", student_id: "student-1", professor_id: "profile-1" });
    const req = { params: { id: "review-1" }, authUser: { id: "someone-else" }, body: { rating: 3 } };
    const res = makeRes();

    await reviewController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("rejects an invalid rating", async () => {
    db.Review.findByPk.mockResolvedValue({ id: "review-1", student_id: "student-1", professor_id: "profile-1" });
    const req = { params: { id: "review-1" }, authUser: { id: "student-1" }, body: { rating: 0 } };
    const res = makeRes();

    await reviewController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("updates the review and recalculates the professor's rating", async () => {
    const review = { id: "review-1", student_id: "student-1", professor_id: "profile-1", rating: 3, comment: "ok", save: jest.fn().mockResolvedValue() };
    db.Review.findByPk.mockResolvedValue(review);
    db.Review.findOne.mockResolvedValue({ avg_rating: "4.00", review_count: "2" });

    const req = { params: { id: "review-1" }, authUser: { id: "student-1" }, body: { rating: 4 } };
    const res = makeRes();

    await reviewController.update(req, res);

    expect(review.rating).toBe(4);
    expect(review.save).toHaveBeenCalled();
    expect(db.ProfessorProfile.update).toHaveBeenCalledWith(
      { rating_avg: "4.00", total_reviews: 2 },
      expect.objectContaining({ where: { id: "profile-1" } })
    );
  });
});

describe("reviewController.remove", () => {
  it("404s when the review doesn't exist", async () => {
    db.Review.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" }, authUser: { id: "student-1", role: "student" } };
    const res = makeRes();

    await reviewController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403s a user who is neither the owner nor an admin", async () => {
    db.Review.findByPk.mockResolvedValue({ id: "review-1", student_id: "student-1", professor_id: "profile-1" });
    const req = { params: { id: "review-1" }, authUser: { id: "someone-else", role: "student" } };
    const res = makeRes();

    await reviewController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("lets an admin delete someone else's review and recalculates the rating", async () => {
    const review = { id: "review-1", student_id: "student-1", professor_id: "profile-1", destroy: jest.fn().mockResolvedValue() };
    db.Review.findByPk.mockResolvedValue(review);
    db.Review.findOne.mockResolvedValue({ avg_rating: "0", review_count: "0" });

    const req = { params: { id: "review-1" }, authUser: { id: "admin-1", role: "admin" } };
    const res = makeRes();

    await reviewController.remove(req, res);

    expect(review.destroy).toHaveBeenCalled();
    expect(db.ProfessorProfile.update).toHaveBeenCalledWith(
      { rating_avg: "0.00", total_reviews: 0 },
      expect.objectContaining({ where: { id: "profile-1" } })
    );
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
