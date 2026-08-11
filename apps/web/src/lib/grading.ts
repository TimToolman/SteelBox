// ============================================================
// AI condition grading — v1 model
//
// Rates a container from (a) the unit's uploaded 8-shot photo
// documentation and (b) five structured answers from the driver
// or container adjuster performing the pickup/review. Produces a
// condition grade (A/B/C) plus a 1–5 sub-score within the grade
// (stored in Container.conditionScore) so two "B" units can
// still be compared: B·5 is nearly an A, B·1 is nearly a C.
//
// The photo side is a transparent computer-vision feature model
// that runs entirely in the browser (canvas pixel statistics —
// rust-tone coverage, dark-spot coverage, panel patchiness), not
// a hosted neural network: deterministic, explainable, free to
// run, and honest about what it is. The answer side carries the
// majority of the weight because a human on the ground beats
// pixel statistics for structural questions. Structural failure
// answers cap the grade regardless of how clean the photos look.
// ============================================================

import { photoUrl, type Container, type ContainerGrade } from './api'

// ── The adjuster's five questions ──────────────────────────

export interface QuestionOption {
  label: string
  points: number          // 0–100 contribution
  capGrade?: 'C'          // structural failures cap the final grade
}

export interface Question {
  key: string
  title: string
  detail: string
  weight: number          // fraction of the answer score (sums to 1)
  options: QuestionOption[]
}

export const ADJUSTER_QUESTIONS: Question[] = [
  {
    key: 'doors',
    title: 'Doors & seals',
    detail: 'Open and close both doors. Check the lock rods and door gaskets.',
    weight: 0.2,
    options: [
      { label: 'Open, close & latch smoothly — gaskets intact', points: 100 },
      { label: 'Stiff hinges or worn gaskets', points: 60 },
      { label: "Won't latch properly / gaskets failed", points: 20, capGrade: 'C' },
    ],
  },
  {
    key: 'structure',
    title: 'Structure & panels',
    detail: 'Walk all four sides and the roof line. Look for dents, bowing, and corner-casting damage.',
    weight: 0.25,
    options: [
      { label: 'Straight and true — no dents', points: 100 },
      { label: 'Cosmetic dents or scrapes only', points: 65 },
      { label: 'Structural damage — bowed rails or corner damage', points: 15, capGrade: 'C' },
    ],
  },
  {
    key: 'floor',
    title: 'Floor & interior',
    detail: 'Walk the floor end to end. Check for soft spots, spills, and odors.',
    weight: 0.2,
    options: [
      { label: 'Dry, solid floor — clean interior', points: 100 },
      { label: 'Surface wear or stains', points: 60 },
      { label: 'Soft spots, delamination or strong odor', points: 20, capGrade: 'C' },
    ],
  },
  {
    key: 'rust',
    title: 'Rust & paint',
    detail: 'Check panel seams, the door frame, and the bottom rail.',
    weight: 0.2,
    options: [
      { label: 'Like new — no rust', points: 100 },
      { label: 'Surface rust patches', points: 55 },
      { label: 'Perforating or structural rust', points: 10, capGrade: 'C' },
    ],
  },
  {
    key: 'light',
    title: 'Light test',
    detail: 'Stand inside with the doors closed. Any daylight means a pinhole leak.',
    weight: 0.15,
    options: [
      { label: 'No light — wind & watertight', points: 100 },
      { label: 'Not performed', points: 70 },
      { label: 'Daylight visible', points: 0, capGrade: 'C' },
    ],
  },
]

// ── Photo feature extraction (canvas, in-browser) ──────────

export interface PhotoFeatures {
  slot: number
  url: string
  rustFrac: number     // fraction of visible pixels in rust hues
  darkFrac: number     // fraction of very dark pixels (dents/shadows/grime)
  patchiness: number   // std-dev of lightness — repaint patches, fade
  sampled: number      // opaque pixels sampled (0 = image unreadable)
}

const ANALYZE_W = 96
// Interior shots photograph dark floors by design — weight them less.
const SLOT_WEIGHT = [1, 1, 1, 1, 1, 0.55, 0.55, 0.35]

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, mx === 0 ? 0 : d / mx, mx / 255]
}

export async function analyzePhoto(slot: number, rawUrl: string): Promise<PhotoFeatures> {
  const url = photoUrl(rawUrl)
  const empty: PhotoFeatures = { slot, url, rustFrac: 0, darkFrac: 0, patchiness: 0, sampled: 0 }
  try {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob)
    const w = ANALYZE_W, h = Math.max(1, Math.round(bmp.height * (w / bmp.width)))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return empty
    ctx.drawImage(bmp, 0, 0, w, h)
    const px = ctx.getImageData(0, 0, w, h).data
    let n = 0, rust = 0, dark = 0, sumV = 0, sumV2 = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 40) continue // transparent — background-removed shots
      const [hh, s, v] = rgbToHsv(px[i], px[i + 1], px[i + 2])
      n++
      sumV += v; sumV2 += v * v
      if (hh >= 8 && hh <= 45 && s > 0.3 && v > 0.15 && v < 0.72) rust++
      if (v < 0.18) dark++
    }
    if (n === 0) return empty
    const meanV = sumV / n
    return {
      slot, url, sampled: n,
      rustFrac: rust / n,
      darkFrac: dark / n,
      patchiness: Math.sqrt(Math.max(0, sumV2 / n - meanV * meanV)),
    }
  } catch {
    return empty // unreadable photo — contributes nothing rather than failing the flow
  }
}

