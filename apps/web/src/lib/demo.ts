// ============================================================
// Static demo mode (VITE_DEMO_STATIC=1)
//
// Serves the whole public site with NO backend: reads come from
// demo-data.json (a snapshot of the dev API taken with the
// script in the file header of demo-data.json's git commit),
// writes pretend to succeed, and sign-in mints a local demo
// customer. api.ts routes every request here when the flag is
// set at build time — used for the GitHub Pages demo while the
// hosted API is offline. Nothing is persisted server-side.
// ============================================================

import demoData from './demo-data.json'
import type { AuthUser, Container, Order } from './api'

const data = demoData as unknown as {
  containers: Container[]
  depots: unknown[]
  customBuilds: { id: string }[]
  sellers: unknown[]
}

const uid = (p: string) => `${p}_demo_${Math.random().toString(36).slice(2, 10)}`

// Session-only state (survives navigation, not reloads — by design).
const sessionOrders: Order[] = []

const DEMO_TOKEN = 'demo-token'
const DEMO_USER_KEY = 'sbx_demo_user'

// Known demo accounts — mirrors the seeded users so each portal is reachable
// in the static demo: the owner gets the admin portal, drivers and the
// container adjuster get the field app (incl. the AI grading flow). There is
// no server to check a password against, so any password signs in.
const DEMO_ACCOUNTS: Record<string, Partial<AuthUser>> = {
  'tgmoore@gmail.com': { role: 'admin', name: 'Tim Moore' },
  'mike@mvpcontainer.com': { role: 'driver', name: 'Mike Torres', driverId: 'drv_01' },
  'dan@mvpcontainer.com': { role: 'driver', name: 'Dan Park', driverId: 'drv_02' },
  'luis@mvpcontainer.com': { role: 'driver', name: 'Luis Mendez', driverId: 'drv_03' },
  'adjuster@mvpcontainer.com': { role: 'adjuster', name: 'Container Adjuster' },
}

function demoUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'usr_demo', email: 'demo@mvpcontainers.com', role: 'customer',
    name: 'Demo Customer', phone: '', driverId: '', customerId: '',
    phoneVerified: true, active: true, createdAt: new Date().toISOString(),
    twoFaVerified: true, mustChangePassword: false,
    ...overrides,
  }
}

function signIn(overrides: Partial<AuthUser>): { token: string; user: AuthUser } {
  const user = demoUser(overrides)
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user))
  return { token: DEMO_TOKEN, user }
}

// Mirrors request<T>'s contract: resolve with the parsed payload or throw
// an Error whose message is shown to the user.
export async function demoRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : {}
  const route = path.split('?')[0]
  const ok = (v: unknown) => v as T

  // ── Public reads ──
  if (method === 'GET' && route === '/containers') return ok(data.containers)
  if (method === 'GET' && /^\/containers\/[^/]+$/.test(route)) {
    const c = data.containers.find(x => x.id === route.split('/')[2])
    if (!c) throw new Error('Container not found')
    return ok(c)
  }
  if (method === 'GET' && route === '/depots') return ok(data.depots)
  if (method === 'GET' && route === '/sellers') return ok(data.sellers)
  if (method === 'GET' && route === '/custombuilds') return ok(data.customBuilds)
  if (method === 'GET' && route === '/delivery/estimate') return ok({ days: 4 })
  if (method === 'GET' && route === '/messages') return ok([])
  if (method === 'GET' && route === '/orders') return ok(sessionOrders)

  // ── Shopping writes — pretend success ──
  if (method === 'POST' && /^\/containers\/[^/]+\/reserve$/.test(route)) {
    return ok({ lockExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString() })
  }
  if (method === 'POST' && route === '/orders') {
    const order = { id: uid('ord'), status: 'sale_in_progress', createdAt: new Date().toISOString(), ...body } as Order
    sessionOrders.push(order)
    return ok(order)
  }
  if (method === 'POST' && route === '/quotes') return ok({ id: uid('quote') })
  if (method === 'POST' && /^\/custombuilds\/[^/]+\/order$/.test(route)) {
    const order = { id: uid('ord'), status: 'estimate_requested', createdAt: new Date().toISOString(), ...body } as Order
    sessionOrders.push(order)
    return ok({ order, container: data.containers[0] })
  }

  // ── Field app: apply an AI condition grade (or any admin edit) ──
  // Session-only merge into the bundled snapshot — the marketplace picks the
  // new grade up immediately; a reload returns to the shipped data.
  if (method === 'PATCH' && /^\/containers\/[^/]+$/.test(route)) {
    const c = data.containers.find(x => x.id === route.split('/')[2])
    if (!c) throw new Error('Container not found')
    Object.assign(c, body)
    return ok(c)
  }
  // Collections the field app reads at boot but the snapshot doesn't carry —
  // empty lists keep every screen alive without a backend.
  if (method === 'GET' && ['/schedule', '/drivers', '/activity', '/availability', '/customers', '/outbox'].includes(route)) {
    return ok([])
  }

  // ── Auth — roles come from the demo account map ──
  if (method === 'POST' && route === '/auth/login') {
    const email = String(body.email || 'demo@mvpcontainers.com').trim().toLowerCase()
    const acct = DEMO_ACCOUNTS[email]
    return ok(signIn(acct ? { email, ...acct } : { email, name: 'Demo Customer' }))
  }
  if (method === 'POST' && route === '/auth/register') {
    return ok(signIn({ email: body.email, name: body.name || 'Demo Customer', phone: body.phone || '' }))
  }
  if (method === 'GET' && route === '/auth/me') {
    const stored = localStorage.getItem(DEMO_USER_KEY)
    if (!stored || localStorage.getItem('sbx_token') !== DEMO_TOKEN) throw new Error('Not signed in')
    return ok(JSON.parse(stored))
  }
  if (method === 'POST' && route === '/auth/login/verify') return ok(signIn({}))
  if (method === 'POST' && route === '/auth/forgot') return ok({ sent: true, devCode: '123456' })
  if (method === 'POST' && route === '/auth/reset') return ok({ reset: true })
  if (method === 'POST' && route === '/auth/change-password') return ok({ changed: true })
  if (method === 'POST' && route === '/auth/2fa/send') return ok({ sent: true, devCode: '123456' })
  if (method === 'POST' && route === '/auth/2fa/verify') return ok({ verified: true })

  // Everything else (admin/field portals, uploads, …) isn't part of the demo.
  throw new Error('This action is disabled in the demo — call us at (504) 555-0190.')
}
