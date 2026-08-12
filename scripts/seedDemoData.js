// One-off script to populate the live Neon DB with a small, realistic set
// of demo data (not a sequelize-cli seeder) so the deployed app isn't empty
// for anyone clicking through it. Deliberately modest in size — this is a
// demo, not a load test, and Neon's free tier is 0.5GB. Safe to re-run:
// users/profiles/FAQs are findOrCreate'd by natural key, and bookings are
// skipped if a similar one already exists for the same student/professor.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const db = require("../models/index");
const { waitForDb } = require("./waitForDb");

const DEMO_PASSWORD = "Demo1234!";

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function findOrCreateUser({ email, full_name, role, is_edu_email = true }) {
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [user] = await db.User.findOrCreate({
    where: { email },
    defaults: {
      email,
      password_hash,
      role,
      full_name,
      auth_provider: "local",
      is_edu_email,
      is_email_verified: true,
    },
  });
  return user;
}

async function findOrCreateProfessorProfile(user, profileData) {
  const [profile] = await db.ProfessorProfile.findOrCreate({
    where: { user_id: user.id },
    defaults: { user_id: user.id, ...profileData },
  });
  return profile;
}

async function ensureBooking({ student, professorProfile, startAt, durationMinutes, status, price, paymentStatus, cancelReason }) {
  const existing = await db.Booking.findOne({
    where: { student_id: student.id, professor_id: professorProfile.id, start_at: startAt },
  });
  if (existing) return existing;

  return db.Booking.create({
    student_id: student.id,
    professor_id: professorProfile.id,
    start_at: startAt,
    end_at: new Date(startAt.getTime() + durationMinutes * 60 * 1000),
    status,
    price,
    payment_status: paymentStatus,
    video_room_slug: randomUUID(),
    cancelled_by: status === "cancelled" ? student.id : null,
    cancel_reason: cancelReason || null,
  });
}

async function ensureReview({ booking, student, professorProfile, rating, comment }) {
  const existing = await db.Review.findOne({ where: { booking_id: booking.id } });
  if (existing) return existing;

  const review = await db.Review.create({
    booking_id: booking.id,
    student_id: student.id,
    professor_id: professorProfile.id,
    rating,
    comment,
  });

  const stats = await db.Review.findOne({
    where: { professor_id: professorProfile.id },
    attributes: [
      [db.Sequelize.fn("COALESCE", db.Sequelize.fn("AVG", db.Sequelize.col("rating")), 0), "avg_rating"],
      [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "review_count"],
    ],
    raw: true,
  });
  await db.ProfessorProfile.update(
    { rating_avg: Number(stats.avg_rating).toFixed(2), total_reviews: Number(stats.review_count) },
    { where: { id: professorProfile.id } }
  );

  return review;
}

