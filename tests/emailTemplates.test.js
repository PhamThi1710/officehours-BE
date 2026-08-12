const {
  studentBookingCreatedEmail,
  professorNewBookingEmail,
  studentPaymentSuccessEmail,
  professorBookingConfirmedEmail,
  bookingReminderEmail,
} = require("../utils/emailTemplates");

const BOOKING = { id: "booking-1", price: 25, start_at: "2026-08-17T09:00:00.000Z" };
const FREE_BOOKING = { id: "booking-2", price: 0, start_at: "2026-08-17T09:00:00.000Z", status: "confirmed" };

describe("emailTemplates", () => {
  it("studentBookingCreatedEmail reflects confirmed vs pending status", () => {
    const confirmed = studentBookingCreatedEmail({ booking: FREE_BOOKING, professorName: "Prof X" });
    expect(confirmed.subject).toMatch(/confirmed/i);
    expect(confirmed.html).toContain("Prof X");
    expect(confirmed.html).toContain("Free");

    const pending = studentBookingCreatedEmail({ booking: { ...BOOKING, status: "pending" }, professorName: "Prof X" });
    expect(pending.subject).toMatch(/payment/i);
    expect(pending.html).toContain("$25.00");
  });

  it("professorNewBookingEmail includes the student's email", () => {
    const { html } = professorNewBookingEmail({ booking: BOOKING, studentEmail: "y@school.edu" });
    expect(html).toContain("y@school.edu");
  });

  it("studentPaymentSuccessEmail and professorBookingConfirmedEmail include a link to the booking", () => {
    process.env.FRONTEND_URL = "https://officehours.example";
    const student = studentPaymentSuccessEmail({ booking: BOOKING, professorName: "Prof X" });
    const professor = professorBookingConfirmedEmail({ booking: BOOKING, studentName: "Student Y" });

    expect(student.html).toContain("https://officehours.example/bookings/booking-1");
    expect(professor.html).toContain("Student Y");
  });

  it("bookingReminderEmail mentions the counterpart", () => {
    const { subject, html } = bookingReminderEmail({ booking: BOOKING, counterpartName: "Prof X" });
    expect(subject).toMatch(/reminder/i);
    expect(html).toContain("Prof X");
  });
});
