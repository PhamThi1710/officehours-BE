const { DateTime } = require("luxon");
const { generateAvailableSlots } = require("../utils/slotGenerator");

const FAR_FUTURE_NOW = DateTime.fromISO("2020-01-01T00:00:00Z");

function utcRule(overrides) {
  return {
    is_active: true,
    day_of_week: null,
    specific_date: null,
    start_time: "09:00",
    end_time: "10:00",
    slot_duration_minutes: 30,
    valid_from: null,
    valid_until: null,
    ...overrides,
  };
}

describe("generateAvailableSlots — recurring rules", () => {
  it("generates back-to-back slots for a matching weekday (2026-08-17 is a Monday)", () => {
    const rule = utcRule({ day_of_week: 1, start_time: "09:00", end_time: "10:00", slot_duration_minutes: 30 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    expect(slots.map((s) => s.start_at)).toEqual([
      "2026-08-17T09:00:00.000Z",
      "2026-08-17T09:30:00.000Z",
    ]);
    expect(slots[0].end_at).toBe("2026-08-17T09:30:00.000Z");
  });

  it("returns nothing when the rule's day_of_week doesn't match the queried date", () => {
    const rule = utcRule({ day_of_week: 1 }); // Monday rule

    const slots = generateAvailableSlots({
      dateStr: "2026-08-18", // Tuesday
      professorTimezone: "UTC",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    expect(slots).toEqual([]);
  });

  it("drops a trailing partial slot that doesn't fully fit the window", () => {
    const rule = utcRule({ day_of_week: 1, start_time: "09:00", end_time: "09:50", slot_duration_minutes: 30 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    // 09:00-09:30 fits; 09:30-10:00 would overshoot the 09:50 window end.
    expect(slots.map((s) => s.start_at)).toEqual(["2026-08-17T09:00:00.000Z"]);
  });

  it("respects valid_from / valid_until bounds", () => {
    const rule = utcRule({ day_of_week: 1, valid_from: "2026-08-24" });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    expect(slots).toEqual([]);
  });

  it("ignores inactive rules", () => {
    const rule = utcRule({ day_of_week: 1, is_active: false });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    expect(slots).toEqual([]);
  });
});

describe("generateAvailableSlots — one-off (specific_date) rules", () => {
  it("applies regardless of day_of_week", () => {
    const rule = utcRule({ day_of_week: null, specific_date: "2026-08-18", start_time: "14:00", end_time: "14:30", slot_duration_minutes: 30 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-18",
      professorTimezone: "UTC",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    expect(slots.map((s) => s.start_at)).toEqual(["2026-08-18T14:00:00.000Z"]);
  });

  it("does not leak into other dates", () => {
    const rule = utcRule({ day_of_week: null, specific_date: "2026-08-18" });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-19",
      professorTimezone: "UTC",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    expect(slots).toEqual([]);
  });
});

describe("generateAvailableSlots — exceptions (blackout dates)", () => {
  it("blacks out the entire date even when a rule would otherwise match", () => {
    const rule = utcRule({ day_of_week: 1 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [rule],
      exceptions: [{ date: "2026-08-17", reason: "Conference" }],
      now: FAR_FUTURE_NOW,
    });

    expect(slots).toEqual([]);
  });
});

describe("generateAvailableSlots — double-booking prevention", () => {
  it("excludes slots whose UTC start time is already booked", () => {
    const rule = utcRule({ day_of_week: 1, start_time: "09:00", end_time: "10:00", slot_duration_minutes: 30 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [rule],
      bookedStartTimesUtc: ["2026-08-17T09:00:00.000Z"],
      now: FAR_FUTURE_NOW,
    });

    expect(slots.map((s) => s.start_at)).toEqual(["2026-08-17T09:30:00.000Z"]);
  });

  it("de-duplicates overlapping rules covering the same start time", () => {
    const ruleA = utcRule({ day_of_week: 1, start_time: "09:00", end_time: "09:30", slot_duration_minutes: 30 });
    const ruleB = utcRule({ day_of_week: 1, start_time: "09:00", end_time: "10:00", slot_duration_minutes: 30 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [ruleA, ruleB],
      now: FAR_FUTURE_NOW,
    });

    expect(slots.map((s) => s.start_at)).toEqual([
      "2026-08-17T09:00:00.000Z",
      "2026-08-17T09:30:00.000Z",
    ]);
  });

  it("excludes slots that start in the past relative to `now`", () => {
    const rule = utcRule({ day_of_week: 1, start_time: "09:00", end_time: "10:00", slot_duration_minutes: 30 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [rule],
      now: DateTime.fromISO("2026-08-17T09:15:00.000Z"),
    });

    expect(slots.map((s) => s.start_at)).toEqual(["2026-08-17T09:30:00.000Z"]);
  });
});

describe("generateAvailableSlots — timezones", () => {
  it("converts a professor's local wall-clock time to the correct UTC instant (America/New_York, EDT = UTC-4)", () => {
    const rule = utcRule({ day_of_week: 1, start_time: "09:00", end_time: "09:30", slot_duration_minutes: 30 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "America/New_York",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    expect(slots).toEqual([
      { start_at: "2026-08-17T13:00:00.000Z", end_at: "2026-08-17T13:30:00.000Z", slot_duration_minutes: 30 },
    ]);
  });

  it("computes day_of_week in the professor's local zone, not UTC", () => {
    // Midnight on 2026-08-18 in Asia/Tokyo (UTC+9) is still 2026-08-17 in
    // UTC, but the *local* calendar date — and its weekday — is the 18th
    // (Tuesday), which is what day_of_week matching must use.
    const mondayRule = utcRule({ day_of_week: 1, start_time: "00:00", end_time: "01:00", slot_duration_minutes: 30 });
    const tuesdayRule = utcRule({ day_of_week: 2, start_time: "00:00", end_time: "01:00", slot_duration_minutes: 30 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-18",
      professorTimezone: "Asia/Tokyo",
      rules: [mondayRule, tuesdayRule],
      now: FAR_FUTURE_NOW,
    });

    // Only the Tuesday rule should match; its 00:00-01:00 JST window is 2026-08-17T15:00-16:00Z.
    expect(slots.map((s) => s.start_at)).toEqual([
      "2026-08-17T15:00:00.000Z",
      "2026-08-17T15:30:00.000Z",
    ]);
  });
});

describe("generateAvailableSlots — invalid input", () => {
  it("throws on an invalid date string", () => {
    expect(() => generateAvailableSlots({ dateStr: "not-a-date", professorTimezone: "UTC", rules: [] })).toThrow();
  });

  it("throws on a malformed rule time", () => {
    const rule = utcRule({ day_of_week: 1, start_time: "9am", end_time: "10:00" });
    expect(() =>
      generateAvailableSlots({ dateStr: "2026-08-17", professorTimezone: "UTC", rules: [rule], now: FAR_FUTURE_NOW })
    ).toThrow();
  });

  it("skips a rule with a zero or negative slot_duration_minutes instead of looping forever", () => {
    const rule = utcRule({ day_of_week: 1, slot_duration_minutes: 0 });

    const slots = generateAvailableSlots({
      dateStr: "2026-08-17",
      professorTimezone: "UTC",
      rules: [rule],
      now: FAR_FUTURE_NOW,
    });

    expect(slots).toEqual([]);
  });
});
