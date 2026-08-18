# Aarcadian — Phase 1 agreement

What has to happen between the MOU (`SteelBox-Aarcadian-MOU-v0.3.docx`) and a
signable agreement. Rationale and structure live here; the *tasks* live in
`TODO.md` under the Aarcadian section, per the one-list rule.

**Status:** MOU at v0.3 (Aug 2026), non-binding. No agreement drafted.

---

## 1. It is three agreements, not one

The MOU calls for "a simple supply agreement." It isn't one document, because
three different things are being promised and they fail in different ways.
Cleanest structure is **one master agreement with three schedules**, so a change
to any one of them doesn't reopen the others:

| Schedule | What it governs | If it's wrong |
|---|---|---|
| **A · Supply & consignment** | Gate-buys, consigned inventory, title, payment on sale, transfer stations, the 45-mile radius | Inventory disputes, unclear ownership at the moment of sale |
| **B · Damage, estimates & the 50/50** | Inspection standard, repair estimates, claims to the line, the split, as-is listing | The one that turns into litigation — money is split on a number *we* produce |
| **C · Platform licence** | Aarcadian's use of the SteelBox driver app, grading and claim tooling | We hand a supplier a login and never define what happens to the data |

Schedule C is the "licensing agreement" in the question. It is the smallest of
the three and the one most likely to be skipped — and skipping it is how a
supplier ends up with an undefined, perpetual, free right to software that is
the company's main asset.

---

## 2. Schedule A — supply & consignment

### Must be nailed down

- **Title and risk.** Title stays with Aarcadian until sale (MOU §5). Say
  explicitly *when* it passes — at customer payment, at pickup from the transfer
  station, or at delivery — and who insures the unit for each leg. Today the MOU
  implies payment-then-pickup; the agreement has to make it a single named moment.
- **Payment on sale, before pickup.** Settlement window (same day? net 3?), the
  method, and what happens when a reseller picks up without settling. This is the
  clause that protects Aarcadian's balance sheet and it needs teeth.
- **Consigned inventory is identified.** Every consigned unit carries Aarcadian's
  ID, and a list of what is on consignment can be produced on demand by either
  side. (Product gap — see §5.)
- **The 45-mile free radius.** Measured from what — depot, nearest yard? Applies to
  consigned units only, or gate-buys too? Rate card beyond 45 miles.
- **Damage in transit to the station.** A unit damaged between depot and transfer
  station is Aarcadian's move on Aarcadian's carrier. Say so, or it lands in
  Schedule B by accident.
- **Unsold units.** How long may a consigned unit sit before Aarcadian can recall
  it, who pays the move back, and does SteelBox get notice.
- **Pricing.** Wholesale for gate-buys, the consignment realization split, and
  whether volume tiers exist (MOU §9 open question).
- **Exclusivity.** The MOU wants it mutual and volume-triggered. Either put real
  numbers in or leave it out of Phase 1 — a vague exclusivity clause is worse than
  none, because it binds without a test for compliance.

### Term, exit, transition

Twelve months with a rolling renewal is right for Phase 1. What matters more than
the term is the **wind-down**: consigned units on our stations at termination,
open orders, in-flight claims, and the data question in Schedule C.

---

## 3. Schedule B — damage, estimates and the 50/50

This is the schedule to spend the most time on. It divides money computed from a
document SteelBox produces, about a unit Aarcadian owns, against a claim a third
party pays. Every one of those is a place to argue.

### The one thing to settle first

**Is the 50/50 on recovery, or on the estimate?**

- *On recovery* — we split what the line actually pays. Aligned incentives, no
  cash risk to either side, but SteelBox's inspection work is unpaid whenever a
  line stalls or denies. Slow-pay years hurt.
- *On the estimate* — we split the appraised repair value whether it is recovered
  or not. Predictable for both sides, but it makes SteelBox's own estimate the
  thing that creates Aarcadian's obligation, and that is a conflict of interest we
  would be writing into the contract ourselves.

Recommendation: **split on recovery**, with a floor — a per-unit inspection and
documentation fee SteelBox earns regardless of outcome. That pays for the work
without letting either side profit from an inflated estimate. Flagged as an open
question in MOU §9 so both teams answer it in writing.

### Also required

- **The inspection standard.** The agreement should name it: the 8-station guided
  walk-around, photographs at each station, findings recorded with severity, a
  damaged unit held off the marketplace until an inspector grades it. That
  standard already exists in the field app — pointing the contract at it is what
  makes the estimate defensible to a shipping line.
- **Who chooses the repair yard**, and an approval threshold above which the
  other side signs off on an estimate (MOU §9).
- **Timeline.** Days from intake to inspection, inspection to estimate, estimate
  to submission. A claim's value decays with age; a deadline is the only thing
  that keeps it moving.
- **As-is listing consent.** Aarcadian agrees a damaged unit is listed at grade D
  with its damage photos and findings visible, and is *not* refurbished and
  relisted as sound. Both sides should want this in writing — it's the disclosure
  that limits liability to the buyer.
- **Floor price / approval on as-is sales.** The platform pre-fills an as-is
  discount by severity (≈10% at D·1 to ≈55% at D·5, editable). Does Aarcadian
  approve each as-is price, or set a standing floor?
- **Claim ownership.** The supplier of record submits to the line (that is how the
  product works today). Confirm that is Aarcadian, and what SteelBox is obliged to
  hand over: the evidence package — photos captioned by reason, notes, estimate,
  chain of custody — as a printable document or signed link.
