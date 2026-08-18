# SteelBox Marketplace Platform — Test Plan & Tester Guide

One login per role · every portal behind it · **updated August 18, 2026**
(Supersedes the August tester guide; same structure, now covering the guided
walk-around, the reworked claims pipeline, the shared photo viewer, shipping-line
contact management, and the beta bug reporter.)

## Before you start

- **Site:** https://timtoolman.github.io/SteelBox/ — marketplace at `/SteelBox/shop`,
  admin at `/SteelBox/admin`, field app at `/SteelBox/field`, shipper review at
  `/SteelBox/shipper`.
- **Any password works** on seeded accounts — the email decides the role. Creating a
  NEW account asks for name + mobile and the demo verification code **123456**.
  The field app works great on a phone.
- **Changes last for your browser session only** and reset on page reload — finish a
  scenario (e.g. grant a role, then try it) in the same tab without refreshing.
- **Found something?** Use the blue **Report an issue** tab on the right edge of any
  page (see §9) — it captures the page, your browser, and recent errors
  automatically. Add what you expected vs. what happened; attach a screenshot of the
  tab when the problem is visual.

## Test accounts — one per role

| Role | Sign in as (any password) | Start at | What to check |
|---|---|---|---|
| HQ admin (SteelBox Co.) | `tgmoore@gmail.com` (Tim Moore) | /admin | Everything, global scope: spoof any reseller ("Managing" dropdown), Sellers + territory map, Depots + transfer stations, **Shipping Lines directory + contacts**, Users & Access grants, **Beta Issues** |
| Reseller admin — MVP | `admin@mvpcontainer.com` (Marie Landry) | /admin | Locked tenant chip, no spoof dropdown, **no Sellers/Shipping Lines nav**; only MVP orders, drivers, customers, schedule, activity |
| Reseller admin — Demo Corp | `admin@democontainercorp.com` (Dana Whitfield) | /admin | Same, other tenant: 2 drivers, Baltimore depot, Demo Corp orders |
| Driver | `mike@mvpcontainer.com` (Mike Torres) | /field | Pickup/delivery jobs, **guided walk-around** (8 stations), report damage (+ optional photo), schedule under Profile |
| Inspector | `inspector@mvpcontainer.com` | /field | **Inspections** tab: held units run the same guided walk; inspector is final grader; raises claims only from photographed findings |
| Customer | `demo@mvpcontainers.com` (or Create an account) | /shop | Browse/filter/favorites, ZIP territory + relay fee (try 21224 or 37211), **photo viewer & 3D view**, cart & checkout, order tracking |
| Supplier | `supplier@oceanbox.com` (Dana Reyes) | /shop | Portal tabs: My Containers (reprice live) and Damage Claims (**review → estimate → send** workspace), My Fleet photo viewer |
| Shipper | `shipper@meridianlines.com` (Kofi Mensah) | /shop or /shipper | Claims Review: **line name in the header**, must open the full claim before approve/reject, evidence photos zoom |

## 1 · Marketplace & shopping (customer)

| # | Steps | Expect |
|---|---|---|
| M-1 | Open /shop fresh | Delivery-ZIP prompt appears once per session; dismiss or enter a ZIP |
| M-2 | Look at the left rail | Order is: **Zip Destination → Sort By → divider → Filters/Reset header → Size → Grade …** — Reset clears only the filters, never ZIP or sort |
| M-3 | Hover a container card (desktop) | Card lifts; a **magnifying-glass circle** fades in over the photo; click anywhere opens the detail |
| M-4 | Open a unit's detail | Tall hero gallery (~280–440px), thumbnail strip below with the active shot ringed + underlined, the rest dimmed until hover |
| M-5 | Control cluster under the hero | **‹ previous · zoom-out · level% · zoom-in · next ›**, centred under the image — clicking level resets to fit |
| M-6 | Scroll/pinch/double-tap on the hero | Zooms in place (up to 6×), drag pans when zoomed; switching shots resets zoom |
| M-7 | Click the hero photo (or "Full screen") | Full-screen viewer opens: same control cluster + thumb strip **under** the image; the **counter + shot name sit at the bottom by the controls**; **Close (✕) sits on the image box's top-right**, not the far screen corner |
| M-8 | In the viewer, press ← → + − 0 Esc | Arrows move (photo only — the container behind must NOT change), +/− zoom, 0 fits, Esc closes; scroll works again after close |
| M-9 | Click **Show 3D View** (top right in the viewer) | Viewer closes and the gallery lands on the 3D slot (drag to rotate when no AI render exists) |
| M-10 | Open a damaged (D-grade) unit | Red "Damage photos — sold as-is" strip; tapping a photo opens the same full-screen viewer |
| M-11 | Buy/Rent toggle + sticky price card | Toggle switches price; card stays visible while scrolling; ZIP check answers territory/relay |
| M-12 | ZIP 21224 on an FC- (Atlanta) unit | Cross-territory relay via I-85 Charlotte with fee; fee lands in Due Today at checkout |
| M-13 | Cart → checkout | Phone-payment explainer; order lands as Pending Review; confirmation email in admin Outbox |

