// Build an accurate hub-network map from real Census geometry.
//
// The prototype drew the US from a ~50-point hand-typed outline, which is why
// it read as a blob. This decodes us-atlas nation-10m (TopoJSON of the Census
// cartographic boundary), keeps the contiguous 48, projects with the same
// Albers conic the country is normally drawn in, and simplifies to the handful
// of points that survive at 460px wide.
import { readFileSync, writeFileSync } from 'node:fs'

const topo = JSON.parse(readFileSync('node_modules/us-atlas/nation-10m.json', 'utf8'))

// ── TopoJSON decode: arcs are quantized + delta-encoded ──
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0
  return arc.map(([dx, dy]) => {
    x += dx; y += dy
    return [x * sx + tx, y * sy + ty]
  })
})
const arcOf = i => (i < 0 ? arcs[~i].slice().reverse() : arcs[i])
const ringOf = idxs => idxs.flatMap((i, n) => (n ? arcOf(i).slice(1) : arcOf(i)))

const geom = topo.objects.nation.geometries[0]
// TopoJSON geometries carry arc indices, not coordinates.
const polys = geom.type === 'MultiPolygon' ? geom.arcs : [geom.arcs]
const rings = polys.map(p => p.map(ringOf))

// ── Contiguous 48 only: the design shows no Alaska/Hawaii insets ──
const inLower48 = ring => {
  const lons = ring.map(p => p[0]), lats = ring.map(p => p[1])
  const cx = (Math.min(...lons) + Math.max(...lons)) / 2
  const cy = (Math.min(...lats) + Math.max(...lats)) / 2
  return cx > -128 && cx < -65 && cy > 23 && cy < 50
}
const kept = rings.filter(r => inLower48(r[0]))

// ── Albers equal-area conic, the standard US parameters ──
const rad = Math.PI / 180
const phi0 = 37.5 * rad, lam0 = -96 * rad
const phi1 = 29.5 * rad, phi2 = 45.5 * rad
const n = (Math.sin(phi1) + Math.sin(phi2)) / 2
const C = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1)
const rho0 = Math.sqrt(C - 2 * n * Math.sin(phi0)) / n
function albers(lon, lat) {
  const theta = n * (lon * rad - lam0)
  const rho = Math.sqrt(C - 2 * n * Math.sin(lat * rad)) / n
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)]
}

// ── Fit to the card, then simplify ──
const W = 460, H = 268, PAD = 16
const projected = kept.map(poly => poly.map(ring => ring.map(([lon, lat]) => albers(lon, lat))))
const all = projected.flat(2)
const xs = all.map(p => p[0]), ys = all.map(p => p[1])
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
const k = Math.min((W - PAD * 2) / (x1 - x0), (H - PAD * 2) / (y1 - y0))
const ox = (W - (x1 - x0) * k) / 2
const oy = (H - (y1 - y0) * k) / 2
// Albers y grows northward; SVG y grows downward. Flip it or the country
// renders upside down.
const fit = ([x, y]) => [(x - x0) * k + ox, (y1 - y) * k + oy]
const project = (lat, lon) => fit(albers(lon, lat))

// Perpendicular-distance simplification — at this size anything finer than
// half a pixel is bytes nobody can see.
function simplify(points, tol) {
  if (points.length < 3) return points
  const keep = new Array(points.length).fill(false)
  const last = points.length - 1
  keep[0] = keep[last] = true
  // A closed ring starts and ends on the same point, so seeding the stack with
  // [0, last] gives a zero-length baseline and every distance computes as 0 —
  // which silently threw away the whole country. Split it at the midpoint.
  const mid = Math.floor(last / 2)
  keep[mid] = true
  const stack = [[0, mid], [mid, last]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let worst = 0, idx = -1
    const [ax, ay] = points[a], [bx, by] = points[b]
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (d > worst) { worst = d; idx = i }
    }
    if (worst > tol && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]) }
  }
  return points.filter((_, i) => keep[i])
}

const TOL = 0.45
const num = v => Math.round(v * 10) / 10
let d = ''
let ringCount = 0
for (const poly of projected) {
  for (const ring of poly) {
    const pts = simplify(ring.map(fit), TOL)
    // Islands smaller than a few px of perimeter are noise at this scale.
    if (pts.length < 4) continue
    const bx = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]))
    const by = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]))
    if (Math.max(bx, by) < 3) continue
    d += 'M' + pts.map(p => `${num(p[0])},${num(p[1])}`).join('L') + 'Z'
    ringCount++
  }
}

