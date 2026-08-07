// ============================================================
// Demo container photo variants — REAL photos, modified.
//
// Uses the background-removed 8-shot set (CDI-20-0002) as the
// master and derives per-color / per-condition variants with
// sharp: the cutout alpha lets the container itself be tinted
// and weathered without painting the sky. New stock shares one
// variant set per factory color; every used unit gets its own
// full 8-shot set with grade-scaled aging, rust, repaint
// patches, and a painted grade stencil on the default shot.
// Interior shots (slots 5–6) are never tinted — only aged.
//
// Also spreads the used stock so every condition grade has 3
// browsable (status=available) units, converting a few new
// units when short. Deterministic: seeded by SKU throughout.
//
// Run from anywhere (writes public/demo-photos/gen/ and patches
// src/lib/demo-data.json). Requires sharp, which is NOT a repo
// dependency — install it un-saved first:
//   npm --prefix apps/web install --no-save sharp
//   node apps/web/scripts/gen-demo-photos.mjs
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = join(ROOT, 'src/lib/demo-data.json')
const OUT_DIR = join(ROOT, 'public/demo-photos/gen')
const PHOTO_DIR = join(ROOT, '../api/data/photos')

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  // Fall back to a scratch install (npm i --no-save sharp anywhere reachable)
  const req = createRequire(import.meta.url)
  try { sharp = req(process.env.SHARP_PATH || 'sharp') } catch {
    console.error('sharp is required: npm --prefix apps/web install --no-save sharp')
    process.exit(1)
  }
}

mkdirSync(OUT_DIR, { recursive: true })
// The SVG variants this photo pipeline replaces
for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.svg')) rmSync(join(OUT_DIR, f))

const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'))

// ── Deterministic RNG (mulberry32, seeded from SKU) ──
const seedOf = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }

// ── Master shots: slot i ← CDI-20-0002-0(i+1)-*.{webp,jpg} ──
const files = readdirSync(PHOTO_DIR)
const baseShot = i => {
  const f = files.find(f => f.startsWith(`CDI-20-0002-0${i + 1}-`))
  if (!f) throw new Error(`missing master shot ${i + 1}`)
  return join(PHOTO_DIR, f)
}
const INTERIOR = new Set([5, 6]) // 'Inside back', 'Inside out' — never tint

// ── Palette: factory colors → tint targets (Beige = original paint) ──
const TINTS = {
  Beige: null,
  Gray: 'desat',
  White: 'bright',
  Blue: { r: 90, g: 130, b: 185 },
  Green: { r: 105, g: 145, b: 110 },
  Tan: { r: 185, g: 140, b: 95 },
  Red: { r: 170, g: 95, b: 85 },
  Orange: { r: 190, g: 120, b: 70 },
}
const NEW_COLORS = Object.keys(TINTS)
const USED_COLORS = ['Blue', 'Green', 'Tan', 'Red', 'Gray', 'Beige', 'Orange']
const GRADE_HEX = { A: '#1B7A5A', B: '#2563EB', C: '#D97706', R: '#6D28D9', X: '#374151' }
const GRADE_WORD = { A: 'ONE-TRIP', B: 'CARGO-WORTHY', C: 'WIND &amp; WATERTIGHT', R: 'REFURBISHED', X: 'CUSTOM BUILD' }

const WIDTH = 640

// Grade-scaled aging parameters
const AGING = {
  A: { brightness: 0.97, saturation: 0.92, rust: 0 },
  B: { brightness: 0.93, saturation: 0.8, rust: 4 },
  C: { brightness: 0.88, saturation: 0.62, rust: 9 },
  R: { brightness: 0.94, saturation: 0.85, rust: 3, repaint: 2 },
  X: { brightness: 0.95, saturation: 0.88, rust: 1 },
}