async function main() {
  await waitForDb(db.sequelize);

  // --- Professors ---
  const chenUser = await findOrCreateUser({ email: "prof.chen@stanford.edu", full_name: "Dr. Sarah Chen", role: "professor" });
  const chenProfile = await findOrCreateProfessorProfile(chenUser, {
    headline: "Algorithms & Data Structures",
    bio: "CS professor at Stanford. Happy to help with algorithms, technical interview prep, and debugging.",
    subjects: ["Algorithms", "Data Structures", "Interview Prep"],
    price_per_session: 0,
    session_duration_default: 30,
    timezone: "America/Los_Angeles",
    status: "approved",
  });

  const patelUser = await findOrCreateUser({ email: "prof.patel@mit.edu", full_name: "Dr. Raj Patel", role: "professor" });
  const patelProfile = await findOrCreateProfessorProfile(patelUser, {
    headline: "Machine Learning & Statistics",
    bio: "Associate professor at MIT researching applied ML. Office hours cover coursework and research methodology.",
    subjects: ["Machine Learning", "Statistics", "Python"],
    price_per_session: 15,
    session_duration_default: 30,
    timezone: "America/New_York",
    status: "approved",
  });

  const garciaUser = await findOrCreateUser({ email: "prof.garcia@berkeley.edu", full_name: "Dr. Elena Garcia", role: "professor" });
  const garciaProfile = await findOrCreateProfessorProfile(garciaUser, {
    headline: "Organic Chemistry",
    bio: "Chemistry professor at UC Berkeley. Can help with problem sets and exam prep.",
    subjects: ["Organic Chemistry", "General Chemistry"],
    price_per_session: 10,
    session_duration_default: 45,
    timezone: "America/Los_Angeles",
    status: "approved",
  });

  const kimUser = await findOrCreateUser({ email: "prof.kim@cmu.edu", full_name: "Dr. David Kim", role: "professor" });
  await findOrCreateProfessorProfile(kimUser, {
    headline: "Classical Mechanics & E&M",
    bio: "Physics professor at CMU, newly joined OfficeHours.",
    subjects: ["Physics", "Classical Mechanics"],
    price_per_session: 0,
    session_duration_default: 30,
    timezone: "America/New_York",
    status: "pending", // demo data for the admin approval queue
  });

  // --- Availability (recurring weekday rules for the approved professors) ---
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: chenProfile.id, day_of_week: 1 },
    defaults: { professor_id: chenProfile.id, day_of_week: 1, start_time: "09:00", end_time: "11:00", slot_duration_minutes: 30, is_active: true },
  });
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: patelProfile.id, day_of_week: 3 },
    defaults: { professor_id: patelProfile.id, day_of_week: 3, start_time: "13:00", end_time: "15:00", slot_duration_minutes: 30, is_active: true },
  });
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: garciaProfile.id, day_of_week: 4 },
    defaults: { professor_id: garciaProfile.id, day_of_week: 4, start_time: "10:00", end_time: "12:00", slot_duration_minutes: 45, is_active: true },
  });

  // --- Students ---
  const alex = await findOrCreateUser({ email: "alex.wong@stanford.edu", full_name: "Alex Wong", role: "student" });
  const jamie = await findOrCreateUser({ email: "jamie.lee@mit.edu", full_name: "Jamie Lee", role: "student" });
  const sam = await findOrCreateUser({ email: "sam.taylor@berkeley.edu", full_name: "Sam Taylor", role: "student" });
  const morgan = await findOrCreateUser({ email: "morgan.davis@cmu.edu", full_name: "Morgan Davis", role: "student" });

  // --- Bookings across every status ---
  const completedFree = await ensureBooking({
    student: alex,
    professorProfile: chenProfile,
    startAt: hoursFromNow(-72),
    durationMinutes: 30,
    status: "completed",
    price: 0,
    paymentStatus: "free",
  });
  await ensureReview({ booking: completedFree, student: alex, professorProfile: chenProfile, rating: 5, comment: "Super clear explanation of Dijkstra's algorithm, thank you!" });

  const completedPaid = await ensureBooking({
    student: jamie,
    professorProfile: patelProfile,
    startAt: hoursFromNow(-48),
    durationMinutes: 30,
    status: "completed",
    price: 15,
    paymentStatus: "paid",
  });
  await ensureReview({ booking: completedPaid, student: jamie, professorProfile: patelProfile, rating: 4, comment: "Helped me understand gradient descent way better." });
  const existingPayout = await db.Payout.findOne({ where: { booking_id: completedPaid.id } });
  if (!existingPayout) {
    await db.Payout.create({ professor_id: patelProfile.id, booking_id: completedPaid.id, amount: 15, status: "pending" });
  }

  await ensureBooking({
    student: sam,
    professorProfile: garciaProfile,
    startAt: hoursFromNow(48),
    durationMinutes: 45,
    status: "confirmed",
    price: 10,
    paymentStatus: "paid",
  });

  await ensureBooking({
    student: morgan,
    professorProfile: patelProfile,
    startAt: hoursFromNow(96),
    durationMinutes: 30,
    status: "pending",
    price: 15,
    paymentStatus: "unpaid",
  });

  await ensureBooking({
    student: alex,
    professorProfile: garciaProfile,
    startAt: hoursFromNow(-24),
    durationMinutes: 45,
    status: "cancelled",
    price: 10,
    paymentStatus: "unpaid",
    cancelReason: "Schedule conflict — will rebook next week.",
  });

  // --- FAQs ---
  const faqs = [
    { category: "general", question: "What is OfficeHours?", answer: "OfficeHours lets students book 1:1 video sessions with professors' office hours, across any school — not just your own." },
    { category: "general", question: "Do I need to attend the same school as the professor?", answer: "No. Any student with a valid .edu email can book with any approved professor on the platform." },
    { category: "booking", question: "How do I book a session?", answer: "Open a professor's profile, pick an open slot on their availability calendar, and confirm — free sessions confirm instantly." },
    { category: "booking", question: "Can I cancel a booking?", answer: "Yes, from your bookings list, any time before the session starts." },
    { category: "payment", question: "Is payment required?", answer: "Only if the professor sets a price for their sessions — many offer free office hours." },
    { category: "payment", question: "What payment methods are supported?", answer: "Card payments via Stripe Checkout (test mode on this demo deployment)." },
  ];
  for (const faq of faqs) {
    await db.Faq.findOrCreate({ where: { question: faq.question }, defaults: faq });
  }

  // --- Support tickets ---
  await db.SupportTicket.findOrCreate({
    where: { subject: "Can't find my professor's timezone" },
    defaults: {
      user_id: null,
      email: "guest@example.edu",
      subject: "Can't find my professor's timezone",
      message: "The booking page doesn't show what timezone the slots are in — could you clarify?",
      status: "open",
    },
  });
  await db.SupportTicket.findOrCreate({
    where: { subject: "Refund question" },
    defaults: {
      user_id: alex.id,
      email: alex.email,
      subject: "Refund question",
      message: "I had to cancel a paid session — do I get refunded automatically?",
      status: "closed",
      admin_reply: "Since this is a test-mode demo, no real charge occurred, but in production a cancellation before the session would trigger a Stripe refund.",
      replied_at: new Date(),
    },
  });

  console.log("Demo data seeded.");
  console.log(`All demo accounts use the password: ${DEMO_PASSWORD}`);
  console.log("Professors:", chenUser.email, patelUser.email, garciaUser.email, `${kimUser.email} (pending approval)`);
  console.log("Students:", alex.email, jamie.email, sam.email, morgan.email);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("SEED_DEMO_ERROR", err.name, err.message);
    process.exit(1);
  });
