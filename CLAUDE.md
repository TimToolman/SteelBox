# SteelBox / MVP Container — project conventions

## UI conventions

- **Iconography: always simple 2D stroke icons.** Use inline SVG with
  `stroke="currentColor"`, `strokeWidth` 1.5–1.7, round caps/joins, on a
  20×20 (or 24×24) viewBox — the same visual language as the admin left
  nav. **Never use emoji, 3D, filled/skeuomorphic, or mixed-style icons**
  in UI chrome (tabs, nav, buttons, badges). Emoji are acceptable only
  inside user-generated or narrative text, never as interface icons.
  Prefer no icon over an off-style icon — plain text labels are fine.
- Values and labels wear ink tokens (`--ink`, `--ink2`, `--ink3`);
  brand/series colors carry identity on marks, not on text.
- Reseller identity is always shown with the seller's `brandPrimary`
  color chip + name.

## Architecture notes

- `apps/api/server.mjs` — zero-dependency Node API over CSV tables
  (`readTable`/`writeTable`); pipe-joined arrays; scrypt password hashes.
- `apps/web` — Vite + React SPA. `VITE_DEMO_STATIC=1` builds the
  API-less demo (GitHub Pages): `src/lib/demo.ts` is a full in-browser
  backend over `src/lib/demo-data.json`; session-only writes.
- Demo lists must return fresh array copies (React bails out on
  identical references after in-place writes).
- Multi-tenancy: `users.sellerId` scopes reseller admins server-side;
  blank sellerId = SteelBox Co. HQ (spoof access). Portal grants live in
  `users.roles` (`marketplace` = sign-in master switch, plus
  `supplier` / `shipper`).

- The **guided walk-around** (`pages/field/WalkAround.tsx`) is the
  inspection: 8 stations in the order you physically circle the unit,
  each taking its documentation shot(s) and asking the condition
  question that belongs to that spot. A clean answer moves on; a
  cosmetic one asks what/where and offers a photo; the capped
  (`capGrade`) answer **requires** a photo before Next unlocks. The walk
  decides its own outcome — any finding queues the unit for an inspector
  (no grade proposed, no choice offered) and a clean walk offers the
  model's grade, or a hand-off to an inspector, on the spot. The
  Inspections queue runs the identical walk with `finalGrader`, so an
  inspector's own findings are recorded but never queue back to them.
- Inspection hold: findings set `containers.inspectionRequired` (+
  `inspectionReason` / `inspectionFlaggedBy` / `inspectionFlaggedAt` /
  `inspectionFindings`, a JSON `DamageFinding[]`). While it's set the
  server refuses the draft→available promotion and pulls a listable unit
  back to `draft`; an explicit inspection (`aiGraded` / `inspectedAt`)
  clears it and the unit re-promotes. The grading role is **inspector**
  ('adjuster' is the legacy value, still accepted); drivers may inspect
  but are never required to. **Sea-freight claims are the inspector's
  call** — raised from Inspections after verifying, never from the
  driver's job screen.

- Damage claims are a **granted privilege for the field crew**: the
  `claims` entry in `users.roles` (an admin checkbox, alongside
  supplier/shipper/marketing). Without it a driver or inspector gets no
  Damage claims tab and every `/claims` route refuses them — inspecting
  and grading never needed it, filing money claims does. Admins,
  suppliers and shippers are unaffected.

- A **damage claim comes after an inspection** — nothing is collected in
  it, and `awaiting_inspection` is no longer a stage a claim can be in.
  It opens at the estimate. `/claim?id=…` is the workspace as a full page
  in its own tab (the audit timeline lives there, under Review), and the
  claims lists carry no send/download buttons at all: everything leaves
  through Review → Estimate → Send. An inspector's Send hands the priced
  claim to the **supplier** (`share` mode `'handoff'`); the supplier is
  the one who submits to the line. A shipper cannot approve or reject
  until they have opened the full claim.
  `pages/field/ClaimWorkspace.tsx` is three steps: review every photo
  and recorded finding → a required note + estimate value + the repair
  shop's own uploaded document → send. Four ways out: `share` mode
  `'submit'` (the formal filing; also advances the stage), the `.zip`,
  `share` mode `'document'` (emails the printable page), and a `mailto:`
  link so it sends from the user's own address.
  `GET /claims/:id/document.html?t=…` is that page — photos captioned by
  reason, notes, estimate and chain of custody, print-to-PDF in the
  browser (the API stays dependency-free). Shared by the field app and
  the supplier portal.

- Damage evidence is its own photo collection, never the retail 8-shot
  set: `claims.photos` appends, index-aligned with `photoReasons` and
  `photoNotes`. `GET /claims/:id/package.zip?t=…` streams the whole claim
  (summary + photos named by reason) behind an HMAC-signed token; the
  demo builds the identical archive in the browser and hands back a
  `blob:` URL. Every claim carries at least one damage photo — POST
  /claims derives them from the unit's `inspectionFindings` when the
  caller sends none, saves any inline data URL to disk (the .zip and
  the claim document read files), and refuses a claim with neither.

