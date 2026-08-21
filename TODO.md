# TODO — MVP Container

Working list toward go-live. Updated 2026-08-18.

Phased plan below: **retail sales launch week 9**, rentals week 15, marketing alongside.
Roadmap for presenting: `roadmap.html`.

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

## The plan — retail first, rentals after, marketing alongside

Decided 2026-08-18. **Retail sales launch in week 9**; rentals stay phone-quoted until
week 15; marketing goes live with the site rather than after it.

The sequence is set by what earns soonest against what takes longest. Buying a container
is a one-time charge — the shortest path from here to revenue. Renting is recurring
billing, dunning and deposit handling: more machinery, and it can wait behind a working
till. Marketing's compliance clock (10DLC, domain reputation) is 2–6 weeks of pure
calendar, so it starts in week 1 even though nothing ships from it until week 7.

**Three things gate the date and no amount of engineering speed moves them:** Stripe
underwriting, 10DLC brand registration, and the legal documents you cannot charge a card
without. All three start week 1.

| Phase | Weeks | What it delivers |
|---|---|---|
| P1 · Database & infrastructure | 1–3 | Postgres, CI, backups, monitoring |
| P2 · Marketing foundation | 1–3 | Consent model, 10DLC filed, DMARC, click ledger |
| P3 · Payments | 3–7 | Stripe, tax, refunds, order state machine |
| P4 · Legal & content | 2–8 | Policies, agreements, real photography |
| P5 · Audiences + email | 4–7 | First campaign out the door |
| **🚀 Retail launch** | **9** | **Buy-only, taking cards** |
| P6 · SMS | 9–11 | Gated on the 10DLC filed in week 1 |
| P7 · Rental subscriptions | 10–15 | Recurring billing, dunning, deposits |
| P8 · Direct mail | 16–18 | Lob, QR attribution |
| P9 · Journeys | 19–22 | Follow-up funnels |
| P10 · AI video | 23–26 | Per-ZIP social, human-approved |
| P11 · Executive reporting | 27–28 | Attribution models, ROI by territory |

Presentable version of this plan: **`roadmap.html`** (open it in a browser).

---

## P1 · Database & infrastructure — weeks 1–3

Blocks payments, subscriptions and marketing. Nothing else starts until Postgres lands.

