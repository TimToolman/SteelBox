// ============================================================
// Lead attribution — UTM capture & persistence
//
// Captured once per landing (first touch kept, last touch
// refreshed) and attached to every lead/quote payload so
// lead_events can tie revenue back to the campaign. SSR-safe:
// every entry point no-ops without a window.
// ============================================================

const KEY = 'mvp_attribution'
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export interface Attribution {
  firstTouch: Record<string, string>   // first UTM set ever seen + landing page + timestamp
  lastTouch: Record<string, string>    // most recent UTM set
  referrer: string
  landingPath: string
}

// Call once on app load — records UTMs from the current URL.
export function captureAttribution(): void {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    const utm: Record<string, string> = {}
    UTM_PARAMS.forEach(k => { const v = params.get(k); if (v) utm[k] = v })
    utm.gclid = params.get('gclid') ?? ''
    if (!utm.gclid) delete utm.gclid

    const stored = readAttribution()
    const now = new Date().toISOString()
    const touch = { ...utm, at: now, path: window.location.pathname }

    const next: Attribution = {
      firstTouch: stored?.firstTouch && Object.keys(stored.firstTouch).length ? stored.firstTouch
        : (Object.keys(utm).length ? touch : {}),
      lastTouch: Object.keys(utm).length ? touch : (stored?.lastTouch ?? {}),
      referrer: stored?.referrer || document.referrer || '',
      landingPath: stored?.landingPath || window.location.pathname,
    }
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* storage unavailable (private mode) — attribution is best-effort */ }
}

export function readAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) as Attribution : null
  } catch { return null }
}

// Flat fields ready to spread into a lead/quote payload.
export function attributionFields(source: string): Record<string, string> {
  const a = readAttribution()
  const last = a?.lastTouch ?? {}
  return {
    source,
    utm_source: last.utm_source ?? '',
    utm_medium: last.utm_medium ?? '',
    utm_campaign: last.utm_campaign ?? '',
    utm_term: last.utm_term ?? '',
    utm_content: last.utm_content ?? '',
    gclid: last.gclid ?? '',
    referrer: a?.referrer ?? '',
    landingPath: a?.landingPath ?? '',
  }
}
