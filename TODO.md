# TODO — MVP Container

Working list toward go-live. Updated 2026-07-15.

## Go-live blockers

- [x] **Real email delivery** — two transports in `apps/api/smtp.mjs`: SendGrid HTTP API
      (preferred — Railway blocks ALL outbound SMTP ports, verified 2026-07-15) and
      Gmail SMTP (587 STARTTLS / 465) for hosts that allow it. Log-only dev mode when
      neither is configured. SMS remains log-only until a gateway (e.g. Twilio) is added.
- [ ] **Set Railway env vars** — `SENDGRID_API_KEY` + `MAIL_FROM` (the SendGrid-verified
      single sender), optional `MAIL_FROM_NAME` / `ORDER_NOTIFY_EMAILS` (defaults to
      tgmoore@gmail.com). The `SMTP_USER`/`SMTP_PASS` vars are dead weight on Railway
      (SMTP blocked) — remove them or leave them; SendGrid wins when both are set.
- [x] **True authentication** — admin logins require an emailed 6-digit code;
      email-code password reset for all roles; seeded `test1234` passwords force a
      change at the door; checkout verification codes now arrive by email.
- [x] **Phone-payment checkout** — card fields removed; cart explains payment is
      collected by phone. Orders land as *Pending Review* with an admin checklist:
      validate availability → call customer → payment collected → assign driver.
- [x] **Order intake notifications** — every new order emails ORDER_NOTIFY_EMAILS
      with full details, and customers get a "we'll call you" confirmation.
- [x] **Driver-assignment + internal messaging** — assign-driver notifies the customer
      (email/SMS-log) and the driver (inbox message + email + SMS-log). Admin portal has
      an Inbox (reply to drivers & customers); customers have a Messages tab (message
      dispatch, see replies); drivers keep their field-app inbox. 30-test API suite
      passes (`node apps/api/test.mjs`).
- [ ] **Deploy** — commit + push (Railway redeploys API; rebuild ships the web app),
      then set the env vars above and place a real test order.

## Hardening (CSV storage, pre-database)

- [x] Atomic CSV writes (temp file + rename) — a crash mid-write can't corrupt a table.
- [ ] Automated backup of the Railway data volume (daily snapshot of /data CSVs + photos).
- [x] Serialized request handling so concurrent writes can't lose updates.
- Keep Railway at exactly 1 API replica (CSV storage + SSE assume a single instance).

## How this file works

**One list, three horizons.** Everything lives here — blockers, roadmap, per-portal
work, and what shipped. There is no second roadmap document: a roadmap kept apart from
the task list drifts within a week, and then neither one is trusted.

- **Go-live blockers** — stops a launch.
- **Major roadmap** — the horizon. Big enough to need a decision before it needs a task.
- **Per-area sections** (marketing portal, etc.) — a roadmap item broken into work.
- **Shipped** — dated, so the roadmap doesn't quietly re-grow what already exists.

A roadmap item graduates by growing its own section, then its entries move to Shipped.

### Findings from demo/beta testing

Use the blue **Report an issue** tab in any portal — it captures the page, the browser
and the recent console errors with your note, and files into **Admin → Beta Issues**,
where each one has a *Copy as prompt* button. That is the intake; nothing needs to be
retyped here by hand. Findings get triaged into the sections above at merge time.

Anything from a separate document (workflow designs, UX notes) merges in here too —
send it over and it lands under the section it belongs to.

## Major roadmap

- [ ] **Multi-tenant resellers** (added 2026-07-15) — make the entire site multi-tenant so
      multiple resellers can sign up, each with their own branding, inventory, users, orders,
      and data isolation. Today the only reseller is "MVP Containers". Touches everything:
      per-tenant CSV namespaces (or the database move), tenant-scoped auth/RBAC, branded
      marketplace themes, per-tenant notification addresses, and tenant admin onboarding.
- [ ] **Real SMS gateway** (Twilio) — SMS is logged to outbox.csv but not delivered;
      wire it up when ready and checkout/2FA can move back to text codes.
- [ ] **Implement RBAC** using the following roles, implaement single sign on with access
      to each portal as setup within Admin Portal as new node. User profiles to include admin, driver, 
      customer with ability to change by user or multi-select by user which profile they are. admin will
      have access to Admin Portal. Driver will have access to Field App. Customer will have access to 
      marketplace. Admin as access to all portals. 
- [x] **Create New Portal - Marketing** — first cut shipped: per-reseller contacts with
      consent, ZIP-zone audiences, campaign composer, delivered/opens/clicks/revenue
      metrics, provider connections and plan tiers. The multi-channel build-out is
      blueprinted in `MARKETING-PORTAL.md` and tasked below.

## Payments (Stripe) — NOT BUILT

Checkout today collects an order and says "we'll call you"; there is no card
processing anywhere in the codebase. This is the single largest gap between the demo
and a site that can take money.

- [ ] Stripe account + business verification. **Calendar-bound** (days to weeks of
      underwriting); start it before the code, not after.
