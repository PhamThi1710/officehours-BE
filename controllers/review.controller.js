const { fn, col } = require("sequelize");
const db = require("../models/index");
const { ROLES } = require("../constants/roles");
const { PROFESSOR_STATUS } = require("../constants/professorStatus");
const { BOOKING_STATUS } = require("../constants/bookingStatus");
const { parsePagination, toPaginatedResponse } = require("../utils/pagination");

const Booking = db.Booking;
const Review = db.Review;
const ProfessorProfile = db.ProfessorProfile;
const User = db.User;

function toReviewResponse(review) {
  return {
    id: review.id,
    booking_id: review.booking_id,
    professor_id: review.professor_id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.createdAt,
    student: review.student
      ? { id: review.student.id, full_name: review.student.full_name, avatar_url: review.student.avatar_url }
      : undefined,
  };
}

function isValidRating(rating) {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

// Keeps professor_profiles.rating_avg/total_reviews in sync with the
// reviews table — recomputed from scratch rather than incrementally
// adjusted, so it can never drift no matter how a review was mutated.
async function recalculateProfessorRating(professorId, transaction) {
  const stats = await Review.findOne({
    where: { professor_id: professorId },
    attributes: [
      [fn("COALESCE", fn("AVG", col("rating")), 0), "avg_rating"],
      [fn("COUNT", col("id")), "review_count"],
    ],
    raw: true,
    transaction,
  });

  await ProfessorProfile.update(
    { rating_avg: Number(stats.avg_rating).toFixed(2), total_reviews: Number(stats.review_count) },
    { where: { id: professorId }, transaction }
  );
}

// POST /api/bookings/:id/review — student (owner) only, and only once the
// session is actually completed.
exports.create = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.student_id !== req.authUser.id) {
      return res.status(403).json({ message: "Not allowed to review this booking" });
    }
    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      return res.status(400).json({ message: "Only a completed session can be reviewed" });
    }

    const { rating, comment } = req.body;
    if (!isValidRating(rating)) {
      return res.status(400).json({ message: "rating must be an integer from 1 to 5" });
    }

    const existing = await Review.findOne({ where: { booking_id: booking.id } });
    if (existing) {
      return res.status(409).json({ message: "This booking has already been reviewed" });
    }

    const t = await db.sequelize.transaction();
    let review;
    try {
      review = await Review.create(
        {
          booking_id: booking.id,
          student_id: booking.student_id,
          professor_id: booking.professor_id,
          rating,
          comment: comment || null,
        },
        { transaction: t }
      );

      await recalculateProfessorRating(booking.professor_id, t);
      await t.commit();
    } catch (err) {
      await t.rollback();
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({ message: "This booking has already been reviewed" });
      }
      throw err;
    }

    return res.status(201).json({ review: toReviewResponse(review) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/professors/:id/reviews — public, approved professors only
exports.listForProfessor = async (req, res) => {
  try {
    const profile = await ProfessorProfile.findOne({
      where: { id: req.params.id, status: PROFESSOR_STATUS.APPROVED },
    });
    if (!profile) {
      return res.status(404).json({ message: "Professor not found" });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const result = await Review.findAndCountAll({
      where: { professor_id: profile.id },
      include: [{ model: User, as: "student", attributes: ["id", "full_name", "avatar_url"] }],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toReviewResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/reviews/:id — owning student only
exports.update = async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    if (review.student_id !== req.authUser.id) {
      return res.status(403).json({ message: "Not allowed to edit this review" });
    }

    const { rating, comment } = req.body;
    if (rating !== undefined && !isValidRating(rating)) {
      return res.status(400).json({ message: "rating must be an integer from 1 to 5" });
    }

    const t = await db.sequelize.transaction();
    try {
      if (rating !== undefined) review.rating = rating;
      if (comment !== undefined) review.comment = comment;
      await review.save({ transaction: t });

      await recalculateProfessorRating(review.professor_id, t);
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    return res.json({ review: toReviewResponse(review) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /api/reviews/:id — owning student or admin
exports.remove = async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    const isOwner = review.student_id === req.authUser.id;
    const isAdmin = req.authUser.role === ROLES.ADMIN;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not allowed to delete this review" });
    }

    const professorId = review.professor_id;
    const t = await db.sequelize.transaction();
    try {
      await review.destroy({ transaction: t });
      await recalculateProfessorRating(professorId, t);
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
