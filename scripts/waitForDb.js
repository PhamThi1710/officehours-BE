// Neon's free tier suspends its compute after idling, so the first
// connection after a while can take a few seconds (or, on a flaky network
// path, a few attempts) to succeed. One-off scripts run this before doing
// real work instead of failing on the first hiccup.
async function waitForDb(sequelize, { retries = 5, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelize.authenticate();
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[waitForDb] attempt ${attempt}/${retries} failed (${err.name}) — retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { waitForDb };
