// ============================================================
// Geo-fencing — resolves a customer ZIP against each depot's
// service circle (yard location + admin-set radius in miles).
//
// Coordinates come from a bundled 3-digit ZIP-prefix centroid
// table (US Census ZCTA gazetteer, averaged per prefix — ~20KB,
// city-level precision, which is plenty for 100–300 mile fences).
// ============================================================

import centroids from './zip3-centroids.json'
import type { Depot } from './api'

const ZIP3 = centroids as unknown as Record<string, [number, number]>

export function zipLatLng(zip: string): [number, number] | null {
  if (!/^\d{5}$/.test(zip)) return null
  return ZIP3[zip.slice(0, 3)] ?? null
}

// Great-circle distance in miles.
export function milesBetween(a: [number, number], b: [number, number]): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface DepotInRange {
  depot: Depot
  miles: number
}

// Every depot whose service circle covers the customer's ZIP, nearest first.
// Returns null when the ZIP can't be geocoded (bad/unknown prefix).
export function depotsServingZip(zip: string, depots: Depot[]): DepotInRange[] | null {
  const here = zipLatLng(zip)
  if (!here) return null
  return depots
    .map(depot => {
      const yard = zipLatLng(depot.zip || '')
      if (!yard) return null
      const miles = milesBetween(here, yard)
      return miles <= (depot.serviceRadiusMiles || 150) ? { depot, miles: Math.round(miles) } : null
    })
    .filter((x): x is DepotInRange => x !== null)
    .sort((a, b) => a.miles - b.miles)
}
