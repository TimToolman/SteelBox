# Home page snapshot — v1 ("classic")

Frozen copy of the public home page exactly as it shipped on **Aug 15, 2026**
(commit `e59b5ec`, PR #43 era), taken before the home-page redesign began.
If the new design doesn't work out, this restores the old page in one step.

## What's here

| File                | Live location it mirrors                  |
|---------------------|-------------------------------------------|
| `landing-index.tsx` | `apps/web/src/pages/landing/index.tsx`    |
| `seo.ts`            | `apps/web/src/pages/landing/seo.ts`       |
| `landing.css`       | `apps/web/src/styles/landing.css`         |

These files are **not imported by the app** — they're inert copies, so they
add nothing to the bundle and can't drift or conflict with the redesign.

## To restore the classic home page

From the repo root:

```bash
cp apps/web/snapshots/landing-v1/landing-index.tsx apps/web/src/pages/landing/index.tsx
cp apps/web/snapshots/landing-v1/seo.ts            apps/web/src/pages/landing/seo.ts
cp apps/web/snapshots/landing-v1/landing.css       apps/web/src/styles/landing.css
```

then rebuild. (Equivalent git form: `git checkout e59b5ec -- apps/web/src/pages/landing apps/web/src/styles/landing.css`.)

Note: the SiteNav / SiteFooter / DriveBand components in `landing-index.tsx`
are also imported by the marketplace and city pages, so restoring brings the
whole shared chrome back to its v1 state as well.
