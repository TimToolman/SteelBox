// ============================================================
// MVP Container API — zero-dependency Node HTTP server
// Data is stored in plain CSV files under ./data (human-editable).
// Swap this for a real DB/API when a more robust solution is needed.
// ============================================================

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
// In the cloud, DATA_DIR points at a persistent volume (e.g. /data on
// Railway) so CSVs survive redeploys. First boot seeds it from the repo's
// bundled data; local dev keeps reading ./data directly.
const SEED_DIR = join(__dirname, 'data')
const DATA_DIR = process.env.DATA_DIR || SEED_DIR
if (DATA_DIR !== SEED_DIR && !existsSync(join(DATA_DIR, 'users.csv'))) {
  mkdirSync(DATA_DIR, { recursive: true })
  cpSync(SEED_DIR, DATA_DIR, { recursive: true })
  console.log(`Seeded data volume ${DATA_DIR} from ${SEED_DIR}`)
}
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000

// A container stays in `draft` until its full photo set is uploaded,
// at which point it auto-promotes to `available` (listable on the marketplace).
// The standard set is 8 labelled shots (see the field app photo session).
// Slot 8 holds the AI-stitched 3D render ("image 9"); slots 9+ are extras.
const PHOTO_TARGET = 8
const RENDER_SLOT = 8

// Promote a draft to available once photo documentation is complete.
function withPhotoPromotion(c) {
  // photos slots can contain '' placeholders — only real URLs count.
  const real = Array.isArray(c.photos) ? c.photos.filter(Boolean).length : 0
  const count = Math.max(c.photoCount ?? 0, real)
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
    // customEta/customBuildName only apply to custom-build orders
    // (status custom_in_progress): the promised completion date + which
    // catalog build the unit is being fabricated as.
    headers: ['id','sku','guid','stockNumber','size','grade','condition','color','status','buyPrice','rentMonthly','photos','photoCount','has360','depotLocation','bayNumber','inspectorName','inspectedAt','deliveryIncluded','listingType','createdAt','purchaseCost','conditionScore','customEta','customBuildName'],
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
    headers: ['id','name','destination','address','attendantName','attendantCell','code'],
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
  // Custom build products on the marketplace "Custom Builds" tab.
  // Managed in Admin → Settings. photo '' = show the built-in clipart.
  custombuilds: {
    file: 'custombuilds.csv',
    headers: ['id','name','tag','description','features','fromPrice','photo','sortOrder','active'],
    types: { fromPrice: 'number', sortOrder: 'number', active: 'boolean', features: 'array' },
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
  // Time-sortable + 5 random bytes — burst-safe (the old 4-digit random
  // suffix could collide when many records were created in the same ms).
  return `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString('hex')}`
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
    company: body.company || '',
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
    ensure(`${first}@mvpcontainer.com`, { role: 'driver', name: d.name, driverId: d.id, phone: d.cellPhone || '' })
  }
  if (changed) writeTable('users', users)
}

// Seed the Custom Builds catalog once (previously hard-coded in the
// marketplace). Admin edits these under Settings; photos are optional —
// blank means the marketplace shows the built-in clipart.
function ensureSeedCustomBuilds() {
  if (readTable('custombuilds').length > 0) return
  const seed = [
    { name: 'Roll-Up Door', tag: 'POPULAR', description: 'Single or double roll-up doors for easy forklift access.', features: ['8×7 roll-up', 'Galvanized steel', 'Lockable'], fromPrice: 3200 },
    { name: 'Personnel Door + Window', tag: 'COMMON', description: 'Man door and sliding window for office or site use.', features: ['36" steel door', 'Deadbolt', 'Slider window'], fromPrice: 2800 },
    { name: 'Workshop Container', tag: 'TURNKEY', description: 'Wired for power, vented, shelving included.', features: ['110v outlets', 'Fluorescent lighting', 'Vent fans'], fromPrice: 5500 },
    { name: 'Pop-Up Retail Shell', tag: 'TRENDING', description: 'Fold-out panels, branded exterior, ready for signage.', features: ['Fold-out counter', 'Service window', 'Awning mounts'], fromPrice: 7200 },
    { name: 'Security Vault', tag: 'HEAVY DUTY', description: 'Reinforced doors, CCTV mount points, alarm wiring.', features: ['10-gauge steel door', '3-point lock', 'CCTV prep'], fromPrice: 4400 },
  ]
  writeTable('custombuilds', seed.map((b, i) => ({ id: uid('cb'), ...b, photo: '', sortOrder: i + 1, active: true })))
  console.log('Seeded custom builds catalog (5 products)')
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
// containers.csv `photos` keeps one slot per shot (index 0–7 = the 8-shot
// standard, 8 = AI render, 9+ = extras), so field app, marketplace gallery,
// and admin stay aligned.

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

// ── AI 3D render ("image 9") ──────────────────────────────
// Stitches the 8 documentation shots into one photorealistic hero render of
// the actual container using Google's Gemini image model. Requires
// GEMINI_API_KEY on the server; the model is overridable via GEMINI_IMAGE_MODEL.

const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'
const SHOT_NAMES = [
  'front doors closed', 'front doors open', 'right hand side', 'back',
  'left hand side', 'inside back', 'inside looking out', 'stock number sticker',
]

async function generateRender(container) {
  if (!GEMINI_KEY) return { error: 'AI rendering is not configured — set GEMINI_API_KEY on the API server' }
  const photos = Array.isArray(container.photos) ? container.photos : []
  const shots = photos.slice(0, PHOTO_TARGET)
  if (shots.filter(Boolean).length < PHOTO_TARGET) {
    return { error: `All ${PHOTO_TARGET} documentation shots are required before rendering` }
  }
  const parts = []
  for (let i = 0; i < PHOTO_TARGET; i++) {
    const file = basename(String(shots[i]).replace(/^\/photos\//, ''))
    const full = join(PHOTO_DIR, file)
    if (!existsSync(full)) return { error: `Photo file missing for shot ${i + 1} (${SHOT_NAMES[i]})` }
    const ext = file.split('.').pop().toLowerCase()
    parts.push({ text: `Photo ${i + 1} — ${SHOT_NAMES[i]}:` })
    parts.push({ inline_data: { mime_type: PHOTO_MIME[ext] || 'image/jpeg', data: readFileSync(full).toString('base64') } })
  }
  parts.push({
    text: `These ${PHOTO_TARGET} photos document one real shipping container (${container.size || ''} ${container.color || ''}, SKU ${container.sku}). ` +
      'Stitch them into ONE photorealistic three-quarter hero render of this exact container — front doors and right side visible, slightly elevated camera, ' +
      'clean white studio background with a soft ground shadow. Faithfully preserve the true paint color, weathering, dents, rust, decals, markings, and door hardware ' +
      'visible in the photos. Do not add text, logos, watermarks, or props. Return a single image.',
  })
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts }] }),
      },
    )
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '')
      console.warn(`Gemini render failed (${resp.status}): ${detail.slice(0, 300)}`)
      return { error: `AI render service error (${resp.status})` }
    }
    const data = await resp.json()
    const outParts = data?.candidates?.[0]?.content?.parts || []
    const img = outParts.find(p => p.inlineData?.data || p.inline_data?.data)
    if (!img) return { error: 'AI render returned no image — try again' }
    const b64 = img.inlineData?.data || img.inline_data.data
    const mime = img.inlineData?.mimeType || img.inline_data?.mime_type || 'image/png'
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
    mkdirSync(PHOTO_DIR, { recursive: true })
    const fname = `${container.sku}-render-${Date.now().toString(36)}.${ext}`
    writeFileSync(join(PHOTO_DIR, fname), Buffer.from(b64, 'base64'))
    return { url: `/photos/${fname}` }
  } catch (e) {
    console.warn('Gemini render failed:', e.message)
    return { error: 'Could not reach the AI render service' }
  }
}