## 2 · Field app — driver (guided walk-around)

| # | Steps | Expect |
|---|---|---|
| F-1 | Open a Pickup job → On my way → Arrived | Job resumes where it left off if reopened |
| F-2 | Start the walk-around | 8 stations in physical order (Front doors → Right side → Back → Left side → Seams & rails → Inside → Light test → Stock number), one condition question each |
| F-3 | Answer clean at a station | Next unlocks immediately |
| F-4 | Answer the middle (cosmetic) option | What/where drill-down + optional photo |
| F-5 | Answer the worst (capped) option | **Photo required** before Next unlocks |
| F-6 | Go back a station | Previous answers, reasons, note, photo all restored |
| F-7 | Finish with any finding | Unit is queued for an inspector — no grade offered, no choice; banner reads "Damage reported" |
| F-8 | Finish clean | Model's grade offered, or **Send to Inspector** for a second opinion; either way returns to the home screen |
| F-9 | "Report damage" on the job screen | Optional photo allowed (not required); report appends to the inspection reason |
| F-10 | Bottom nav | Schedule is gone from the bar — it lives under **Profile → Schedule & availability** |

## 3 · Field app — inspector

| # | Steps | Expect |
|---|---|---|
| I-1 | Inspections tab | Held units listed with the field crew's findings (photo thumbnails open the full-screen viewer) |
| I-2 | Walk a held unit | Identical 8-station walk; inspector's findings are recorded but never queue back to them |
| I-3 | Finish the walk | Grade applies, hold clears, unit re-promotes to the marketplace once 8 photos exist |
| I-4 | "Open a damage claim" | Only offered when a **photographed** finding exists; otherwise the screen says to walk the unit and photograph the damage |
| I-5 | Claims tab without the grant | No Damage claims tab; API refuses — an admin must tick **Damage claims** on the account (Users & Access) |

## 4 · Damage claims (post-inspection)

| # | Steps | Expect |
|---|---|---|
| C-1 | File a claim (supplier or granted inspector) | Picker lists only units with a photographed finding; a photoless claim is refused: "A claim needs at least one damage photo" |
| C-2 | Open claim workspace | Opens **full-page in a new tab** (`/claim?id=…`): 1·Review → 2·Estimate → 3·Send; audit timeline under Review |
| C-3 | Review step | Every damage photo captioned by reason; findings and the unit's 8-shot documentation shown; **all photos open in the full-screen viewer** with zoom/next/prev |
| C-4 | Estimate step | Requires a note, an estimate value, and the repair shop's uploaded document (image or PDF) |
| C-5 | Send step — inspector | Sends to the **supplier** (who owns the line relationship); no Submit-to-Shipper offered |
| C-6 | Send step — supplier | Submit to Shipper (advances the stage), Download .zip, Email PDF (print-styled page), Email Link (mailto) |
| C-7 | Claims list | No send/download buttons on the list — everything goes through the workspace; no "Awaiting inspection" stage exists anywhere |
| C-8 | .zip download | Real archive: summary.html + photos named by reason |

## 5 · Shipper review