export async function analyzeContainerPhotos(
  container: Container,
  onProgress?: (done: number, total: number) => void,
): Promise<PhotoFeatures[]> {
  const shots = (container.photos || []).slice(0, 8)
    .map((u, slot) => ({ u, slot }))
    .filter(x => !!x.u)
  const out: PhotoFeatures[] = []
  for (let i = 0; i < shots.length; i++) {
    out.push(await analyzePhoto(shots[i].slot, shots[i].u!))
    onProgress?.(i + 1, shots.length)
  }
  return out
}

// ── Scoring ────────────────────────────────────────────────

export interface GradeFactor { label: string; score: number /* 0–100 */; note: string }

export interface GradeResult {
  score: number               // 0–100 combined condition score
  grade: ContainerGrade       // A / B / C (R and X are workflow states, not ratings)
  sub: number                 // 1–5 sub-score within the grade band
  photoScore: number
  answerScore: number
  capped: boolean             // a structural answer capped the grade
  factors: GradeFactor[]
}

const PHOTO_WEIGHT = 0.4     // answers carry the majority — see header
const BANDS: { grade: ContainerGrade; lo: number }[] = [
  { grade: 'A', lo: 85 },
  { grade: 'B', lo: 60 },
  { grade: 'C', lo: 0 },
]

export function scorePhotos(features: PhotoFeatures[]): { score: number; factors: GradeFactor[] } {
  const usable = features.filter(f => f.sampled > 0)
  if (usable.length === 0) {
    return { score: 70, factors: [{ label: 'Photo analysis', score: 70, note: 'No readable photos — neutral prior' }] }
  }
  const wavgOver = (set: PhotoFeatures[], pick: (f: PhotoFeatures) => number) => {
    const wsum = set.reduce((s, f) => s + (SLOT_WEIGHT[f.slot] ?? 0.5), 0)
    return wsum === 0 ? 0 : set.reduce((s, f) => s + pick(f) * (SLOT_WEIGHT[f.slot] ?? 0.5), 0) / wsum
  }
  // Interiors have near-black plywood floors by design — dark-spot and
  // patchiness signals only make sense on the exterior shots.
  const exterior = usable.filter(f => !(f.slot === 5 || f.slot === 6))
  const wavg = (pick: (f: PhotoFeatures) => number) => wavgOver(usable, pick)
  const wavgExt = (pick: (f: PhotoFeatures) => number) => wavgOver(exterior.length ? exterior : usable, pick)
  // Normalize each signal against a "fully weathered" reference level. Rust
  // tone is the strongest and most reliable signal, so it carries the most.
  const rustN = Math.min(1, wavg(f => f.rustFrac) / 0.16)
  const darkN = Math.min(1, wavgExt(f => f.darkFrac) / 0.45)
  const patchN = Math.min(1, wavgExt(f => f.patchiness) / 0.3)
  const score = Math.round(100 - (60 * rustN + 15 * darkN + 25 * patchN))
  return {
    score,
    factors: [
      { label: 'Rust coverage (photos)', score: Math.round(100 - rustN * 100), note: `${(wavg(f => f.rustFrac) * 100).toFixed(1)}% rust-tone pixels` },
      { label: 'Dents & dark spots (photos)', score: Math.round(100 - darkN * 100), note: `${(wavgExt(f => f.darkFrac) * 100).toFixed(1)}% dark-spot pixels (exterior)` },
      { label: 'Paint uniformity (photos)', score: Math.round(100 - patchN * 100), note: 'Panel-to-panel color variance' },
    ],
  }
}

// answers: option index per question, keyed by Question.key
export function gradeContainer(features: PhotoFeatures[], answers: Record<string, number>): GradeResult {
  const photo = scorePhotos(features)
  let answerScore = 0
  let capped = false
  const factors: GradeFactor[] = []
  for (const q of ADJUSTER_QUESTIONS) {
    const opt = q.options[answers[q.key]] ?? q.options[1]
    answerScore += opt.points * q.weight
    if (opt.capGrade) capped = true
    factors.push({ label: q.title, score: opt.points, note: opt.label })
  }
  answerScore = Math.round(answerScore)
  let score = Math.round(PHOTO_WEIGHT * photo.score + (1 - PHOTO_WEIGHT) * answerScore)

  let grade = BANDS.find(b => score >= b.lo)!.grade
  if (capped && grade !== 'C') { grade = 'C'; score = Math.min(score, 59) }

  // 1–5 sub-score: where the unit sits inside its grade band.
  const band = BANDS.find(b => b.grade === grade)!
  const hi = grade === 'A' ? 100 : (BANDS[BANDS.findIndex(b => b.grade === grade) - 1].lo - 1)
  const sub = Math.max(1, Math.min(5, 1 + Math.floor(5 * (score - band.lo) / (hi - band.lo + 1))))

  return { score, grade, sub, photoScore: photo.score, answerScore, capped, factors: [...photo.factors, ...factors] }
}

// Display helper: "B·4" — grade plus sub-score wherever both exist.
export function gradeLabel(grade: string, sub?: number | null): string {
  return sub && sub > 0 ? `${grade}·${sub}` : grade
}
