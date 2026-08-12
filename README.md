# OfficeHours API

Backend for **OfficeHours** — a cross-university platform where students book 1:1 or small-group
video office hours with professors, based on the professor's weekly availability.

Built as a portfolio project. Architecture patterns (layered controllers/routes/models, JWT auth,
Stripe payments, PDF invoices, WebSocket video signalling) are inspired by a prior production
codebase, but all schema, business logic, and code are written from scratch for this project.

## Stack

- Node.js 20 + Express
- PostgreSQL (Sequelize ORM) — hosted free on [Neon](https://neon.tech)
- JWT auth (short-lived access token + rotating refresh token) + Google OAuth
- Stripe Checkout (test mode)
- Self-built WebRTC signalling (`ws`) for video sessions
- Deployed free on [Render](https://render.com)

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT secrets, etc.
npm run migrate
npm run seed            # creates the admin account
npm run dev
```

Health check: `GET /health`.

## Project structure

```
config/       # DB + auth config (app runtime and sequelize-cli)
constants/    # shared enums (roles, etc.)
controllers/  # request handlers (controllers/admin/ for admin-only endpoints)
routes/       # express routers, mounted from server.js
middleware/   # authJwt (verifyToken, role guards)
models/       # sequelize model definitions + models/index.js bootstrap
migrations/   # sequelize-cli migrations
seeders/      # sequelize-cli seeders
utils/        # eduEmail validation, token generation, etc.
tests/        # jest unit tests (models mocked, no real DB)
```

## Build phases

- [x] Phase 0 — repo scaffold
- [x] Phase 1 — users schema, JWT auth (register/login/refresh/logout), Google OAuth, `.edu`
      email validation, role middleware
- [x] Phase 2 — professor profiles + admin approval
- [x] Phase 3 — availability rules + slot generation
- [x] Phase 4 — booking flow (double-booking prevention)
- [x] Phase 5 — Stripe Checkout (test mode) + invoice PDF
- [x] Phase 6 — payout ledger + admin revenue report
- [x] Phase 7 — reviews & ratings
- [x] Phase 8 — email notifications
- [x] Phase 9 — WebRTC video signalling
- [x] Phase 10 — FAQ + support tickets
- [x] Phase 11 — realtime chat (optional)

All 12 phases (0–11) are done. `officehours-BE` now has every backend feature from the original
scope; remaining work is the `officehours-FE` and `officehours-admin` UIs, then deployment.

## API (so far)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | — | Register with `.edu` email + password (student/professor) |
| POST | /api/auth/login | — | Email/password login |
| POST | /api/auth/google | — | Google ID token login/signup |
| POST | /api/auth/refresh | — | Rotate refresh token, issue new access token |
| POST | /api/auth/logout | — | Revoke a refresh token |
| GET | /api/auth/me | Bearer | Current user |
| POST | /api/professors/apply | Bearer (professor) | Create own professor profile (status = pending) |
| GET | /api/professors/me | Bearer (professor) | Own professor profile, any status |
| PATCH | /api/professors/me | Bearer (professor) | Update own profile fields |
| GET | /api/professors | — | List approved professors (`?subject=&search=&page=&limit=`) |
| GET | /api/professors/:id | — | Approved professor detail |
| GET | /api/admin/professors | Bearer (admin) | List professors (`?status=pending\|approved\|rejected`) |
| GET | /api/admin/professors/:id | Bearer (admin) | Professor detail incl. contact email |
| PATCH | /api/admin/professors/:id/approve | Bearer (admin) | Approve a professor profile |
| PATCH | /api/admin/professors/:id/reject | Bearer (admin) | Reject with optional `reason` |
| POST | /api/professors/me/availability-rules | Bearer (professor) | Add a recurring (`day_of_week`) or one-off (`specific_date`) weekly rule |
| GET | /api/professors/me/availability-rules | Bearer (professor) | List own rules |
| DELETE | /api/professors/me/availability-rules/:ruleId | Bearer (professor) | Remove own rule |
| POST | /api/professors/me/exceptions | Bearer (professor) | Block out a whole date (e.g. sick day) |
| GET | /api/professors/me/exceptions | Bearer (professor) | List own blackout dates |
| DELETE | /api/professors/me/exceptions/:exceptionId | Bearer (professor) | Remove own blackout date |
| GET | /api/professors/:id/slots?date=YYYY-MM-DD | — | Bookable UTC slots for that professor on that date |
| POST | /api/bookings | Bearer (student) | Book a slot (`professor_id`, `start_at`) |
| GET | /api/bookings/me | Bearer (student) | Own bookings (`?status=&page=&limit=`) |
| GET | /api/professors/me/bookings | Bearer (professor) | Own bookings as a professor |
| GET | /api/bookings/:id | Bearer (owner student/professor/admin) | Booking detail |
| PATCH | /api/bookings/:id/cancel | Bearer (owner student/professor/admin) | Cancel before it starts (`reason` optional) |
| PATCH | /api/bookings/:id/complete | Bearer (owner professor/admin) | Mark a past confirmed session completed |
| POST | /api/bookings/:id/checkout-session | Bearer (owner student) | Create a Stripe test-mode Checkout Session for a priced, unpaid booking |
| POST | /api/webhooks/stripe | Stripe signature (no JWT) | `checkout.session.completed` → marks the booking `confirmed`/`paid` |
| GET | /api/bookings/:id/invoice | Bearer (owner student/professor/admin) | Streams a PDF invoice, once paid or free |
| GET | /api/professors/me/payouts | Bearer (professor) | Own payout ledger (`?status=&page=&limit=`) + pending/paid summary |
| GET | /api/admin/payouts | Bearer (admin) | All payouts (`?status=&professor_id=`) |
| PATCH | /api/admin/payouts/:id/mark-paid | Bearer (admin) | Simulate disbursing a pending payout |
| GET | /api/admin/reports/bookings?days=30 | Bearer (admin) | Booking counts by status + daily time series |
| GET | /api/admin/reports/revenue?days=30 | Bearer (admin) | Total/daily paid revenue + payout pending/paid totals |
| POST | /api/bookings/:id/review | Bearer (owner student) | Review a completed session (`rating` 1–5, `comment` optional) |
| GET | /api/professors/:id/reviews | — | Paginated reviews for an approved professor |
| PATCH | /api/reviews/:id | Bearer (owner student) | Edit own review |
| DELETE | /api/reviews/:id | Bearer (owner student or admin) | Delete a review |
| GET | /api/bookings/:id/video-room | Bearer (owner student/professor) | Short-lived room token + ICE servers for the WebRTC signalling socket |
| GET | /api/faqs?category= | — | Published FAQs, ordered by `sort_order` |
| POST | /api/support-tickets | — (optional Bearer) | Submit a ticket; guests must supply `email`, logged-in callers may omit it |
| GET | /api/support-tickets/me | Bearer | Own submitted tickets |
| GET | /api/admin/faqs | Bearer (admin) | All FAQs incl. unpublished (`?category=&is_published=`) |
| POST | /api/admin/faqs | Bearer (admin) | Create an FAQ |
| PATCH | /api/admin/faqs/:id | Bearer (admin) | Update an FAQ |
| DELETE | /api/admin/faqs/:id | Bearer (admin) | Delete an FAQ |
| GET | /api/admin/support-tickets | Bearer (admin) | All tickets (`?status=`) |
| GET | /api/admin/support-tickets/:id | Bearer (admin) | Ticket detail |
| PATCH | /api/admin/support-tickets/:id | Bearer (admin) | Set `admin_reply` and/or `status`; a reply emails the submitter |
| GET | /api/bookings/:id/messages | Bearer (party student/professor) | Chat history for a booking (oldest first); live delivery is over Socket.io, not REST |

### Availability & slot generation design

- Rules are wall-clock times (`HH:mm`) in the professor's own IANA `timezone` — `utils/slotGenerator.js`
  converts to UTC via `luxon`, computing `day_of_week` from the *local* calendar date, not UTC's.
- A rule is either recurring (`day_of_week`, optionally bounded by `valid_from`/`valid_until`) or a
  one-off (`specific_date`) — a DB `CHECK` constraint enforces exactly one is set.
- An `availability_exceptions` row blacks out an entire date regardless of matching rules.
- `generateAvailableSlots` is a pure function (`utils/slotGenerator.js`, covered by
  `tests/slotGenerator.test.js`) so the timezone/overlap/past-slot math is unit-tested without a DB.
  It takes a `bookedStartTimesUtc` list to exclude taken slots — `availability.controller.js#getSlots`
  and `booking.controller.js#create` both feed it from the real `bookings` table (Phase 4).

### Booking flow & double-booking prevention

- `POST /api/bookings` never trusts a client-supplied `end_at`: it re-runs `generateAvailableSlots`
  for the professor/date and only accepts `start_at` values that come back as an actual open slot —
  the matched slot's `end_at` and duration are what gets stored.
- The remaining race window (between that re-derivation and the `INSERT`) is closed by a **partial
  unique index** on `bookings (professor_id, start_at) WHERE status IN ('pending','confirmed')`
  (see the migration) — a plain unique index would also block rebooking a slot freed up by a
  cancellation, which is why it's partial. `Booking.create` catches
  `SequelizeUniqueConstraintError` and returns `409` if two requests race for the same slot. A
  `SELECT ... FOR UPDATE` pre-check was deliberately not used here — it can't lock a row that
  doesn't exist yet, so it wouldn't actually prevent the race.
- Pricing is snapshotted onto the booking from `professor_profiles.price_per_session` at booking
  time, so a later price change never rewrites an existing booking's cost.
- `price_per_session = 0` auto-confirms the booking (`status=confirmed`, `payment_status=free`).
  A priced session is created `pending`/`unpaid` — Phase 5 (Stripe) is what moves it to
  `confirmed`/`paid` via webhook, so there's intentionally no manual `PATCH /:id/confirm` endpoint.
- `cancel` is blocked once `start_at` has passed (for non-admins) and on already-cancelled/completed
  bookings; `complete` requires `status=confirmed` and `start_at` in the past, and is restricted to
  the owning professor or an admin.

### Payments & invoices (Stripe test mode)

- A `payments` row tracks the Stripe transaction itself (`pending`/`paid`/`failed`/`refunded`),
  separate from `bookings.payment_status`, which is the booking's coarser view (`unpaid`/`paid`/
  `refunded`/`free`). Re-requesting a checkout session for the same booking reuses and updates that
  row instead of creating a duplicate, so a student can retry an abandoned Stripe Checkout.
- `server.js` parses the body with `express.json({ verify })`, which stashes the exact bytes on
  `req.rawBody` alongside the parsed JSON — Stripe's webhook signature check needs those exact
  bytes, and this way every other route still gets normal parsed `req.body` for free.
- The webhook is idempotent by design: Stripe retries delivery, so `handleWebhook` only advances a
  `Payment` that isn't already `paid`. Confirming the booking (`status → confirmed`,
  `payment_status → paid`) happens only from this webhook — never from the client — since a
  Checkout redirect back to the frontend isn't proof payment actually succeeded.
