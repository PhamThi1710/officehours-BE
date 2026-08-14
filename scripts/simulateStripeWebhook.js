// Local-only webhook simulator — signs a real checkout.session.completed
// payload with the app's own STRIPE_WEBHOOK_SECRET and posts it straight to
// the local webhook endpoint. Used instead of `stripe listen` so testing
// never depends on whichever Stripe account the machine's CLI happens to be
// logged into.
//
// Usage: node scripts/simulateStripeWebhook.js <checkout_session_id>
require("dotenv").config();
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_URL = "http://localhost:4000/api/webhooks/stripe";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: node scripts/simulateStripeWebhook.js <checkout_session_id>");
    process.exit(1);
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  console.log("Fetched session:", session.id, "payment_status:", session.payment_status);

  const event = {
    id: `evt_sim_${Date.now()}`,
    object: "event",
    type: "checkout.session.completed",
    data: { object: session },
  };
  const payload = JSON.stringify(event);

  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": header },
    body: payload,
  });
  const body = await res.text();
  console.log("Webhook response:", res.status, body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
