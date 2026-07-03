// ============================================================
// SteelBox API — zero-dependency Node HTTP server
// Data is stored in plain CSV files under ./data (human-editable).
// Swap this for a real DB/API when a more robust solution is needed.
// ============================================================

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000

// A container stays in `draft` until its full photo set is uploaded,
// at which point it auto-promotes to `available` (listable on the marketplace).
// The standard set is 12 labelled shots (see the field app photo session).
const PHOTO_TARGET = 12

// Promote a draft to available once photo documentation is complete.
function withPhotoPromotion(c) {
  const count = Math.max(c.photoCount ?? 0, Array.isArray(c.photos) ? c.photos.length : 0)
  if (c.status === 'draft' && count >= PHOTO_TARGET) return { ...c, status: 'available' }
  return c
}

// ── CSV helpers ───────────────────────────────────────────
// A small but correct CSV implementation (handles quoted fields,
// embedded commas, quotes, and newlines).

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c === '\r') {
      // ignore; handled by \n
    } else {
      field += c
    }
  }
  // trailing field/row (if file doesn't end in newline)
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
}

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function serializeCsv(headers, records, toCells) {
  const lines = [headers.join(',')]
  for (const rec of records) lines.push(toCells(rec).map(csvCell).join(','))
  return lines.join('\n') + '\n'
}

// ── Typed table layer ─────────────────────────────────────
// Each table declares field types so CSV strings round-trip to
// proper JSON (numbers, booleans, arrays, nulls).

const SCHEMAS = {
  containers: {
    file: 'containers.csv',
    headers: ['id','sku','guid','stockNumber','size','grade','status','buyPrice','rentMonthly','photos','photoCount','has360','depotLocation','bayNumber','inspectorName','inspectedAt','deliveryIncluded','listingType','createdAt','purchaseCost','conditionScore'],
    types: {
      buyPrice: 'number', rentMonthly: 'numberOrNull', photoCount: 'number', purchaseCost: 'number', conditionScore: 'number',
      has360: 'boolean', deliveryIncluded: 'boolean',
      photos: 'array', inspectedAt: 'stringOrNull',
    },
  },
  orders: {
    file: 'orders.csv',
    headers: ['id','orderNumber','containerId','containerSku','customerId','customerName','customerEmail','customerPhone','deliveryAddress','deliveryZip','amount','status','driverId','driverName','scheduledDate','completedAt','createdAt','saleType','unitCost','deposit','driverHours'],
    types: {
      amount: 'number', unitCost: 'number', deposit: 'number', driverHours: 'number',
      driverId: 'stringOrNull', driverName: 'stringOrNull',
      scheduledDate: 'stringOrNull', completedAt: 'stringOrNull',
    },
  },
  drivers: {
    file: 'drivers.csv',
    headers: ['id','driverCode','name','initials','cdlClass','vehicle','licensePlate','status','rating','deliveriesMonth','deliveriesTotal','onTimePercent','activeOrderId','activeOrderSku','nextShift','colorHex','active','address','cellPhone','hourlyWage','trucks','workHours'],
    types: {
      rating: 'number', deliveriesMonth: 'number', deliveriesTotal: 'number', onTimePercent: 'number', hourlyWage: 'number',
      active: 'boolean',
      activeOrderId: 'stringOrNull', activeOrderSku: 'stringOrNull', nextShift: 'stringOrNull',
    },
  },
  // Append-only activity log — field pickups/returns, photo sessions, arrivals.
  activity: {
    file: 'activity.csv',
    headers: ['id','timestamp','type','jobType','sku','containerId','actor','location','note'],
    types: {},
  },
  // Pickup depots — physical yards with a lot attendant contact.
  depots: {
    file: 'depots.csv',
    headers: ['id','name','address','attendantName','attendantCell','code'],
    types: {},
  },
  // Pickup/delivery/return/transfer schedule — shared by admin Schedule + field app.
  schedule: {
    file: 'schedule.csv',
    headers: ['id','dayOffset','startMin','driverId','type','sku','customer','origin','originAddress','destination','destinationAddress','miles','contact'],
    types: { dayOffset: 'number', startMin: 'number', miles: 'number' },
  },
  // Per-week driver working hours (availability), set ahead in the field app.
  availability: {
    file: 'availability.csv',
    headers: ['id','driverId','weekStart','workHours'],
    types: {},
  },
  // Customer master list — CRUD in the admin portal; referenced by orders + schedule.
  customers: {
    file: 'customers.csv',
    headers: ['id','name','company','email','phone','address','city','state','zip','notes','active','createdAt','notifySms','notifyEmail'],
    // notifyEmail is always true (email is mandatory); notifySms is the customer's opt-in.
    types: { active: 'boolean', notifySms: 'boolean', notifyEmail: 'boolean' },
  },
  // Messages between drivers, admin dispatch, and customers. Each row is one direction;
  // toDriverId is the driver party in the conversation (whether sending or receiving).
  messages: {
    file: 'messages.csv',
    headers: ['id','fromRole','fromName','fromEmail','toDriverId','toRole','toName','toEmail','subject','body','createdAt','read','trashed'],
    types: { read: 'boolean', trashed: 'boolean' },
  },
  // Login accounts (RBAC): admin / driver / customer. passwordHash is scrypt "salt$hash";
  // driverId links driver accounts to drivers.csv, customerId links buyers to customers.csv.
  users: {
    file: 'users.csv',
    headers: ['id','email','passwordHash','role','name','phone','driverId','customerId','phoneVerified','active','createdAt'],
    types: { phoneVerified: 'boolean', active: 'boolean' },
  },
  // Outbound email + SMS log. In dev nothing actually leaves the machine —
  // every message the system "sends" is recorded here (admin portal shows it).
  outbox: {
    file: 'outbox.csv',
    headers: ['id','channel','to','subject','body','relatedType','relatedId','status','createdAt'],
    types: {},
  },
}

