# Reseller Marketing Portal — Technical Blueprint

**From:** CTO · **To:** CMO and the marketing team · **Date:** 2026-08-18
**Status:** proposal for approval. Nothing below is built yet except where marked *(exists)*.

---

## 1. The one decision everything else depends on

**We own the contact record and the attribution ledger. Vendors deliver messages; they do not hold truth.**

The stack as proposed has us buying two systems of record — an ESP (Klaviyo or
ActiveCampaign) *and* a CRM (GoHighLevel or HubSpot). Both store contacts, segments,
consent and automations. Two copies of consent state is not a sync problem, it is a
**legal problem**: an unsubscribe honoured in one system and missed in the other is a
CAN-SPAM/TCPA violation with a per-message penalty, and "the integration was down" is
not a defence.

So: contacts, consent, audiences, sends, touches and costs live in **our Postgres**.
Klaviyo/Lob/HeyGen are *delivery endpoints* we call and whose webhooks we record.

This is not a purity argument — it is the only way the ROI report the CMO wants can be
produced at all. Attribution that lives inside a vendor cannot join to `orders`, and
attribution that lives in a Make.com scenario cannot be rebuilt when a task fails
silently at 2am.

### What I recommend we buy, and what I recommend we skip

| Need | Recommendation | Why / instead of |
|---|---|---|
| Marketing email + SMS | **Klaviyo** | One vendor for both, strong segmentation, native SMS with STOP handling. ActiveCampaign is fine but weaker on commerce data. |
| Transactional email | **Resend** *(separate from marketing)* | Order confirmations must never share a sending domain or reputation with campaigns. A campaign spam spike must not stop an order receipt. |
| Direct mail | **Lob** | Agreed. Good API, real per-piece tracking, address verification included. |
| AI video | **HeyGen** for base renders + our own compositing | See §6 — a full avatar render *per ZIP per reseller* is the wrong unit of work and will cost more than it returns. |
| CRM | **Skip GoHighLevel / HubSpot as system of record** | We already hold contacts, quotes, orders and campaigns. Adding a CRM creates a second truth to reconcile. If the team wants a familiar UI, HubSpot as a **read-only mirror** is acceptable in Phase 6. GoHighLevel is agency-shaped (sub-accounts, its own billing) and will fight our reseller/territory model. |
| Workflow glue | **Make.com — ops only** | Fine for "notify the account manager in Slack". Never for anything that writes a metric we report on. |
| Product analytics | **PostHog** | Already on the production shortlist. Behaviour, not attribution. |

**Net:** Klaviyo + Lob + HeyGen + Resend + PostHog, glued by our own API. One vendor per
job, no vendor holding the customer record.

---

## 2. What already exists *(build on this, don't replace it)*

| Piece | Where | Notes |
|---|---|---|
| Per-reseller contacts | `mktcontacts` | `sellerId, name, email, phone, zip, city, state, tags, source, consent, createdAt` |
| Campaigns + metrics | `mktcampaigns` | `type, status, audienceKind (all\|zip), zipPrefixes, budget, spend, delivered, opens, clicks, conversions, revenue, unsubs, managedBy` |
| Vendor connections | `mktconnections` | `sellerId, provider, status, apiKeyMasked` |
| Reseller territory | `sellers.territoryZips` | 3-digit ZIP prefix zones — **this is our targeting primitive** |
| Plan tiers | `sellers.marketingPlan` | `starter \| growth \| pro` — gates channels and volume |
| UTM capture | `lib/attribution.ts` | First-touch + last-touch + `gclid`, attached to leads and quotes |
| Portal UI | `pages/marketplace/Marketing.tsx` | Contacts, campaign composer, ZIP audience picker, reports |

The ZIP-prefix territory model is the asset here. Every other marketing platform would
make us rebuild "which reseller owns this lead" as tags and hope. We have it as data.

---

## 3. Data schema

Extends the three tables above. Names are Postgres; today's CSV columns port directly.

### 3.1 Consent — split by channel, never one boolean

