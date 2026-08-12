jest.mock("../models/index", () => ({
  Booking: { findByPk: jest.fn() },
  ProfessorProfile: {},
}));

const db = require("../models/index");
const { getBookingForChat } = require("../utils/bookingChatAccess");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getBookingForChat", () => {
  it("returns not-found when the booking doesn't exist", async () => {
    db.Booking.findByPk.mockResolvedValue(null);

    const result = await getBookingForChat("missing", "user-1");

    expect(result).toEqual({ booking: null, allowed: false });
  });

  it("allows the student party", async () => {
    db.Booking.findByPk.mockResolvedValue({
      id: "booking-1",
      student_id: "student-1",
      status: "confirmed",
      professor: { id: "profile-1", user_id: "prof-user-1" },
    });

    const { allowed } = await getBookingForChat("booking-1", "student-1");

    expect(allowed).toBe(true);
  });

  it("allows the owning professor", async () => {
    db.Booking.findByPk.mockResolvedValue({
      id: "booking-1",
      student_id: "student-1",
      status: "pending",
      professor: { id: "profile-1", user_id: "prof-user-1" },
    });

    const { allowed } = await getBookingForChat("booking-1", "prof-user-1");

    expect(allowed).toBe(true);
  });

  it("denies a stranger", async () => {
    db.Booking.findByPk.mockResolvedValue({
      id: "booking-1",
      student_id: "student-1",
      status: "confirmed",
      professor: { id: "profile-1", user_id: "prof-user-1" },
    });

    const { allowed } = await getBookingForChat("booking-1", "someone-else");

    expect(allowed).toBe(false);
  });

  it("denies chat on a cancelled booking even for a party", async () => {
    db.Booking.findByPk.mockResolvedValue({
      id: "booking-1",
      student_id: "student-1",
      status: "cancelled",
      professor: { id: "profile-1", user_id: "prof-user-1" },
    });

    const { allowed } = await getBookingForChat("booking-1", "student-1");

    expect(allowed).toBe(false);
  });
});
