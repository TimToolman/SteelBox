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
  it. `pages/field/ClaimWorkspace.tsx` is three steps: review every photo
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
  `blob:` URL.

- Home-page redesign in progress (Aug 2026): the pre-redesign page is
  frozen at `apps/web/snapshots/landing-v1/` (restore steps in its
  README; source commit `e59b5ec`). Keep that snapshot untouched while
  the new home page evolves — it is the owner's rollback point.

## Verification before shipping

- `npx tsc --noEmit` in `apps/web`
- `VITE_DEMO_STATIC=1 npm run build` in `apps/web`
- `node test.mjs` in `apps/api` (do not commit the throwaway data dir)
- Playwright smoke against the built demo for UI changes