function decodeCell(raw, type) {
  switch (type) {
    case 'number': return raw === '' ? 0 : Number(raw)
    case 'numberOrNull': return raw === '' ? null : Number(raw)
    case 'boolean': return raw === 'true'
    case 'array': return raw === '' ? [] : raw.split('|')
    case 'stringOrNull': return raw === '' ? null : raw
    default: return raw
  }
}

function encodeCell(value, type) {
  if (type === 'array') return Array.isArray(value) ? value.join('|') : ''
  if (value === null || value === undefined) return ''
  if (type === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function readTable(name) {
  const schema = SCHEMAS[name]
  const path = join(DATA_DIR, schema.file)
  if (!existsSync(path)) return []
  const rows = parseCsv(readFileSync(path, 'utf8'))
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).map(cells => {
    const rec = {}
    headers.forEach((h, i) => { rec[h] = decodeCell(cells[i] ?? '', schema.types[h]) })
    return rec
  })
}

function writeTable(name, records) {
  const schema = SCHEMAS[name]
  const csv = serializeCsv(schema.headers, records, rec =>
    schema.headers.map(h => encodeCell(rec[h], schema.types[h])))
  writeFileSync(join(DATA_DIR, schema.file), csv)
}

// ── Domain helpers ────────────────────────────────────────

// Short depot code for SKUs (NOLA, BR, HOU…) from the depot location string.
function depotCode(loc) {
  const s = (loc || '').toLowerCase()
  if (s.includes('nola') || s.includes('new orleans')) return 'NOLA'
  if (s.includes('baton rouge') || /\bbr\b/.test(s)) return 'BR'
  if (s.includes('houston')) return 'HOU'
  const words = (loc || '').replace(/depot/ig, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'SBX'
  return words.length === 1 ? words[0].slice(0, 4).toUpperCase() : words.map(w => w[0]).join('').toUpperCase()
}

// SKU format: {DEPOT}-{size}-{sequence} — e.g. NOLA-20-0001.
function nextSku(size, code, containers) {
  const sz = size.startsWith('40') ? '40' : size.startsWith('10') ? '10' : '20'
  const prefix = `${code}-${sz}-`
  const nums = containers
    .map(c => c.sku)
    .filter(s => s && s.startsWith(prefix))
    .map(s => Number(s.slice(prefix.length)))
    .filter(n => !Number.isNaN(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return prefix + String(next).padStart(4, '0')
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

// Find-or-create a customer from an order/checkout body; returns the customer id.
// Matches by email (case-insensitive), else by an explicit customerId; otherwise creates a new row.
function upsertCustomerFromOrder(body) {
  const customers = readTable('customers')
  const email = (body.customerEmail || '').trim().toLowerCase()
  let match = email ? customers.find(c => (c.email || '').trim().toLowerCase() === email) : null
  if (!match && body.customerId) match = customers.find(c => c.id === body.customerId)

  if (match) {
    // Backfill blanks from this order without overwriting existing data.
    const i = customers.findIndex(c => c.id === match.id)
    customers[i] = {
      ...match,
      name: match.name || body.customerName || match.name,
      phone: match.phone || body.customerPhone || '',
      address: match.address || body.deliveryAddress || '',
      zip: match.zip || body.deliveryZip || '',
    }
    writeTable('customers', customers)
    return match.id
  }

  const id = uid('cus')
  customers.push({
    id,
    name: body.customerName || body.customerEmail || 'Guest',
    company: '',
    email: body.customerEmail || '',
    phone: body.customerPhone || '',
    address: body.deliveryAddress || '',
    city: '', state: '', zip: body.deliveryZip || '',
    notes: 'Created from marketplace checkout',
    active: true,
    createdAt: new Date().toISOString(),
    notifySms: body.notifySms === true, // customer's text opt-in from checkout
    notifyEmail: true,                   // email is mandatory
  })
  writeTable('customers', customers)
  return id
}

// Rough monthly rent estimate when the client doesn't supply one.
function estimateRent(buyPrice) {
  return Math.round((buyPrice * 0.038) / 5) * 5
}

// ── Auth (users.csv + stateless HMAC tokens) ──────────────

const AUTH_SECRET = process.env.SBX_SECRET || 'sbx-dev-secret'
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12h sessions

function hashPassword(pw) {
  const salt = randomBytes(8).toString('hex')
  return `${salt}$${scryptSync(String(pw), salt, 32).toString('hex')}`
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split('$')
  if (!salt || !hash) return false
  const test = scryptSync(String(pw), salt, 32).toString('hex')
  return test.length === hash.length && timingSafeEqual(Buffer.from(test), Buffer.from(hash))
}
function signToken(userId) {
  const exp = Date.now() + TOKEN_TTL_MS
  const payload = `${userId}.${exp}`
  const sig = createHmac('sha256', AUTH_SECRET).update(payload).digest('hex').slice(0, 32)
  return `${payload}.${sig}`
}
function verifyToken(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const [id, exp, sig] = parts
  const expect = createHmac('sha256', AUTH_SECRET).update(`${id}.${exp}`).digest('hex').slice(0, 32)
  if (sig !== expect || Number(exp) < Date.now()) return null
  return id
}
function publicUser(u) {
  const { passwordHash, ...rest } = u
  return rest
}
function currentUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const id = verifyToken(token)
  if (!id) return null
  const u = readTable('users').find(x => x.id === id && x.active !== false)
  return u || null
}

// Seed accounts on boot: the default admin plus one login per active driver
// (password "test1234" for all seeded accounts — dev only).
function ensureSeedUsers() {
  const users = readTable('users')
  let changed = false
  const ensure = (email, fields) => {
    if (users.some(u => (u.email || '').toLowerCase() === email)) return
    users.push({
      id: uid('usr'), email, passwordHash: hashPassword('test1234'),
      phone: '', driverId: '', customerId: '', phoneVerified: false, active: true,
      createdAt: new Date().toISOString(), ...fields,
    })
    changed = true
    console.log(`Seeded ${fields.role} account: ${email} / test1234`)
  }
  ensure('tgmoore@gmail.com', { role: 'admin', name: 'Tim Moore' })
  for (const d of readTable('drivers')) {
    if (d.active === false) continue
    const first = (d.name || 'driver').trim().split(/\s+/)[0].toLowerCase()
    ensure(`${first}@steelbox.co`, { role: 'driver', name: d.name, driverId: d.id, phone: d.cellPhone || '' })
  }
  if (changed) writeTable('users', users)
}

// ── Two-factor codes (SMS) ────────────────────────────────
// Codes live in memory (10-min expiry); the "text" itself is logged to
// outbox.csv. Orders require a verification completed in the last 15 min —
// on the first order AND every subsequent order.

const twoFactor = new Map() // userId → { code, phone, expires, verifiedAt }
const TWOFA_CODE_TTL = 10 * 60 * 1000
const TWOFA_VALID_FOR = 15 * 60 * 1000

function twoFaVerified(userId) {
  const rec = twoFactor.get(userId)
  return !!rec?.verifiedAt && (Date.now() - rec.verifiedAt) < TWOFA_VALID_FOR
}

// ── Outbound email / SMS (logged to outbox.csv) ───────────

function queueMessage(channel, to, subject, body, relatedType = '', relatedId = '') {
  if (!to) return
  const rows = readTable('outbox')
  rows.push({
    id: uid('out'), channel, to, subject, body,
    relatedType, relatedId, status: 'sent', createdAt: new Date().toISOString(),
  })
  writeTable('outbox', rows)
}

// ── Photo storage ─────────────────────────────────────────
// Real image files live under data/photos and are served at /photos/<file>.
// containers.csv `photos` keeps one slot per shot (index 0–11 = the 12-shot
// standard), so field app, marketplace spinner, and admin stay aligned.

const PHOTO_DIR = join(DATA_DIR, 'photos')
const PHOTO_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function savePhoto(sku, slot, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl || ''))
  if (!m) return { error: 'dataUrl must be a base64 image/jpeg, image/png, or image/webp' }
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 8 * 1024 * 1024) return { error: 'Photo too large (8 MB max)' }
  mkdirSync(PHOTO_DIR, { recursive: true })
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
  const fname = `${sku}-${String(slot + 1).padStart(2, '0')}-${Date.now().toString(36)}.${ext}`
  writeFileSync(join(PHOTO_DIR, fname), buf)
  return { url: `/photos/${fname}` }
}

// ── HTTP plumbing ─────────────────────────────────────────

function send(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  })
  res.end(json)
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) } catch { resolve({}) }
    })
  })
}

