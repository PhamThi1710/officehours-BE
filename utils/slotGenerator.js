const { DateTime } = require("luxon");

const HHMM_REGEX = /^(\d{2}):(\d{2})$/;

function parseHHmm(value) {
  const match = HHMM_REGEX.exec(value);
  if (!match) {
    throw new Error(`Invalid time format: ${value}`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function ruleMatchesDate(rule, dateStr, dayOfWeek) {
  if (!rule.is_active) return false;

  if (rule.specific_date) {
    return rule.specific_date === dateStr;
  }

  if (rule.day_of_week === null || rule.day_of_week === undefined) return false;
  if (rule.day_of_week !== dayOfWeek) return false;
  if (rule.valid_from && dateStr < rule.valid_from) return false;
  if (rule.valid_until && dateStr > rule.valid_until) return false;
  return true;
}

// Turns a professor's recurring/one-off availability rules into concrete,
// bookable UTC slots for a single calendar date — the one place double-
// booking prevention actually starts (booked + past slots never come back
// out of this function). Pure function so the tricky date-math is testable
// without a database.
function generateAvailableSlots({
  dateStr,
  professorTimezone = "UTC",
  rules = [],
  exceptions = [],
  bookedStartTimesUtc = [],
  now = DateTime.utc(),
}) {
  const zone = professorTimezone || "UTC";
  const targetDate = DateTime.fromISO(dateStr, { zone });
  if (!targetDate.isValid) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  const isBlackedOut = exceptions.some((exception) => exception.date === dateStr);
  if (isBlackedOut) return [];

  // Luxon weekday is 1 (Mon) .. 7 (Sun); we use 0 (Sun) .. 6 (Sat), matching
  // JS Date#getDay(), so % 7 maps Sunday from 7 down to 0.
  const dayOfWeek = targetDate.weekday % 7;
  const matchingRules = rules.filter((rule) => ruleMatchesDate(rule, dateStr, dayOfWeek));

  const nowUtc = DateTime.isDateTime(now) ? now.toUTC() : DateTime.fromJSDate(now).toUTC();
  const bookedSet = new Set(bookedStartTimesUtc);
  const slotsByStartIso = new Map();

  for (const rule of matchingRules) {
    const duration = rule.slot_duration_minutes;
    if (!Number.isInteger(duration) || duration <= 0) continue;

    const start = parseHHmm(rule.start_time);
    const end = parseHHmm(rule.end_time);
    const windowEnd = targetDate.set({ hour: end.hour, minute: end.minute, second: 0, millisecond: 0 });

    let cursor = targetDate.set({ hour: start.hour, minute: start.minute, second: 0, millisecond: 0 });

    while (cursor.plus({ minutes: duration }) <= windowEnd) {
      const slotEndLocal = cursor.plus({ minutes: duration });
      const startUtc = cursor.toUTC();
      const startIso = startUtc.toISO();

      if (startUtc > nowUtc && !bookedSet.has(startIso)) {
        slotsByStartIso.set(startIso, {
          start_at: startIso,
          end_at: slotEndLocal.toUTC().toISO(),
          slot_duration_minutes: duration,
        });
      }

      cursor = slotEndLocal;
    }
  }

  return Array.from(slotsByStartIso.values()).sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
}

module.exports = { generateAvailableSlots, parseHHmm };
