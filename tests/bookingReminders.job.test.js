const mockCronSchedule = jest.fn();
jest.mock("node-cron", () => ({ schedule: mockCronSchedule }));

jest.mock("../models/index", () => ({
  Booking: { findAll: jest.fn() },
  ProfessorProfile: {},
  User: {},
}));
jest.mock("../utils/mailer");

const db = require("../models/index");
const mailer = require("../utils/mailer");
const { sendDueReminders, start, REMINDER_WINDOW_MINUTES } = require("../jobs/bookingReminders.job");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("sendDueReminders", () => {
  const NOW = new Date("2026-08-17T08:15:00.000Z");

  it("does nothing when no bookings are due", async () => {
    db.Booking.findAll.mockResolvedValue([]);

    const count = await sendDueReminders(NOW);

    expect(count).toBe(0);
    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });

  it("queries confirmed, not-yet-reminded bookings starting within the reminder window", async () => {
    db.Booking.findAll.mockResolvedValue([]);

    await sendDueReminders(NOW);

    const callArgs = db.Booking.findAll.mock.calls[0][0];
    expect(callArgs.where.status).toBe("confirmed");
    expect(callArgs.where.reminder_sent_at).toBeNull();
    expect(REMINDER_WINDOW_MINUTES).toBe(60);
  });

  it("emails both the student and professor and marks the booking reminded", async () => {
    const booking = {
      id: "booking-1",
      start_at: "2026-08-17T09:00:00.000Z",
      professor: { user: { full_name: "Prof X", email: "profx@school.edu" } },
      student: { full_name: "Student Y", email: "y@school.edu" },
      reminder_sent_at: null,
      save: jest.fn().mockResolvedValue(),
    };
    db.Booking.findAll.mockResolvedValue([booking]);

    const count = await sendDueReminders(NOW);

    expect(count).toBe(1);
    expect(mailer.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "y@school.edu" }));
    expect(mailer.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "profx@school.edu" }));
    expect(booking.reminder_sent_at).toBeInstanceOf(Date);
    expect(booking.save).toHaveBeenCalled();
  });

  it("processes multiple due bookings independently", async () => {
    const makeBooking = (id) => ({
      id,
      start_at: "2026-08-17T09:00:00.000Z",
      professor: { user: { full_name: "Prof X", email: "profx@school.edu" } },
      student: { full_name: "Student Y", email: "y@school.edu" },
      reminder_sent_at: null,
      save: jest.fn().mockResolvedValue(),
    });
    db.Booking.findAll.mockResolvedValue([makeBooking("booking-1"), makeBooking("booking-2")]);

    const count = await sendDueReminders(NOW);

    expect(count).toBe(2);
    expect(mailer.sendEmail).toHaveBeenCalledTimes(4);
  });
});

describe("start", () => {
  it("schedules the job to run every 15 minutes", () => {
    start();

    expect(mockCronSchedule).toHaveBeenCalledWith("*/15 * * * *", expect.any(Function));
  });
});
