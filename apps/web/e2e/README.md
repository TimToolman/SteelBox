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

Suites live here IN THE REPO — sweeps kept in scratch space were lost to an
environment reset once; never again. `smoke-mobile.mjs` (camera round-trip
reload survival + picker hygiene) is the first committed suite; the earlier
feature sweeps referenced by TESTPLAN.md are being re-materialized here.

Hard-won locator notes: dismiss (or pre-seed `sessionStorage.sbx_zip_prompted`)
before hovering marketplace cards; admin left-nav items are `div`s, not
buttons; the viewer's Close button needs an exact-name match ("Front doors
**closed**" also matches /Close/); input placeholders aren't in `textContent`;
`boundingBox()` ignores CSS transforms; input values need `inputValue()`.
