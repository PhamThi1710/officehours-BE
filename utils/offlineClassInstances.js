const { DateTime } = require("luxon");
const { parseHHmm } = require("./slotGenerator");

// Turns an OfflineClass's recurring rule (day_of_week + start/end time) or
// one-off rule (specific_date) into concrete, bookable UTC session
// instances — the offline-class analog of slotGenerator.js, simplified
// because a class session isn't subdivided into multiple slot_duration
// chunks the way general availability is: one row's rule produces one
// instance per occurrence.
function getUpcomingInstances({ offlineClass, professorTimezone = "UTC", now = DateTime.utc(), weeksAhead = 8 }) {
  if (!offlineClass.is_active) return [];

  const zone = professorTimezone || "UTC";
  const nowUtc = DateTime.isDateTime(now) ? now.toUTC() : DateTime.fromJSDate(now).toUTC();
  const start = parseHHmm(offlineClass.start_time);
  const end = parseHHmm(offlineClass.end_time);

  function buildInstance(dateInZone) {
    const startLocal = dateInZone.set({ hour: start.hour, minute: start.minute, second: 0, millisecond: 0 });
    const endLocal = dateInZone.set({ hour: end.hour, minute: end.minute, second: 0, millisecond: 0 });
    return { start_at: startLocal.toUTC().toISO(), end_at: endLocal.toUTC().toISO() };
  }

  if (offlineClass.specific_date) {
    const dateInZone = DateTime.fromISO(offlineClass.specific_date, { zone });
    if (!dateInZone.isValid) return [];
    const instance = buildInstance(dateInZone);
    return DateTime.fromISO(instance.start_at) > nowUtc ? [instance] : [];
  }

  if (offlineClass.day_of_week === null || offlineClass.day_of_week === undefined) return [];

  const today = nowUtc.setZone(zone).startOf("day");
  // Luxon weekday is 1 (Mon) .. 7 (Sun); this app uses 0 (Sun) .. 6 (Sat),
  // matching JS Date#getDay() (same convention as slotGenerator.js).
  const todayDow = today.weekday % 7;
  let daysUntilFirst = offlineClass.day_of_week - todayDow;
  if (daysUntilFirst < 0) daysUntilFirst += 7;
  const firstOccurrence = today.plus({ days: daysUntilFirst });

  const instances = [];
  for (let week = 0; week < weeksAhead; week += 1) {
    const dateInZone = firstOccurrence.plus({ weeks: week });
    const dateStr = dateInZone.toFormat("yyyy-LL-dd");
    if (offlineClass.valid_from && dateStr < offlineClass.valid_from) continue;
    if (offlineClass.valid_until && dateStr > offlineClass.valid_until) continue;

    const instance = buildInstance(dateInZone);
    if (DateTime.fromISO(instance.start_at) > nowUtc) {
      instances.push(instance);
    }
  }

  return instances;
}

module.exports = { getUpcomingInstances };
