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
