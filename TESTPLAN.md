# SteelBox Marketplace Platform — Test Plan

Grouped by persona & login · **updated August 18, 2026**
For the manual test team, and the coverage map of Claude's automated regression.

## Before you start

- **Site:** https://timtoolman.github.io/SteelBox/ — marketplace /SteelBox/shop · admin /SteelBox/admin · field app /SteelBox/field · shipper review /SteelBox/shipper.
- **Passwords:** Any password works on seeded accounts — the email decides the role. Creating a NEW account asks for name + mobile and the demo verification code 123456. The field app works great on a phone.
- **Demo data:** Changes last for your browser session only and reset on page reload — finish a scenario (e.g. grant a role, then try it) in the same tab without refreshing.
- **Found something?:** Use the blue "Report an issue" tab on the right edge of any page — it captures the page, your browser, and recent console errors automatically. Write what you expected vs. what happened; attach a screenshot of the tab when the problem is visual. Reports appear under Admin → Beta Issues.
- **Coverage column:** Auto = Claude runs this in the automated regression before every ship (suite named). Manual = only you can catch it — please prioritize those.

## G · Guest shopper — no login

**Sign in:** No account · start at /shop
Anyone browsing the marketplace before signing in.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| G-1 | Delivery-ZIP prompt | Open /shop in a fresh tab | ZIP prompt appears once per session; enter a ZIP or pick Nationwide Search; it never re-appears this session | Manual only |
| G-2 | Left rail order | Look at the left rail top-to-bottom | Zip Destination → Sort By → divider → Filters/Reset header → Size → Grade…; Reset clears only the filters below it, never ZIP or sort | Auto — smoke-batch |
| G-3 | Card hover magnifier | Hover any container card (desktop) | Card lifts, magnifying-glass circle fades in over the photo; clicking anywhere opens the detail | Auto — smoke-batch |
| G-4 | Detail gallery | Open any unit | Tall hero (~280–440px); thumbnail strip below with the active shot ringed + underlined, others dimmed until hover | Auto — smoke-batch + smoke-viewer |
| G-5 | Control cluster | Look under the hero image | ‹ previous · zoom-out · level% · zoom-in · next ›, centred under the image; clicking the level resets to fit | Auto — smoke-batch |
| G-6 | Zoom in place | Scroll / pinch / double-tap the hero; drag while zoomed | Zooms up to 6× without leaving the page; drag pans; switching shots resets zoom | Auto — smoke-viewer |
| G-7 | Full-screen viewer | Click the hero photo (or the Full screen pill) | Viewer opens with the same cluster + thumb strip UNDER the image; counter + shot name at the bottom by the controls; Close (✕) on the image box’s top-right | Auto — smoke-batch + smoke-viewer |
| G-8 | Keyboard | In the viewer press ← → + − 0 Esc | Arrows move the photo ONLY (the container behind must not change); +/− zoom; 0 fits; Esc closes and page scroll returns | Auto — smoke-viewer |
| G-9 | Show 3D View | Click the pill at the viewer’s top right | Viewer closes; gallery lands on the 3D slot (drag to rotate when no AI render exists) | Auto — smoke-batch |
| G-10 | Damaged unit photos | Open a D-grade unit; tap a photo in the red "sold as-is" strip | Damage photos open in the same full-screen viewer | Manual only |
| G-11 | Buy/Rent + price card | Toggle Buy/Rent; scroll the detail | Price switches; the price card stays visible (sticky); ZIP check answers territory/relay | Manual only |

## CU · Customer

**Sign in:** demo@mvpcontainers.com (any password) · start at /shop — or Create an account (code 123456)
A buyer or renter with an account.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| CU-1 | Sign-up gate | Create a new account; stop before entering the code | Name + mobile + verification code 123456 required; an unverified sign-up cannot use the site | Auto — api |
| CU-2 | Favorites | Heart a few units; reload is NOT allowed (demo) | Hearts toggle without opening the card and persist within the session | Manual only |
| CU-3 | Territory & relay | Open an FC- (Atlanta) unit → ZIP check 21224 (Baltimore) | Relay via I-85 Charlotte with a fee and mileage; in-territory ZIPs show "delivery included" instead | Auto — api (fees) · UI manual |
| CU-4 | Cart & checkout | Add to cart → checkout | Phone-payment explainer (no card fields); relay fee lands in Due Today; order confirmation + "we’ll call you" email in admin Outbox | Auto — api · UI manual |
| CU-5 | Order tracking | Open the order after an admin advances it | Status steps update; rating available after delivery (1–5, buyer only) | Auto — api · UI manual |
| CU-6 | Two-factor at order | Place an order | SMS code (see admin Outbox) required; codes expire; re-verification needed on later orders | Auto — api |

