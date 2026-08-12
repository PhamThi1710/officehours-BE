process.env.JWT_ACCESS_SECRET = "test-secret";

const { signVideoToken, verifyVideoToken } = require("../utils/videoToken");

describe("videoToken", () => {
  it("round-trips bookingId/userId", () => {
    const token = signVideoToken({ bookingId: "booking-1", userId: "user-1" });
    const decoded = verifyVideoToken(token);
    expect(decoded).toEqual({ bookingId: "booking-1", userId: "user-1" });
  });

  it("throws on a tampered token", () => {
    const token = signVideoToken({ bookingId: "booking-1", userId: "user-1" });
    expect(() => verifyVideoToken(`${token}x`)).toThrow();
  });

  it("throws on a garbage token", () => {
    expect(() => verifyVideoToken("not-a-jwt")).toThrow();
  });
});
