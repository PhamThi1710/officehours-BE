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

// Bookings are normally made some lead time before the session, not the
// instant they're seeded — backdating created_at avoids every booking
// clustering onto "today" in the admin's daily-activity charts.
async function backdateCreated(booking, daysAgo) {
  await db.sequelize.query('UPDATE bookings SET created_at = :created_at WHERE id = :id', {
    replacements: { id: booking.id, created_at: hoursFromNow(-daysAgo * 24) },
  });
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
  await db.sequelize.query('UPDATE bookings SET created_at = start_at WHERE id = :id', { replacements: { id: completedFree.id } });

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
  await db.sequelize.query('UPDATE bookings SET created_at = start_at WHERE id = :id', { replacements: { id: completedPaid.id } });
  const existingPayout = await db.Payout.findOne({ where: { booking_id: completedPaid.id } });
  if (!existingPayout) {
    await db.Payout.create({ professor_id: patelProfile.id, booking_id: completedPaid.id, amount: 15, status: "pending" });
  }

  const originalConfirmed = await ensureBooking({
    student: sam,
    professorProfile: garciaProfile,
    startAt: hoursFromNow(48),
    durationMinutes: 45,
    status: "confirmed",
    price: 10,
    paymentStatus: "paid",
  });
  await backdateCreated(originalConfirmed, 2);

  const originalPending = await ensureBooking({
    student: morgan,
    professorProfile: patelProfile,
    startAt: hoursFromNow(96),
    durationMinutes: 30,
    status: "pending",
    price: 15,
    paymentStatus: "unpaid",
  });
  await backdateCreated(originalPending, 1);

  const originalCancelled = await ensureBooking({
    student: alex,
    professorProfile: garciaProfile,
    startAt: hoursFromNow(-24),
    durationMinutes: 45,
    status: "cancelled",
    price: 10,
    paymentStatus: "unpaid",
    cancelReason: "Schedule conflict — will rebook next week.",
  });
  await backdateCreated(originalCancelled, 6);

  // --- Richer availability (more days per approved professor, so the
  // dashboard's weekly-hours strip isn't just a single highlighted day) ---
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: chenProfile.id, day_of_week: 3 },
    defaults: { professor_id: chenProfile.id, day_of_week: 3, start_time: "14:00", end_time: "16:00", slot_duration_minutes: 30, is_active: true },
  });
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: chenProfile.id, day_of_week: 5 },
    defaults: { professor_id: chenProfile.id, day_of_week: 5, start_time: "10:00", end_time: "12:00", slot_duration_minutes: 30, is_active: true },
  });
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: patelProfile.id, day_of_week: 1 },
    defaults: { professor_id: patelProfile.id, day_of_week: 1, start_time: "09:00", end_time: "10:30", slot_duration_minutes: 30, is_active: true },
  });
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: patelProfile.id, day_of_week: 5 },
    defaults: { professor_id: patelProfile.id, day_of_week: 5, start_time: "15:00", end_time: "17:00", slot_duration_minutes: 30, is_active: true },
  });
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: garciaProfile.id, day_of_week: 2 },
    defaults: { professor_id: garciaProfile.id, day_of_week: 2, start_time: "09:00", end_time: "11:00", slot_duration_minutes: 45, is_active: true },
  });
  await db.AvailabilityRule.findOrCreate({
    where: { professor_id: garciaProfile.id, day_of_week: 1 },
    defaults: { professor_id: garciaProfile.id, day_of_week: 1, start_time: "13:00", end_time: "15:00", slot_duration_minutes: 45, is_active: true },
  });

  // --- Richer booking history: more completed sessions (with reviews) and
  // more upcoming/pending ones spread across all 4 students, so every
  // approved professor's (and every student's) dashboard has real content
  // instead of looking freshly-created. ---
  async function completedWithReview({ student, professorProfile, hoursAgo, durationMinutes, price, paymentStatus, rating, comment, payoutStatus }) {
    const booking = await ensureBooking({
      student,
      professorProfile,
      startAt: hoursFromNow(hoursAgo),
      durationMinutes,
      status: "completed",
      price,
      paymentStatus,
    });
    await ensureReview({ booking, student, professorProfile, rating, comment });
    // The original insert always got created_at = "now" (Sequelize's
    // default), which bunches every completed session onto the same day in
    // the admin's daily-activity charts. Backdate it to line up with when
    // the session actually happened, like a real created-at would.
    await db.sequelize.query('UPDATE bookings SET created_at = start_at WHERE id = :id', { replacements: { id: booking.id } });
    if (payoutStatus) {
      const existing = await db.Payout.findOne({ where: { booking_id: booking.id } });
      if (!existing) {
        await db.Payout.create({
          professor_id: professorProfile.id,
          booking_id: booking.id,
          amount: price,
          status: payoutStatus,
          paid_at: payoutStatus === "paid_simulated" ? hoursFromNow(hoursAgo + 6) : null,
        });
      }
    }
    return booking;
  }

  await completedWithReview({
    student: jamie, professorProfile: chenProfile, hoursAgo: -120, durationMinutes: 30, price: 0, paymentStatus: "free",
    rating: 5, comment: "Really patient with my questions about recursion.",
  });
  await completedWithReview({
    student: sam, professorProfile: chenProfile, hoursAgo: -200, durationMinutes: 30, price: 0, paymentStatus: "free",
    rating: 4, comment: "Good session, a bit rushed at the end.",
  });
  await completedWithReview({
    student: morgan, professorProfile: patelProfile, hoursAgo: -96, durationMinutes: 30, price: 15, paymentStatus: "paid",
    rating: 5, comment: "Explained backprop clearly, worth every penny.", payoutStatus: "paid_simulated",
  });
  await completedWithReview({
    student: alex, professorProfile: patelProfile, hoursAgo: -160, durationMinutes: 30, price: 15, paymentStatus: "paid",
    rating: 4, comment: "Solid overview of regularization techniques.", payoutStatus: "paid_simulated",
  });
  await completedWithReview({
    student: sam, professorProfile: garciaProfile, hoursAgo: -30, durationMinutes: 45, price: 10, paymentStatus: "paid",
    rating: 5, comment: "Cleared up my confusion on reaction mechanisms.", payoutStatus: "pending",
  });
  await completedWithReview({
    student: morgan, professorProfile: garciaProfile, hoursAgo: -140, durationMinutes: 45, price: 10, paymentStatus: "paid",
    rating: 3, comment: "Helpful but ran a few minutes over.", payoutStatus: "paid_simulated",
  });

  // Upcoming (confirmed) sessions, so "Upcoming bookings" previews aren't empty.
  const upcoming1 = await ensureBooking({ student: jamie, professorProfile: chenProfile, startAt: hoursFromNow(24), durationMinutes: 30, status: "confirmed", price: 0, paymentStatus: "free" });
  await backdateCreated(upcoming1, 1);
  const upcoming2 = await ensureBooking({ student: sam, professorProfile: chenProfile, startAt: hoursFromNow(72), durationMinutes: 30, status: "confirmed", price: 0, paymentStatus: "free" });
  await backdateCreated(upcoming2, 3);
  const upcoming3 = await ensureBooking({ student: alex, professorProfile: patelProfile, startAt: hoursFromNow(50), durationMinutes: 30, status: "confirmed", price: 15, paymentStatus: "paid" });
  await backdateCreated(upcoming3, 2);
  const upcoming4 = await ensureBooking({ student: jamie, professorProfile: garciaProfile, startAt: hoursFromNow(120), durationMinutes: 45, status: "confirmed", price: 10, paymentStatus: "paid" });
  await backdateCreated(upcoming4, 5);

  // An extra pending (awaiting payment) booking beyond the original one.
  const upcoming5 = await ensureBooking({ student: alex, professorProfile: garciaProfile, startAt: hoursFromNow(200), durationMinutes: 45, status: "pending", price: 10, paymentStatus: "unpaid" });
  await backdateCreated(upcoming5, 4);

  // total_sessions isn't touched by direct inserts above (only the real
  // booking-complete endpoint increments it) — recompute it from actual
  // completed-booking counts so profile stats stay internally consistent.
  for (const professorProfile of [chenProfile, patelProfile, garciaProfile]) {
    const completedCount = await db.Booking.count({ where: { professor_id: professorProfile.id, status: "completed" } });
    await db.ProfessorProfile.update({ total_sessions: completedCount }, { where: { id: professorProfile.id } });
  }

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