```sql
ALTER TABLE mkt_contacts
  ADD consent_email      boolean NOT NULL DEFAULT false,
  ADD consent_sms        boolean NOT NULL DEFAULT false,
  ADD consent_mail       boolean NOT NULL DEFAULT true,   -- mail is opt-out, not opt-in
  ADD consent_source     text,        -- 'checkout' | 'import:2026-08-01.csv' | 'web-form'
  ADD consent_at         timestamptz,
  ADD consent_ip         inet,        -- TCPA evidence: who agreed, from where, when
  ADD unsub_email_at     timestamptz,
  ADD unsub_sms_at       timestamptz,
  ADD dedupe_key         text;        -- lower(email) or E.164 phone; unique per seller
```

One boolean cannot express "emails yes, texts no", which is the most common real state.
`consent_source` + `consent_at` + `consent_ip` is the evidence bundle a TCPA complaint asks
for; without it a complaint is indefensible regardless of whether we were right.

### 3.2 Audiences — a saved definition, not a frozen list

```sql
CREATE TABLE mkt_audiences (
  id            text PRIMARY KEY,
  seller_id     text NOT NULL REFERENCES sellers(id),
  name          text NOT NULL,
  zip_prefixes  text[],        -- ['700','701'] — defaults to the seller's territory
  tags_any      text[],
  tags_none     text[],
  last_order_days_gt int,      -- win-back: ordered, but not lately
  never_ordered boolean,
  grade_interest text[],       -- from browse behaviour
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

Definitions, not snapshots — a list frozen at creation is stale the day after. Resolve at
send time and record the resolved count on the campaign.

### 3.3 Campaigns, journeys, sends

```sql
ALTER TABLE mkt_campaigns
  ADD channel        text,     -- 'email' | 'sms' | 'mail' | 'social'
  ADD audience_id    text REFERENCES mkt_audiences(id),
  ADD template_id    text,
  ADD approval_state text NOT NULL DEFAULT 'draft',  -- draft|pending|approved|rejected
  ADD approved_by    text,
  ADD scheduled_at   timestamptz,
  ADD provider       text,     -- 'klaviyo' | 'lob' | 'heygen'
  ADD provider_ref   text;     -- their id, for reconciliation