// Fire-and-forget render once the 8th shot lands (called from the photo
// upload route). Re-reads the table on completion so concurrent uploads
// that landed while the render was generating are not clobbered.
function triggerAutoRender(containerId) {
  ;(async () => {
    const containers = readTable('containers')
    const c = containers.find(x => x.id === containerId)
    if (!c) return
    const result = await generateRender(c)
    if (result.error) { console.warn(`Auto-render skipped for ${c.sku}: ${result.error}`); return }
    const fresh = readTable('containers')
    const idx = fresh.findIndex(x => x.id === containerId)
    if (idx === -1) return
    const photos = Array.isArray(fresh[idx].photos) ? [...fresh[idx].photos] : []
    while (photos.length <= RENDER_SLOT) photos.push('')
    photos[RENDER_SLOT] = result.url
    fresh[idx] = { ...fresh[idx], photos, has360: true }
    writeTable('containers', fresh)
    console.log(`Auto-rendered 3D view for ${fresh[idx].sku}`)
  })().catch(e => console.warn('Auto-render failed:', e.message))
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

async function handleRequest(req, res) {
  const method = req.method || 'GET'
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const path = url.pathname
  const seg = path.split('/').filter(Boolean) // e.g. ['containers','ctr_1','reserve']

  if (method === 'OPTIONS') return send(res, 204, {})

  // Uptime probe for the hosting platform — no auth, no data access.
  if (path === '/health' && method === 'GET') return send(res, 200, { ok: true })

  try {
    // ── Static photo files (public — marketplace guests see listings) ──
    if (seg[0] === 'photos' && seg.length === 2 && method === 'GET') {
      const file = basename(seg[1]) // basename() blocks path traversal
      const full = join(PHOTO_DIR, file)
      if (!existsSync(full)) return send(res, 404, { message: 'Photo not found' })
      const ext = file.split('.').pop().toLowerCase()
      res.writeHead(200, {
        'Content-Type': PHOTO_MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      })
      return res.end(readFileSync(full))
    }

    // Resolve the signed-in user (if any) once for the whole request.
    const user = currentUser(req)
    const denied = (status = 401, message = 'Sign in required') => send(res, status, { message })
    const hasRole = (...roles) => !!user && roles.includes(user.role)

    // ── Auth ──
    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = await readBody(req)
      const u = readTable('users').find(x =>
        (x.email || '').toLowerCase() === String(email || '').trim().toLowerCase() && x.active !== false)
      if (!u || !checkPassword(password || '', u.passwordHash)) {
        return send(res, 401, { message: 'Invalid email or password' })
      }
      return send(res, 200, { token: signToken(u.id), user: publicUser(u) })
    }

    // Customer self-registration (marketplace). Creates the login and links
    // (or creates) the customers.csv record by email.
    if (path === '/auth/register' && method === 'POST') {
      const body = await readBody(req)
      const email = String(body.email || '').trim().toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(email)) return send(res, 400, { message: 'A valid email is required' })
      if (!body.name || !String(body.name).trim()) return send(res, 400, { message: 'Name is required' })
      if (!body.password || String(body.password).length < 8) return send(res, 400, { message: 'Password must be at least 8 characters' })
      const users = readTable('users')
      if (users.some(u => (u.email || '').toLowerCase() === email)) {
        return send(res, 409, { message: 'An account with that email already exists — sign in instead' })
      }
      const customerId = upsertCustomerFromOrder({ customerEmail: email, customerName: String(body.name).trim(), customerPhone: body.phone || '' })
      const rec = {
        id: uid('usr'), email, passwordHash: hashPassword(body.password),
        role: 'customer', name: String(body.name).trim(), phone: body.phone || '',
        driverId: '', customerId, phoneVerified: false, active: true,
        createdAt: new Date().toISOString(),
      }
      users.push(rec)
      writeTable('users', users)
      queueMessage('email', email, 'Welcome to MVP Container',
        `Hi ${rec.name}, your MVP Container account is ready. Browse containers and order any time — you'll verify your mobile number at checkout.`,
        'user', rec.id)
      return send(res, 201, { token: signToken(rec.id), user: publicUser(rec) })
    }

    if (path === '/auth/me' && method === 'GET') {
      if (!user) return denied()
      return send(res, 200, { ...publicUser(user), twoFaVerified: twoFaVerified(user.id) })
    }

    // ── Two-factor: send + verify a 6-digit SMS code ──
    if (path === '/auth/2fa/send' && method === 'POST') {
      if (!user) return denied()
      const { phone } = await readBody(req)
      const cleaned = String(phone || user.phone || '').trim()
      if (cleaned.replace(/\D/g, '').length < 10) return send(res, 400, { message: 'A valid mobile number is required' })
      const code = String(randomInt(100000, 1000000))
      twoFactor.set(user.id, { code, phone: cleaned, expires: Date.now() + TWOFA_CODE_TTL, verifiedAt: null })
      queueMessage('sms', cleaned, 'Verification code',
        `Your MVP Container verification code is ${code}. It expires in 10 minutes.`, 'user', user.id)
      // Dev convenience: no real SMS gateway, so surface the code to the client.
      return send(res, 200, { sent: true, devCode: code })
    }
    if (path === '/auth/2fa/verify' && method === 'POST') {
      if (!user) return denied()
      const { code } = await readBody(req)
      const rec = twoFactor.get(user.id)
      if (!rec || Date.now() > rec.expires) return send(res, 400, { message: 'Code expired — request a new one' })
      if (String(code || '').trim() !== rec.code) return send(res, 400, { message: 'Incorrect code — check the text and try again' })
      rec.verifiedAt = Date.now()
      // Persist the verified mobile number on the account.
      const users = readTable('users')
      const i = users.findIndex(u => u.id === user.id)
      if (i !== -1) {
        users[i] = { ...users[i], phone: rec.phone, phoneVerified: true }
        writeTable('users', users)
      }
      return send(res, 200, { verified: true })
    }

    // ── Users (admin-managed accounts) ──
    if (seg[0] === 'users') {
      if (!hasRole('admin')) return denied(user ? 403 : 401, user ? 'Admin access required' : 'Sign in required')
      const users = readTable('users')
      if (seg.length === 1 && method === 'GET') return send(res, 200, users.map(publicUser))
      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        const email = String(body.email || '').trim().toLowerCase()
        if (!/^\S+@\S+\.\S+$/.test(email)) return send(res, 400, { message: 'A valid email is required' })
        if (users.some(u => (u.email || '').toLowerCase() === email)) return send(res, 409, { message: 'Email already in use' })
        if (!body.password || String(body.password).length < 8) return send(res, 400, { message: 'Password must be at least 8 characters' })
        const rec = {
          id: uid('usr'), email, passwordHash: hashPassword(body.password),
          role: ['admin', 'driver', 'customer'].includes(body.role) ? body.role : 'customer',
          name: body.name || email, phone: body.phone || '',
          driverId: body.driverId || '', customerId: body.customerId || '',
          phoneVerified: false, active: true, createdAt: new Date().toISOString(),
        }
        users.push(rec)
        writeTable('users', users)
        return send(res, 201, publicUser(rec))
      }
      const idx = users.findIndex(u => u.id === seg[1])
      if (idx === -1) return send(res, 404, { message: 'User not found' })
      if (seg.length === 2 && method === 'PATCH') {
        const body = await readBody(req)
        const patch = {}
        if (body.name != null) patch.name = body.name
        if (body.phone != null) patch.phone = body.phone
        if (body.driverId != null) patch.driverId = body.driverId
        if (['admin', 'driver', 'customer'].includes(body.role)) patch.role = body.role
        if (body.active != null) patch.active = body.active === true
        if (body.password) {
          if (String(body.password).length < 8) return send(res, 400, { message: 'Password must be at least 8 characters' })
          patch.passwordHash = hashPassword(body.password)
        }
        users[idx] = { ...users[idx], ...patch, id: users[idx].id }
        writeTable('users', users)
        return send(res, 200, publicUser(users[idx]))
      }
      // Soft delete — deactivate (self-deactivation blocked so admin can't lock themselves out).
      if (seg.length === 2 && method === 'DELETE') {
        if (users[idx].id === user.id) return send(res, 400, { message: 'You cannot deactivate your own account' })
        users[idx] = { ...users[idx], active: false }
        writeTable('users', users)
        return send(res, 200, { id: users[idx].id, archived: true })
      }
    }

    // ── Outbox (sent email/SMS log — admin only) ──
    if (path === '/outbox' && method === 'GET') {
      if (!hasRole('admin')) return denied(user ? 403 : 401, user ? 'Admin access required' : 'Sign in required')
      return send(res, 200, [...readTable('outbox')].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
    }

    // ── Containers ──
    if (seg[0] === 'containers') {
      const containers = readTable('containers')

      if (seg.length === 1 && method === 'GET') return send(res, 200, containers)

      if (seg.length === 1 && method === 'POST') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
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
          // Factory condition (new/used) — orthogonal to grade and listingType:
          // both new and used units can be listed to buy, rent, or both.
          condition: ['new', 'used'].includes(body.condition) ? body.condition : 'used',
          color: body.color || '',
          // New containers start as draft — awaiting field photo documentation.
          status: body.status || 'draft',
          // How the unit may be transacted: 'buy', 'rent', or 'both'.
          listingType: ['buy', 'rent', 'both'].includes(body.listingType) ? body.listingType : 'both',
          buyPrice,
          // Acquisition cost — what we paid the depot for the unit (COGS).
          purchaseCost: body.purchaseCost != null ? Number(body.purchaseCost) : 0,
          // Field-scored condition 1–5 (0 = not yet inspected).
          conditionScore: body.conditionScore != null ? Number(body.conditionScore) : 0,
          // Buy-only units carry no rent rate; otherwise default to an estimate.
          rentMonthly: body.listingType === 'buy' ? (body.rentMonthly != null ? Number(body.rentMonthly) : null)
            : body.rentMonthly != null ? Number(body.rentMonthly) : estimateRent(buyPrice),
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
        if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Admin or driver access required')
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        const body = await readBody(req)
        containers[idx] = withPhotoPromotion({ ...containers[idx], ...body, id: containers[idx].id })
        writeTable('containers', containers)
        // Setting/altering the custom-build ETA syncs the customer's order and
        // notifies them (their portal shows the expected completion date).
        if (body.customEta !== undefined) {
          const orders = readTable('orders')
          const oi = orders.findIndex(o => (o.containerId === containers[idx].id || o.containerSku === containers[idx].sku) && o.status === 'custom_in_progress')
          if (oi !== -1) {
            orders[oi] = { ...orders[oi], scheduledDate: body.customEta || null }
            writeTable('orders', orders)
            if (body.customEta) {
              const o = orders[oi]
              const nice = String(body.customEta).slice(0, 10)
              queueMessage('email', o.customerEmail, `Your custom build — estimated completion ${nice}`,
                `Good news! Your ${containers[idx].customBuildName || 'custom container'} (${o.containerSku}) is in the shop. Estimated completion: ${nice}. We'll schedule delivery as soon as it's ready.`,
                'order', o.id)
              const cust = readTable('customers').find(c => c.id === o.customerId)
              if (cust?.notifySms && o.customerPhone) {
                queueMessage('sms', o.customerPhone, 'Custom build update',
                  `MVP Container: your ${o.containerSku} custom build is estimated complete ${nice}.`, 'order', o.id)
              }
            }
          }
        }
        return send(res, 200, containers[idx])
      }

      if (seg.length === 2 && method === 'DELETE') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
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
        if (!user) return denied()
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        containers[idx].status = 'sale_in_progress'
        writeTable('containers', containers)
        const lockExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
        return send(res, 200, { lockExpiresAt })
      }

      // Upload one shot into a photo slot (0–7 = the 8-shot standard; 8 = the
      // AI render; 9+ = extras like proof-of-delivery). Field drivers
      // document, admin fixes. When the 8th shot lands, the AI render is
      // generated automatically in the background.
      if (seg.length === 3 && seg[2] === 'photos' && method === 'POST') {
        if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Admin or driver access required')
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        const body = await readBody(req)
        const slot = Number(body.slot)
        if (!Number.isInteger(slot) || slot < 0 || slot > 23) return send(res, 400, { message: 'slot must be 0–23' })
        const saved = savePhoto(containers[idx].sku, slot, body.dataUrl)
        if (saved.error) return send(res, 400, { message: saved.error })
        const photos = Array.isArray(containers[idx].photos) ? [...containers[idx].photos] : []
        while (photos.length <= slot) photos.push('')
        photos[slot] = saved.url
        containers[idx] = withPhotoPromotion({
          ...containers[idx],
          photos,
          photoCount: photos.slice(0, PHOTO_TARGET).filter(Boolean).length,
          inspectorName: body.inspectorName || containers[idx].inspectorName,
          inspectedAt: new Date().toISOString(),
        })
        writeTable('containers', containers)
        // Full 8-shot set just completed and no render exists yet → stitch one.
        if (slot < PHOTO_TARGET && !photos[RENDER_SLOT] && GEMINI_KEY
            && photos.slice(0, PHOTO_TARGET).filter(Boolean).length === PHOTO_TARGET) {
          triggerAutoRender(containers[idx].id)
        }
        return send(res, 200, containers[idx])
      }

      // Generate (or regenerate) the AI-stitched 3D render into slot 8.
      if (seg.length === 3 && seg[2] === 'render' && method === 'POST') {
        if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Admin or driver access required')
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        const result = await generateRender(containers[idx])
        if (result.error) return send(res, 422, { message: result.error })
        const photos = Array.isArray(containers[idx].photos) ? [...containers[idx].photos] : []
        while (photos.length <= RENDER_SLOT) photos.push('')
        photos[RENDER_SLOT] = result.url
        containers[idx] = { ...containers[idx], photos, has360: true }
        writeTable('containers', containers)
        return send(res, 200, containers[idx])
      }

      // Remove the photo in a slot (admin review/fix).
      if (seg.length === 4 && seg[2] === 'photos' && method === 'DELETE') {
        if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Admin or driver access required')
        if (idx === -1) return send(res, 404, { message: 'Container not found' })
        const slot = Number(seg[3])
        const photos = Array.isArray(containers[idx].photos) ? [...containers[idx].photos] : []
        if (!Number.isInteger(slot) || slot < 0 || slot >= photos.length) return send(res, 400, { message: 'Invalid slot' })
        photos[slot] = ''
        while (photos.length && !photos[photos.length - 1]) photos.pop() // trim trailing blanks
        containers[idx] = {
          ...containers[idx],
          photos,
          photoCount: photos.slice(0, PHOTO_TARGET).filter(Boolean).length,
          ...(slot === RENDER_SLOT ? { has360: false } : {}),
        }
        writeTable('containers', containers)
        return send(res, 200, containers[idx])
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

      if (seg.length === 1 && method === 'GET') {
        if (!user) return denied()
        // Admin + drivers see everything; customers only their own orders.
        if (hasRole('admin', 'driver')) return send(res, 200, orders)
        const mine = orders.filter(o => (o.customerEmail || '').toLowerCase() === user.email.toLowerCase())
        return send(res, 200, mine)
      }

      if (seg.length === 1 && method === 'POST') {
        // Checkout requires a signed-in account, and customers must have
        // completed SMS two-factor within the last 15 minutes — on the first
        // order and on every subsequent order.
        if (!user) return denied(401, 'Sign in to complete your order')
        if (user.role === 'customer' && !twoFaVerified(user.id)) {
          return send(res, 403, { message: 'Verify your mobile number to place this order', code: 'twofa_required' })
        }
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
        // Confirmation email (mandatory) + text (if the customer opted in).
        queueMessage('email', record.customerEmail,
          `Order ${record.orderNumber} confirmed — ${record.containerSku}`,
          `Thanks ${record.customerName || 'for your order'}! We've reserved ${record.containerSku} (${record.saleType === 'rent' ? 'rental' : 'purchase'}, $${record.amount.toLocaleString()}). Our team will confirm delivery to ${record.deliveryAddress} and finalize payment within 2 hours.`,
          'order', record.id)
        if (body.notifySms === true && record.customerPhone) {
          queueMessage('sms', record.customerPhone, 'Order confirmed',
            `MVP Container: order ${record.orderNumber} (${record.containerSku}) confirmed. We'll text delivery updates to this number.`,
            'order', record.id)
        }
        return send(res, 201, record)
      }

      const id = seg[1]
      const idx = orders.findIndex(o => o.id === id || o.orderNumber === id)

      if (seg.length === 2 && method === 'GET') {
        if (!user) return denied()
        if (idx === -1) return send(res, 404, { message: 'Order not found' })
        if (!hasRole('admin', 'driver') && (orders[idx].customerEmail || '').toLowerCase() !== user.email.toLowerCase()) {
          return denied(403, 'Not your order')
        }
        return send(res, 200, orders[idx])
      }

      // ── Custom-build stage machine (admin) ──
      // estimate_requested → estimate_in_progress → estimate_sent (amount set,
      // approval happens over the phone) → estimate_approved →
      // custom_in_progress (build ETA) → sold → normal delivery pipeline.
      // Each transition syncs the container and notifies the customer.
      if (seg.length === 3 && seg[2] === 'custom-stage' && method === 'POST') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
        if (idx === -1) return send(res, 404, { message: 'Order not found' })
        const body = await readBody(req)
        const STAGES = ['estimate_in_progress', 'estimate_sent', 'estimate_approved', 'custom_in_progress']
        if (!STAGES.includes(body.stage)) return send(res, 400, { message: `stage must be one of ${STAGES.join(', ')}` })
        const amount = Number(body.amount)
        if (body.stage === 'estimate_sent' && !(amount > 0)) return send(res, 400, { message: 'A positive estimate amount is required' })
        orders[idx] = {
          ...orders[idx],
          status: body.stage,
          ...(body.stage === 'estimate_sent' ? { amount } : {}),
        }
        writeTable('orders', orders)
        const o = orders[idx]
        // Mirror the stage (and settled price) onto the pipeline container.
        const containers = readTable('containers')
        const ci = containers.findIndex(c => c.id === o.containerId || c.sku === o.containerSku)
        if (ci !== -1) {
          containers[ci] = { ...containers[ci], status: body.stage, ...(body.stage === 'estimate_sent' ? { buyPrice: amount } : {}) }
          writeTable('containers', containers)
        }
        const buildName = (ci !== -1 && containers[ci].customBuildName) || 'custom build'
        const cust = readTable('customers').find(c => c.id === o.customerId)
        const sms = (subject, text) => { if (cust?.notifySms && o.customerPhone) queueMessage('sms', o.customerPhone, subject, text, 'order', o.id) }
        if (body.stage === 'estimate_in_progress') {
          queueMessage('email', o.customerEmail, `We're preparing your estimate — ${buildName}`,
            `Hi ${o.customerName}, our team is working up your ${buildName} estimate (${o.containerSku}). Expect a call at ${o.customerPhone || 'your number'} to walk through the details.`,
            'order', o.id)
        } else if (body.stage === 'estimate_sent') {
          queueMessage('email', o.customerEmail, `Your estimate — ${buildName}: $${amount.toLocaleString()}`,
            `Hi ${o.customerName}, your ${buildName} (${o.containerSku}) estimate is $${amount.toLocaleString()}, delivery included. We'll call to walk through it — approval happens right on the call.`,
            'order', o.id)
          sms('Estimate ready', `MVP Container: your ${buildName} estimate is $${amount.toLocaleString()}. We'll call to review and confirm.`)
        } else if (body.stage === 'estimate_approved') {
          queueMessage('email', o.customerEmail, `Estimate approved — ${buildName} ($${(o.amount || 0).toLocaleString()})`,
            `Great news ${o.customerName} — your ${buildName} (${o.containerSku}) estimate of $${(o.amount || 0).toLocaleString()} is approved. We're scheduling fabrication and will send your build completion date next.`,
            'order', o.id)
          sms('Estimate approved', `MVP Container: ${o.containerSku} approved at $${(o.amount || 0).toLocaleString()}. Build date coming soon.`)
        } else if (body.stage === 'custom_in_progress') {
          queueMessage('email', o.customerEmail, `Fabrication started — ${buildName}`,
            `Your ${buildName} (${o.containerSku}) is in the shop! We'll send the estimated completion date as soon as it's scheduled.`,
            'order', o.id)
        }
        return send(res, 200, o)
      }

      // Admin edits (e.g. moving a finished custom build to 'sold' so it
      // enters the normal approve → assign-driver delivery pipeline).
      if (seg.length === 2 && method === 'PATCH') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
        if (idx === -1) return send(res, 404, { message: 'Order not found' })
        const body = await readBody(req)
        orders[idx] = { ...orders[idx], ...body, id: orders[idx].id }
        writeTable('orders', orders)
        return send(res, 200, orders[idx])
      }

      if (seg.length === 3 && seg[2] === 'assign-driver' && method === 'POST') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
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
        // Notify the customer their delivery is scheduled (email + opted-in SMS).
        const o = orders[idx]
        const when = o.scheduledDate ? ` on ${String(o.scheduledDate).slice(0, 10)}` : ''
        queueMessage('email', o.customerEmail, `Delivery scheduled — ${o.containerSku}`,
          `${driver.name} will deliver ${o.containerSku}${when} to ${o.deliveryAddress}. You'll get a text when the driver is on the way.`,
          'order', o.id)
        const cust = readTable('customers').find(c => c.id === o.customerId)
        if (cust?.notifySms && o.customerPhone) {
          queueMessage('sms', o.customerPhone, 'Delivery scheduled',
            `MVP Container: ${o.containerSku} delivery scheduled${when}. Driver: ${driver.name}.`, 'order', o.id)
        }
        return send(res, 200, orders[idx])
      }

      if (seg.length === 3 && seg[2] === 'delivered' && method === 'POST') {
        if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Admin or driver access required')
        if (idx === -1) return send(res, 404, { message: 'Order not found' })
        orders[idx] = { ...orders[idx], status: 'delivered', completedAt: new Date().toISOString() }
        writeTable('orders', orders)
        const o = orders[idx]
        queueMessage('email', o.customerEmail, `Delivered — ${o.containerSku} · receipt`,
          `Your container ${o.containerSku} was delivered. Amount: $${(o.amount || 0).toLocaleString()} (${o.saleType === 'rent' ? 'rental' : 'purchase'}). Thanks for choosing MVP Container!`,
          'order', o.id)
        return send(res, 200, orders[idx])
      }
    }

    // ── Drivers ──
    if (seg[0] === 'drivers') {
      const drivers = readTable('drivers')
      if (seg.length === 1 && method === 'GET') {
        // Staff see full records; customers/guests get a sanitized subset
        // (enough for "message your driver" pickers — no wages/addresses).
        if (hasRole('admin', 'driver')) return send(res, 200, drivers)
        return send(res, 200, drivers.map(d => ({
          id: d.id, driverCode: d.driverCode, name: d.name, initials: d.initials,
          vehicle: d.vehicle, status: d.status, colorHex: d.colorHex, active: d.active,
        })))
      }

      if (seg.length === 1 && method === 'POST') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
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
        if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Staff access required')
        return idx !== -1 ? send(res, 200, drivers[idx]) : send(res, 404, { message: 'Driver not found' })
      }
      if (seg.length === 2 && method === 'PATCH') {
        // Admin can edit anyone; a driver may only edit their own record.
        if (!hasRole('admin') && !(hasRole('driver') && user.driverId === seg[1])) {
          return denied(user ? 403 : 401, 'Not allowed')
        }
        if (idx === -1) return send(res, 404, { message: 'Driver not found' })
        const body = await readBody(req)
        const oldName = drivers[idx].name
        drivers[idx] = { ...drivers[idx], ...body, id: drivers[idx].id }
        writeTable('drivers', drivers)
        // Open orders carry the driver's name as display text — keep them in
        // step on rename (delivered orders keep their historical snapshot).
        if (body.name && body.name !== oldName) {
          const orders = readTable('orders')
          let changed = false
          orders.forEach((o, i) => {
            if (o.driverId === drivers[idx].id && o.status !== 'delivered') {
              orders[i] = { ...o, driverName: drivers[idx].name }; changed = true
            }
          })
          if (changed) writeTable('orders', orders)
        }
        return send(res, 200, drivers[idx])
      }
      // Soft delete — keep the row (activity/order history intact), just deactivate.
      if (seg.length === 2 && method === 'DELETE') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
        if (idx === -1) return send(res, 404, { message: 'Driver not found' })
        drivers[idx] = { ...drivers[idx], active: false, status: 'off_duty' }
        writeTable('drivers', drivers)
        return send(res, 200, { id: drivers[idx].id, archived: true })
      }
    }

    // ── Customers (master list — CRUD from admin portal) ──
    if (seg[0] === 'customers') {
      const customers = readTable('customers')
      if (seg.length === 1 && method === 'GET') {
        if (!user) return denied()
        // Staff see everyone; a customer sees only their own record.
        if (hasRole('admin', 'driver')) return send(res, 200, customers)
        return send(res, 200, customers.filter(c => (c.email || '').toLowerCase() === user.email.toLowerCase()))
      }

      if (seg.length === 1 && method === 'POST') {
        if (!user) return denied()
        const body = await readBody(req)
        // Customers may only create their own profile (email is forced to theirs).
        if (!hasRole('admin')) body.email = user.email
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
        if (!user) return denied()
        if (idx === -1) return send(res, 404, { message: 'Customer not found' })
        if (!hasRole('admin', 'driver') && (customers[idx].email || '').toLowerCase() !== user.email.toLowerCase()) {
          return denied(403, 'Not your profile')
        }
        return send(res, 200, customers[idx])
      }
      if (seg.length === 2 && method === 'PATCH') {
        if (!user) return denied()
        if (idx === -1) return send(res, 404, { message: 'Customer not found' })
        // Admin edits anyone; a customer may only edit their own record (and can't change its email).
        const own = (customers[idx].email || '').toLowerCase() === user.email.toLowerCase()
        if (!hasRole('admin') && !own) return denied(403, 'Not your profile')
        const body = await readBody(req)
        if (!hasRole('admin')) delete body.email
        const oldName = customers[idx].name
        customers[idx] = { ...customers[idx], ...body, id: customers[idx].id, notifyEmail: true }
        writeTable('customers', customers)
        // Open orders + scheduled jobs show the customer's name — cascade
        // renames so admin, field app, and profile views all agree.
        if (body.name && body.name !== oldName) {
          const orders = readTable('orders')
          let oChanged = false
          orders.forEach((o, i) => {
            if (o.customerId === customers[idx].id && o.status !== 'delivered') {
              orders[i] = { ...o, customerName: customers[idx].name }; oChanged = true
            }
          })
          if (oChanged) writeTable('orders', orders)
          const sched = readTable('schedule')
          let sChanged = false
          sched.forEach((s, i) => {
            const next = { ...s }
            if (next.customer === oldName) { next.customer = customers[idx].name; sChanged = true }
            if (next.origin === oldName) { next.origin = customers[idx].name; sChanged = true }
            if (next.destination === oldName) { next.destination = customers[idx].name; sChanged = true }
            sched[i] = next
          })
          if (sChanged) writeTable('schedule', sched)
        }
        return send(res, 200, customers[idx])
      }
      // Soft delete — keep the row (order history intact), just deactivate.
      if (seg.length === 2 && method === 'DELETE') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
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
        if (!user) return denied()
        const driverId = url.searchParams.get('driverId')
        let list = driverId ? messages.filter(m => m.toDriverId === driverId) : messages
        // Customers only see their own conversations (by email).
        if (!hasRole('admin', 'driver')) {
          const em = user.email.toLowerCase()
          list = list.filter(m => (m.toEmail || '').toLowerCase() === em || (m.fromEmail || '').toLowerCase() === em)
        }
        return send(res, 200, [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
      }

      if (seg.length === 1 && method === 'POST') {
        if (!user) return denied()
        const body = await readBody(req)
        if (!body.toDriverId) return send(res, 400, { message: 'toDriverId is required' })
        const record = {
          id: uid('msg'),
          fromRole: ['admin', 'customer', 'driver'].includes(body.fromRole) ? body.fromRole : 'admin',
          fromName: body.fromName || 'MVP Container',
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
        // Messages to customers also go out as real email/SMS (per their prefs).
        if (record.toRole === 'customer' && record.toEmail) {
          queueMessage('email', record.toEmail, record.subject, record.body, 'message', record.id)
          const cust = readTable('customers').find(c => (c.email || '').toLowerCase() === record.toEmail.toLowerCase())
          if (cust?.notifySms && cust.phone) {
            queueMessage('sms', cust.phone, record.subject, `MVP Container (${record.fromName}): ${record.body}`.slice(0, 300), 'message', record.id)
          }
        }
        return send(res, 201, record)
      }

      // DELETE /messages?driverId=drv_01&trashed=true → empty that driver's trash.
      if (seg.length === 1 && method === 'DELETE') {
        if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Staff access required')
        const driverId = url.searchParams.get('driverId')
        const kept = messages.filter(m => !(m.trashed && (!driverId || m.toDriverId === driverId)))
        const removed = messages.length - kept.length
        writeTable('messages', kept)
        return send(res, 200, { emptied: true, removed })
      }

      const id = seg[1]
      const idx = messages.findIndex(m => m.id === id)

      if (seg.length === 2 && method === 'PATCH') {
        if (!user) return denied()
        if (idx === -1) return send(res, 404, { message: 'Message not found' })
        const body = await readBody(req)
        messages[idx] = { ...messages[idx], ...body, id: messages[idx].id }
        writeTable('messages', messages)
        return send(res, 200, messages[idx])
      }
      if (seg.length === 2 && method === 'DELETE') {
        if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Staff access required')
        if (idx === -1) return send(res, 404, { message: 'Message not found' })
        const [removed] = messages.splice(idx, 1)
        writeTable('messages', messages)
        return send(res, 200, { id: removed.id, deleted: true })
      }
    }

    // ── Activity log (field pickups/returns + photo sessions) ──
    if (seg[0] === 'activity') {
      if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Staff access required')
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

      if (seg.length === 1 && method === 'GET') {
        // Staff see the full record; shoppers get a sanitized list (no yard
        // address or attendant contact) so the marketplace can filter by depot.
        if (hasRole('admin', 'driver')) return send(res, 200, depots)
        return send(res, 200, depots.map(d => ({ id: d.id, name: d.name, destination: d.destination || '', code: d.code })))
      }

      if (seg.length === 1 && method === 'POST') {
        if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')
        const body = await readBody(req)
        if (!body.name) return send(res, 400, { message: 'name is required' })
        const record = {
          id: uid('dep'),
          name: body.name,
          // Delivery market the depot serves, e.g. "Atlanta, GA".
          destination: body.destination || '',
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
      if (seg.length === 2 && !hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')

      if (seg.length === 2 && method === 'PATCH') {
        if (idx === -1) return send(res, 404, { message: 'Depot not found' })
        const body = await readBody(req)
        const oldName = depots[idx].name
        depots[idx] = { ...depots[idx], ...body, id: depots[idx].id }
        writeTable('depots', depots)
        // Containers and the schedule reference depots by name/address strings —
        // cascade renames so admin, field app, and marketplace stay in sync.
        const { name: newName, address: newAddress } = depots[idx]
        if (newName !== oldName) {
          const containers = readTable('containers')
          let changed = false
          containers.forEach((c, i) => {
            if (c.depotLocation === oldName) { containers[i] = { ...c, depotLocation: newName }; changed = true }
          })
          if (changed) writeTable('containers', containers)
        }
        if (newName !== oldName || body.address !== undefined) {
          const sched = readTable('schedule')
          let changed = false
          sched.forEach((s, i) => {
            const next = { ...s }
            if (next.origin === oldName) { next.origin = newName; next.originAddress = newAddress; changed = true }
            else if (next.origin === newName && body.address !== undefined) { next.originAddress = newAddress; changed = true }
            if (next.destination === oldName) { next.destination = newName; next.destinationAddress = newAddress; changed = true }
            else if (next.destination === newName && body.address !== undefined) { next.destinationAddress = newAddress; changed = true }
            sched[i] = next
          })
          if (changed) writeTable('schedule', sched)
        }
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
      if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Staff access required')
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
      if (!hasRole('admin', 'driver')) return denied(user ? 403 : 401, 'Staff access required')
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

    // ── Custom builds (marketplace catalog · admin-managed) ──
    if (seg[0] === 'custombuilds') {
      const builds = readTable('custombuilds')

      // Public list — shoppers see active builds; admins also see inactive ones.
      if (seg.length === 1 && method === 'GET') {
        const list = [...builds].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        return send(res, 200, hasRole('admin') ? list : list.filter(b => b.active !== false))
      }

      // ── Request an estimate for a custom build. Open to guests — no login
      // required; pricing is agreed over the phone, so name + phone + email
      // are enough. Creates the pipeline container (status estimate_requested,
      // shown in admin "Custom Orders") plus the customer's order row.
      if (seg.length === 3 && seg[2] === 'order' && method === 'POST') {
        const build = builds.find(b => b.id === seg[1] && b.active !== false)
        if (!build) return send(res, 404, { message: 'Custom build not found' })
        const body = await readBody(req)
        const email = (user?.email || String(body.customerEmail || '')).trim().toLowerCase()
        if (!/^\S+@\S+\.\S+$/.test(email)) return send(res, 400, { message: 'A valid email is required so we can send your estimate' })
        if (String(body.customerPhone || '').replace(/\D/g, '').length < 10) {
          return send(res, 400, { message: 'A valid phone number is required — estimates are confirmed by phone' })
        }
        const containers = readTable('containers')
        const size = ['20ft-std', '20ft-hc', '40ft-std', '40ft-hc'].includes(body.size) ? body.size : '20ft-std'
        // Custom fabrication happens at the Houston depot.
        const depotRow = readTable('depots').find(d => /houston/i.test(d.name)) || readTable('depots')[0]
        const skuCode = (depotRow?.code || 'SBX').toUpperCase()
        const sku = nextSku(size, skuCode, containers)
        // Price is settled by the estimate — fromPrice is only the reference floor.
        const amount = 0
        const record = {
          id: uid('ctr'), sku,
          guid: `${crypto.randomUUID?.() ?? uid('guid')}`,
          stockNumber: `STK-${sku.slice(-4)}`,
          size, grade: 'X', status: 'estimate_requested', listingType: 'buy',
          buyPrice: build.fromPrice, purchaseCost: 0, conditionScore: 0, rentMonthly: null,
          photos: [], photoCount: 0, has360: false,
          depotLocation: depotRow?.name || 'Houston Depot', bayNumber: '',
          inspectorName: '', inspectedAt: null, deliveryIncluded: true,
          createdAt: new Date().toISOString(),
          customEta: '', customBuildName: build.name,
        }
        containers.push(record)
        writeTable('containers', containers)
        const orders = readTable('orders')
        const nums = orders.map(o => Number(String(o.orderNumber).replace('ORD-', ''))).filter(n => !Number.isNaN(n))
        const customerId = upsertCustomerFromOrder({ ...body, customerEmail: email, customerName: body.customerName || user?.name || email })
        // Honor the SMS opt-in on existing customer records too (upsert only backfills blanks).
        if (body.notifySms === true) {
          const custs = readTable('customers')
          const ci2 = custs.findIndex(x => x.id === customerId)
          if (ci2 !== -1 && !custs[ci2].notifySms) {
            custs[ci2] = { ...custs[ci2], notifySms: true, phone: custs[ci2].phone || body.customerPhone || '' }
            writeTable('customers', custs)
          }
        }
        const order = {
          id: uid('ord'),
          orderNumber: `ORD-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`,
          containerId: record.id, containerSku: sku,
          customerId,
          customerName: body.customerName || user?.name || email,
          customerEmail: email,
          customerPhone: body.customerPhone || user?.phone || '',
          deliveryAddress: body.deliveryAddress || '', deliveryZip: body.deliveryZip || '',
          amount, status: 'estimate_requested',
          driverId: null, driverName: null, scheduledDate: null, completedAt: null,
          createdAt: new Date().toISOString(),
          saleType: 'buy', unitCost: 0, deposit: 0, driverHours: 0,
        }
        orders.push(order)
        writeTable('orders', orders)
        queueMessage('email', order.customerEmail, `Estimate requested — ${build.name} (${order.orderNumber})`,
          `Thanks ${order.customerName}! We received your estimate request for a ${build.name} (${sku}, base from $${build.fromPrice.toLocaleString()}). Our team will call ${order.customerPhone || 'you'} to walk through the specs and send your estimate.`,
          'order', order.id)
        if (body.notifySms === true && order.customerPhone) {
          queueMessage('sms', order.customerPhone, 'Estimate requested',
            `MVP Container: got your ${build.name} estimate request (${sku}). Expect a call from our team shortly.`, 'order', order.id)
        }
        return send(res, 201, { order, container: record })
      }

      if (!hasRole('admin')) return denied(user ? 403 : 401, 'Admin access required')

      if (seg.length === 1 && method === 'POST') {
        const body = await readBody(req)
        if (!body.name || !String(body.name).trim()) return send(res, 400, { message: 'name is required' })
        const record = {
          id: uid('cb'),
          name: String(body.name).trim(),
          tag: (body.tag || '').toUpperCase(),
          description: body.description || '',
          features: Array.isArray(body.features) ? body.features.map(f => String(f).replace(/\|/g, '/')) : [],
          fromPrice: Number(body.fromPrice) || 0,
          photo: '',
          sortOrder: builds.length ? Math.max(...builds.map(b => b.sortOrder || 0)) + 1 : 1,
          active: body.active !== false,
        }
        builds.push(record)
        writeTable('custombuilds', builds)
        return send(res, 201, record)
      }

      const idx = builds.findIndex(b => b.id === seg[1])
      if (idx === -1) return send(res, 404, { message: 'Custom build not found' })

      if (seg.length === 2 && method === 'PATCH') {
        const body = await readBody(req)
        if (Array.isArray(body.features)) body.features = body.features.map(f => String(f).replace(/\|/g, '/'))
        builds[idx] = { ...builds[idx], ...body, id: builds[idx].id }
        writeTable('custombuilds', builds)
        return send(res, 200, builds[idx])
      }

      if (seg.length === 2 && method === 'DELETE') {
        const [removed] = builds.splice(idx, 1)
        writeTable('custombuilds', builds)
        return send(res, 200, { id: removed.id, deleted: true })
      }

      // Upload the showcase photo (real product shot replaces the clipart).
      if (seg.length === 3 && seg[2] === 'photo' && method === 'POST') {
        const body = await readBody(req)
        const slug = builds[idx].name.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'build'
        const saved = savePhoto(`CB-${slug}`, 0, body.dataUrl)
        if (saved.error) return send(res, 400, { message: saved.error })
        builds[idx] = { ...builds[idx], photo: saved.url }
        writeTable('custombuilds', builds)
        return send(res, 200, builds[idx])
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
}

// Every route does a whole-file read-modify-write on its CSV table, so
// concurrent requests could interleave and silently lose updates (both read,
// then both write). Serialize handling — correctness over throughput for a
// CSV-backed dev API. handleRequest never rejects (it catches internally);
// the .catch here is a backstop so one failure can't wedge the chain.
let requestChain = Promise.resolve()
const server = createServer((req, res) => {
  requestChain = requestChain
    .then(() => handleRequest(req, res))
    .catch(err => {
      console.error('Unhandled request error:', err)
      try { send(res, 500, { message: 'Internal error' }) } catch { /* headers already sent */ }
    })
})

ensureSeedUsers()
ensureSeedCustomBuilds()

server.listen(PORT, () => {
  console.log(`MVP Container API (CSV-backed) listening on http://localhost:${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
  console.log(`Default admin: tgmoore@gmail.com / test1234`)
})
