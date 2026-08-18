# Browser sweeps (Playwright, against the built demo)

These run against the static demo build — the same artifact GitHub Pages
serves — so what passes here is what testers see.

```bash
cd apps/web
VITE_DEMO_STATIC=1 npm run build          # build the demo into dist/
node e2e/serve-dist.mjs &                 # serve it at http://localhost:4890/SteelBox/
PLAYWRIGHT_LIB=…/playwright/index.mjs \
PW_CHROMIUM=…/chromium \
node e2e/smoke-mobile.mjs                 # run a sweep
```

`PLAYWRIGHT_LIB` / `PW_CHROMIUM` are only needed when playwright isn't on the
module path (they are preset in Claude's remote environment). Screenshots land
in `e2e/shots/` (gitignored).

`node e2e/run-all.mjs` runs every `smoke-*.mjs` in this directory and totals
the result.

| Suite | Covers |
|---|---|
| `smoke-admin` | landing hero, marketplace filter rail + card hover, beta issue triage, shipping lines & contacts, shipper-needs-a-line, retired roles |
| `smoke-claims` | supplier claims list, the workspace's review → estimate → send, inspector hand-off, shipper's read-before-deciding gate, claims RBAC |
| `smoke-inspections` | driver end-of-walk options, the three inspection queues and who sees them, the walk an inspector reads back, original inspections, the desk-side Inspections tab |
| `smoke-mobile` | camera round-trip reload survival on every capture flow, picker hygiene |
| `smoke-viewer` | the photo viewer on the gallery, full screen, the claim page and the shipper's evidence strip |

`lib.mjs` holds the shared plumbing — sign-in, the scorer, and `walkUnit()`,
which drives the guided walk-around end to end.

Suites live here IN THE REPO: an earlier set kept in scratch space was lost to
an environment reset. Never put a sweep anywhere but here.

Hard-won locator notes: dismiss (or pre-seed `sessionStorage.sbx_zip_prompted`)
before hovering marketplace cards; admin left-nav items are `div`s, not
buttons; the viewer's Close button needs an exact-name match ("Front doors
**closed**" also matches /Close/); input placeholders aren't in `textContent`;
`boundingBox()` ignores CSS transforms; input values need `inputValue()`.