// ── Hubs ──
const HUBS = [
  ['Houston', 29.76, -95.37], ['New Orleans', 29.95, -90.07], ['Mobile', 30.69, -88.04],
  ['Tampa', 27.95, -82.46], ['Miami', 25.76, -80.19], ['Jacksonville', 30.33, -81.66],
  ['Savannah', 32.08, -81.09], ['Charleston', 32.78, -79.93], ['Wilmington', 34.23, -77.94],
  ['Atlanta', 33.75, -84.39], ['Jackson', 32.30, -90.18],
]
// The staging hub sits mid-country rather than in the Gulf: at 31°N it landed
// on top of the Jackson and New Orleans dots and buried its own label.
const [cx, cy] = project(37.0, -94.5)

// Eleven hubs, six of them inside 30px of each other on the South Atlantic
// coast: a generic placement rule can't keep those labels apart, so they're
// positioned by hand. dx/dy are offsets from the dot, in viewBox units.
const LABELS = {
  Houston:      [-8,  5, 'end'],
  'New Orleans': [0, 15, 'middle'],
  Jackson:      [-8,  2, 'end'],
  Mobile:        [8,  7, 'start'],
  Atlanta:      [-8,  0, 'end'],
  Jacksonville:  [8,  3, 'start'],
  Savannah:      [8,  3, 'start'],
  Charleston:    [8,  0, 'start'],
  Wilmington:    [8,  1, 'start'],
  Tampa:         [8,  4, 'start'],
  Miami:         [8,  3, 'start'],
}

let spokes = '', nodes = ''
for (const [name, lat, lon] of HUBS) {
  const [hx, hy] = project(lat, lon)
  const [dx, dy, anchor] = LABELS[name]
  spokes += `<line x1="${num(cx)}" y1="${num(cy)}" x2="${num(hx)}" y2="${num(hy)}"/>`
  nodes += `<g><circle cx="${num(hx)}" cy="${num(hy)}" r="6" class="halo"/>`
    + `<circle cx="${num(hx)}" cy="${num(hy)}" r="3.4" class="dot"/>`
    + `<text x="${num(hx + dx)}" y="${num(hy + dy)}" text-anchor="${anchor}">${name.toUpperCase()}</text></g>`
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img"
  aria-label="Transfer hub network: a central hub linked to Houston, New Orleans, Jackson, Mobile, Atlanta, Tampa, Miami, Jacksonville, Savannah, Charleston and Wilmington.">
  <defs>
    <linearGradient id="land" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#60a5fa" stop-opacity=".52"/>
      <stop offset="1" stop-color="#2563eb" stop-opacity=".42"/>
    </linearGradient>
    <filter id="lift" x="-8%" y="-8%" width="116%" height="120%">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity=".3"/>
    </filter>
  </defs>
  <style>
    .spokes line { stroke: rgba(255,255,255,.42); stroke-width: 1.1; stroke-dasharray: 5 4; stroke-linecap: round; }
    .halo { fill: rgba(16,185,129,.28); }
    .dot { fill: #10b981; stroke: #fff; stroke-width: 1.2; }
    text { font: 700 7.8px 'DM Sans', system-ui, sans-serif; fill: rgba(255,255,255,.92); letter-spacing: .02em; }
    .hub-label { font-size: 8px; letter-spacing: .1em; fill: #fff; }
  </style>
  <g filter="url(#lift)">
    <path d="${d}" fill="url(#land)" stroke="rgba(191,219,254,.5)" stroke-width="1" stroke-linejoin="round"/>
  </g>
  <g class="spokes">${spokes}</g>
  <g transform="translate(${num(cx - 24)},${num(cy - 21)})">
    <rect x="3" y="11" width="42" height="24" rx="2" fill="#ea580c" stroke="#c2410c" stroke-width="1"/>
    <rect x="3" y="7" width="42" height="7" rx="1.5" fill="#f97316"/>
    <line x1="13" y1="11" x2="13" y2="35" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
    <line x1="24" y1="11" x2="24" y2="35" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
    <line x1="35" y1="11" x2="35" y2="35" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
    <rect x="0" y="13" width="5" height="16" rx="1" fill="#c2410c"/>
    <rect x="43" y="13" width="5" height="16" rx="1" fill="#9a3412"/>
  </g>
  <text class="hub-label" x="${num(cx)}" y="${num(cy - 28)}" text-anchor="middle">CENTRAL HUB</text>
  ${nodes}
</svg>
`

writeFileSync('hub-network-map.svg', svg)
console.log(`rings kept: ${ringCount}, path chars: ${d.length}, svg bytes: ${svg.length}`)
console.log(`central hub at ${num(cx)},${num(cy)}`)
