// ============================================================
// Coverage & logistics map — the resellers' US footprint
//
// Every dot is one 3-digit ZIP prefix at its Census-centroid
// location, colored by the reseller whose territory claims it —
// so the map IS the territory table, drawn geographically.
// Seller pickup depots render as squares in the owner's brand
// color; SteelBox Co. transfer stations (sub-depots, where
// cross-territory relays hand off) render as orange diamonds.
//
// Two fits: "Corridor" hugs everything claimed or built (the
// Gulf/Southeast pilot region), "Full US" shows the lower 48
// for context while territories are still sparse.
// ============================================================

import { useMemo, useState } from 'react'
import centroidsJson from '../../lib/zip3-centroids.json'
import { parseZones } from '../../lib/territory'
import type { Seller, Depot, MeetPoint } from '../../lib/api'

const CENTROIDS = centroidsJson as unknown as Record<string, [number, number]>
const UNCLAIMED = '#D7DCE4'
const OVERLAP_RING = '#B3261E'
const STATION = '#E65100' // SteelBox Co. platform orange

interface CoverageMapProps {
  sellers: Seller[]
  // Unsaved zone edits (keyed by seller id) preview live on the map.
  zoneDrafts?: Record<string, string>
  depots: Depot[]
  meetPoints: MeetPoint[]
}