| # | Steps | Expect |
|---|---|---|
| S-1 | Sign in at /shipper | Header leads with the **shipping line's name** ("Meridian Lines · Claims Review") plus your name/email |
| S-2 | Claims queue | Only claims against **your** line, ever; first view is stamped on the audit timeline |
| S-3 | Try to approve immediately | Blocked — "Review the claim before deciding"; the **Open the full claim** document must be opened first |
| S-4 | After opening the full claim | ✓ Reviewed appears; Approve estimate / Reject unlock; decision + notes stamp the timeline |
| S-5 | Evidence photos | Click any → full-screen viewer with zoom (you're paying on these) |

## 6 · Supplier portal

| # | Steps | Expect |
|---|---|---|
| P-1 | Damage Claims tab | Filters rail: stage, severity, filed-period — the **Shipping line filter is hidden for accounts tied to one line**, visible otherwise |
| P-2 | My Fleet (bottom section) | Full fleet with grade chips: **D·n (damage severity) for damaged units**, letter·score (A·5, R·4…) for the rest; **thumbnail click opens all the unit's photos** in the viewer |
| P-3 | Repair decision | Approved claim → book repair (keep retail) or sell as damaged (strike-through pricing on the marketplace) |

## 7 · Admin — users, lines & access

| # | Steps | Expect |
|---|---|---|
| A-1 | Users & Access → Add User → role **Shipper** | A **mandatory Shipping line picker** appears; saving without one is refused (client and server) |
| A-2 | Edit an existing shipper account | The line cannot be removed or blanked later |
| A-3 | Shipping Lines (HQ admin only) | Reseller admins don't see the nav item at all; HQ can add/edit/deactivate lines (company, trade lane, contact, address) |
| A-4 | Shipping Lines → **Contacts** | Per line: every tied account with its access state (CAN SIGN IN / ACCESS HIDDEN) |
| A-5 | Invite a contact (name + email) | Mints a shipper login tied to the line; temp password emailed (see Outbox); duplicate email refused |
| A-6 | Hide access / Restore access | Toggles sign-in without dropping the contact from the list |
| A-7 | Remove a contact | Unlinks from the line and deactivates the account; gone from the contacts list |
| A-8 | Grant portals on one login | Supplier portal (pick company) + Shipper portal (pick line) checkboxes still work as before; unchecking Marketplace blocks sign-in entirely (⛔ NO SIGN-IN) |

## 8 · Cross-role scenarios (the good stuff)

1. **One login, many portals:** HQ admin → Users & Access → edit any customer →
   grant Supplier (pick company) + Shipper (pick line) → sign in at /shop as them in
   the same tab: Marketplace, My Containers, Damage Claims, Claims Review all appear.
2. **Cross-territory relay:** customer opens an FC- unit → ZIP 21224 → relay via
   I-85 Charlotte + fee → fee in Due Today; HQ assigns a driver → two schedule legs.
3. **Claim end-to-end:** driver's walk-around finds damage (photo required on the
   worst answer) → unit held off the marketplace → inspector re-walks it in
   Inspections, verifies, opens the claim → workspace Review → Estimate (shop doc +
   value) → Send to supplier → supplier submits to shipper → shipper opens the full
   claim, then approves/rejects → supplier books repair or sells as damaged.
4. **Hold discipline:** while a unit is held, it never shows on the marketplace and
   draft→available promotion is refused until an inspection clears it.

## 9 · Beta bug reporter

| # | Steps | Expect |
|---|---|---|
| B-1 | Any page, any portal | Blue **Report an issue** tab on the right edge (marketplace, admin, field, shipper, claim page) |
| B-2 | Click it, write nothing, Send | Refused — the description is required |
| B-3 | Write what happened, Send | "Logged — thank you." Works signed-in **or** as a guest |
| B-4 | "Attach a screenshot of this tab" | Browser asks to share the tab; a preview appears; Remove discards it. Declining never blocks the report |
| B-5 | Admin → **Beta Issues** | Every report: status, when, who, page, description, browser + viewport, the page's recent console errors, and the screenshot (opens in the viewer) |
| B-6 | **Copy as prompt** | Copies a ready-to-paste fix-it prompt with all context |
| B-7 | Mark resolved / Reopen / Delete | Status flips; resolved reports dim; delete is permanent |

## Automated regression (run before shipping any change)

| Suite | Command | Latest count |
|---|---|---|
| Types | `cd apps/web && npx tsc --noEmit` | clean |
| Demo build | `cd apps/web && VITE_DEMO_STATIC=1 npm run build` | clean |
| API suite | `cd apps/api && node test.mjs` (throwaway `DATA_DIR`) | **205 checks** |
| Browser sweeps (Playwright vs built demo) | smoke-batch · smoke-viewer · smoke-lightbox · smoke-round · smoke-claimws · smoke-walk · smoke-rbac · smoke-walkfix · smoke-photos · smoke-handoff | **262 checks** |

Playwright notes for whoever extends the sweeps: dismiss (or pre-seed
`sessionStorage.sbx_zip_prompted`) before hovering marketplace cards; admin left-nav
items are `div`s, not buttons; the viewer's Close button needs an exact-name match
("Front doors **closed**" also matches /Close/); input placeholders aren't in
`textContent`.
