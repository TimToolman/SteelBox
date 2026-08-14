// ============================================================
// Static demo mode (VITE_DEMO_STATIC=1)
//
// Serves the whole site — marketplace, admin portal, AND field
// app — with NO backend. Reads come from demo-data.json (a full
// snapshot of the dev API; regenerate with the script in this
// file's git commit message), writes mutate an in-memory copy
// that lives until the page reloads, and sign-in looks the email
// up in the snapshot's users table so the seeded admin and
// driver accounts land in their real portals (any password is
// accepted — there is no server to check it against). Unknown
// emails sign in as a demo customer. api.ts routes every request
// here when the flag is set at build time — used for the GitHub
// Pages deployment while no API is hosted. Nothing persists.
// ============================================================

import demoData from './demo-data.json'
import type { AuthUser, Container, Order } from './api'

type Row = Record<string, unknown> & { id: string }

const snapshot = demoData as unknown as Record<string, Row[]>

// In-memory database, keyed by REST route segment. Deep-copied from the
// snapshot so demo writes never bleed into the imported module data.
const db: Record<string, Row[]> = Object.fromEntries([
  ['containers', snapshot.containers],
  ['depots', snapshot.depots],
  ['custombuilds', (demoData as { customBuilds: Row[] }).customBuilds],
  ['sellers', snapshot.sellers],
  ['drivers', snapshot.drivers],
  ['customers', snapshot.customers],
  ['orders', snapshot.orders],
  ['schedule', snapshot.schedule],
  ['activity', snapshot.activity],
  ['availability', snapshot.availability],
  ['messages', snapshot.messages],
  ['users', snapshot.users],
  ['outbox', snapshot.outbox],
  ['suppliers', snapshot.suppliers],
  ['shippers', snapshot.shippers],
  ['repairshops', snapshot.repairshops],
  ['claims', snapshot.claims],
  ['meetpoints', snapshot.meetpoints],
].map(([k, v]) => [k as string, JSON.parse(JSON.stringify(v ?? []))]))

const uid = (p: string) => `${p}_demo_${Math.random().toString(36).slice(2, 10)}`

const DEMO_TOKEN = 'demo-token'
const DEMO_USER_KEY = 'sbx_demo_user'

function demoUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'usr_demo', email: 'demo@mvpcontainers.com', role: 'customer',
    name: 'Demo Customer', phone: '', driverId: '', customerId: '',
    phoneVerified: true, active: true, createdAt: new Date().toISOString(),
    twoFaVerified: true, mustChangePassword: false,
    ...overrides,
  } as AuthUser
}

// The snapshot's users table decides who's who: the seeded admin email gets
// the admin portal, driver emails get the field app, everyone else shops.
// Unknown emails do NOT get a session — new visitors go through Create an
// account (profile + code), mirroring the API server. Returns null when the
// email matches no seeded or session-created account.
function accountFor(email: string): Partial<AuthUser> | null {
  let norm = String(email || '').trim().toLowerCase()
  // Demo-only extra account: the container adjuster role — lands in the
  // field app with access to the AI condition-grading flow.
  if (norm === 'adjuster@mvpcontainer.com') return { email: norm, role: 'adjuster', name: 'Container Adjuster' }
  // The walk-up demo shopper from the tester guide.
  if (norm === 'demo@mvpcontainers.com') return { email: norm, role: 'customer', name: 'Demo Customer' }
  // Forgive the near-miss for the seeded supplier (.co → .com rename).
  if (norm === 'supplier@oceanbox.co') norm = 'supplier@oceanbox.com'
  const acct = db.users.find(u => String(u.email || '').toLowerCase() === norm && u.active !== false)
  return acct ? (acct as unknown as Partial<AuthUser>) : null
}

// Sign-ups awaiting their verification code (demo code: 123456). The account
// only lands in db.users once the code is entered.
const pendingSignups = new Map<string, Row>()

function signIn(overrides: Partial<AuthUser>): { token: string; user: AuthUser } {
  const user = demoUser(overrides)
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user))
  return { token: DEMO_TOKEN, user }
}

function storedUser(): AuthUser | null {
  const stored = localStorage.getItem(DEMO_USER_KEY)
  if (!stored || localStorage.getItem('sbx_token') !== DEMO_TOKEN) return null
  try { return JSON.parse(stored) as AuthUser } catch { return null }
}

