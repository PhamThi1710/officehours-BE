const { DateTime } = require("luxon");
const { getUpcomingInstances } = require("../utils/offlineClassInstances");

// Fixed "now": 2026-08-17T08:00:00Z is a Monday.
const NOW = DateTime.fromISO("2026-08-17T08:00:00.000Z", { zone: "utc" });

describe("getUpcomingInstances", () => {
  it("returns nothing for an inactive class", () => {
    const offlineClass = {
      is_active: false,
      day_of_week: 1,
      specific_date: null,
      start_time: "09:00",
      end_time: "10:00",
      valid_from: null,
      valid_until: null,
    };

    expect(getUpcomingInstances({ offlineClass, professorTimezone: "UTC", now: NOW })).toEqual([]);
  });

  it("generates one instance per week for a recurring day_of_week rule", () => {
    const offlineClass = {
      is_active: true,
      day_of_week: 1, // Monday
      specific_date: null,
      start_time: "09:00",
      end_time: "10:00",
      valid_from: null,
      valid_until: null,
    };

    const instances = getUpcomingInstances({ offlineClass, professorTimezone: "UTC", now: NOW, weeksAhead: 3 });

    expect(instances).toHaveLength(3);
    expect(instances[0]).toEqual({ start_at: "2026-08-17T09:00:00.000Z", end_at: "2026-08-17T10:00:00.000Z" });
    expect(instances[1].start_at).toBe("2026-08-24T09:00:00.000Z");
    expect(instances[2].start_at).toBe("2026-08-31T09:00:00.000Z");
  });

  it("skips today's occurrence once its start time has already passed", () => {
    const offlineClass = {
      is_active: true,
      day_of_week: 1, // Monday — today, per NOW
      specific_date: null,
      start_time: "07:00", // already passed relative to NOW (08:00Z)
      end_time: "08:00",
      valid_from: null,
      valid_until: null,
    };

    const instances = getUpcomingInstances({ offlineClass, professorTimezone: "UTC", now: NOW, weeksAhead: 2 });

    expect(instances).toHaveLength(1);
    expect(instances[0].start_at).toBe("2026-08-24T07:00:00.000Z");
  });

  it("bounds recurring occurrences by valid_from/valid_until", () => {
    const offlineClass = {
      is_active: true,
      day_of_week: 1,
      specific_date: null,
      start_time: "09:00",
      end_time: "10:00",
      valid_from: "2026-08-24",
      valid_until: "2026-08-24",
    };

    const instances = getUpcomingInstances({ offlineClass, professorTimezone: "UTC", now: NOW, weeksAhead: 4 });

    expect(instances).toEqual([{ start_at: "2026-08-24T09:00:00.000Z", end_at: "2026-08-24T10:00:00.000Z" }]);
  });

  it("returns a single instance for a future specific_date", () => {
    const offlineClass = {
      is_active: true,
      day_of_week: null,
      specific_date: "2026-08-20",
      start_time: "14:00",
      end_time: "15:00",
      valid_from: null,
      valid_until: null,
    };

    const instances = getUpcomingInstances({ offlineClass, professorTimezone: "UTC", now: NOW });

    expect(instances).toEqual([{ start_at: "2026-08-20T14:00:00.000Z", end_at: "2026-08-20T15:00:00.000Z" }]);
  });

  it("returns nothing for a specific_date already in the past", () => {
    const offlineClass = {
      is_active: true,
      day_of_week: null,
      specific_date: "2026-08-01",
      start_time: "14:00",
      end_time: "15:00",
      valid_from: null,
      valid_until: null,
    };

    expect(getUpcomingInstances({ offlineClass, professorTimezone: "UTC", now: NOW })).toEqual([]);
  });
});