// Rust blobs / repaint patches / grade stencil as an SVG overlay,
// composited with blend 'atop' so it clips to the container cutout.
function overlaySvg(w, h, { rust = 0, repaint = 0, stencil = null }, r) {
  const el = []
  for (let i = 0; i < repaint; i++) {
    const x = w * (0.1 + r() * 0.6), y = h * (0.15 + r() * 0.4)
    const pw = w * (0.12 + r() * 0.18), ph = h * (0.2 + r() * 0.35)
    const tone = r() < 0.5 ? '255,255,255' : '30,25,20'
    el.push(`<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="rgb(${tone})" opacity="${0.1 + r() * 0.1}"/>`)
  }
  for (let i = 0; i < rust; i++) {
    const x = w * (0.06 + r() * 0.88), y = h * (0.35 + r() * 0.55)
    const rr = w * (0.015 + r() * 0.045)
    const tone = ['139,74,43', '160,82,45', '107,58,32'][Math.floor(r() * 3)]
    el.push(`<ellipse cx="${x}" cy="${y}" rx="${rr}" ry="${rr * (0.5 + r())}" fill="rgb(${tone})" opacity="${0.35 + r() * 0.3}" filter="url(#b)"/>`)
    if (r() < 0.55) el.push(`<rect x="${x - rr * 0.15}" y="${y}" width="${rr * 0.3}" height="${rr * (2 + r() * 4)}" fill="rgb(${tone})" opacity="0.3" filter="url(#b)"/>`)
  }
  if (stencil) {
    const s = w * 0.055, gx = w * 0.05, gy = h * 0.86
    el.push(`<rect x="${gx}" y="${gy}" width="${s}" height="${s}" rx="${s * 0.12}" fill="${GRADE_HEX[stencil]}" opacity=".95"/>`)
    el.push(`<text x="${gx + s / 2}" y="${gy + s * 0.74}" text-anchor="middle" font-family="monospace" font-size="${s * 0.66}" font-weight="700" fill="#fff">${stencil}</text>`)
    el.push(`<rect x="${gx + s * 1.15}" y="${gy + s * 0.22}" width="${GRADE_WORD[stencil].replace('&amp;', '&').length * s * 0.19 + s * 0.35}" height="${s * 0.52}" rx="${s * 0.08}" fill="#101418" opacity=".6"/>`)
    el.push(`<text x="${gx + s * 1.32}" y="${gy + s * 0.6}" font-family="monospace" font-size="${s * 0.3}" font-weight="700" letter-spacing="1" fill="#F2F2EA">${GRADE_WORD[stencil]}</text>`)
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="b"><feGaussianBlur stdDeviation="${w * 0.008}"/></filter></defs>${el.join('')}</svg>`)
}

const CARD_H = Math.round(WIDTH * 0.52) // marketplace card photo aspect

async function makeShot({ slot, color, grade, seedKey, outName }) {
  const src = baseShot(slot)
  // Slot 0 is the card thumbnail: letterbox the cutout into the card's
  // landscape aspect on a transparent canvas so the whole box is visible
  // (object-fit: cover would otherwise crop to the middle of the doors).
  let img = slot === 0
    ? sharp(src).resize({ width: WIDTH, height: CARD_H, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : sharp(src).resize({ width: WIDTH })
  const meta = await img.metadata()
  const h = slot === 0 ? CARD_H : Math.round(meta.height * (WIDTH / meta.width))

  const tint = INTERIOR.has(slot) ? null : TINTS[color] ?? null
  if (tint === 'desat') img = img.modulate({ saturation: 0.35, brightness: 0.95 })
  else if (tint === 'bright') img = img.modulate({ saturation: 0.4, brightness: 1.12 })
  else if (tint) img = img.tint(tint)

  if (grade) {
    const a = AGING[grade] ?? AGING.B
    img = img.modulate({ brightness: a.brightness, saturation: a.saturation })
    const wantsOverlay = !INTERIOR.has(slot) && (a.rust || a.repaint || slot === 0)
    if (wantsOverlay) {
      const r = rng(seedOf(seedKey + ':' + slot))
      const layers = []
      const wear = overlaySvg(WIDTH, h, {
        rust: a.rust ? a.rust + Math.floor(r() * 3) : 0,
        repaint: a.repaint || 0,
      }, r)
      layers.push({ input: wear, blend: 'atop' }) // clips to the cutout
      if (slot === 0) {
        // Stencil rides 'over' so it stays legible even on the letterbox gutter
        layers.push({ input: overlaySvg(WIDTH, h, { stencil: grade }, r), blend: 'over' })
      }
      img = img.composite(layers)
    }
  }
  await img.webp({ quality: 68 }).toFile(join(OUT_DIR, outName))
  return `/photos/gen/${outName}`
}

// ── Grade spread: 3 browsable used units per grade ──
const GRADE_LADDER = ['A', 'B', 'C', 'R', 'X']
const PER_GRADE = 3
const isUsed = c => c.condition !== 'new'
const avail = c => c.status === 'available'
const hasRealPhotos = c => c.photos && c.photos.filter(Boolean).some(u => !String(u).includes('/photos/gen/'))
{
  const short = GRADE_LADDER.length * PER_GRADE - data.containers.filter(c => isUsed(c) && avail(c)).length
  if (short > 0) {
    const candidates = data.containers
      .filter(c => !isUsed(c) && avail(c) && !hasRealPhotos(c))
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

// ── Diversify new-stock colors (seeded, ~half keep factory beige/gray) ──
let recolored = 0
for (const c of data.containers) {
  if (hasRealPhotos(c)) continue
  const r = rng(seedOf(c.sku))
  if (c.condition === 'new') {
    if ((!c.color || c.color === 'Beige' || c.color === 'Gray') && r() < 0.5) {
      c.color = NEW_COLORS[Math.floor(r() * NEW_COLORS.length)]
      recolored++
    }
  } else if (!c.color || !TINTS[c.color]) {
    c.color = USED_COLORS[Math.floor(r() * USED_COLORS.length)]
    recolored++
  }
}

// ── Generate: shared sets per color for new stock ──
const newColors = [...new Set(data.containers.filter(c => !hasRealPhotos(c) && c.condition === 'new').map(c => c.color || 'Beige'))]
const colorSets = {}
for (const color of newColors) {
  const set = []
  for (let slot = 0; slot < 8; slot++) {
    set.push(await makeShot({ slot, color, grade: null, seedKey: color, outName: `new-${color.toLowerCase()}-${slot}.webp` }))
  }
  colorSets[color] = set
}

// ── Generate: per-unit weathered sets for used stock ──
let usedSets = 0
for (const c of data.containers) {
  if (hasRealPhotos(c)) continue
  if (c.condition === 'new') {
    c.photos = [...(colorSets[c.color || 'Beige'] ?? colorSets.Beige ?? [])]
    continue
  }
  const set = []
  for (let slot = 0; slot < 8; slot++) {
    set.push(await makeShot({ slot, color: c.color || 'Beige', grade: c.grade || 'B', seedKey: c.sku, outName: `${c.sku}-${slot}.webp` }))
  }
  c.photos = set
  usedSets++
}

writeFileSync(JSON_PATH, JSON.stringify(data, null, 1) + '\n')
console.log({ newColorSets: newColors.length, usedUnitSets: usedSets, recolored })
