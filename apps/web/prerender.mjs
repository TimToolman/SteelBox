// ============================================================
// Static prerender — runs after `vite build` (client) and
// `vite build --ssr` (SSG entry). For each public route it:
//   1. renders the React tree to HTML (real content for
//      crawlers, social scrapers, and email clients),
//   2. injects per-route <title>/<meta>/canonical/OG tags,
//   3. writes dist/<route>/index.html.
// Also emits:
//   - dist/app.html — pristine SPA shell for non-prerendered
//     routes (/shop, /admin, /field) so they don't flash the
//     landing page markup before the router mounts,
//   - dist/404.html — copy of app.html (GitHub Pages fallback),
//   - dist/sitemap.xml + dist/robots.txt (production URLs).
//
// Env:
//   VITE_SITE_ORIGIN  canonical origin (default production www)
//   VITE_NOINDEX=1    add <meta robots noindex> — set on the
//                     GitHub Pages test bed so it never competes
//                     with production for keywords
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')

const ORIGIN = (process.env.VITE_SITE_ORIGIN || 'https://www.mvpcontainers.com').replace(/\/$/, '')
const NOINDEX = process.env.VITE_NOINDEX === '1'

const { renderPages } = await import(join(root, 'dist-ssr', 'entry-ssg.js'))

const template = readFileSync(join(dist, 'index.html'), 'utf8')

// Pristine SPA shell for client-routed pages (+ Pages 404 fallback).
writeFileSync(join(dist, 'app.html'), template)
writeFileSync(join(dist, '404.html'), template)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function headFor(page) {
  const canonical = `${ORIGIN}${page.path}`
  const og = `${ORIGIN}/og/og-card.jpg`
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    NOINDEX ? `<meta name="robots" content="noindex, nofollow" />` : `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="MVP Container" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${og}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Field-inspected shipping container ready for delivery" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${og}" />`,
  ].join('\n    ')
}

const pages = renderPages()

for (const page of pages) {
  let html = template
    // Replace the template's static title/description with per-route head.
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace(/<meta name="description"[^>]*\/?>\s*/, '')
    .replace('</head>', `  ${headFor(page)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${page.html}</div>`)

  const outDir = join(dist, ...page.path.split('/').filter(Boolean))
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), html)
  console.log(`[prerender] wrote ${page.path} (${Math.round(html.length / 1024)} kB)`)
}

// ── sitemap.xml + robots.txt (production URLs only) ──
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>${ORIGIN}${p.path}</loc></url>`).join('\n')}
</urlset>
`
writeFileSync(join(dist, 'sitemap.xml'), sitemap)
writeFileSync(join(dist, 'robots.txt'), NOINDEX
  ? `User-agent: *\nDisallow: /\n`
  : `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`)

console.log(`[prerender] ${pages.length} pages · origin ${ORIGIN} · noindex=${NOINDEX}`)