## D · Driver

**Sign in:** mike@mvpcontainer.com (any password) · start at /field — best on a phone
Field crew: pickups, deliveries, photo documentation. May inspect, never required to.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| D-1 | Job flow resumes | Open a Pickup → On my way → Arrived → leave → reopen | The job resumes exactly where it left off | Auto — smoke-walkfix |
| D-2 | Guided walk-around | Start the walk on a pickup | 8 stations in physical order: Front doors → Right side → Back → Left side → Seams & rails → Inside → Light test → Stock number; one condition question each | Auto — smoke-walk + smoke-photos |
| D-3 | Photo frames | Take the station shots | Photos sit in neat 4:3 frames, never stretched; every station (incl. Seams & rails) can attach a damage photo | Auto — smoke-photos |
| D-4 | Clean answer | Pick the best option at a station | Next unlocks immediately, highlighted in the brighter blue, sized to the app column | Auto — smoke-walkfix |
| D-5 | Middle answer | Pick the cosmetic option | What/where drill-down appears; photo optional | Auto — smoke-walk |
| D-6 | Worst answer | Pick the capped option | A photo of the damage is REQUIRED before Next unlocks | Auto — smoke-walk |
| D-7 | Going back | Answer a station, go forward, come back | Answers, reasons, note and photo all restored; changing them re-records | Auto — smoke-walkfix |
| D-8 | Finding → inspector | Finish a walk with any finding | No grade offered — the unit queues for an inspector; banner reads "Damage reported"; the unit drops off the marketplace | Auto — smoke-walk + api |
| D-9 | Clean walk | Finish with no findings | Model’s grade offered — Apply, or "Send to Inspector" for a second opinion; both return to the home screen | Auto — smoke-handoff |
| D-10 | Report damage | On the job screen tap Report damage | Optional photo allowed (not required); reasons + note; report appends to the unit’s inspection reason; can report repeatedly | Auto — smoke-round |
| D-11 | Schedule moved | Look at the bottom nav | No Schedule tab — it lives under Profile → Schedule & availability | Auto — smoke-round |
| D-12 | Claims need a grant | Look for a Damage claims area | Absent until an admin ticks "Damage claims" on the account; the API refuses too | Auto — smoke-rbac + api |
| D-13 | Camera reload survival | Mid-job, open Report damage, pick a reason + note + photo — then let the phone camera reload the page (or reload by hand) | You land BACK on the same job with the sheet open and the reason, note and photo intact — never on the home screen. The same holds mid-walk-around and mid-estimate | Auto — smoke-mobile |

## I · Inspector

**Sign in:** inspector@mvpcontainer.com (any password) · start at /field
Final grader. Verifies field-crew findings, releases holds, raises claims.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| I-1 | Inspections queue | Open the Inspections tab | Held units listed with the crew’s findings; finding photos open the full-screen viewer | Auto — smoke-viewer |
| I-2 | Same walk, final say | Walk a held unit | Identical 8-station walk; the inspector’s findings are recorded but never re-queue to an inspector | Auto — smoke-claimws |
| I-3 | Hold release | Finish the walk and apply the grade | Hold clears; the unit re-promotes to the marketplace once its 8 photos exist | Auto — api |
| I-4 | Claim gate | Try "open a damage claim" on a unit with no photographed finding | Not offered — the screen says to walk the unit and photograph the damage first | Auto — api + smoke-walk |
| I-5 | Claim evidence | Open a claim from a photographed finding | The walk-around photos ride in as the claim’s evidence, captioned by reason | Auto — api |
| I-6 | Inspector sends to supplier | Complete Review → Estimate → Send on a claim | Send goes to the SUPPLIER (who owns the line relationship); Submit-to-Shipper is not offered | Auto — smoke-claimws + smoke-round |

## SU · Supplier