- One photo viewer for the whole platform: `components/Lightbox.tsx`.
  `useZoomPan()` (wheel/pinch/drag/double-tap), `ViewerControls`
  (previous · zoom out · level · zoom in · next — always in that order,
  always **under** the image box), `ThumbStrip`, `Lightbox`,
  `useLightbox()`. Styling lives in `styles/tokens.css` under
  `.sb-vc` / `.sb-thumb` / `.sb-hero`. Two things it must keep doing:
  render through `createPortal` into `<body>` (the field app centres
  its column with a `transform`, which boxes any `position: fixed`
  child into a sliver), and bind its keys in the **capture** phase with
  `stopPropagation` (hosts bind the same arrows — the marketplace
  detail modal steps containers on ← →). Close (✕) sits on the image
  box's top-right, the counter+caption live at the bottom by the
  controls, and the marketplace passes `onShow3D` (a pill that exits
  to the gallery's 3D slot) — other hosts don't.

- A **shipper account works for exactly one line**: `users.shipperId`
  is mandatory whenever the role is `shipper` or the shipper grant is
  ticked (client + server enforce it; every claim view scopes on it).
  The Shipping Lines directory (HQ admin only) manages the lines and
  their **contacts** — contacts ARE user accounts tied to the line:
  `POST /shippers/:id/invite` mints one (temp password emailed), hide
  = empty grants (`blocked` sentinel), remove = unlink + deactivate.

- Beta bug reporter: `components/BugReport.tsx` mounts once in
  `main.tsx` (floating right-edge tab on every portal; portals into
  `<body>`). It buffers window/console errors, optionally grabs a tab
  screenshot via `getDisplayMedia`, and files to `POST /issues`
  (guests allowed; screenshot saved to disk server-side). Admin →
  Beta Issues lists reports with a copy-as-prompt action. The list
  refetches on entering the view — reports filed after page load must
  appear without a manual refresh.

- Mobile capture rules (`lib/capture.ts`): every photo/file input goes
  through `pickFile()` — DOM-attached (iOS GC's detached inputs while
  the camera is open) with a polled cancel fallback. And because a
  phone camera round-trip can RELOAD the tab, in-flight field-app UI
  (screen + job + step, the Report-damage draft, walk-around progress,
  the claim workspace step/estimate, grade/claim selection) mirrors to
  sessionStorage via load/save/clearSession and restores on mount;
  finishing or cancelling clears it. Never hold camera-adjacent state
  only in React.

- Browser sweeps live IN THE REPO at `apps/web/e2e/` (see its README
  for the run recipe and the suite map) — an earlier set kept in scratch
  space was lost to an environment reset. `node e2e/run-all.mjs` runs
  them all. Add new sweeps there, never to /tmp.

- Three inspection queues, one rule each, shared by the field app's
  Inspections tab and the marketplace's Inspections portal:
  `inspectionRequired` → **damage** (a walk found something),
  else `aiGraded` → **reviewed**, else **initial** (nobody has walked
  it — a driver only moved it, so the inspector runs the original
  inspection). The damage queue needs inspector rights (role
  `inspector`, admin, or a driver with the `claims` grant); a plain
  driver grades units and never reviews reported damage.

- A walk records `inspectionAnswers` (JSON, keyed by
  INSPECTOR_QUESTIONS key) next to `inspectionFindings`, because an
  inspector reading someone else's walk needs the answers, not just the
  photos. `answersOf()` / `walkedBy()` in lib/api.ts read them back;
  no answers and no findings means nobody has inspected the unit.

- A driver who finds damage never grades: the walk ends with exactly
  two ways on — back a stop, or Send to inspector — and nothing is
  written until they choose. Both outcomes return to the job at its
  Load step, not the home screen.

- `TODO.md` is the single work list — blockers, roadmap horizon,
  per-area breakdowns, and a dated Shipped section. Do not start a
  second roadmap or backlog file: a roadmap kept apart from the task
  list drifts within a week and then neither is trusted. Design docs
  (`MARKETING-PORTAL.md`, `SEO-LANDING.md`) carry rationale and
  schema; their *tasks* live in TODO.md.

- The reseller marketing portal's multi-channel blueprint (schema,
  vendor choices, attribution model, compliance, phased rollout) is
  `MARKETING-PORTAL.md`, tasked out in TODO.md. The governing rule:
  vendors deliver messages, our database owns contacts, consent and
  attribution — two systems of record for consent is a legal problem,
  and attribution living in a vendor or a Zap can't join to `orders`.

- The full manual + automated regression plan lives in `TESTPLAN.md`
  — keep it current when flows change; the tester team runs it by hand.

- Home-page redesign in progress (Aug 2026): the pre-redesign page is
  frozen at `apps/web/snapshots/landing-v1/` (restore steps in its
  README; source commit `e59b5ec`). Keep that snapshot untouched while
  the new home page evolves — it is the owner's rollback point.

## Verification before shipping

- `npx tsc --noEmit` in `apps/web`
- `VITE_DEMO_STATIC=1 npm run build` in `apps/web`
- `node test.mjs` in `apps/api` (do not commit the throwaway data dir)
- Playwright smoke against the built demo for UI changes
