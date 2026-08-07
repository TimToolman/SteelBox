// Generate varied container "photos" (SVG) for demo units with no real
// shots, and diversify factory colors on new stock. Seeded by SKU —
// rerunning produces identical output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = join(ROOT, 'src/lib/demo-data.json')
const OUT_DIR = join(ROOT, 'public/demo-photos/gen')
mkdirSync(OUT_DIR, { recursive: true })

const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'))

// mulberry32 seeded from the SKU
const seedOf = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }

const PALETTE = {
  Beige: '#C4B49A', Gray: '#878E94', Blue: '#2F5F8A', Green: '#3F6B50',
  White: '#DDDFDA', Tan: '#A98A5F', Red: '#7E3B33', Orange: '#BE6A2F',
}
const NEW_COLORS = ['Beige', 'Gray', 'Blue', 'Green', 'White', 'Tan', 'Red', 'Orange']
const USED_COLORS = ['Blue', 'Green', 'Tan', 'Red', 'Gray', 'Beige', 'Orange']

const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16)
  const ch = i => Math.max(0, Math.min(255, Math.round(((n >> i) & 255) * f)))
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

function svgFor(c, r) {
  const W = 640, H = 340
  const colorHex = PALETTE[c.color] || '#7A8087'
  const jit = 0.94 + r() * 0.12
  const body = shade(colorHex, jit)
  const dark = shade(body, 0.78), darker = shade(body, 0.6), light = shade(body, 1.18)
  const is40 = c.size.startsWith('40')
  // Container geometry
  const bw = is40 ? W - 60 : Math.round((W - 60) * 0.72)
  const bx = Math.round((W - bw) / 2), bh = is40 ? 168 : 188, by = H - 66 - bh
  const ribs = is40 ? 26 : 18
  const ribW = bw / ribs
  const used = c.condition !== 'new'
  const grade = c.grade || 'A'

  // Yard scenes vary a little
  const scene = Math.floor(r() * 3)
  const skies = [['#DCE7F0', '#C6D6E4'], ['#E7EBEE', '#D3DBE2'], ['#E4E0D5', '#CFCBC0']][scene]
  const ground = ['#B9BDB9', '#C4C1B8', '#ADB2B5'][scene]

  let el = []
  // sky + ground
  el.push(`<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skies[0]}"/><stop offset="1" stop-color="${skies[1]}"/></linearGradient>
  <linearGradient id="bodyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".18" stop-color="${body}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
  <filter id="blur1"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="blur2"><feGaussianBlur stdDeviation="5"/></filter></defs>`)
  el.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`)
  el.push(`<rect y="${H - 78}" width="${W}" height="78" fill="${ground}"/>`)
  el.push(`<ellipse cx="${W / 2}" cy="${H - 62}" rx="${bw / 2 + 14}" ry="12" fill="#000" opacity=".18" filter="url(#blur2)"/>`)

  // body
  el.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="url(#bodyg)"/>`)
  // corrugation
  for (let i = 1; i < ribs; i++) {
    const x = bx + i * ribW
    el.push(`<rect x="${x - 1.2}" y="${by + 8}" width="2.4" height="${bh - 16}" fill="${darker}" opacity=".55"/>`)
    el.push(`<rect x="${x + 1.4}" y="${by + 8}" width="1.6" height="${bh - 16}" fill="${light}" opacity=".4"/>`)
  }
  // top & bottom rails, corner posts
  el.push(`<rect x="${bx}" y="${by}" width="${bw}" height="9" fill="${darker}"/>`)
  el.push(`<rect x="${bx}" y="${by + bh - 10}" width="${bw}" height="10" fill="${darker}"/>`)
  for (const x of [bx, bx + bw - 12]) el.push(`<rect x="${x}" y="${by}" width="12" height="${bh}" fill="${dark}"/>`)
  // corner castings
  for (const [x, y] of [[bx - 4, by - 2], [bx + bw - 10, by - 2], [bx - 4, by + bh - 12], [bx + bw - 10, by + bh - 12]])
    el.push(`<rect x="${x}" y="${y}" width="14" height="14" rx="2" fill="#4A4E52"/><circle cx="${x + 7}" cy="${y + 7}" r="3" fill="#2E3134"/>`)
  // door end (right): hinge seam + 4 lock rods
  const dx = bx + bw - Math.max(56, ribW * 2.4)
  el.push(`<rect x="${dx}" y="${by + 9}" width="${bx + bw - dx - 12}" height="${bh - 19}" fill="${shade(body, 0.92)}"/>`)
  for (let i = 0; i < 4; i++) {
    const x = dx + 10 + i * ((bx + bw - dx - 30) / 4)
    el.push(`<rect x="${x}" y="${by + 12}" width="4" height="${bh - 24}" rx="2" fill="${shade(body, 1.3)}" stroke="${darker}" stroke-width=".8"/>`)
    el.push(`<rect x="${x - 3}" y="${by + bh * 0.45}" width="10" height="5" rx="2" fill="#3A3E42"/>`)
  }
  // SKU stencil + CSC plate
  el.push(`<text x="${bx + 22}" y="${by + 30}" font-family="monospace" font-size="15" font-weight="700" fill="${used ? '#EDEDE6' : '#F5F5EF'}" opacity=".85">${c.sku}</text>`)
  el.push(`<rect x="${bx + 20}" y="${by + bh - 40}" width="34" height="22" rx="2" fill="#D8D8D0" opacity=".8"/>`)

  // Painted grade stencil — the ask: the grade must read off the default
  // image itself, not just the UI badge. Colors match GRADE_META.
  const GRADE_HEX = { A: '#1B7A5A', B: '#2563EB', C: '#D97706', R: '#6D28D9', X: '#374151' }
  const GRADE_WORD = { A: 'ONE-TRIP', B: 'CARGO-WORTHY', C: 'WIND &amp; WATERTIGHT', R: 'REFURBISHED', X: 'CUSTOM BUILD' }
  if (used) {
    const gx = bx + 24, gy = by + bh - 78
    el.push(`<rect x="${gx}" y="${gy}" width="40" height="40" rx="4" fill="${GRADE_HEX[grade] || '#374151'}" opacity=".92"/>`)
    el.push(`<text x="${gx + 20}" y="${gy + 29}" text-anchor="middle" font-family="monospace" font-size="26" font-weight="700" fill="#fff">${grade}</text>`)
    el.push(`<rect x="${gx + 46}" y="${gy + 11}" width="${GRADE_WORD[grade].length * 7.4 + 14}" height="18" rx="3" fill="#101418" opacity=".55"/>`)
    el.push(`<text x="${gx + 53}" y="${gy + 24}" font-family="monospace" font-size="11" font-weight="700" letter-spacing="1" fill="#F2F2EA">${GRADE_WORD[grade]}</text>`)
  }

  // ── Wear & damage, scaled by grade ──
  const rust = (n, minR, maxR, op) => {
    for (let i = 0; i < n; i++) {
      const x = bx + 16 + r() * (bw - 40), y = by + 14 + r() * (bh - 30)
      const rr = minR + r() * (maxR - minR)
      const tone = ['#8B4A2B', '#A0522D', '#6B3A20', '#96552F'][Math.floor(r() * 4)]
      el.push(`<ellipse cx="${x}" cy="${y}" rx="${rr}" ry="${rr * (0.5 + r() * 0.6)}" fill="${tone}" opacity="${op + r() * 0.2}" filter="url(#blur1)"/>`)
      if (r() < 0.6) el.push(`<rect x="${x - 1.5}" y="${y}" width="3" height="${10 + r() * 26}" fill="${tone}" opacity="${op * 0.7}" filter="url(#blur1)"/>`)
    }
  }
  const scratches = n => {
    for (let i = 0; i < n; i++) {
      const x = bx + 20 + r() * (bw - 60), y = by + 20 + r() * (bh - 40)
      el.push(`<rect x="${x}" y="${y}" width="${14 + r() * 46}" height="1.6" fill="${light}" opacity="${0.4 + r() * 0.3}" transform="rotate(${(r() - 0.5) * 14} ${x} ${y})"/>`)
    }
  }
  const dents = n => {
    for (let i = 0; i < n; i++) {
      const x = bx + 30 + r() * (bw - 80), y = by + 24 + r() * (bh - 56)
      el.push(`<ellipse cx="${x}" cy="${y}" rx="${12 + r() * 22}" ry="${8 + r() * 14}" fill="#000" opacity="${0.14 + r() * 0.12}" filter="url(#blur2)"/>`)
    }
  }
  const fade = n => {
    for (let i = 0; i < n; i++) {
      const x = bx + r() * (bw - 90)
      el.push(`<rect x="${x}" y="${by + 10}" width="${50 + r() * 90}" height="${bh - 20}" fill="#fff" opacity="${0.05 + r() * 0.07}"/>`)
    }
  }
  const repaint = n => {
    for (let i = 0; i < n; i++) {
      const i0 = 1 + Math.floor(r() * (ribs - 3)), span = 1 + Math.floor(r() * 2)
      el.push(`<rect x="${bx + i0 * ribW}" y="${by + 9}" width="${span * ribW}" height="${bh - 19}" fill="${shade(body, 0.82 + r() * 0.5)}" opacity=".85"/>`)
    }
  }

  if (!used) {
    // one-trip: clean, but some units picked up transport dust/scuffs
    if (r() < 0.4) scratches(1 + Math.floor(r() * 2))
    if (r() < 0.25) el.push(`<rect x="${bx}" y="${by + bh - 26}" width="${bw}" height="16" fill="#6B5B45" opacity="${0.06 + r() * 0.06}" filter="url(#blur2)"/>`)
  } else if (grade === 'A') {
    // used one-trip: near-new, a scuff or two at most
    scratches(1 + Math.floor(r() * 2))
    if (r() < 0.4) fade(1)
  } else if (grade === 'X') {
    // custom build: personnel door + window cut into the side, mild wear
    const ddx = bx + bw * (0.28 + r() * 0.1)
    el.push(`<rect x="${ddx}" y="${by + bh - 96}" width="44" height="86" rx="3" fill="${shade(body, 0.7)}" stroke="#2E3134" stroke-width="2"/>`)
    el.push(`<circle cx="${ddx + 36}" cy="${by + bh - 52}" r="3" fill="#D9D9D2"/>`)
    const wx = ddx + 78
    el.push(`<rect x="${wx}" y="${by + 34}" width="64" height="40" rx="3" fill="#9FC2D8" stroke="#2E3134" stroke-width="2"/>`)
    el.push(`<line x1="${wx + 32}" y1="${by + 34}" x2="${wx + 32}" y2="${by + 74}" stroke="#2E3134" stroke-width="2"/>`)
    scratches(1 + Math.floor(r() * 2)); if (r() < 0.5) rust(1, 4, 8, 0.28)
  } else if (grade === 'B') {
    fade(1 + Math.floor(r() * 2)); scratches(2 + Math.floor(r() * 3)); rust(2 + Math.floor(r() * 3), 4, 10, 0.3); dents(r() < 0.5 ? 1 : 0)
  } else if (grade === 'C') {
    fade(2); scratches(4 + Math.floor(r() * 4)); rust(6 + Math.floor(r() * 5), 6, 20, 0.42); dents(2 + Math.floor(r() * 2))
    el.push(`<rect x="${bx}" y="${by + bh - 18}" width="${bw}" height="8" fill="#7A4526" opacity=".4" filter="url(#blur1)"/>`)
  } else { // R / X and anything else used
    repaint(1 + Math.floor(r() * 2)); rust(3 + Math.floor(r() * 3), 5, 12, 0.35); scratches(2); dents(1)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${el.join('')}</svg>`
}

// Spread the used stock across the full grade ladder with 3 BROWSABLE
// (status=available) units per grade — shoppers must actually see every
// grade on the lot. Converts a few available new units to used if the
// browsable used pool is short. Deterministic by SKU order.
const GRADE_LADDER = ['A', 'B', 'C', 'R', 'X']
const PER_GRADE = 3
const isUsed = c => c.condition !== 'new'
const avail = c => c.status === 'available'
{
  const short = GRADE_LADDER.length * PER_GRADE - data.containers.filter(c => isUsed(c) && avail(c)).length
  if (short > 0) {
    const candidates = data.containers
      .filter(c => !isUsed(c) && avail(c) && !(c.photos && c.photos.filter(Boolean).find(u => !String(u).includes('/photos/gen/'))))
      .sort((a, b) => a.sku.localeCompare(b.sku))
    const step = Math.max(1, Math.floor(candidates.length / short))
    for (let i = 0, n = 0; n < short && i < candidates.length; i += step, n++) {
      const c = candidates[i]
      c.condition = 'used'
      const r = rng(seedOf(c.sku + ':used'))
      c.color = USED_COLORS[Math.floor(r() * USED_COLORS.length)]
    }
  }
  const browsable = data.containers.filter(c => isUsed(c) && avail(c)).sort((a, b) => a.sku.localeCompare(b.sku))
  browsable.forEach((c, i) => { c.grade = GRADE_LADDER[Math.floor(i / PER_GRADE) % GRADE_LADDER.length] })
  const rest = data.containers.filter(c => isUsed(c) && !avail(c)).sort((a, b) => a.sku.localeCompare(b.sku))
  rest.forEach((c, i) => { c.grade = GRADE_LADDER[i % GRADE_LADDER.length] })
}

let generated = 0, recolored = 0
for (const c of data.containers) {
  const realPhoto = c.photos && c.photos.filter(Boolean).find(u => !String(u).includes('/photos/gen/'))
  if (realPhoto) continue // keep real photo sets
  const r = rng(seedOf(c.sku))
  // Diversify factory colors: roughly half the new stock keeps Beige/Gray,
  // the rest spreads across the catalog colors. Used units without a color
  // get a plausible weathered one.
  if (c.condition === 'new') {
    if ((!c.color || c.color === 'Beige' || c.color === 'Gray') && r() < 0.5) {
      c.color = NEW_COLORS[Math.floor(r() * NEW_COLORS.length)]
      recolored++
    }
  } else if (!c.color) {
    c.color = USED_COLORS[Math.floor(r() * USED_COLORS.length)]
    recolored++
  }
  const file = `${c.sku}.svg`
  writeFileSync(`${OUT_DIR}/${file}`, svgFor(c, r))
  c.photos = c.photos && c.photos.length ? c.photos : []
  c.photos[0] = `/photos/gen/${file}`
  generated++
}
writeFileSync(JSON_PATH, JSON.stringify(data, null, 1) + '\n')
console.log({ generated, recolored })
