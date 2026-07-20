# SEO — Landing & City Pages

How the public marketing pages (`/`, `/service-area/`, `/service-area/<city>/`) get real
content and unique meta into the **served HTML**, and how the two deploy targets are kept
from competing with each other.

## The problem this solves

The app is a Vite/React SPA. Before this work, the served `index.html` was an empty
`<div id="root"></div>` shell — crawlers, social scrapers, and email link previews saw no
content, one generic title, and no canonical. All ranking signal was thrown away.

## Prerender approach (SSG, no SSR/ISR)

Build pipeline (`apps/web/package.json` → `build`):

1. `tsc && vite build` — normal client build.
2. `vite build --ssr src/entry-ssg.tsx --outDir dist-ssr` — server bundle of the landing,
   service-area index, and city pages.
3. `node prerender.mjs` —
   - fetches **live inventory** from `VITE_API_URL` (best-effort, 8s timeout) so real
     units with real prices are baked into the HTML; falls back to size-spec category
     cards when unreachable,
   - renders each route with `renderToString`, injects per-route `<title>`, meta
     description, robots, canonical, Open Graph/Twitter tags into the template,
   - writes `dist/<route>/index.html` (25 pages currently),
   - emits `dist/app.html` (pristine SPA shell used for `/shop`, `/admin`, `/field` so
     they don't flash landing markup), `dist/404.html` (GitHub Pages SPA fallback),
     `dist/sitemap.xml`, `dist/robots.txt`.

Everything is static at build time — **no on-demand SSR, no ISR, no serverless
functions** — so there is no function/bandwidth overage exposure on Vercel. Inventory in
the HTML is as fresh as the last deploy; the client re-fetches live data on hydration.

Verified on the built output (`grep` on `dist/index.html`): hero copy, product grid with
prices (note: React emits `$<!-- -->3,548` comment separators — text content is intact
for crawlers), and FAQ text are all present in raw HTML.

## Deploy targets

| | Vercel (production) | GitHub Pages (test bed) |
|---|---|---|
| Domain | `https://www.mvpcontainers.com` (apex 301 → www via `vercel.json` redirect + dashboard domain config) | `*.github.io/SteelBox/` |
| Vite base | `/` (`VITE_BASE=/` in `vercel.json` build env) | `/SteelBox/` (default) |
| Robots meta | `index, follow` | **`noindex, nofollow` on every page** (`VITE_NOINDEX=1` in `deploy.yml`) |
| Canonical | self, on production origin | **points at production** (`https://www.mvpcontainers.com/...`) |
| robots.txt | `Allow: /` + sitemap | `Disallow: /` (inert at a subpath, meta noindex is the real mechanism) |

So the Pages build can never compete with production for keywords.

Vercel routing (`vercel.json`): static files first; anything else rewrites to `/app.html`
(SPA). Assets get immutable cache headers.

## Meta / schema / OG coverage

Per prerendered route:

- Unique `<title>` + meta description (`src/pages/landing/seo.ts` — `homeMeta`,
  `cityMeta`, `serviceAreaMeta`), targeting *shipping containers for sale [city]*,
  *conex box [city]*, *container rental [city]*. All copy is original — nothing sourced
  from competitor sites.
- `<link rel="canonical">` derived from the **tenant's** `primaryDomain`.
- Open Graph + Twitter card: `og:title/description/url/type/site_name`,
  `og:image` = `/og/og-card.jpg` (real container photo, 1200×630),
  `twitter:card=summary_large_image`.
- JSON-LD (rendered inside the React tree so it ships in static HTML *and* on hydration):
  - **LocalBusiness** — NAP, hours, Gulf Coast `areaServed`, social `sameAs`.
  - **ItemList of Product** — live units with `Offer` (price, `InStock`) when inventory
    was baked; spec-only Products otherwise.
  - **FAQPage** — generated from the same `buildFaq()` array that renders the visible
    FAQ, so schema text always matches page text.
  - **BreadcrumbList** — Home → Service Area → City on city pages.

## Correct numbers, one source

All dimensions/payloads/grades render from `src/lib/specs.ts` (`SIZE_SPECS`,
`GRADE_META`, `CUSTOM_MODS`) — e.g. the 20ft payload is stated as ≈**47,900 lb**
(52,910 lb max gross − ~5,000 lb tare), deliberately correcting the ~24,000 lb figure
competitors repeat. The marketplace imports the same `GRADE_META`. Don't restate numbers
inline anywhere; extend `specs.ts`.

## Multi-tenant seam

`src/tenant/index.ts` resolves a `Tenant` from the request hostname (one seed:
`www.mvpcontainers.com` → `mvp-container`, brand `#2B7FD4 / #E65100 / #13293D`). Brand
colors flow in as CSS vars (`--ld-brand` etc.), canonical/OG/schema URLs derive from
`tenant.primaryDomain`, and service cities/ZIP prefixes live on the tenant. All public
inventory reads go through `src/tenant/inventory.ts` → `getInventory({ tenantId, nearZip,
radiusMiles, scope })`. A second tenant or a national site = a new config entry.

## Lead attribution

`src/lib/attribution.ts` captures UTM params + `gclid` + referrer on load
(first/last touch, localStorage) and every lead path spreads `attributionFields(source)`
into the `/quotes` payload: marketplace quote dialog, landing rental/custom quick forms,
city-page quote form, email-capture band. **Note:** the API's `POST /quotes` currently
discards its body (write-only stub) — the payload arrives but isn't persisted yet; on
failure the client logs the payload to console as a fallback.

## Known gaps / next steps

- Persist `/quotes` payloads server-side (lead_events CSV) — attribution is already
  arriving in the request body.
- Replace the three sample testimonials in `src/tenant/index.ts` (marked
  "Sample quote — replace before launch") with real customer quotes. They are plain text
  only — deliberately **not** marked up as Review/AggregateRating schema.
- Set `tenant.googleReviewsUrl` to the real Google Business profile once claimed; add a
  rating badge when there are reviews to show.
- Verify the seeded NAP (address/phone/hours) in `src/tenant/index.ts` matches the real
  Google Business Profile before launch.
- `node_modules` is historically committed (~3,200 tracked files); `.gitignore` now
  blocks new additions — untracking the rest is a separate cleanup PR.