-- Sequential follow-up funnels
CREATE TABLE mkt_journeys (
  id text PRIMARY KEY, seller_id text NOT NULL, name text NOT NULL,
  trigger_kind text NOT NULL,          -- 'quote_no_order' | 'order_delivered' | 'abandoned_cart' | 'manual'
  trigger_window_hours int,
  status text NOT NULL DEFAULT 'off',  -- off | live | paused
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mkt_journey_steps (
  id text PRIMARY KEY, journey_id text NOT NULL REFERENCES mkt_journeys(id),
  step_no int NOT NULL,
  wait_hours int NOT NULL DEFAULT 0,
  channel text NOT NULL,               -- email | sms | mail | task
  template_id text,
  stop_if text                         -- 'ordered' | 'replied' | 'unsubscribed'
);

-- The delivery ledger: one row per contact per step. This is what makes
-- "did she actually get the postcard" answerable.
CREATE TABLE mkt_sends (
  id text PRIMARY KEY,
  seller_id text NOT NULL, campaign_id text, journey_id text, step_no int,
  contact_id text NOT NULL, channel text NOT NULL,
  status text NOT NULL,                -- queued|sent|delivered|bounced|failed|opened|clicked
  provider_message_id text,
  click_id text UNIQUE,                -- OUR id, minted per send — see §4
  cost_cents int NOT NULL DEFAULT 0,   -- SMS segments, Lob per-piece, render cost
  sent_at timestamptz, delivered_at timestamptz, failed_reason text
);
```

### 3.4 The attribution ledger

```sql
CREATE TABLE mkt_touch (
  id text PRIMARY KEY,
  click_id text REFERENCES mkt_sends(click_id),
  contact_id text, seller_id text NOT NULL,
  campaign_id text, journey_id text, channel text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  landing_path text, referrer text, utm jsonb, device text, ip inet
);
CREATE INDEX ON mkt_touch (contact_id, at);
```

`orders` already carries the UTM blob from `lib/attribution.ts`; add `orders.click_id` and
the join to revenue is a single query rather than a spreadsheet.

### 3.5 Assets and cost

```sql
CREATE TABLE mkt_assets (
  id text PRIMARY KEY, seller_id text NOT NULL,
  kind text NOT NULL,                  -- 'video' | 'image' | 'postcard'
  template_id text, variables jsonb,   -- {zip, city, depot, from_price}
  url text, thumb_url text,
  approval_state text NOT NULL DEFAULT 'pending',
  approved_by text, approved_at timestamptz,
  provider text, provider_ref text, cost_cents int, created_at timestamptz DEFAULT now()
);
```

---

## 4. Attribution — first-party, or it is guesswork

Every outbound link is minted per send and routed through us:

```
https://nationalsteelbox.com/r/<click_id>   →  302 to the real destination
                                            →  INSERT mkt_touch
                                            →  set sbx_cid cookie (first-party, 90d)
```

- **Email/SMS:** every link rewritten to `/r/<click_id>`.
- **Direct mail:** the QR code *is* `/r/<click_id>` — the only way mail is measurable.
  Print the same code as a short vanity URL for people who won't scan.
- **Social/video:** one click id per post variant, not per viewer; measures the post.
- **Stitching:** `sbx_cid` cookie → on any lead, quote or order, write `click_id` onto the
  row. Contacts recognised by `dedupe_key` merge anonymous touches into the known contact.

**Report first-touch and last-touch side by side, plus a position-based split
(40/20/40).** Every model flatters a different channel; showing one invites the argument
that the number was chosen. Showing three ends it. Direct mail in particular always looks
worthless under last-touch and decisive under first-touch — that is a property of mail,
not of our data.

**Executive ROI** is then one honest query per campaign:

```
revenue  = Σ orders joined by click_id (attributed by the chosen model)
cost     = Σ mkt_sends.cost_cents + campaign.spend (ad/print/render)
ROI      = (revenue − cost) / cost
```

Report **per reseller, per ZIP zone, per channel** — that is the CMO's actual question:
*which channel works in which territory for which reseller.*

---

## 5. Compliance — the real schedule risk

This is the part that slips projects, and it is nobody's favourite slide.

1. **10DLC registration (US SMS).** Sending business SMS to US numbers requires brand +
   campaign registration with The Campaign Registry. **Two to six weeks**, and it is
   per-brand. Multi-tenant forces a decision now:
   - **(a) One brand — National SteelBox** sends on behalf of resellers, with the reseller
     named in the message body. Fast, one registration, one reputation. *Recommended.*
   - **(b) Per-reseller brands.** Each reseller registers, each waits weeks, each pays.
     Only worth it if resellers demand their own number. Defer to a later phase.
2. **Quiet hours.** No SMS before 8am or after 9pm **in the recipient's timezone** — we have
   their ZIP, so derive it; do not use the sender's clock.
3. **STOP/HELP** must be honoured within seconds and write back to `consent_sms` in *our*
   database, not only Klaviyo's.
4. **Email authentication per reseller.** Each sending reseller gets a subdomain
   (`mail.<reseller>.nationalsteelbox.com`) with its own SPF/DKIM/DMARC. Without this, one
   reseller's complaint rate poisons deliverability for every other reseller — the single
   most likely way this program quietly dies.
5. **Direct mail** has no opt-in requirement but does need suppression on request; keep
   `consent_mail` as opt-out and honour it.
6. **Purchased lists: no.** Not into `mkt_contacts`, not ever. One purchased list can get a
   sending domain blacklisted for months.

---

## 6. AI video — the honest version

The ask is "AI-generated video social posts, per reseller per ZIP area". Generated
literally, that is *resellers × ZIP zones* renders — hundreds of clips, each costing money
and minutes, most never watched.

**Do this instead:** render a small library of base clips (one per message per reseller,
~10–20 total), then composite the local variables — ZIP/city name, depot, from-price,
phone — as an overlay pass we control. Same perceived personalisation, roughly 5% of the
render cost, and regenerating a price change means re-compositing, not re-rendering.

**Non-negotiable: a human approval gate.** Nothing generated posts under a reseller's name
without a named person approving it (`mkt_assets.approval_state`, `approved_by`). An AI
video that misstates a price or a delivery window is a claim we have to honour.

Start with **one message, one reseller, ten ZIP zones** and measure. If per-ZIP video does
not beat a generic clip on cost-per-lead, we have learned something cheap.

---

## 7. Phased rollout

Each phase is independently shippable and independently useful. No phase depends on a
later one.

| Phase | Weeks | Deliverable | Done when |
|---|---|---|---|
| **0 · Foundation & compliance** | 1–2 | Split consent columns, dedupe keys, 10DLC brand submitted, sending subdomains + DMARC, `/r/<click_id>` redirector + `mkt_touch` | A test send's click appears in `mkt_touch` and joins to an order |
| **1 · Audiences + email** | 3–5 | `mkt_audiences`, resolve-at-send, Klaviyo delivery, `mkt_sends` ledger, webhook ingest, campaign ROI tile | A reseller sends to a ZIP zone and sees delivered/opened/clicked/revenue on one screen |
| **2 · SMS** | 6–8 | SMS channel, quiet hours by recipient ZIP, STOP/HELP write-back, per-segment cost | Same screen, SMS column, no message sent outside 8am–9pm local |
| **3 · Direct mail** | 9–11 | Lob integration, address verification, QR = click id, per-piece cost + delivery status | A postcard scan shows up as a touch and attributes to an order |
| **4 · Journeys** | 12–15 | `mkt_journeys` + steps, triggers (quote-no-order, delivered, abandoned cart), stop conditions | A quote with no order in 72h fires email → wait → SMS → postcard, and stops on order |
| **5 · AI video** | 16–19 | HeyGen base renders, variable compositing, approval gate, one-click post | Ten ZIP variants from one base clip, each approved by a named person before posting |
| **6 · Executive reporting** | 20–22 | Attribution models side by side, per-reseller/ZIP/channel ROI, scheduled exec email, optional HubSpot mirror | The CMO opens one page and can answer "which channel, which territory, what return" |

**Phase 0 gates everything.** 10DLC and DMARC are calendar time we cannot compress by
adding people — start them in week 1 even though nothing ships from them.

---

## 8. Risks, stated plainly

| Risk | Consequence | Mitigation |
|---|---|---|
| Two systems of record for consent | Legal exposure per message | Our DB is authoritative; vendors are delivery only |
| Shared sending reputation | One reseller's spam complaints kill everyone's inbox placement | Per-reseller subdomains + DKIM from Phase 0; complaint-rate circuit breaker per reseller |
| 10DLC delay | SMS phase slips 2–6 weeks | Submit in week 1; Phase 2 does not block Phases 1/3 |
| Attribution in a Zap | Unauditable, unrebuildable ROI numbers | Attribution writes go through our API only |
| Per-ZIP video cost | Spend outruns return before we notice | Template + composite, not per-ZIP render; measure on 10 zones first |
| CSV storage | Multi-channel volume will outgrow it immediately | The Postgres move (already on the roadmap) is a prerequisite for Phase 1 |

---

## 9. What I need from the CMO to start

1. **Brand decision:** one sending brand (National SteelBox, resellers named in body) or
   per-reseller brands? This gates 10DLC in week 1.
2. **The three campaigns that matter most.** We build Phase 1 around real messages, not
   a generic composer.
3. **Attribution model of record** for the exec report — my recommendation is
   position-based 40/20/40, with first and last shown alongside.
4. **Budget ceiling per reseller per month**, so plan tiers (`starter/growth/pro`) can
   enforce volume rather than surprising anyone with a bill.