// Mirrors request<T>'s contract: resolve with the parsed payload or throw
// an Error whose message is shown to the user.
export async function demoRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const body: Record<string, unknown> = typeof options.body === 'string' ? JSON.parse(options.body) : {}
  const route = path.split('?')[0]
  const ok = (v: unknown) => v as T

  // ── Marketplace specials ──
  if (method === 'GET' && route === '/delivery/estimate') return ok({ days: 4 })
  if (method === 'POST' && /^\/containers\/[^/]+\/reserve$/.test(route)) {
    return ok({ lockExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString() })
  }
  if (method === 'POST' && route === '/quotes') return ok({ id: uid('quote') })
  if (method === 'POST' && /^\/custombuilds\/[^/]+\/order$/.test(route)) {
    const order = { id: uid('ord'), orderNumber: `SO-D${Math.floor(Math.random() * 9000 + 1000)}`, status: 'estimate_requested', createdAt: new Date().toISOString(), ...body } as Row
    db.orders.push(order)
    return ok({ order, container: db.containers[0] })
  }

  // ── Order pipeline actions (admin / field) ──
  const action = route.match(/^\/orders\/([^/]+)\/(custom-stage|review-step|assign-driver|delivered)$/)
  if (method === 'POST' && action) {
    const order = db.orders.find(o => o.id === action[1]) as (Row & Partial<Order>) | undefined
    if (!order) throw new Error('Order not found')
    const now = new Date().toISOString()
    if (action[2] === 'review-step') {
      const step = body.step
      if (step === 'validated') order.validatedAt = now
      if (step === 'called') order.calledAt = now
      if (step === 'paid') { order.paidAt = now; order.status = 'confirmed' }
      if (step === 'reject') {
        order.status = 'cancelled'
        const c = db.containers.find(x => x.id === order.containerId)
        if (c) c.status = 'available'
      }
    }
    if (action[2] === 'custom-stage') {
      order.status = body.stage as Order['status']
      if (body.amount != null) order.amount = Number(body.amount)
    }
    if (action[2] === 'assign-driver') {
      const d = db.drivers.find(x => x.id === body.driverId)
      order.driverId = String(body.driverId || '')
      order.driverName = d ? String(d.name) : ''
      order.scheduledDate = String(body.scheduledDate || '')
      order.status = 'assigned'
      // Cross-territory relay: both legs land on the (session) schedule —
      // leg 1 transfer to the meet point, leg 2 delivery by the receiving
      // reseller's driver.
      const ro = order as Row & { crossTerritory?: boolean; meetPointName?: string; sellerToId?: string; containerSku?: string; customerName?: string; deliveryAddress?: string; relayLinehaulMiles?: number; relayLastMiles?: number }
      if (ro.crossTerritory && ro.meetPointName) {
        const leg2 = db.drivers.find(x => x.active !== false && (x.sellerId || 'sel_mvp') === ro.sellerToId) ?? d
        db.schedule.push({ id: uid('sch'), dayOffset: 1, startMin: 540, driverId: d?.id || '', type: 'transfer', sku: ro.containerSku, customer: `Relay leg 1`, origin: 'Origin depot', originAddress: '', destination: `Meet point — ${ro.meetPointName}`, destinationAddress: '', miles: ro.relayLinehaulMiles || 0, contact: 'SteelBox Co. dispatch' } as Row)
        db.schedule.push({ id: uid('sch'), dayOffset: 1, startMin: 810, driverId: leg2?.id || '', type: 'delivery', sku: ro.containerSku, customer: ro.customerName || 'Customer', origin: `Meet point — ${ro.meetPointName}`, originAddress: '', destination: 'Customer', destinationAddress: ro.deliveryAddress || '', miles: ro.relayLastMiles || 0, contact: '' } as Row)
      }
    }
    if (action[2] === 'delivered') { order.status = 'delivered'; order.completedAt = now }
    return ok(order)
  }

  // Container photo upload / retake / delete — session-side. Uploads keep the
  // captured image as a data: URL in the slot (photoUrl passes data: URLs
  // through), deletes clear the slot; a reload returns to the shipped set.
  const photoRoute = route.match(/^\/containers\/([^/]+)\/photos(\/\d+)?$/)
  if (photoRoute && (method === 'POST' || method === 'DELETE')) {
    const c = db.containers.find(x => x.id === photoRoute[1])
    if (!c) throw new Error('Container not found')
    const photos = [...((c.photos as string[] | undefined) ?? [])]
    if (method === 'POST') {
      const slot = Number((body as { slot?: number }).slot ?? 0)
      photos[slot] = String((body as { dataUrl?: string }).dataUrl || '')
    } else {
      photos[Number(photoRoute[2]!.slice(1))] = ''
    }
    c.photos = photos
    return ok(c)
  }

  // ── Auth — roles come from the snapshot users table ──
  if (method === 'POST' && route === '/auth/login') {
    const acct = accountFor(String(body.email || ''))
    // New visitors must leave a profile + verify a code first — no silent
    // walk-in sessions for unknown emails (mirrors the API server).
    if (!acct) throw new Error(`No account found for ${String(body.email || '').trim()} — choose “Create an account” to sign up.`)
    // The 'marketplace' grant is the master switch — removing it in admin
    // blocks the account from signing in at all (mirrors the API server).
    // An empty list means an admin removed every grant this session — that
    // blocks sign-in too, not just an explicit non-marketplace list.
    const grants = (acct as { roles?: string[] }).roles
    if (Array.isArray(grants) && !grants.includes('marketplace')) {
      throw new Error('Sign-in for this account has been disabled — contact your administrator.')
    }
    return ok(signIn(acct))
  }
  if (method === 'POST' && route === '/auth/register') {
    const email = String(body.email || '').trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email is required')
    if (!String(body.name || '').trim()) throw new Error('Name is required')
    if (String(body.phone || '').replace(/\D/g, '').length < 10) throw new Error('A mobile number is required to create an account')
    if (db.users.some(u => String(u.email || '').toLowerCase() === email)) throw new Error('An account with that email already exists — sign in instead')
    // Profile captured; the account activates only after the code step.
    const rec = { id: uid('usr'), email, role: 'customer', name: String(body.name).trim(), phone: String(body.phone || ''), driverId: '', customerId: '', phoneVerified: false, active: true, createdAt: new Date().toISOString(), roles: ['marketplace'] }
    const pendingToken = uid('pend')
    pendingSignups.set(pendingToken, rec as Row)
    return ok({ twoFaRequired: true, pendingToken, devCode: '123456' })
  }
  if (method === 'GET' && route === '/auth/me') {
    const u = storedUser()
    if (!u) throw new Error('Not signed in')
    return ok(u)
  }
  if (method === 'POST' && route === '/auth/login/verify') {
    const pend = pendingSignups.get(String(body.pendingToken || ''))
    if (pend) {
      if (String(body.code || '').trim() !== '123456') throw new Error('Incorrect code — the demo verification code is 123456')
      pendingSignups.delete(String(body.pendingToken))
      db.users.push(pend)
      return ok(signIn(pend as unknown as Partial<AuthUser>))
    }
    return ok({ token: DEMO_TOKEN, user: storedUser() ?? demoUser() })
  }
  if (method === 'POST' && route === '/auth/forgot') return ok({ sent: true, devCode: '123456' })
  if (method === 'POST' && route === '/auth/reset') return ok({ reset: true })
  if (method === 'POST' && route === '/auth/change-password') return ok({ changed: true })
  if (method === 'POST' && route === '/auth/2fa/send') return ok({ sent: true, devCode: '123456' })
  if (method === 'POST' && route === '/auth/2fa/verify') return ok({ verified: true })

  // Claim audit-timeline helper (mirrors the server's chain-of-custody log)
  const claimEvent = (c: Row, actor: string, text: string) => {
    let ev: unknown[] = []
    try { ev = JSON.parse(String(c.events || '[]')) } catch { /* rebuild */ }
    ev.push({ t: new Date().toISOString(), actor, text })
    c.events = JSON.stringify(ev)
  }

  // ── Damage claims: creation defaults + evidence photo slots ──
  if (method === 'POST' && route === '/claims') {
    const cont = db.containers.find(c => c.id === body.containerId || c.sku === body.containerId)
    if (!cont) throw new Error('containerId is required')
    const sup = db.suppliers.find(x => x.id === body.supplierId) ?? db.suppliers[0]
    const shp = db.shippers.find(x => x.id === body.shipperId) ?? db.shippers[0]
    const row = {
      id: uid('clm'), claimNumber: `CLM-${String(db.claims.length + 1).padStart(4, '0')}`,
      containerId: cont.id, containerSku: cont.sku,
      supplierId: sup?.id || '', supplierName: (sup?.name as string) || '',
      shipperId: shp?.id || '', shipperName: (shp?.name as string) || '',
      vesselRef: String(body.vesselRef || ''), status: 'awaiting_inspection',
      severity: 0, photos: [], notes: String(body.notes || ''),
      estimateAmount: 0, estimateNotes: '', shipperDecision: '', shipperNotes: '',
      shipperDecidedAt: null, repairShopId: '', repairShopName: '', repairDate: '',
      decision: '', inspectorName: '', inspectedAt: null, createdAt: new Date().toISOString(),
      events: '[]', sharedAt: null, shipperViewedAt: null,
    } as Row
    claimEvent(row, storedUser()?.name || 'Supplier', `Claim filed against ${row.shipperName}${row.vesselRef ? ` (${row.vesselRef})` : ''}`)
    db.claims.push(row)
    return ok(row)
  }
  const claimPhoto = route.match(/^\/claims\/([^/]+)\/photos(\/\d+)?$/)
  if (claimPhoto && (method === 'POST' || method === 'DELETE')) {
    const c = db.claims.find(x => x.id === claimPhoto[1])
    if (!c) throw new Error('Claim not found')
    const photos = [...((c.photos as string[] | undefined) ?? [])]
    if (method === 'POST') photos[Number((body as { slot?: number }).slot ?? 0)] = String((body as { dataUrl?: string }).dataUrl || '')
    else photos[Number(claimPhoto[2]!.slice(1))] = ''
    c.photos = photos
    return ok(c)
  }

  // Share the estimate with the shipping line (pretend email + audit event)
  const shareRoute = route.match(/^\/claims\/([^/]+)\/share$/)
  if (shareRoute && method === 'POST') {
    const c = db.claims.find(x => x.id === shareRoute[1])
    if (!c) throw new Error('Claim not found')
    const mode = (body as { mode?: string }).mode === 'packet' ? 'claim packet' : 'login link'
    c.sharedAt = new Date().toISOString()
    claimEvent(c, storedUser()?.name || 'Supplier', `Estimate shared with ${c.shipperName} by email (${mode})`)
    return ok(c)
  }

  // Digest preference — stored on the session's demo user
  if (method === 'PATCH' && route === '/auth/me') {
    const u = storedUser()
    if (!u) throw new Error('Not signed in')
    const next = { ...u, digestFreq: (body as { digestFreq?: AuthUser['digestFreq'] }).digestFreq || u.digestFreq }
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(next))
    return ok(next)
  }

  // Claims PATCH — merge + append the same timeline events as the server
  const claimPatch = route.match(/^\/claims\/([^/]+)$/)
  if (claimPatch && method === 'PATCH') {
    const c = db.claims.find(x => x.id === claimPatch[1])
    if (!c) throw new Error('Claim not found')
    const before = String(c.status)
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || ['id', 'claimNumber', 'createdAt', 'events'].includes(k)) continue
      c[k] = (k === 'severity' || k === 'estimateAmount') ? Number(v) : v
    }
    const actor = storedUser()?.name || 'User'
    if (String(c.status) !== before) {
      if (c.status === 'awaiting_estimate') claimEvent(c, String(c.inspectorName || actor), `Damage inspected — severity D·${c.severity}`)
      if (c.status === 'awaiting_shipper') claimEvent(c, actor, `Repair estimate $${Number(c.estimateAmount).toLocaleString()} submitted to ${c.shipperName}`)
      if (c.status === 'awaiting_decision') claimEvent(c, actor, `Shipper ${c.shipperDecision} the estimate${c.shipperNotes ? ` — “${c.shipperNotes}”` : ''}`)
      if (c.status === 'repair_scheduled') claimEvent(c, actor, `Repair booked — ${c.repairShopName}, ${c.repairDate}`)
      if (c.status === 'sell_as_damaged') claimEvent(c, actor, `Listed for sale as damaged D·${c.severity}`)
      if (c.status === 'closed') claimEvent(c, actor, 'Claim closed — unit stays retail')
    }
    return ok(c)
  }

  // Reseller-admin tenancy (mirrors the API server): an admin signed in with
  // users.sellerId only ever receives their own company's rows. The blank-
  // sellerId account is SteelBox Co. HQ and sees everything.
  const tenantScope = (col: string, rows: Row[]): Row[] => {
    const u = storedUser()
    const sid = u && u.role === 'admin' && u.sellerId ? u.sellerId : null
    if (!sid) return rows
    const sellerOf = (x?: Row) => String(x?.sellerId || 'sel_mvp')
    const myDrivers = new Set(db.drivers.filter(d => sellerOf(d) === sid).map(d => d.id))
    const orderHit = (custId?: unknown, email?: unknown) => db.orders.some(o => sellerOf(o) === sid &&
      ((custId && o.customerId === custId) || (email && String(o.customerEmail || '').toLowerCase() === String(email).toLowerCase())))
    switch (col) {
      case 'orders': return rows.filter(o => sellerOf(o) === sid)
      case 'drivers': return rows.filter(d => sellerOf(d) === sid)
      case 'depots': return rows.filter(d => sellerOf(d) === sid)
      case 'customers': return rows.filter(c => c.sellerId ? c.sellerId === sid : orderHit(c.id, c.email))
      case 'users': return rows.filter(u2 => {
        if (u2.sellerId) return u2.sellerId === sid
        if (u2.driverId) return myDrivers.has(String(u2.driverId))
        if (u2.customerId || u2.role === 'customer') return orderHit(u2.customerId, u2.email)
        return false
      })
      case 'schedule': return rows.filter(j => {
        const drv = db.drivers.find(d => d.id === j.driverId)
        if (drv) return sellerOf(drv) === sid
        const dep = db.depots.find(d => d.name === j.origin || d.name === j.destination)
        return dep ? sellerOf(dep) === sid : true
      })
      case 'activity': return rows.filter(e => {
        const c = db.containers.find(x => x.id === e.containerId || x.sku === e.sku)
        return c ? sellerOf(c) === sid : false
      })
      default: return rows
    }
  }

  // ── Generic collection CRUD — covers the admin & field portals ──
  const [, col, rid, extra] = route.split('/')
  if (col && !extra && col in db) {
    const rows = db[col]
    // Always hand back a fresh array — returning the live db reference makes
    // React bail out of re-renders (same object identity) after in-place
    // writes, so new rows would never appear until a reload.
    if (method === 'GET' && !rid) return ok([...tenantScope(col, rows)])
    if (method === 'GET' && rid) {
      const r = rows.find(x => x.id === rid)
      if (!r) throw new Error('Not found')
      return ok(r)
    }
    if (method === 'POST' && !rid) {
      delete body.password // users.create — never keep a password around
      const row = { id: uid(col.slice(0, 3)), createdAt: new Date().toISOString(), active: true, ...body } as Row
      if (col === 'orders' && !row.orderNumber) row.orderNumber = `SO-D${Math.floor(Math.random() * 9000 + 1000)}`
      rows.push(row)
      return ok(row)
    }
    if (method === 'PATCH' && rid) {
      const i = rows.findIndex(x => x.id === rid)
      if (i === -1) throw new Error('Not found')
      delete body.password
      rows[i] = { ...rows[i], ...body }
      return ok(rows[i])
    }
    if (method === 'DELETE' && rid) {
      const i = rows.findIndex(x => x.id === rid)
      // Shipping lines soft-delete (mirrors the server): claim history keeps
      // its reference, the line just leaves the pickers.
      if (col === 'shippers') {
        if (i !== -1) rows[i] = { ...rows[i], active: false }
        return ok({ id: rid, archived: true })
      }
      if (i !== -1) rows.splice(i, 1)
      return ok({ deleted: true })
    }
  }

  // Everything else (photo uploads elsewhere, SSE, …) isn't part of the demo.
  throw new Error('This action is disabled in the demo — call us at (504) 555-0190.')
}
