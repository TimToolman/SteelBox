// ============================================================
// Reseller territories & cross-territory relay quotes
//
// A territory is a set of 3-digit ZIP prefixes ("700-705,770-778"),
// configured per seller in the admin portal. The marketplace uses it to
// answer "whose turf is this delivery ZIP?"; when the answer differs
// from the unit's seller, the delivery relays through a SteelBox Co.
// meet point and the buyer pays a mileage-based relay fee, split
// linehaul / last-mile / platform.
// ============================================================

import { zipLatLng, milesBetween } from './geo'
import { RELAY_RATE_PER_MILE, RELAY_MIN_FEE, RELAY_PLATFORM_CUT } from './specs'
import type { Seller, MeetPoint } from './api'

// "700-705, 770,772-778" → list of [lo, hi] prefix ranges
export function parseZones(zones: string | undefined | null): [number, number][] {
  return String(zones || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const m = /^(\d{3})(?:\s*-\s*(\d{3}))?$/.exec(part)
      if (!m) return null
      const lo = Number(m[1]), hi = Number(m[2] ?? m[1])
      return lo <= hi ? [lo, hi] as [number, number] : [hi, lo] as [number, number]
    })
    .filter((x): x is [number, number] => x !== null)
}

export function zipInZones(zip: string, zones: string | undefined | null): boolean {
  const p = Number(String(zip).slice(0, 3))
  if (Number.isNaN(p)) return false
  return parseZones(zones).some(([lo, hi]) => p >= lo && p <= hi)
}

// Which reseller owns this delivery ZIP? First active seller whose zones
// match; null = unclaimed territory (the selling reseller delivers direct).
export function sellerForZip(zip: string, sellers: Seller[]): Seller | null {
  return sellers.find(s => s.active !== false && zipInZones(zip, s.territoryZips)) ?? null
}

// Prefixes claimed by 2+ sellers — surfaced in the admin editor.
export function zoneOverlaps(sellers: Seller[]): { prefix: string; names: string[] }[] {
  const out: { prefix: string; names: string[] }[] = []
  for (let p = 0; p < 1000; p++) {
    const zip = String(p).padStart(3, '0') + '00'
    const names = sellers.filter(s => s.active !== false && zipInZones(zip, s.territoryZips)).map(s => s.name)
    if (names.length > 1) out.push({ prefix: String(p).padStart(3, '0'), names })
  }
  return out
}

export interface RelayQuote {
  meetPoint: MeetPoint
  linehaulMiles: number      // origin depot → meet point (selling reseller)
  lastMiles: number          // meet point → customer (receiving reseller)
  fee: number                // what the buyer pays at checkout
  linehaulShare: number      // to the selling reseller
  lastMileShare: number      // to the receiving reseller
  platformShare: number      // SteelBox Co. (brokering + meet point)
}

// Pick the meet point that minimizes total relay miles and price the trip.
// null when either end can't be geocoded or no meet point exists.
export function relayQuote(originZip: string, destZip: string, meetPoints: MeetPoint[]): RelayQuote | null {
  const a = zipLatLng(originZip), b = zipLatLng(destZip)
  if (!a || !b) return null
  let best: { mp: MeetPoint; leg1: number; leg2: number } | null = null
  for (const mp of meetPoints) {
    if (mp.active === false) continue
    const m = zipLatLng(mp.zip)
    if (!m) continue
    const leg1 = milesBetween(a, m), leg2 = milesBetween(m, b)
    if (!best || leg1 + leg2 < best.leg1 + best.leg2) best = { mp, leg1, leg2 }
  }
  if (!best) return null
  const linehaulMiles = Math.round(best.leg1)
  const lastMiles = Math.round(best.leg2)
  const raw = Math.max(RELAY_MIN_FEE, (linehaulMiles + lastMiles) * RELAY_RATE_PER_MILE)
  const fee = Math.round(raw / 5) * 5
  const platformShare = Math.round(fee * RELAY_PLATFORM_CUT)
  const pool = fee - platformShare
  const linehaulShare = Math.round(pool * (linehaulMiles / Math.max(1, linehaulMiles + lastMiles)))
  return {
    meetPoint: best.mp, linehaulMiles, lastMiles, fee,
    linehaulShare, lastMileShare: pool - linehaulShare, platformShare,
  }
}
