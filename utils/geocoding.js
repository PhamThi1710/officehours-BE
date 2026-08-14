const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "OfficeHours/1.0 (https://officehours.example; support@officehours.example)";
const MIN_REQUEST_INTERVAL_MS = 1100; // Nominatim usage policy: max 1 request/sec
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

class GeocodeError extends Error {}

// Module-level (single Node process, matches ai.controller.js's in-memory
// rate-limit Map — there's no Redis/shared-cache infra in this app) cache
// so repeat lookups of the same address string never re-hit Nominatim.
const cache = new Map();
let lastRequestAt = 0;

function normalize(address) {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serializes outbound requests so concurrent callers still respect the
// 1 req/sec ceiling instead of racing past each other.
let throttleQueue = Promise.resolve();

async function throttle() {
  const runAfterQueue = throttleQueue.then(async () => {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  throttleQueue = runAfterQueue.catch(() => {});
  return runAfterQueue;
}

// Forward-geocodes a free-text address via OpenStreetMap Nominatim. Cached
// per normalized address string; callers that only want to skip re-geocoding
// on an unrelated edit should compare the stored address before calling this
// at all (see controllers/offlineClasses.controller.js).
async function geocodeAddress(address) {
  const key = normalize(address);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { latitude: cached.latitude, longitude: cached.longitude };
  }

  await throttle();

  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) {
    throw new GeocodeError(`Nominatim request failed with status ${response.status}`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new GeocodeError(`No geocoding result found for address: ${address}`);
  }

  const latitude = Number(results[0].lat);
  const longitude = Number(results[0].lon);
  cache.set(key, { latitude, longitude, cachedAt: Date.now() });

  return { latitude, longitude };
}

module.exports = { geocodeAddress, GeocodeError };
