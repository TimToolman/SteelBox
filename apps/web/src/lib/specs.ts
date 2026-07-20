// ============================================================
// Canonical container reference data — single source of truth
// for sizes, grades, and custom-mod marketing copy.
//
// Every surface that states a dimension, payload, or grade
// definition (landing page, city pages, FAQ, JSON-LD schema,
// marketplace) must render FROM these constants so the numbers
// can never drift apart. Do not restate these values inline.
// ============================================================

import type { ContainerGrade, ContainerSize } from './api'

// ── Size specifications ───────────────────────────────────
// Figures follow the ISO 668 rating plate on the container door.
// Note the 20ft payload: the CSC plate rates a standard 20ft at
// 52,910 lb max gross − ~5,000 lb tare ≈ 47,900 lb of cargo.
// (Listings elsewhere often show ~24,000 lb — a kg/lb mix-up.)

export interface SizeSpec {
  size: ContainerSize
  label: string            // marketing label ("20ft Standard")
  keyword: string          // SEO phrase ("20ft shipping container")
  extL: string; extW: string; extH: string
  intL: string; intW: string; intH: string
  doorW: string            // door opening width
  doorH: string            // door opening clearance
  capacityCuFt: number     // internal cubic capacity
  floorSqFt: number        // interior floor area
  tareLb: number           // empty weight
  maxGrossLb: number       // CSC plate max gross
  payloadLb: number        // maxGross − tare (real cargo payload)
}

// The four core marketplace sizes. Specialty types (double door,
// open side, quad) inherit the base shell dimensions of their size.
export const SIZE_SPECS: SizeSpec[] = [
  {
    size: '20ft-std', label: '20ft Standard', keyword: '20ft shipping container',
    extL: `20'0"`, extW: `8'0"`, extH: `8'6"`,
    intL: `19'4"`, intW: `7'8"`, intH: `7'10"`,
    doorW: `7'8"`, doorH: `7'6"`,
    capacityCuFt: 1172, floorSqFt: 148,
    tareLb: 5010, maxGrossLb: 52910, payloadLb: 47900,
  },
  {
    size: '20ft-hc', label: '20ft High Cube', keyword: '20ft high cube container',
    extL: `20'0"`, extW: `8'0"`, extH: `9'6"`,
    intL: `19'4"`, intW: `7'8"`, intH: `8'10"`,
    doorW: `7'8"`, doorH: `8'6"`,
    capacityCuFt: 1310, floorSqFt: 148,
    tareLb: 5200, maxGrossLb: 52910, payloadLb: 47710,
  },
  {
    size: '40ft-std', label: '40ft Standard', keyword: '40ft shipping container',
    extL: `40'0"`, extW: `8'0"`, extH: `8'6"`,
    intL: `39'6"`, intW: `7'8"`, intH: `7'10"`,
    doorW: `7'8"`, doorH: `7'6"`,
    capacityCuFt: 2390, floorSqFt: 303,
    tareLb: 8270, maxGrossLb: 67200, payloadLb: 58930,
  },
  {
    size: '40ft-hc', label: '40ft High Cube', keyword: '40ft high cube container',
    extL: `40'0"`, extW: `8'0"`, extH: `9'6"`,
    intL: `39'6"`, intW: `7'8"`, intH: `8'10"`,
    doorW: `7'8"`, doorH: `8'6"`,
    capacityCuFt: 2694, floorSqFt: 303,
    tareLb: 8600, maxGrossLb: 67200, payloadLb: 58600,
  },
]

export const specOf = (size: ContainerSize): SizeSpec | undefined =>
  SIZE_SPECS.find(s => s.size === size)

// Delivery-truck site requirements (tilt-bed roll-off) — used by the
// FAQ and city pages so access guidance is stated once.
export const DELIVERY_CLEARANCE = {
  straightFeet20: 75,   // straight-line clearance to set a 20ft
  straightFeet40: 100,  // straight-line clearance to set a 40ft
  widthFeet: 12,
  overheadFeet: 14,
}

// ── Grade definitions ─────────────────────────────────────
// Canonical grade ladder — shared by marketplace cards, landing
// page, FAQ, and admin surfaces.

export const GRADE_META: Record<ContainerGrade, { label: string; desc: string; color: string }> = {
  A: { label: 'One-Trip', desc: 'Direct import, single use. Like new inside and out.', color: '#1B7A5A' },
  B: { label: 'Cargo-Worthy', desc: 'Used, structurally sound, wind and watertight.', color: '#2563EB' },
  C: { label: 'Wind & Watertight', desc: 'Older unit with visible rust. Structurally solid.', color: '#D97706' },
  R: { label: 'Refurbished', desc: 'Repainted, resealed, and reconditioned.', color: '#6D28D9' },
  X: { label: 'Custom Build', desc: 'Modified to specification.', color: '#374151' },
}

export const GRADE_ORDER: ContainerGrade[] = ['A', 'B', 'C', 'R', 'X']

// ── Custom modifications ──────────────────────────────────
// Static marketing catalog of the modifications our fab shop
// quotes most often. The transactable custom-build catalog stays
// data-driven (custombuilds.csv via the API) — this list feeds
// the landing teaser + SEO copy only.

export interface CustomMod {
  name: string
  blurb: string
}

export const CUSTOM_MODS: CustomMod[] = [
  { name: 'Roll-up doors', blurb: 'Drive-up access on the long or short wall, framed and sealed.' },
  { name: 'Personnel doors & windows', blurb: 'Steel man-doors, sliding windows, and security bar kits.' },
  { name: 'Insulation & climate control', blurb: 'Spray-foam or panel insulation with wall-mounted HVAC.' },
  { name: 'Electrical packages', blurb: 'Breaker panel, outlets, LED lighting, and exterior hookup.' },
  { name: 'Shelving & racking', blurb: 'Bolted steel shelving sized to the corrugation pitch.' },
  { name: 'Office build-outs', blurb: 'Finished walls, flooring, and partitions for jobsite offices.' },
  { name: 'Vents & ventilation', blurb: 'Passive whirlybird or louvered vents to stop condensation.' },
  { name: 'Paint & branding', blurb: 'Full repaint in your color with logo and signage.' },
]