- [ ] **Postgres migration** (promoted from Nice-to-have — it now blocks payments,
- [ ] Hosting + CI: build, migrations and rollback on deploy.
- [ ] Automated backups with a **restore actually tested**, not just configured.
- [ ] Error tracking (Sentry) and uptime alerting — right now a 500 in production is
- [ ] Secrets management: no keys in env files on a laptop.
- [ ] Rate limiting + bot protection on auth, checkout and the quote forms.
- [ ] **Server-side auth on order placement** — the guest add-to-cart sign-up gate
      (PR #86) is UI-only; the API still accepts an anonymous `POST /orders`. In
      production the server must refuse orders without a valid session, so the
      account requirement can't be bypassed by calling the API directly.
- [ ] Load check: the API is single-instance by design (CSV + SSE). Confirm Postgres
- [ ] Real photography to replace `demo-photos/` and the borrowed-photo fallback.

## P2 · Marketing foundation & compliance — weeks 1–3

Calendar-bound. Start in week 1; nothing ships from it until P5.

- [ ] Split `mktcontacts.consent` into `consentEmail` / `consentSms` / `consentMail`,
- [ ] `dedupeKey` per contact (lower(email) / E.164 phone), unique per seller.
- [ ] Submit 10DLC brand + campaign registration (calendar time — start before anything else).
- [ ] Per-reseller sending subdomains with SPF/DKIM/DMARC. Without this one reseller's
- [ ] `/r/<clickId>` redirector + `mkt_touch` ledger + `sbx_cid` first-party cookie.
- [ ] Add `orders.clickId` so revenue joins to a campaign in one query.
- [ ] **Prerequisite:** the Postgres move (below) — multi-channel volume outgrows CSVs immediately.

## P3 · Payments — weeks 3–7

The largest gap between the demo and a site that takes money.

- [ ] Stripe account + business verification. **Calendar-bound** (days to weeks of
- [ ] Payment Intents on checkout — card, Apple/Google Pay. Never store a PAN; the
- [ ] Webhook receiver (`payment_intent.succeeded/failed`, `charge.refunded`) as the
- [ ] Idempotency keys on every charge so a double-tap or retry can't bill twice.
- [ ] Order state machine: pending → authorized → captured → fulfilled → refunded,
- [ ] Deposits + partial payments (rentals take a month's deposit; custom builds take
- [ ] Refunds from the admin portal, with an audit row per refund.
- [ ] Multi-tenant money: which seller is paid for which order (Stripe Connect if
- [ ] Sales tax by delivery ZIP (Stripe Tax or Avalara) — a container delivered across
- [ ] PCI SAQ-A questionnaire (trivial with hosted fields, but it must be filed).

## P4 · Legal & content — weeks 2–8

Mostly other people's calendars. Start early, chase weekly.

- [ ] Terms of sale, rental agreement, privacy policy, cookie/consent banner.
- [ ] Refund + cancellation policy stated at checkout (required before charging cards).
- [ ] Damage-claim terms: who is liable for what, referenced by the claim document.
- [ ] Business insurance + reseller agreements. **Calendar-bound.**

## P5 · Audiences + email — weeks 4–7

- [ ] `mkt_audiences` — saved definitions (ZIP prefixes, tags, last-order age, never-ordered),
- [ ] Klaviyo delivery integration + webhook ingest (delivered/open/click/bounce/unsub).
- [ ] `mkt_sends` delivery ledger — one row per contact per step, with `costCents`.
- [ ] Campaign ROI tile: delivered → opened → clicked → attributed revenue, per ZIP zone.

## 🚀 Retail launch — week 9

- [ ] Buy-only checkout live with cards, tax and refunds.
- [ ] Rentals still quoted by phone (the Rent tab says so plainly, no dead end).
- [ ] First real order placed, paid, assigned to a driver and delivered end to end.
- [ ] Error tracking watched daily for the first fortnight.

## P6 · SMS — weeks 9–11

- [ ] SMS channel through the same audience/ledger path.
- [ ] Quiet hours 8am–9pm **in the recipient's timezone**, derived from their ZIP.
- [ ] STOP/HELP honoured in seconds and written back to OUR `consentSms`.
- [ ] Per-segment cost capture (SMS bills per 160 chars — long copy silently doubles spend).

## P7 · Rental subscriptions — weeks 10–15

Recurring billing, once the till works.

- [ ] Subscription records: unit, customer, rate, start, term, renewal mode, status.
- [ ] Stripe Subscriptions (or scheduled Payment Intents) for the monthly charge.
- [ ] Dunning: retry schedule, failed-payment emails, and what happens on day 30
- [ ] Proration on early return, and end-of-term: auto-renew, month-to-month, or return.
- [ ] Deposit hold + release, tied to the return inspection the field app already runs.
- [ ] Customer self-serve: see the subscription, change the card, schedule a return.
- [ ] Rental revenue reporting separated from sales (MRR, churn, units on rent).
- [ ] Return-to-inventory automation: subscription ends → unit re-enters the marketplace

## P8 · Direct mail — weeks 16–18

- [ ] Lob integration: postcards/letters triggered from journeys, address verification.
- [ ] QR code = `/r/<clickId>` — the only way mail is measurable — plus a vanity short URL.
- [ ] Per-piece cost + delivery status back into `mkt_sends`.

## P9 · Journeys / follow-up funnels — weeks 19–22

- [ ] `mkt_journeys` + `mkt_journey_steps` (wait → channel → template, with stop conditions).
- [ ] Triggers: quote-with-no-order, order-delivered, abandoned cart, manual enrol.
- [ ] Stop-if rules (ordered / replied / unsubscribed) evaluated before every step.

## P10 · AI video — weeks 23–26

- [ ] HeyGen base renders (~10–20 clips), then composite ZIP/city/depot/price as an overlay
- [ ] `mkt_assets` with a human approval gate: nothing posts under a reseller's name
- [ ] Measure on one message × one reseller × ten ZIP zones before scaling.

## P11 · Executive reporting — weeks 27–28

- [ ] First-touch, last-touch and position-based (40/20/40) side by side — showing one
- [ ] ROI per reseller × ZIP zone × channel; scheduled executive email.
- [ ] Optional HubSpot **read-only** mirror if the team wants a familiar CRM UI.

## Aarcadian partnership — supply, consignment, damage split

Runs alongside the phases above, on the partner's calendar rather than ours.
Rationale and the full term-sheet breakdown: `AARCADIAN-AGREEMENT.md`.
MOU is at v0.4 (`SteelBox-Aarcadian-MOU-v0.4.docx`) — non-binding.
Charted alongside the phases in `roadmap.html`.

**Paper (blocks nothing technical, but blocks the relationship):**

- [ ] **Return the MOU with comments** — both teams mark up v0.4 and send back.
      *Week 1 · 1 week · both teams.*
- [ ] **Mutual NDA + IP assignment** signed **before** the workflow design sessions — MOU §7
      asks Aarcadian to help design the repair→estimate→shipper flow, and contributed
      design with no assignment clause is a claim waiting to happen.
      *Weeks 1–2 · counsel, both sides.*
- [ ] **Sign the MOU** at the working session, and settle the three §10 questions there:
      the 50/50 basis (recovery vs. estimate — recommendation is recovery plus a fixed
      inspection fee), repair-yard selection and the estimate approval threshold, and
      whether the 45-mile free radius covers gate-buys. *Week 2 · one session.*
- [ ] **Identify containers for the New Orleans reseller (MVP)** — the first unit list:
      sizes, grades, wholesale pricing, which depot each sits at, and how many go to the
      transfer station first. This is the deliverable that turns the MOU into inventory.
      *Weeks 2–4 · Aarcadian + SteelBox.*
- [ ] **Establish the contract docs** — counsel drafts the master agreement + Schedule A
      (supply & consignment), Schedule B (damage, estimates, 50/50), Schedule C (platform
      licence); both sides review; executed. *Weeks 3–8 · counsel-paced, chase weekly.*
- [ ] **Repair → estimate → shipper workflow design sessions** with Aarcadian — what an
      estimate must contain to be accepted, which damage classes are repaired vs. sold
      as-is, which yards, what each line pays on. *Weeks 4–6 · joint, gated on the NDA.*
- [ ] **First units staged and listed** — units at a transfer station, documented, graded
      and live on the marketplace. *Weeks 5–6 · SteelBox.*

**Build — what the agreement promises that the platform can't do yet:**

- [ ] **Consignment ownership** on containers: owned vs. held-on-consignment, the
      consignor of record, and title passing at a named moment. Gated on the Postgres
      move in P1 for the same reason payments are. *Weeks 6–11 · with the settlement
      ledger below, one piece of work.*
- [ ] **Settlement ledger** — what is owed to the consignor per sold unit, when it was
      paid, and a statement either side can pull. Today the money side stops at the order.
      *Weeks 6–11.*
- [ ] **Damage split fields** on claims: split basis, amount recovered from the line,
      amount paid out and to whom. `estimateAmount` alone can't settle a 50/50.
      *Weeks 10–14.*
- [ ] **Transfer stations** as a location type holding another party's inventory —
      depots exist, stations don't. *Weeks 10–14.*
- [ ] **Supplier access audit trail** — who at the supplier viewed or changed what,
      which is what makes the Schedule C licence enforceable. *Weeks 10–14.*
- [x] As-is damaged listings: grade `D` with 1–5 severity, damage photos on the listing
      and a pre-filled discount ladder, kept distinct from `R` (Refurbished). The shared
      grade badge now renders `D` instead of falling back to an unlabelled grey chip —
      2026-08-18

## Explicitly NOT doing (and why)
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

## Homepage redesign — what the new design promises but doesn't yet have

The homepage was rebuilt from the supplied prototype on 2026-08-19. The design
positions SteelBox as a marketplace of local resellers, which introduces two
destinations the site does not have. Both currently say so out loud via the
"not built yet" toast rather than dead-ending.

- [ ] **Reseller sign-up** — the "Sign up your container company" flow the new
      Partners section sells: consignment listing, exclusive ZIPs, SLA and NPS
      terms. Overlaps the consignment work in the Aarcadian section.
- [ ] **Warranty page** — the warranty bar's "Learn more" has nowhere to go. Needs
      the actual terms of the 90-day doors-and-seals warranty, which is a P4 legal item.
- [ ] Rebuild `og/container-hero.jpg` at a landscape size. It is 750×1000
      portrait and the redesign uses it full-bleed behind the hero, so it is
      upscaled well past its resolution on any desktop viewport.
- [ ] Decide where **Insights** lives. The redesign gave its nav slot to
      Partners; the shop tab still works by URL but nothing links to it.

- [ ] The marketplace overflows ~11px horizontally on a 412px phone (scrollWidth 423)
      — found while placing the back-to-top button; some element in the shop grid is
      wider than the viewport. Cosmetic but it makes fixed elements anchor oddly.

## Nice-to-have / later

- [ ] Code-split the web bundle (HEIC converter + background-removal model warn at >500 kB).
- [ ] Add `apps/.DS_Store` to .gitignore.
- [ ] Move from CSVs to a real database when volume outgrows them (multi-tenancy will force this).