- [ ] Payment Intents on checkout — card, Apple/Google Pay. Never store a PAN; the
      card never touches our server.
- [ ] Webhook receiver (`payment_intent.succeeded/failed`, `charge.refunded`) as the
      authority on paid state — the browser's word for "it worked" is not evidence.
- [ ] Idempotency keys on every charge so a double-tap or retry can't bill twice.
- [ ] Order state machine: pending → authorized → captured → fulfilled → refunded,
      replacing today's phone-payment checklist.
- [ ] Deposits + partial payments (rentals take a month's deposit; custom builds take
      a deposit up front).
- [ ] Refunds from the admin portal, with an audit row per refund.
- [ ] Multi-tenant money: which seller is paid for which order (Stripe Connect if
      resellers are paid directly, or one account + internal ledger). **Decision needed
      before building** — it changes the schema.
- [ ] Sales tax by delivery ZIP (Stripe Tax or Avalara) — a container delivered across
      state lines is a taxable event we currently ignore.
- [ ] PCI SAQ-A questionnaire (trivial with hosted fields, but it must be filed).

## Rental subscriptions — NOT BUILT

A rental today prices `term × monthly rate` once at checkout and then nothing ever
renews, invoices or ends. Renting is the recurring half of the business and none of
that machinery exists.

- [ ] Subscription records: unit, customer, rate, start, term, renewal mode, status.
- [ ] Stripe Subscriptions (or scheduled Payment Intents) for the monthly charge.
- [ ] Dunning: retry schedule, failed-payment emails, and what happens on day 30
      (suspend? recover the unit? — a policy decision, not a code one).
- [ ] Proration on early return, and end-of-term: auto-renew, month-to-month, or return.
- [ ] Deposit hold + release, tied to the return inspection the field app already runs.
- [ ] Customer self-serve: see the subscription, change the card, schedule a return.
- [ ] Rental revenue reporting separated from sales (MRR, churn, units on rent).
- [ ] Return-to-inventory automation: subscription ends → unit re-enters the marketplace
      once the return walk-around clears it.

## Production infrastructure — NOT BUILT

- [ ] **Postgres migration** (promoted from Nice-to-have — it now blocks payments,
      subscriptions and the marketing portal). Every `SCHEMAS` entry is already a table
      definition; the CSV read/write layer becomes the query layer.
- [ ] Hosting + CI: build, migrations and rollback on deploy.
- [ ] Automated backups with a **restore actually tested**, not just configured.
- [ ] Error tracking (Sentry) and uptime alerting — right now a 500 in production is
      invisible until a customer calls.
- [ ] Secrets management: no keys in env files on a laptop.
- [ ] Rate limiting + bot protection on auth, checkout and the quote forms.
- [ ] Load check: the API is single-instance by design (CSV + SSE). Confirm Postgres
      lifts that, then run more than one replica.
- [ ] Real photography to replace `demo-photos/` and the borrowed-photo fallback.

## Legal & policy — NOT BUILT

- [ ] Terms of sale, rental agreement, privacy policy, cookie/consent banner.
- [ ] Refund + cancellation policy stated at checkout (required before charging cards).
- [ ] Damage-claim terms: who is liable for what, referenced by the claim document.
- [ ] Business insurance + reseller agreements. **Calendar-bound.**

## Marketing portal — multi-channel build-out

Full technical blueprint, schema and rationale: **`MARKETING-PORTAL.md`**.
Vendors deliver messages; **our database owns contacts, consent and attribution** — two
systems of record for consent is a legal problem, not a sync problem.

**Blocked on a decision from the CMO** (see blueprint §9): one sending brand vs. per-reseller
brands. This gates 10DLC registration, which is 2–6 weeks of calendar time we cannot compress.

### Phase 0 — foundation & compliance (gates everything; start week 1)
- [ ] Split `mktcontacts.consent` into `consentEmail` / `consentSms` / `consentMail`,
      plus `consentSource`, `consentAt`, `consentIp` — the TCPA evidence bundle.
      One boolean can't express "email yes, texts no", which is the common real state.
- [ ] `dedupeKey` per contact (lower(email) / E.164 phone), unique per seller.
- [ ] Submit 10DLC brand + campaign registration (calendar time — start before anything else).
- [ ] Per-reseller sending subdomains with SPF/DKIM/DMARC. Without this one reseller's
      complaint rate poisons deliverability for every other reseller.
- [ ] `/r/<clickId>` redirector + `mkt_touch` ledger + `sbx_cid` first-party cookie.
- [ ] Add `orders.clickId` so revenue joins to a campaign in one query.
- [ ] **Prerequisite:** the Postgres move (below) — multi-channel volume outgrows CSVs immediately.

### Phase 1 — audiences + email (weeks 3–5)
- [ ] `mkt_audiences` — saved definitions (ZIP prefixes, tags, last-order age, never-ordered),
      resolved at send time, not frozen at creation.