- **Recovery below estimate.** Who absorbs the gap, in whichever split is chosen.
- **Records and audit.** Either side can inspect the claim record behind any split
  payment for [24] months.

---

## 4. Schedule C — the platform licence

Aarcadian uses SteelBox's driver-management, photo-collection and AI-grading
software to move units from depot to transfer station (MOU §5). That is a
software licence and it needs the ordinary terms:

- **Grant.** Non-exclusive, non-transferable, revocable, limited to Aarcadian's
  own operations in support of this partnership. No sublicensing, no service
  bureau, no use for containers destined for anyone but SteelBox.
- **Scope and seats.** Named users, which portals (field app, supplier portal),
  and what an admin at Aarcadian may and may not see. Our roles model already
  scopes a supplier to their own units — the licence should say the grant is
  exactly that scope.
- **Fees.** Free-of-charge during Phase 1 is fine, but say it is *consideration
  for the supply relationship and terminates with it*. Otherwise it reads as
  perpetual. Set the rate that applies if the supply relationship ends and they
  want to keep using it.
- **Data ownership — the one that matters.**
  - *Aarcadian's data*: their unit list, costs, depot records. Theirs.
  - *SteelBox platform data*: the inspection records, gradings, photographs,
    claim documents, marketplace demand signals. Ours, with a licence back to
    Aarcadian to use records for their own units.
  - *Exit*: on termination Aarcadian gets an export of their units' records in a
    usable format within [30] days; we keep our copy for claim and audit history.
    Absent this clause the exit becomes a negotiation at the worst moment.
- **IP.** SteelBox owns the platform, the grading model, and anything derived from
  aggregate usage. Feedback and workflow design contributed by Aarcadian — and MOU
  §6 explicitly asks them to help design the repair→estimate→shipper workflow —
  is licensed to SteelBox freely and without claim. **Get this in writing before
  the design sessions start, not after.**
- **Confidentiality.** Mutual NDA covering pricing, unit costs, customer data and
  claim records. If nothing else on this list gets signed before work begins, this
  one should.
- **Service levels.** Be modest and honest: single-instance API, best-effort
  uptime, support by email, no penalty clauses. Do not promise a 99.9% SLA the
  infrastructure work in P1 hasn't delivered yet.
- **Security and access.** How accounts are provisioned and revoked, MFA
  expectations, and notice obligations on a breach.
- **AI grading disclaimer.** The grade is an AI-assisted assessment reviewed by a
  human inspector, not a warranty of condition. Say it here and repeat it on the
  listing.

---

## 5. What SteelBox has to build before this is signable

The agreement promises things the platform does not yet do. Each is a real gap,
not a config change:

1. **Consignment ownership.** `containers.supplierId` exists, but there is no
   distinction between a unit we own and a unit we hold on consignment, no
   consignor payable, and no settlement record at the moment of sale. Schedule A's
   "pay on sale, before pickup" needs all three.
2. **Settlement ledger.** What is owed to Aarcadian per sold unit, when it was
   paid, and a statement either side can pull. Today the money side of a sale
   stops at the order.
3. **Damage split fields.** Claims carry `estimateAmount` but nothing about how it
   splits, what was recovered, or what was paid out to whom. Schedule B is
   unenforceable without a recovery record.
4. **Transfer-station model.** Depots exist; a transfer station holding another
   party's inventory does not. Needed for consigned stock to be visible as such.
5. **Supplier-scoped licence surface.** A supplier login exists; the audit trail of
   who at Aarcadian saw or changed what does not.
6. **As-is listing disclosure.** The D grade, severity and damage photos already
   ship on listings — this one is done, and it is the piece Schedule B leans on.

Items 1–5 are new work and belong in the phased roadmap. Sequencing note: none of
them are on the week-9 retail launch path, so they run alongside — but item 1 is
gated on the Postgres move in P1 for the same reason payments are.

---

## 6. Sequence

| When | What |
|---|---|
| Before design sessions | Mutual NDA + IP assignment for contributed workflow design |
| Week of 8/24 | Both teams mark up MOU v0.3 |
| Week of 8/31 | Working session — settle the 50/50 basis, the radius scope, the repair-yard question |
| Then | Counsel drafts master + Schedules A/B/C from the settled answers |
| In parallel | Build gaps 1–5 above so Phase 1 can operate the way the agreement describes |

Do not let the drafting wait on the build, or the build wait on the drafting. The
questions in MOU §9 are what blocks both, and they are answerable in one meeting.

---

## 7. Where this touches the product

- The **repair → estimate → shipper workflow** (MOU §6) is already built end to
  end: guided walk-around → inspector review → estimate with the repair shop's own
  document → handoff to the supplier → submission to the line, with a printable
  claim document and a signed share link. Aarcadian's input refines it; it is not
  a from-scratch build, which is worth saying in the room.
- **"Damaged, not refurbished"** is already how the platform behaves: grade `D`
  ("Damaged — sold as-is") is a separate grade from `R` (Refurbished — repainted,
  resealed, reconditioned), with a 1–5 severity, a pre-filled as-is discount
  ladder and the damage photos attached to the listing. No rename is needed, and
  a rename would be wrong: both grades are real and mean different things. What
  the agreement adds is Aarcadian's consent that *their* damaged units take the D
  route rather than being repaired and relisted as sound.