- Invoices are generated on request with `pdfkit` and streamed directly to the response
  (`GET /api/bookings/:id/invoice`); nothing is written to disk or object storage, so there's no
  file-storage service to provision for this feature.
- To exercise the full flow locally: `stripe listen --forward-to localhost:4000/api/webhooks/stripe`,
  then pay with Stripe's test card `4242 4242 4242 4242` (any future expiry/CVC) on the Checkout
  page returned by `checkout_url`.

### Payouts & admin reports (no real money moves)

- A `payouts` row is created automatically — inside the same DB transaction as the status change,
  see `booking.controller.js#complete` — the moment a **paid** booking is marked `completed`. Free
  sessions never get one (there's nothing to disburse). A `UNIQUE` constraint on `payouts.booking_id`
  means a booking can only ever earn one payout, which the `complete` status guard already prevents
  from being attempted twice.
- `paid_simulated` only means an admin called `PATCH /api/admin/payouts/:id/mark-paid` — no bank
  transfer, Stripe Connect, or payout API is involved, matching the "simulated payout" scope of this
  project.
- The admin report endpoints use Postgres `date_trunc('day', created_at)` grouping via Sequelize's
  `fn`/`col`, capped to a 365-day window (`?days=`, default 30) so a bad query param can't force an
  unbounded aggregate scan.

### Reviews & ratings

- A review can only be left on a `completed` booking, by the student who was actually booked, and
  only once — enforced by a `UNIQUE` constraint on `reviews.booking_id` (plus a friendly pre-check
  before hitting it, same pattern as booking creation).
- `professor_profiles.rating_avg`/`total_reviews` are **recomputed from scratch** (`AVG`/`COUNT`
  over `reviews`) inside the same transaction as every create/update/delete, rather than
  incrementally adjusted — so they can never drift out of sync no matter how a review changes.
- Also fixed in this phase: `professor_profiles.total_sessions` had existed since Phase 2 but
  nothing ever incremented it — `booking.controller.js#complete` now does, for every completed
  session (paid or free), since it's the natural place session completion is already recorded.

### Email notifications

- **Gmail SMTP via `nodemailer`**, not Resend — Resend's free tier can only send to the account
  owner's own address until a domain is verified, which would mean nobody who signs up with their
  own email actually receives anything. A Gmail App Password sends to any recipient for free with
  no domain needed, which matters for a portfolio demo real people will click through.
- `utils/mailer.js#sendEmail` no-ops (with a console warning) if `GMAIL_USER`/`GMAIL_APP_PASSWORD`
  aren't set, so the app runs and every other feature works with email simply turned off — no crash
  from a missing credential.
- Every call site fires emails **without awaiting them** (`notify...(...).catch(logAndIgnore)`) —
  booking creation, the Stripe webhook, and the reminder job all attach a `.catch` and move on, so a
  slow or failing SMTP call can never delay an HTTP response or break the webhook/job it's attached
  to. Because the `sendEmail(...)` calls happen before the first `await` inside those helpers, they
  still register synchronously — which is also why the tests can assert on them without extra
  flushing.
- Three triggers, five templates (`utils/emailTemplates.js`, all built on one shared HTML renderer):
  booking created (student + professor), payment succeeded (student + professor), and a reminder
  (`jobs/bookingReminders.job.js`, both parties).
- The reminder job (`node-cron`, every 15 minutes) reminds anyone with a `confirmed` booking
  starting in the next `REMINDER_WINDOW_MINUTES` (60) and hasn't been reminded yet —
  `bookings.reminder_sent_at` is what makes a run idempotent across restarts, the same idempotency
  pattern used for the Stripe webhook. Because it only checks every 15 minutes, an actual reminder
  can land anywhere from ~45–60 minutes ahead of the session; that slack is fine for a heads-up
  email. The job only starts outside `NODE_ENV=test` (`server.js`), same guard as `app.listen`.

### Video call (self-built WebRTC signalling, no Jitsi/Daily)

- `ws/videoSignalling.js` is a raw `ws` server attached to the **same** HTTP server as Express via
  `httpServer.on("upgrade", ...)` (`server.js`) — one Render web service, no second port/process to
  provision on the free tier.
- The server never looks inside offer/answer/ICE-candidate payloads; it just tags each message with
  the sender's `userId` and relays it to the other participant(s) — all real WebRTC negotiation
  happens peer-to-peer in the browser. Rooms are an in-memory `Map<bookingId, Map<userId, ws>>`,
  capped at 2 participants (this project's sessions are 1:1 — see the booking-flow note above about
  `is_group`/group sessions being deliberately out of scope for now).
- **Auth without an Authorization header**: a browser `WebSocket` can't send custom headers, so
  `GET /api/bookings/:id/video-room` (normal JWT-protected REST call, already checks the requester
  is a party to the booking) hands back a separate short-lived (`utils/videoToken.js`, 5 min) token
  that's passed on the WS URL's query string and verified during the HTTP upgrade — unmatched paths
  or bad/expired tokens just get `socket.destroy()`ed before any WebSocket handshake completes.
- Joining is only allowed for a `confirmed` booking, and only from `JOIN_EARLY_MINUTES` (10) before
  `start_at` through `end_at` — not hours early, not after the session's over.
- ICE servers (`utils/iceServers.js`): Google's public STUN plus a free TURN relay
  (`TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL`, e.g. Metered.ca's Open Relay project) when
  configured — STUN alone often can't traverse symmetric/restrictive NAT, which would make calls
  between some real-world networks silently fail to connect.
- The relay logic (`handleConnection`) is exported separately from the HTTP-upgrade plumbing
  (`attach`) specifically so `tests/videoSignalling.test.js` can drive it with plain `EventEmitter`
  stand-ins instead of real sockets — same "keep the trixy logic pure and testable" approach as
  `utils/slotGenerator.js`. It's also verified against a real running server + real `ws` client
  connections as a one-off smoke test (HTTP upgrade → JWT check → two-way relay all confirmed
  working end-to-end, not just the mocked unit tests).
- In-memory rooms mean a process restart drops any calls in progress — an accepted trade-off for a
  single free-tier instance; a production version would move room state to something shared (e.g.
  Redis) before scaling past one instance.

### FAQ & support tickets

- `POST /api/support-tickets` is intentionally open to guests (no `.edu` account needed to ask a
  question) but still recognizes a logged-in caller: `attachUserIfPresent`
  (`middleware/authJwt.js`) is a new **non-blocking** auth middleware — unlike `verifyToken`, a
  missing/expired/malformed token never 401s, it just leaves `req.authUser` unset and calls
  `next()` either way. A guest must supply `email` in the body; a logged-in caller can omit it and
  the token's email is used instead, with `user_id` linked automatically.
- Admin replying auto-bumps a still-`open` ticket to `in_progress` unless the same request also sets
  an explicit `status` — the common case (reply first, close later) needs no second API call, but an
  admin can still reply-and-close in one request.
- A reply fires an email to the ticket's `email` (same fire-and-forget pattern as every other
  notification in this codebase — see Phase 8) built from a template that, unlike the
  booking-related ones, doesn't reuse `renderBookingEmailHtml` since a ticket has no
  price/start_at to render.

### Realtime chat (Socket.io)

- **Two different real-time transports, one HTTP server.** Phase 9's video signalling is raw `ws`
  with a custom protocol; chat uses **Socket.io** instead (as originally planned) since it fits a
  simple broadcast/room chat better — automatic reconnection, room management (`socket.join`/
  `io.to(room).emit`), and acknowledgement callbacks for free, none of which the video path needs
  (it's a dumb 2-party relay). Both attach to the **same** `http.Server` in `server.js`
  (`ws/videoSignalling.js` + `ws/chatServer.js`) — one Render service, no extra port.
- **This required fixing a real bug from Phase 9**: Node fires *every* registered `"upgrade"`
  listener on an `http.Server` for *every* upgrade request, and `ws/videoSignalling.js` used to
  unconditionally `socket.destroy()` any request that wasn't its own `/ws/video` path — which would
  have silently killed every Socket.io handshake (mounted at `/socket.io/`) before Socket.io's own
  listener ever saw it. Fixed to just `return` (do nothing) on a path it doesn't own, letting other
  listeners take it. Covered by `tests/videoSignallingUpgradeRouting.test.js`, and verified against
  **real** `ws` + `socket.io-client` connections hitting the same running server — both connect
  successfully side by side, not just asserted via mocks.
- **Auth differs from the video socket on purpose**: Socket.io's handshake is a real HTTP
  request/response round-trip before the transport upgrades, so it can carry an `auth` payload — the
  client passes the normal short-lived access token via `io(url, { auth: { token } })`, verified
  server-side in `io.use(authenticateSocket)`. No separate short-lived token type is needed here,
  unlike `utils/videoToken.js` for the raw browser WebSocket case, which has no such handshake step.
- `utils/bookingChatAccess.js#getBookingForChat` is the single access rule — either party to a
  non-cancelled booking — shared by both the Socket.io handlers (`join-booking`, `send-message`) and
  the REST history endpoint, so the rule can't drift between the two transports.
- The server never trusts client-claimed identity beyond the authenticated `socket.user.id`; every
  `send-message` re-checks room membership rules server-side rather than assuming a prior
  `join-booking` still holds.