- [ ] Klaviyo delivery integration + webhook ingest (delivered/open/click/bounce/unsub).
- [ ] `mkt_sends` delivery ledger — one row per contact per step, with `costCents`.
- [ ] Campaign ROI tile: delivered → opened → clicked → attributed revenue, per ZIP zone.

### Phase 2 — SMS (weeks 6–8)
- [ ] SMS channel through the same audience/ledger path.
- [ ] Quiet hours 8am–9pm **in the recipient's timezone**, derived from their ZIP.
- [ ] STOP/HELP honoured in seconds and written back to OUR `consentSms`.
- [ ] Per-segment cost capture (SMS bills per 160 chars — long copy silently doubles spend).

### Phase 3 — direct mail (weeks 9–11)
- [ ] Lob integration: postcards/letters triggered from journeys, address verification.
- [ ] QR code = `/r/<clickId>` — the only way mail is measurable — plus a vanity short URL.
- [ ] Per-piece cost + delivery status back into `mkt_sends`.

### Phase 4 — journeys / follow-up funnels (weeks 12–15)
- [ ] `mkt_journeys` + `mkt_journey_steps` (wait → channel → template, with stop conditions).
- [ ] Triggers: quote-with-no-order, order-delivered, abandoned cart, manual enrol.
- [ ] Stop-if rules (ordered / replied / unsubscribed) evaluated before every step.

### Phase 5 — AI video (weeks 16–19)
- [ ] HeyGen base renders (~10–20 clips), then composite ZIP/city/depot/price as an overlay
      pass we control — NOT one render per ZIP per reseller (cost/benefit doesn't hold).
- [ ] `mkt_assets` with a human approval gate: nothing posts under a reseller's name
      without a named approver. An AI clip that misstates a price is a claim we must honour.
- [ ] Measure on one message × one reseller × ten ZIP zones before scaling.

### Phase 6 — executive reporting (weeks 20–22)
- [ ] First-touch, last-touch and position-based (40/20/40) side by side — showing one
      model invites the argument that the number was chosen.
- [ ] ROI per reseller × ZIP zone × channel; scheduled executive email.
- [ ] Optional HubSpot **read-only** mirror if the team wants a familiar CRM UI.

### Explicitly NOT doing (and why)
- [ ] ~~GoHighLevel / HubSpot as system of record~~ — a second copy of contacts and consent
      to reconcile; GHL's sub-account model fights our reseller/territory data.
- [ ] ~~Make.com/Zapier owning attribution~~ — ops glue only. Anything that writes a metric
      we report on goes through our API, or the ROI number can't be audited or rebuilt.
- [ ] ~~Purchased lists~~ — one bad list blacklists a sending domain for months.

## Shipped

- [x] Claim pipeline tightened: no Awaiting-inspection stage, workspace opens
      full-page in its own tab with the audit timeline in it, no send/download
      shortcuts on the lists, inspector hands off to the supplier who files with
      the line, and the shipper must open the full claim before approving — 2026-08-18
- [x] Damage claims gated behind an admin-granted `claims` role — a driver or
      inspector can inspect and grade by role, but only reviews and submits claims
      once it's ticked on their account — 2026-08-18
- [x] Claims are post-inspection work: the Inspections queue runs the same guided
      walk a driver does, and a claim opens into review → estimate → send —
      required note, estimate value and the repair shop's uploaded document, then
      Submit to Shipper / Download ZIP / Email PDF / Email Link. The claim document
      is one printable page with every photo, reason and note — 2026-08-18
- [x] Guided walk-around inspection — 8 stations in walking order, each with its
      photo(s) and the condition question for that spot; a structural answer can't
      continue without a damage photo. Any finding queues the unit for an inspector
      (no grade offered); a clean walk grades on the spot. Claims are raised by the
      inspector after verifying — 2026-08-18
- [x] Report damage from the walk-around — the photo-documentation step offers
      Inspection Required (held off the marketplace until an inspector grades it)
      or a Damage Claim; grading releases the hold. "Retail grading" is now the
      "Inspection Required" queue, and the adjuster role is the Inspector role —
      drivers may inspect, they're just never required to — 2026-08-18
- [x] Damage collection as its own photo type — reason-first capture (Bent, Hole,
      Rust, Scrape, Warped…), per-photo notes, and the whole claim packaged as a
      .zip (download, email to the shipping line, or a signed share link that needs
      no sign-in) from the field app, supplier portal and shipper review — 2026-08-18
- [x] Live cross-app auto-refresh (SSE): admin ⇄ field ⇄ marketplace sync without
      manual browser refresh — 2026-07-15
- [x] Go-live auth + phone-payment pipeline + 3-way messaging (see blockers above) — 2026-07-15
- [x] 3D spinner simplified: real front/back photos on the ends, size callout on the
      sides, top/bottom unchanged — 2026-07-15

## Nice-to-have / later

- [ ] Code-split the web bundle (HEIC converter + background-removal model warn at >500 kB).
- [ ] Add `apps/.DS_Store` to .gitignore.
- [ ] Move from CSVs to a real database when volume outgrows them (multi-tenancy will force this).