**Sign in:** supplier@oceanbox.com (any password) · start at /shop → portal tabs
Container owner: pricing, damage claims, repair decisions.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| SU-1 | Live repricing | My Containers tab → change a price | Price updates immediately on the marketplace card | Manual only |
| SU-2 | Claims list | Damage Claims tab | Stages read Review & estimate → Awaiting shipper → decision; NO send/download buttons on the list; no "Awaiting inspection" anywhere | Auto — smoke-round |
| SU-3 | File a claim | Click + File a claim | Picker lists ONLY units with a photographed finding; a photoless claim is refused ("needs at least one damage photo") | Auto — api |
| SU-4 | Line filter | Look at the filters rail | Stage, severity, filed-period; the Shipping line filter shows for THIS untied account but disappears for any account tied to one line | Auto — smoke-batch (untied) · tied manual |
| SU-5 | Claim workspace | Open claim workspace | Opens FULL-PAGE in a new tab: 1·Review → 2·Estimate → 3·Send, audit timeline under Review | Auto — smoke-round + smoke-claimws |
| SU-6 | Review photos | Click any photo in the workspace | Full-screen viewer with zoom/next/prev; findings, claim evidence and unit documentation are separate sets | Auto — smoke-lightbox |
| SU-7 | Estimate step | Fill the estimate | Requires a note, a value, and the repair shop’s uploaded document (image or PDF) | Auto — smoke-claimws + api |
| SU-8 | Send step | Reach step 3 | Submit to Shipper (advances the stage) · Download .zip (real archive: summary + photos named by reason) · Email PDF (print page) · Email Link (mailto) | Auto — api + smoke-claimws |
| SU-9 | My Fleet viewer | Bottom section → click a fleet thumbnail | The unit’s full photo set (documentation + damage shots) opens in the viewer | Auto — smoke-batch |
| SU-10 | Fleet grade chips | Read the chips on fleet cards | D units show D·severity (damage); others letter·score (A·5, R·4 = Refurbished, B·3…) | Manual only |
| SU-11 | Repair decision | After a shipper approves | Book repair (keep retail) or sell as damaged — strike-through pricing appears on the marketplace | Auto — api |

## SH · Shipper

**Sign in:** shipper@meridianlines.com (any password) · start at /shipper (or the Claims Review tab on /shop)
The shipping line’s claims reviewer. Works for exactly ONE line.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| SH-1 | Line in the header | Sign in | Header leads with the line: "Meridian Lines · Claims Review", plus your name/email | Auto — smoke-batch |
| SH-2 | Scoped queue | Read the claims list | Only claims against YOUR line, ever; the first view is stamped on the audit timeline | Auto — api |
| SH-3 | Review before deciding | Try to approve straight away | Blocked — "Review the claim before deciding"; you must Open the full claim (document with every photo, damage, note, estimate) | Auto — smoke-round |
| SH-4 | Decision unlock | After opening the full claim | ✓ Reviewed appears; Approve estimate / Reject unlock; decision + notes stamp the timeline; the estimate amount is untouchable | Auto — smoke-round + api |
| SH-5 | Evidence zoom | Click an evidence photo on the list | Full-screen viewer with zoom — you’re paying on these photos | Auto — smoke-viewer |
| SH-6 | Claim emails | Change the digest preference (top right) | Per-container / daily / weekly saved to the account | Auto — api |

## HQ · HQ admin — SteelBox Co.

**Sign in:** tgmoore@gmail.com (any password) · start at /admin
Platform-wide scope: every reseller, the directories, access control, beta triage.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| HQ-1 | Spoofing | "Managing" dropdown → pick a reseller | The whole portal narrows to that reseller’s data; switch back to HQ for global | Manual only |
| HQ-2 | Shipping Lines directory | Shipping Lines nav | Add / edit / deactivate lines (company, trade lane, contact, address); deactivation is soft — claim history intact, line leaves the pickers | Auto — api |
| HQ-3 | Line contacts | Shipping Lines → Contacts on a line | Every account tied to the line with its access state (CAN SIGN IN / ACCESS HIDDEN) | Auto — smoke-batch + api |
| HQ-4 | Invite a contact | Enter name + email → Invite | Mints a shipper login tied to the line; temp password emailed (see Outbox); the login works; duplicate email refused | Auto — smoke-batch + api |
| HQ-5 | Hide / restore access | Toggle on a contact | Sign-in blocked/restored without dropping the contact from the list | Auto — smoke-batch + api |
| HQ-6 | Remove a contact | Remove on a contact | Unlinked from the line and deactivated; gone from the contacts list | Auto — api |
| HQ-7 | Shipper needs a line | Users & Access → Add User → role Shipper | A mandatory Shipping line picker appears; saving without one is refused — and the line can’t be blanked later | Auto — smoke-batch + api |
| HQ-8 | Portal grants | Edit any customer → tick Supplier (pick company) + Shipper (pick line) | Signing in as them shows all portal tabs; unchecking Marketplace = ⛔ NO SIGN-IN, login refused entirely | Auto — api · UI manual |
| HQ-9 | Beta Issues | Beta Issues nav | Every report: status, when, who, page, description, browser + viewport, recent console errors, screenshot (opens in the viewer) | Auto — smoke-batch + api |
| HQ-10 | Copy as prompt | On a report | Copies a ready-to-paste fix-it prompt with all context; Mark resolved / Reopen / Delete work | Auto — smoke-batch + api |
| HQ-11 | Sellers & territories | Sellers nav | Territory ZIP zones + coverage map; overlaps flagged; meet points listed under transfer stations | Manual only |