// ── Router ────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const method = req.method || 'GET'
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const path = url.pathname
  const seg = path.split('/').filter(Boolean) // e.g. ['containers','ctr_1','reserve']

  if (method === 'OPTIONS') return send(res, 204, {})

  try {
    // ── Auth (stubbed — any credentials succeed) ──
    if (path === '/auth/login' && method === 'POST') {
      const { email } = await readBody(req)
      return send(res, 200, {
        token: 'dev-token',
        user: { id: 'usr_admin', email: email || 'admin@steelbox.dev', role: 'admin', name: 'James R.' },
      })
    }
    if (path === '/auth/me' && method === 'GET') {
      return send(res, 200, { id: 'usr_admin', email: 'admin@steelbox.dev', role: 'admin', name: 'James R.' })
    }

    // ── Containers ──
    if (seg[0] === 'containers') {
      const containers = readTable('containers')

      if (seg.length === 1 && method === 'GET') return send(res, 200, containers)

      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        if (!body.size || !body.grade) return send(res, 400, { message: 'size and grade are required' })
        const buyPrice = Number(body.buyPrice) || 0
        const id = uid('ctr')
        // Prefer the depot's configured code; fall back to a derived code from the name.
        const depotRow = readTable('depots').find(d => d.name === body.depotLocation)
        const skuCode = (depotRow?.code || depotCode(body.depotLocation)).toUpperCase()
        const sku = nextSku(body.size, skuCode, containers)
        const seq = sku.slice(-4)
        const photos = Array.isArray(body.photos) ? body.photos : []
        const record = withPhotoPromotion({
          id,
          sku,
          guid: `${crypto.randomUUID?.() ?? uid('guid')}`,
          stockNumber: `STK-${seq}`,
          size: body.size,
          grade: body.grade,
          // New containers start as draft — awaiting field photo documentation.
          status: body.status || 'draft',
          // How the unit may be transacted: 'buy', 'rent', or 'both'.
          listingType: ['buy', 'rent', 'both'].includes(body.listingType) ? body.listingType : 'both',
          buyPrice,
          // Acquisition cost — what we paid the depot for the unit (COGS).
          purchaseCost: body.purchaseCost != null ? Number(body.purchaseCost) : 0,
          // Field-scored condition 1–5 (0 = not yet inspected).
          conditionScore: body.conditionScore != null ? Number(body.conditionScore) : 0,
          rentMonthly: body.rentMonthly != null ? Number(body.rentMonthly) : estimateRent(buyPrice),
          photos,
          photoCount: body.photoCount != null ? Number(body.photoCount) : photos.length,
          has360: body.has360 ?? false,
          depotLocation: body.depotLocation || '',
          bayNumber: body.bayNumber || '',
          inspectorName: body.inspectorName || '',
          inspectedAt: null,
          deliveryIncluded: body.deliveryIncluded ?? true,
          createdAt: new Date().toISOString(),
        })
        containers.push(record)
        writeTable('containers', containers)
        return send(res, 201, record)
      }

      const id = seg[1]
      const idx = containers.findIndex(c => c.id === id || c.sku === id)

      if (seg.length === 2 && method === 'GET') {
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        return send(res, 200, containers[idx])
      }

      if (seg.length === 2 && method === 'PATCH') {
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        const body = await readBody(req)
        containers[idx] = withPhotoPromotion({ ...containers[idx], ...body, id: containers[idx].id })
        writeTable('containers', containers)
        return send(res, 200, containers[idx])
      }

      if (seg.length === 2 && method === 'DELETE') {
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        // Guard: a container tied to an in-flight sale can't be removed.
        if (containers[idx].status === 'sale_in_progress') {
          return send(res, 409, { message: 'Cannot delete a container with a sale in progress' })
        }
        const [removed] = containers.splice(idx, 1)
        writeTable('containers', containers)
        return send(res, 200, { id: removed.id, sku: removed.sku, deleted: true })
      }

      if (seg.length === 3 && seg[2] === 'reserve' && method === 'POST') {
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        containers[idx].status = 'sale_in_progress'
        writeTable('containers', containers)
        const lockExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
        return send(res, 200, { lockExpiresAt })
      }

      if (seg.length === 3 && seg[2] === 'photo-upload-url' && method === 'GET') {
        // No real storage in dev — hand back a placeholder.
        const filename = url.searchParams.get('filename') || 'photo.jpg'
        return send(res, 200, { uploadUrl: `http://localhost:${PORT}/dev-upload`, publicUrl: `http://localhost:${PORT}/dev-photos/${filename}` })
      }
    }

    // ── Orders ──
    if (seg[0] === 'orders') {
      const orders = readTable('orders')

      if (seg.length === 1 && method === 'GET') return send(res, 200, orders)

      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        const nums = orders.map(o => Number(String(o.orderNumber).replace('ORD-', ''))).filter(n => !Number.isNaN(n))
        const next = (nums.length ? Math.max(...nums) : 0) + 1
        // Upsert the buyer into customers.csv — the first cart checkout creates the record;
        // repeat orders (matched by email) reuse it and backfill any blank contact fields.
        const customerId = upsertCustomerFromOrder(body)
        const record = {
          id: uid('ord'),
          orderNumber: `ORD-${String(next).padStart(4, '0')}`,
          containerId: body.containerId || '',
          containerSku: body.containerSku || '',
          customerId,
          customerName: body.customerName || '',
          customerEmail: body.customerEmail || '',
          customerPhone: body.customerPhone || '',
          deliveryAddress: body.deliveryAddress || '',
          deliveryZip: body.deliveryZip || '',
          amount: Number(body.amount) || 0,
          status: body.status || 'sale_in_progress',
          driverId: body.driverId || null,
          driverName: body.driverName || null,
          scheduledDate: body.scheduledDate || null,
          completedAt: body.completedAt || null,
          createdAt: new Date().toISOString(),
          // Profit fields (snapshotted at sale time so historical margin is stable).
          saleType: ['buy', 'rent'].includes(body.saleType) ? body.saleType : 'buy',
          unitCost: Number(body.unitCost) || 0,
          deposit: Number(body.deposit) || 0,
          driverHours: Number(body.driverHours) || 0,
        }
        orders.push(record)
        writeTable('orders', orders)
        return send(res, 201, record)
      }

      const id = seg[1]
      const idx = orders.findIndex(o => o.id === id || o.orderNumber === id)

      if (seg.length === 2 && method === 'GET') {
        if (idx === -1) return send(res, 404, { message: 'Order not found' })
        return send(res, 200, orders[idx])
      }

      if (seg.length === 3 && seg[2] === 'assign-driver' && method === 'POST') {
        if (idx === -1) return send(res, 404, { message: 'Order not found' })
        const { driverId, scheduledDate } = await readBody(req)
        const drivers = readTable('drivers')
        const driver = drivers.find(d => d.id === driverId)
        if (!driver) return send(res, 400, { message: 'Driver not found' })
        orders[idx] = {
          ...orders[idx],
          driverId,
          driverName: driver.name,
          scheduledDate: scheduledDate || null,
          status: 'assigned',
        }
        writeTable('orders', orders)
        return send(res, 200, orders[idx])
      }

      if (seg.length === 3 && seg[2] === 'delivered' && method === 'POST') {
        if (idx === -1) return send(res, 404, { message: 'Order not found' })
        orders[idx] = { ...orders[idx], status: 'delivered', completedAt: new Date().toISOString() }
        writeTable('orders', orders)
        return send(res, 200, orders[idx])
      }
    }

    // ── Drivers ──
    if (seg[0] === 'drivers') {
      const drivers = readTable('drivers')
      if (seg.length === 1 && method === 'GET') return send(res, 200, drivers)

      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        if (!body.name) return send(res, 400, { message: 'name is required' })
        const nums = drivers.map(d => Number(String(d.driverCode).replace('DRV-', ''))).filter(n => !Number.isNaN(n))
        const next = (nums.length ? Math.max(...nums) : 0) + 1
        const initials = body.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
        const palette = ['#0057B8', '#00A86B', '#F5A623', '#9013FE', '#E65100', '#0EA5E9', '#DB2777']
        const record = {
          id: uid('drv'),
          driverCode: `DRV-${String(next).padStart(2, '0')}`,
          name: body.name, initials: body.initials || initials,
          cdlClass: body.cdlClass || 'A',
          vehicle: body.vehicle || '', licensePlate: body.licensePlate || '',
          status: body.status || 'on_duty',
          rating: Number(body.rating) || 5, deliveriesMonth: 0, deliveriesTotal: 0, onTimePercent: 100,
          activeOrderId: null, activeOrderSku: null, nextShift: body.nextShift || null,
          colorHex: body.colorHex || palette[drivers.length % palette.length],
          active: true,
          address: body.address || '', cellPhone: body.cellPhone || '',
          hourlyWage: Number(body.hourlyWage) || 0,
          trucks: body.trucks || '',
          workHours: body.workHours || '1:6-18|2:6-18|3:6-18|4:6-18|5:6-18',
        }
        drivers.push(record)
        writeTable('drivers', drivers)
        return send(res, 201, record)
      }

      const id = seg[1]
      const idx = drivers.findIndex(x => x.id === id || x.driverCode === id)

      if (seg.length === 2 && method === 'GET') {
        return idx !== -1 ? send(res, 200, drivers[idx]) : send(res, 404, { message: 'Driver not found' })
      }
      if (seg.length === 2 && method === 'PATCH') {
        if (idx === -1) return send(res, 404, { message: 'Driver not found' })
        const body = await readBody(req)
        drivers[idx] = { ...drivers[idx], ...body, id: drivers[idx].id }
        writeTable('drivers', drivers)
        return send(res, 200, drivers[idx])
      }
      // Soft delete — keep the row (activity/order history intact), just deactivate.
      if (seg.length === 2 && method === 'DELETE') {
        if (idx === -1) return send(res, 404, { message: 'Driver not found' })
        drivers[idx] = { ...drivers[idx], active: false, status: 'off_duty' }
        writeTable('drivers', drivers)
        return send(res, 200, { id: drivers[idx].id, archived: true })
      }
    }

    // ── Customers (master list — CRUD from admin portal) ──
    if (seg[0] === 'customers') {
      const customers = readTable('customers')
      if (seg.length === 1 && method === 'GET') return send(res, 200, customers)

      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        if (!body.name) return send(res, 400, { message: 'name is required' })
        const record = {
          id: uid('cus'),
          name: body.name,
          company: body.company || '',
          email: body.email || '',
          phone: body.phone || '',
          address: body.address || '',
          city: body.city || '',
          state: body.state || '',
          zip: body.zip || '',
          notes: body.notes || '',
          active: true,
          createdAt: body.createdAt || new Date().toISOString(),
          notifySms: body.notifySms === true,
          notifyEmail: true, // email is mandatory — always on
        }
        customers.push(record)
        writeTable('customers', customers)
        return send(res, 201, record)
      }

      const id = seg[1]
      const idx = customers.findIndex(x => x.id === id)

      if (seg.length === 2 && method === 'GET') {
        return idx !== -1 ? send(res, 200, customers[idx]) : send(res, 404, { message: 'Customer not found' })
      }
      if (seg.length === 2 && method === 'PATCH') {
        if (idx === -1) return send(res, 404, { message: 'Customer not found' })
        const body = await readBody(req)
        customers[idx] = { ...customers[idx], ...body, id: customers[idx].id, notifyEmail: true }
        writeTable('customers', customers)
        return send(res, 200, customers[idx])
      }
      // Soft delete — keep the row (order history intact), just deactivate.
      if (seg.length === 2 && method === 'DELETE') {
        if (idx === -1) return send(res, 404, { message: 'Customer not found' })
        customers[idx] = { ...customers[idx], active: false }
        writeTable('customers', customers)
        return send(res, 200, { id: customers[idx].id, archived: true })
      }
    }

    // ── Messages (driver Inbox/Trash — from admin or customers) ──
    if (seg[0] === 'messages') {
      const messages = readTable('messages')

      // GET /messages?driverId=drv_01 → that driver's messages, newest first.
      if (seg.length === 1 && method === 'GET') {
        const driverId = url.searchParams.get('driverId')
        const list = driverId ? messages.filter(m => m.toDriverId === driverId) : messages
        return send(res, 200, [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
      }

      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        if (!body.toDriverId) return send(res, 400, { message: 'toDriverId is required' })
        const record = {
          id: uid('msg'),
          fromRole: ['admin', 'customer', 'driver'].includes(body.fromRole) ? body.fromRole : 'admin',
          fromName: body.fromName || 'SteelBox',
          fromEmail: body.fromEmail || '',
          toDriverId: body.toDriverId,
          toRole: ['admin', 'customer', 'driver'].includes(body.toRole) ? body.toRole : 'driver',
          toName: body.toName || '',
          toEmail: body.toEmail || '',
          subject: body.subject || '(no subject)',
          body: body.body || '',
          createdAt: body.createdAt || new Date().toISOString(),
          read: false,
          trashed: false,
        }
        messages.push(record)
        writeTable('messages', messages)
        return send(res, 201, record)
      }

      // DELETE /messages?driverId=drv_01&trashed=true → empty that driver's trash.
      if (seg.length === 1 && method === 'DELETE') {
        const driverId = url.searchParams.get('driverId')
        const kept = messages.filter(m => !(m.trashed && (!driverId || m.toDriverId === driverId)))
        const removed = messages.length - kept.length
        writeTable('messages', kept)
        return send(res, 200, { emptied: true, removed })
      }

      const id = seg[1]
      const idx = messages.findIndex(m => m.id === id)

      if (seg.length === 2 && method === 'PATCH') {
        if (idx === -1) return send(res, 404, { message: 'Message not found' })
        const body = await readBody(req)
        messages[idx] = { ...messages[idx], ...body, id: messages[idx].id }
        writeTable('messages', messages)
        return send(res, 200, messages[idx])
      }
      if (seg.length === 2 && method === 'DELETE') {
        if (idx === -1) return send(res, 404, { message: 'Message not found' })
        const [removed] = messages.splice(idx, 1)
        writeTable('messages', messages)
        return send(res, 200, { id: removed.id, deleted: true })
      }
    }

    // ── Activity log (field pickups/returns + photo sessions) ──
    if (seg[0] === 'activity') {
      const events = readTable('activity')
      if (seg.length === 1 && method === 'GET') {
        // Newest first.
        return send(res, 200, [...events].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')))
      }
      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        const record = {
          id: uid('act'),
          timestamp: body.timestamp || new Date().toISOString(),
          type: body.type || 'event',
          jobType: body.jobType || '',
          sku: body.sku || '',
          containerId: body.containerId || '',
          actor: body.actor || '',
          location: body.location || '',
          note: body.note || '',
        }
        events.push(record)
        writeTable('activity', events)
        return send(res, 201, record)
      }
    }

    // ── Depots (pickup locations) ──
    if (seg[0] === 'depots') {
      const depots = readTable('depots')

      if (seg.length === 1 && method === 'GET') return send(res, 200, depots)

      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        if (!body.name) return send(res, 400, { message: 'name is required' })
        const record = {
          id: uid('dep'),
          name: body.name,
          address: body.address || '',
          attendantName: body.attendantName || '',
          attendantCell: body.attendantCell || '',
          // SKU prefix code; default to the derived code from the name.
          code: (body.code || depotCode(body.name)).toUpperCase(),
        }
        depots.push(record)
        writeTable('depots', depots)
        return send(res, 201, record)
      }

      const id = seg[1]
      const idx = depots.findIndex(d => d.id === id)

      if (seg.length === 2 && method === 'PATCH') {
        if (idx === -1) return send(res, 404, { message: 'Depot not found' })
        const body = await readBody(req)
        depots[idx] = { ...depots[idx], ...body, id: depots[idx].id }
        writeTable('depots', depots)
        return send(res, 200, depots[idx])
      }

      if (seg.length === 2 && method === 'DELETE') {
        if (idx === -1) return send(res, 404, { message: 'Depot not found' })
        const [removed] = depots.splice(idx, 1)
        writeTable('depots', depots)
        return send(res, 200, { id: removed.id, deleted: true })
      }
    }

    // ── Schedule (deliveries / returns / transfers) ──
    if (seg[0] === 'schedule') {
      const sched = readTable('schedule')
      if (seg.length === 1 && method === 'GET') return send(res, 200, sched)
      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        const record = {
          id: uid('sch'),
          dayOffset: Number(body.dayOffset) || 0,
          startMin: Number(body.startMin) || 0,
          driverId: body.driverId || '',
          type: body.type || 'delivery',
          sku: body.sku || '',
          customer: body.customer || '',
          origin: body.origin || '',
          destination: body.destination || '',
          miles: Number(body.miles) || 0,
          contact: body.contact || '',
        }
        sched.push(record)
        writeTable('schedule', sched)
        return send(res, 201, record)
      }
      const sid = seg[1]
      const sidx = sched.findIndex(s => s.id === sid)
      if (seg.length === 2 && method === 'PATCH') {
        if (sidx === -1) return send(res, 404, { message: 'Schedule entry not found' })
        const body = await readBody(req)
        sched[sidx] = { ...sched[sidx], ...body, id: sched[sidx].id }
        writeTable('schedule', sched)
        return send(res, 200, sched[sidx])
      }
      if (seg.length === 2 && method === 'DELETE') {
        if (sidx === -1) return send(res, 404, { message: 'Schedule entry not found' })
        const [removed] = sched.splice(sidx, 1)
        writeTable('schedule', sched)
        return send(res, 200, { id: removed.id, deleted: true })
      }
    }

    // ── Availability (per-week driver working hours) ──
    if (seg[0] === 'availability') {
      const rows = readTable('availability')
      if (seg.length === 1 && method === 'GET') return send(res, 200, rows)
      // Upsert by (driverId, weekStart).
      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        if (!body.driverId || !body.weekStart) return send(res, 400, { message: 'driverId and weekStart are required' })
        const idx = rows.findIndex(r => r.driverId === body.driverId && r.weekStart === body.weekStart)
        if (idx !== -1) {
          rows[idx] = { ...rows[idx], workHours: body.workHours ?? '' }
          writeTable('availability', rows)
          return send(res, 200, rows[idx])
        }
        const record = { id: uid('avl'), driverId: body.driverId, weekStart: body.weekStart, workHours: body.workHours || '' }
        rows.push(record)
        writeTable('availability', rows)
        return send(res, 201, record)
      }
    }

    // ── Quotes (write-only log) ──
    if (path === '/quotes' && method === 'POST') {
      await readBody(req)
      return send(res, 201, { id: uid('quo') })
    }

    // ── Delivery estimate ──
    if (path === '/delivery/estimate' && method === 'GET') {
      return send(res, 200, { days: 3 })
    }

    return send(res, 404, { message: `No route for ${method} ${path}` })
  } catch (err) {
    console.error(err)
    return send(res, 500, { message: err instanceof Error ? err.message : 'Internal error' })
  }
})

server.listen(PORT, () => {
  console.log(`SteelBox API (CSV-backed) listening on http://localhost:${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
})