export function CoverageMap({ sellers, zoneDrafts = {}, depots, meetPoints }: CoverageMapProps) {
  const [fit, setFit] = useState<'region' | 'us'>('region')

  const active = sellers.filter(s => s.active !== false)
  const zonesOf = (s: Seller) => parseZones(zoneDrafts[s.id] ?? s.territoryZips)

  // prefix → owning sellers (first match is the marketplace winner)
  const owners = useMemo(() => {
    const map = new Map<string, Seller[]>()
    for (const prefix of Object.keys(CENTROIDS)) {
      const p = Number(prefix)
      const own = active.filter(s => zonesOf(s).some(([lo, hi]) => p >= lo && p <= hi))
      if (own.length) map.set(prefix, own)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellers, zoneDrafts])

  const stations = meetPoints.filter(m => m.active !== false)
  const markerLL = (zip?: string) => (zip && CENTROIDS[zip.slice(0, 3)]) || null

  // ── Fit the viewport ──
  // Region = claimed prefixes + every marker, padded; US = the lower 48.
  const bounds = useMemo(() => {
    if (fit === 'us') return { minLat: 24, maxLat: 49.5, minLng: -124.8, maxLng: -66.9 }
    const pts: [number, number][] = []
    owners.forEach((_, prefix) => { const ll = CENTROIDS[prefix]; if (ll) pts.push(ll) })
    for (const d of depots) { const ll = markerLL(d.zip); if (ll) pts.push(ll) }
    for (const m of stations) { const ll = markerLL(m.zip); if (ll) pts.push(ll) }
    if (pts.length === 0) return { minLat: 24, maxLat: 49.5, minLng: -124.8, maxLng: -66.9 }
    const lats = pts.map(p => p[0]), lngs = pts.map(p => p[1])
    return {
      minLat: Math.min(...lats) - 1.2, maxLat: Math.max(...lats) + 1.2,
      minLng: Math.min(...lngs) - 1.5, maxLng: Math.max(...lngs) + 1.5,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, owners, depots, meetPoints])

  // Equirectangular with the x-axis compressed by cos(mid-latitude) — plenty
  // accurate at this scale and keeps distances honest enough to read.
  const W = 920
  const midLat = (bounds.minLat + bounds.maxLat) / 2
  const xScale = Math.cos((midLat * Math.PI) / 180)
  const spanX = (bounds.maxLng - bounds.minLng) * xScale
  const spanY = bounds.maxLat - bounds.minLat
  const H = Math.round((W * spanY) / spanX)
  const px = (lng: number) => ((lng - bounds.minLng) * xScale / spanX) * W
  const py = (lat: number) => ((bounds.maxLat - lat) / spanY) * H
  const inView = ([lat, lng]: [number, number]) =>
    lat >= bounds.minLat - 0.3 && lat <= bounds.maxLat + 0.3 && lng >= bounds.minLng - 0.4 && lng <= bounds.maxLng + 0.4

  const dotR = fit === 'us' ? 2.4 : 4.6
  const label = (name: string) => name.replace(/ Relay Yard$/i, '')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)', flex: 1 }}>
          Coverage &amp; logistics map — one dot per 3-digit ZIP prefix
        </div>
        {(['region', 'us'] as const).map(m => (
          <button key={m} onClick={() => setFit(m)} style={{
            padding: '5px 12px', borderRadius: 'var(--pill)', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${fit === m ? 'var(--primary)' : 'var(--div)'}`,
            background: fit === m ? 'var(--primary-cont)' : 'var(--surf-w)',
            color: fit === m ? 'var(--primary)' : 'var(--ink2)',
          }}>{m === 'region' ? 'Corridor' : 'Full US'}</button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '560px', display: 'block', background: 'var(--surf1)', borderRadius: 'var(--r12)', border: '1px solid var(--div)' }}>
          {/* ZIP-prefix dots — the geography emerges from the centroids */}
          {Object.entries(CENTROIDS).map(([prefix, ll]) => {
            if (!inView(ll)) return null
            const own = owners.get(prefix)
            const fill = own?.[0]?.brandPrimary || UNCLAIMED
            return (
              <circle key={prefix} cx={px(ll[1])} cy={py(ll[0])} r={own ? dotR : dotR * 0.62}
                fill={own ? fill : UNCLAIMED} opacity={own ? 0.92 : 0.55}
                stroke={own && own.length > 1 ? OVERLAP_RING : 'none'} strokeWidth={1.6}>
                <title>{`ZIP ${prefix}xx · ${own ? own.map(o => o.name).join(' + ') : 'unclaimed'}`}</title>
              </circle>
            )
          })}

          {/* Seller pickup depots — squares in the owner's brand color */}
          {depots.map((d, i) => {
            const ll = markerLL(d.zip)
            if (!ll || !inView(ll)) return null
            const seller = sellers.find(s => s.id === (d.sellerId || 'sel_mvp'))
            const x = px(ll[1]), y = py(ll[0])
            const s = fit === 'us' ? 8 : 13
            return (
              <g key={d.id}>
                <rect x={x - s / 2} y={y - s / 2} width={s} height={s} rx={2.5}
                  fill={seller?.brandPrimary || 'var(--primary)'} stroke="#fff" strokeWidth={1.6} />
                {fit === 'region' && (
                  <text x={x} y={i % 2 === 0 ? y - 11 : y + 22} textAnchor="middle"
                    style={{ fontSize: '11px', fontWeight: 700, fill: 'var(--ink2)', fontFamily: 'var(--mono)' }}>
                    {d.code || d.name}
                  </text>
                )}
                <title>{`${d.name} — ${seller?.name || 'MVP Container'} pickup depot (${d.zip})`}</title>
              </g>
            )
          })}

          {/* SteelBox Co. transfer stations — diamonds where relays hand off */}
          {stations.map(m => {
            const ll = markerLL(m.zip)
            if (!ll || !inView(ll)) return null
            const x = px(ll[1]), y = py(ll[0])
            const s = fit === 'us' ? 9 : 15
            return (
              <g key={m.id}>
                <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={2}
                  transform={`translate(${x} ${y}) rotate(45)`}
                  fill={STATION} stroke="#fff" strokeWidth={1.8} />
                {fit === 'region' && (
                  <text x={x} y={y + 26} textAnchor="middle"
                    style={{ fontSize: '11px', fontWeight: 700, fill: STATION }}>
                    {label(m.name)}
                  </text>
                )}
                <title>{`${m.name} — SteelBox Co. transfer station (${m.zip})`}</title>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend — identity by reseller brand color; shapes carry the network */}
      <div style={{ display: 'flex', gap: '14px', marginTop: '9px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--ink2)', alignItems: 'center' }}>
        {active.map(s => (
          <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.brandPrimary || 'var(--primary)' }} />{s.name}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: UNCLAIMED }} />Unclaimed
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--ink3)' }} />Pickup depot
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: STATION, transform: 'rotate(45deg)' }} />Transfer station (SteelBox Co.)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: `2px solid ${OVERLAP_RING}` }} />Overlap
        </span>
      </div>
    </div>
  )
}