## RA · Reseller admins

**Sign in:** admin@mvpcontainer.com (MVP · Marie Landry) and admin@democontainercorp.com (Demo Corp · Dana Whitfield) · start at /admin
Tenant-scoped operations. Verify both tenants see ONLY their own world.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| RA-1 | Tenant lockdown | Sign in as each | Locked tenant chip, no spoof dropdown, no Sellers or Shipping Lines nav; only that tenant’s orders, drivers, customers, schedule, activity | Auto — smoke-batch (nav) + api |
| RA-2 | Order pipeline | Open a Pending Review order | Checklist: validate availability → called customer → payment collected → assign driver; each step timestamps | Auto — api |
| RA-3 | Driver assignment | Assign a driver to a cross-territory order | Two schedule legs appear (transfer + delivery); driver + customer notified (Outbox) | Auto — api · UI manual |
| RA-4 | Users scoped | Users & Access | Only accounts inside the tenant; cannot touch another reseller’s accounts | Auto — api |
| RA-5 | Alerts & Outbox | Alerts / Outbox navs | Reserved units + unassigned orders raise alerts; every "sent" email/SMS is logged | Manual only |

## BR · Every persona — beta bug reporter

**Sign in:** Any page, any account (or none)
The floating blue tab on the right edge of every portal.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| BR-1 | Tab everywhere | Check marketplace, admin, field, shipper, claim page | The "Report an issue" tab is present on all of them | Auto — smoke-batch (marketplace + admin) |
| BR-2 | Description required | Open it, write nothing, Send | Refused — the description is the whole point | Auto — api |
| BR-3 | Guest + signed-in | Send a report signed out, then signed in | Both accepted; signed-in reports carry your name/email/role | Auto — smoke-batch + api |
| BR-4 | Screenshot | "Attach a screenshot of this tab" | Browser share prompt; preview appears; Remove discards; declining never blocks the report | Manual only |
| BR-5 | Context rides along | Send any report, then check Admin → Beta Issues | URL/route, browser, viewport and the page’s recent console errors arrived with it | Auto — smoke-batch + api |

## X · Cross-persona scenarios — the good stuff

**Sign in:** Run each in ONE tab session (demo data resets on reload)
End-to-end flows that cross portals.

| # | Feature | Steps | Expect | Coverage |
|---|---|---|---|---|
| X-1 | Claim end-to-end | Driver’s walk finds damage (photo forced on the worst answer) → unit held → inspector re-walks in Inspections, verifies, opens the claim → workspace Review → Estimate (doc + value) → Send to supplier → supplier submits to shipper → shipper opens the full claim, approves → supplier books repair or sells as damaged | Every hand-off works; the audit timeline shows the whole chain of custody; a held unit never shows on the marketplace | Auto — api + smoke-walk + smoke-claimws + smoke-round |
| X-2 | One login, many portals | HQ grants a customer Supplier (company) + Shipper (line) → sign in as them at /shop | Marketplace, My Containers, Damage Claims, Claims Review tabs all appear | Manual only |
| X-3 | Cross-territory relay | Customer orders an FC- unit to ZIP 21224 → HQ assigns a driver | Relay fee in Due Today; two schedule legs (transfer + delivery) | Auto — api · UI manual |
| X-4 | Hold discipline | While a unit is held, search the marketplace for it | Absent until an inspection clears the hold and the 8 photos re-promote it | Auto — api |

## Automated regression (Claude runs this before every ship)

| Suite | Command | Latest count |
|---|---|---|
| Types | `cd apps/web && npx tsc --noEmit` | clean |
| Demo build | `cd apps/web && VITE_DEMO_STATIC=1 npm run build` | clean |
| API suite (api) | `cd apps/api && node test.mjs  (throwaway DATA_DIR)` | 205 checks |
| Mobile sweep | `node apps/web/e2e/smoke-mobile.mjs — camera round-trip reload survival on every field-app capture flow, plus picker hygiene (see apps/web/e2e/README.md)` | 16 checks |
| Browser sweeps | `Playwright vs the built demo: smoke-batch · smoke-viewer · smoke-lightbox · smoke-round · smoke-claimws · smoke-walk · smoke-rbac · smoke-walkfix · smoke-photos · smoke-handoff — being re-materialized into apps/web/e2e/ (they previously ran from scratch space)` | 262 checks |

Playwright notes for whoever extends the sweeps: dismiss (or pre-seed
`sessionStorage.sbx_zip_prompted`) before hovering marketplace cards; admin left-nav
items are `div`s, not buttons; the viewer's Close button needs an exact-name match
("Front doors **closed**" also matches /Close/); input placeholders aren't in
`textContent`.
