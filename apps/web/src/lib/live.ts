// ============================================================
// Live updates — one SSE connection per tab to the API's
// /events stream. The server broadcasts {table, rev} whenever
// a CSV table is written; subscribers re-fetch just the tables
// they care about, so admin ⇄ field ⇄ marketplace stay in sync
// without manual refreshes.
// ============================================================

// `||` (not ??) so an empty build-time var still falls back to localhost.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export type LiveTable =
  | 'containers' | 'orders' | 'drivers' | 'activity' | 'depots' | 'schedule'
  | 'availability' | 'customers' | 'messages' | 'users' | 'outbox' | 'custombuilds'

type Listener = { tables: readonly LiveTable[]; cb: (table: LiveTable) => void }

const listeners = new Set<Listener>()
// Last revision we've seen per table — lets a reconnect re-fetch only what
// actually changed while the tab was asleep/offline.
const seenRevs: Record<string, number> = {}
const pending = new Map<string, number>() // table → debounce timer
let source: EventSource | null = null
let hadSnapshot = false

function notify(table: LiveTable) {
  // Writes land in bursts (an order touches orders + containers + outbox) —
  // debounce per table so one save triggers one re-fetch, not several.
  clearTimeout(pending.get(table))
  pending.set(table, window.setTimeout(() => {
    pending.delete(table)
    for (const l of listeners) if (l.tables.includes(table)) l.cb(table)
  }, 250))
}

function connect() {
  if (source) return
  source = new EventSource(`${BASE}/events`)

  source.addEventListener('change', (e) => {
    try {
      const { table, rev } = JSON.parse((e as MessageEvent).data)
      seenRevs[table] = rev
      notify(table)
    } catch { /* malformed frame — ignore */ }
  })

  // Sent once per (re)connect. EventSource auto-reconnects after drops
  // (mobile backgrounding, redeploys), so diff the snapshot against what we
  // last saw and re-sync only the tables that moved while we were away.
  source.addEventListener('snapshot', (e) => {
    let revs: Record<string, number>
    try { revs = JSON.parse((e as MessageEvent).data) } catch { return }
    if (hadSnapshot) {
      const tables = new Set([...Object.keys(revs), ...Object.keys(seenRevs)])
      for (const t of tables) {
        if (revs[t] !== seenRevs[t]) notify(t as LiveTable)
      }
    }
    hadSnapshot = true
    for (const k of Object.keys(seenRevs)) delete seenRevs[k]
    Object.assign(seenRevs, revs)
  })
  // No error handler needed: EventSource retries on its own, and the snapshot
  // diff above covers anything missed during the outage.
}

// Subscribe to change pushes for a set of tables. Returns an unsubscribe
// function. The shared connection opens lazily on first subscribe and stays
// up for the life of the tab (a single idle SSE socket is negligible).
export function subscribeLive(tables: readonly LiveTable[], cb: (table: LiveTable) => void): () => void {
  const listener: Listener = { tables, cb }
  listeners.add(listener)
  connect()
  return () => { listeners.delete(listener) }
}
