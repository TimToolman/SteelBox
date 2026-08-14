// ============================================================
// MVP Container API — end-to-end smoke test
// Boots the real server against a throwaway copy of ./data and
// exercises the go-live flows: admin email-code 2FA login,
// password reset, checkout verification, the phone-payment
// order pipeline, driver assignment, and 3-way messaging.
//   node test.mjs
// Exits 0 on success, 1 with the failed assertion otherwise.
// ============================================================

import { spawn } from 'node:child_process'
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, scryptSync } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 4791
const BASE = `http://localhost:${PORT}`

const dataDir = mkdtempSync(join(tmpdir(), 'sbx-test-'))
cpSync(join(__dirname, 'data'), dataDir, { recursive: true })

// The repo users.csv sometimes gets committed from a live instance, carrying
// real (changed) password hashes — which would break every login below.
// Reset all accounts in the throwaway copy to the seed password.
{
  const salt = randomBytes(8).toString('hex')
  const seedHash = `${salt}$${scryptSync('test1234', salt, 32).toString('hex')}`
  const usersCsv = join(dataDir, 'users.csv')
  const rows = readFileSync(usersCsv, 'utf8').split(/\r?\n/)
  writeFileSync(usersCsv, rows.map((line, i) => {
    if (i === 0 || !line.trim()) return line
    const cols = line.split(',')
    cols[2] = seedHash // id,email,passwordHash,… — no quoted commas before col 2
    return cols.join(',')
  }).join('\n'))
}

const server = spawn(process.execPath, [join(__dirname, 'server.mjs')], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), SMTP_USER: '', SMTP_PASS: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', d => { serverLog += d })
server.stderr.on('data', d => { serverLog += d })

let failures = 0
let passes = 0
function check(name, cond, extra = '') {
  if (cond) { passes++; console.log(`  ✓ ${name}`) }
  else { failures++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  let json = null
  try { json = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body: json }
}

async function waitForBoot() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`server never came up.\n${serverLog}`)
}

try {
  await waitForBoot()

  // ── Admin login: two-step with emailed code ──
  console.log('Admin 2FA login')
  const l1 = await api('/auth/login', { method: 'POST', body: { email: 'tgmoore@gmail.com', password: 'test1234' } })
  check('password step returns twoFaRequired', l1.status === 200 && l1.body?.twoFaRequired === true)
  check('dev code surfaced without SMTP', typeof l1.body?.devCode === 'string' && l1.body.devCode.length === 6)
  const bad = await api('/auth/login/verify', { method: 'POST', body: { pendingToken: l1.body.pendingToken, code: '000000' } })
  check('wrong code rejected', bad.status === 400)
  const l2 = await api('/auth/login/verify', { method: 'POST', body: { pendingToken: l1.body.pendingToken, code: l1.body.devCode } })
  check('correct code returns a session', l2.status === 200 && !!l2.body?.token)
  check('seeded password flagged for change', l2.body?.user?.mustChangePassword === true)
  const admin = l2.body.token

  // ── Change password clears the nag ──
  const chg = await api('/auth/change-password', { method: 'POST', token: admin, body: { current: 'test1234', next: 'a-real-password-1' } })
  check('change-password works', chg.status === 200 && chg.body?.changed === true)
  const l3 = await api('/auth/login', { method: 'POST', body: { email: 'tgmoore@gmail.com', password: 'a-real-password-1' } })
  check('new password logs in (2FA step)', l3.status === 200 && l3.body?.twoFaRequired === true)

  // ── Customer register + password reset ──
  console.log('Customer auth')
  const reg = await api('/auth/register', { method: 'POST', body: { name: 'Test Buyer', email: 'buyer@test.dev', password: 'buyerpass1', phone: '5045550111' } })
  check('customer registers (no 2FA step)', reg.status === 201 && !!reg.body?.token)
  const customer = reg.body.token
  const forgot = await api('/auth/forgot', { method: 'POST', body: { email: 'buyer@test.dev' } })
  check('forgot returns dev code', forgot.status === 200 && !!forgot.body?.devCode)
  const reset = await api('/auth/reset', { method: 'POST', body: { email: 'buyer@test.dev', code: forgot.body.devCode, password: 'buyerpass2' } })
  check('reset sets new password', reset.status === 200)
  const relogin = await api('/auth/login', { method: 'POST', body: { email: 'buyer@test.dev', password: 'buyerpass2' } })
  check('customer login with reset password', relogin.status === 200 && !!relogin.body?.token)

  // ── Checkout: 2FA by email, order lands as pending_review ──
  console.log('Order pipeline')
  const containers = (await api('/containers')).body
  const unit = containers.find(c => c.status === 'available')
  check('an available container exists in seed data', !!unit)
  const tfa = await api('/auth/2fa/send', { method: 'POST', token: customer, body: { phone: '5045550111' } })
  check('checkout code sent via email channel', tfa.status === 200 && tfa.body?.channel === 'email' && !!tfa.body?.devCode)
  const tfaV = await api('/auth/2fa/verify', { method: 'POST', token: customer, body: { code: tfa.body.devCode } })
  check('checkout code verifies', tfaV.status === 200)
  const ord = await api('/orders', {
    method: 'POST', token: customer,
    body: { containerId: unit.id, containerSku: unit.sku, customerName: 'Test Buyer', customerEmail: 'buyer@test.dev', customerPhone: '5045550111', deliveryAddress: '1 Test Ln', deliveryZip: '70112', amount: unit.buyPrice, saleType: 'buy' },
  })
  check('order created as pending_review', ord.status === 201 && ord.body?.status === 'pending_review')
  const orderId = ord.body.id
  const outbox1 = (await api('/outbox', { token: admin })).body
  check('staff NEW ORDER email queued', outbox1.some(m => m.channel === 'email' && m.to.includes('tgmoore@gmail.com') && m.subject.startsWith('NEW ORDER')))
  check('customer confirmation email queued', outbox1.some(m => m.to === 'buyer@test.dev' && m.subject.includes('received')))

  // ── Review checklist: validated → called → paid → confirmed ──
  for (const step of ['validated', 'called']) {
    const r = await api(`/orders/${orderId}/review-step`, { method: 'POST', token: admin, body: { step } })
    check(`step ${step} recorded`, r.status === 200 && !!r.body?.[`${step === 'validated' ? 'validatedAt' : 'calledAt'}`])
  }
  const paid = await api(`/orders/${orderId}/review-step`, { method: 'POST', token: admin, body: { step: 'paid' } })
  check('paid → status confirmed', paid.status === 200 && paid.body?.status === 'confirmed' && !!paid.body?.paidAt)
  const unitAfter = (await api(`/containers/${unit.id}`)).body
  check('container marked sold after payment', unitAfter?.status === 'sold')

  // ── Assign driver: order updated + driver inbox message + notifications ──
  const drivers = (await api('/drivers', { token: admin })).body.filter(d => d.active !== false)
  const asg = await api(`/orders/${orderId}/assign-driver`, { method: 'POST', token: admin, body: { driverId: drivers[0].id, scheduledDate: '2026-07-20' } })
  check('driver assigned', asg.status === 200 && asg.body?.status === 'assigned' && asg.body?.driverName === drivers[0].name)
  const driverMsgs = (await api(`/messages?driverId=${drivers[0].id}`, { token: admin })).body
  check('driver got an inbox message about the job', driverMsgs.some(m => m.subject.startsWith('New delivery') && m.body.includes(unit.sku)))

  // ── Messaging: customer → admin (no driverId), admin reply → email queued ──
  console.log('Messaging')
  const cmsg = await api('/messages', { method: 'POST', token: customer, body: { fromRole: 'customer', fromName: 'Test Buyer', fromEmail: 'buyer@test.dev', toRole: 'admin', toName: 'Dispatch', subject: 'Where is my box?', body: 'Just checking in.' } })
  check('customer → admin message accepted without driverId', cmsg.status === 201)
  const outbox2 = (await api('/outbox', { token: admin })).body
  check('admin inbox notification email queued', outbox2.some(m => m.subject === '[Inbox] Where is my box?'))
  const reply = await api('/messages', { method: 'POST', token: admin, body: { fromRole: 'admin', fromName: 'Dispatch', toRole: 'customer', toName: 'Test Buyer', toEmail: 'buyer@test.dev', subject: 'Re: Where is my box?', body: 'On its way!' } })
  check('admin → customer reply accepted', reply.status === 201)
  const outbox3 = (await api('/outbox', { token: admin })).body
  check('customer reply email queued', outbox3.some(m => m.to === 'buyer@test.dev' && m.subject === 'Re: Where is my box?'))
  const custView = (await api('/messages', { token: customer })).body
  check('customer sees both sides of the thread', custView.some(m => m.subject === 'Where is my box?') && custView.some(m => m.subject === 'Re: Where is my box?'))

  // ── Damage-claim pipeline: supplier → inspection → estimate → shipper → sell as damaged ──
  console.log('Damage claims')
  const supLogin = await api('/auth/login', { method: 'POST', body: { email: 'supplier@oceanbox.co', password: 'test1234' } })
  check('supplier signs in', supLogin.status === 200 && !!supLogin.body?.token)
  const supplier = supLogin.body.token
  const shpLogin = await api('/auth/login', { method: 'POST', body: { email: 'shipper@meridianlines.com', password: 'test1234' } })
  check('shipper signs in', shpLogin.status === 200 && !!shpLogin.body?.token)
  const shipper = shpLogin.body.token

  // Give the supplier a unit, then file a claim against the seeded shipper.
  const dmgUnit = [...containers].reverse().find(c => c.status === 'available' && c.id !== unit.id) || containers[0]
  await api(`/containers/${dmgUnit.id}`, { method: 'PATCH', token: admin, body: { supplierId: 'sup_01' } })
  const shippers = (await api('/shippers', { token: supplier })).body
  const claim = await api('/claims', { method: 'POST', token: supplier, body: { containerId: dmgUnit.id, shipperId: shippers[0].id, vesselRef: 'MV-TEST-042', notes: 'Fork damage at transship' } })
  check('supplier files a claim (awaiting inspection)', claim.status === 201 && claim.body?.status === 'awaiting_inspection' && claim.body?.claimNumber?.startsWith('CLM-'))
  const claimId = claim.body.id

  // Field inspection: severity + move to estimate (driver-level access).
  const insp = await api(`/claims/${claimId}`, { method: 'PATCH', token: admin, body: { severity: 4, status: 'awaiting_estimate', inspectorName: 'Field Adjuster', inspectedAt: new Date().toISOString() } })
  check('inspection sets severity D·4', insp.status === 200 && insp.body?.severity === 4 && insp.body?.status === 'awaiting_estimate')

  // Supplier submits the estimate to the shipper.
  const estR = await api(`/claims/${claimId}`, { method: 'PATCH', token: supplier, body: { estimateAmount: 2400, estimateNotes: 'Rail + door frame', status: 'awaiting_shipper' } })
  check('estimate submitted to shipper', estR.status === 200 && estR.body?.estimateAmount === 2400)

  // Shipper sees it and rejects; supplier-only fields stay untouched.
  const shpView = (await api('/claims', { token: shipper })).body
  check('shipper sees the claim in their queue', shpView.some(c => c.id === claimId && c.status === 'awaiting_shipper'))
  const dec = await api(`/claims/${claimId}`, { method: 'PATCH', token: shipper, body: { shipperDecision: 'rejected', shipperNotes: 'Pre-existing wear', shipperDecidedAt: new Date().toISOString(), status: 'awaiting_decision', estimateAmount: 1 } })
  check('shipper decision recorded (estimate untouchable)', dec.status === 200 && dec.body?.shipperDecision === 'rejected' && dec.body?.estimateAmount === 2400)

  // Share with the shipper + audit trail + digest preference.
  const shr = await api(`/claims/${claimId}/share`, { method: 'POST', token: supplier, body: { mode: 'packet' } })
  check('estimate shared with shipper (packet email)', shr.status === 200 && !!shr.body?.sharedAt)
  const evs = JSON.parse(shr.body.events || '[]')
  check('audit timeline records the chain of custody', evs.length >= 4 && evs.some(e => e.text.includes('shared with')) && evs.some(e => e.text.includes('Damage inspected')))
  const outboxShare = (await api('/outbox', { token: admin })).body
  check('shipper share email queued with login link', outboxShare.some(m => m.to === 'shipper@meridianlines.com' && m.body.includes('/shipper?claim=')))
  const pref = await api('/auth/me', { method: 'PATCH', token: shipper, body: { digestFreq: 'weekly' } })
  check('digest preference saved', pref.status === 200 && pref.body?.digestFreq === 'weekly')

  // Supplier sells the unit as damaged: their own container, grade D.
  const sell = await api(`/containers/${dmgUnit.id}`, { method: 'PATCH', token: supplier, body: { grade: 'D', damageSeverity: 4, damagePhotos: [], condition: 'used', status: 'available' } })
  check('supplier lists own unit as damaged D·4', sell.status === 200 && sell.body?.grade === 'D' && sell.body?.damageSeverity === 4)
  const wrap = await api(`/claims/${claimId}`, { method: 'PATCH', token: supplier, body: { status: 'sell_as_damaged', decision: 'wholesale' } })
  check('claim closes as sell-as-damaged', wrap.status === 200 && wrap.body?.decision === 'wholesale')
  const other = containers.find(c => c.supplierId !== 'sup_01' && c.id !== dmgUnit.id)
  const denied2 = await api(`/containers/${other.id}`, { method: 'PATCH', token: supplier, body: { grade: 'D' } })
  check("supplier cannot touch another owner's unit", denied2.status === 403 || denied2.status === 401)

  // ── Cross-territory relay: territory config → relay order → two legs ──
  console.log('Territories & relay')
  const sellers = (await api('/sellers')).body
  const tset = await api(`/sellers/${sellers[0].id}`, { method: 'PATCH', token: admin, body: { territoryZips: '700-716,770-778' } })
  check('territory zones saved on seller', tset.status === 200 && tset.body?.territoryZips === '700-716,770-778')
  const mps = (await api('/meetpoints')).body
  check('meet points seeded & public-readable', Array.isArray(mps) && mps.length >= 2 && !!mps[0].zip)
  const relayUnit = [...containers].filter(c => c.status === 'available').slice(-3)[0]
  const rord = await api('/orders', {
    method: 'POST', token: admin,
    body: {
      containerId: relayUnit.id, containerSku: relayUnit.sku, customerName: 'Relay Buyer', customerEmail: 'relay@test.dev',
      deliveryAddress: '9 Peachtree St, Atlanta, GA', deliveryZip: '30318', amount: relayUnit.buyPrice, saleType: 'buy',
      crossTerritory: true, sellerToId: 'sel_demo', sellerToName: 'Demo Container Corp',
      meetPointId: mps[0].id, meetPointName: mps[0].name,
      relayFee: 980, relayLinehaul: 500, relayLastMile: 382, relayPlatform: 98,
      relayLinehaulMiles: 160, relayLastMiles: 140,
    },
  })
  check('relay order stores the fee split', rord.status === 201 && rord.body?.crossTerritory === true && rord.body?.relayFee === 980 && rord.body?.relayPlatform === 98)
  const schedBefore = (await api('/schedule', { token: admin })).body.length
  const rasg = await api(`/orders/${rord.body.id}/assign-driver`, { method: 'POST', token: admin, body: { driverId: drivers[0].id, scheduledDate: '2026-08-20' } })
  check('relay assign-driver succeeds', rasg.status === 200 && rasg.body?.status === 'assigned')
  const schedAfter = (await api('/schedule', { token: admin })).body
  const legs = schedAfter.filter(x => x.sku === relayUnit.sku && String(x.destination || '').includes(mps[0].name) || (x.sku === relayUnit.sku && String(x.origin || '').includes(mps[0].name)))
  check('two relay legs land on the schedule (transfer + delivery)', schedAfter.length === schedBefore + 2 && legs.length === 2 && legs.some(l => l.type === 'transfer') && legs.some(l => l.type === 'delivery'))

  // ── Reseller tenancy: a seller-scoped admin only sees their company ──
  console.log('Reseller tenancy')
  const sellerRows = (await api('/sellers')).body
  check('territory defaults seeded on both resellers', sellerRows.every(s => (s.territoryZips || '').length > 0))
  check('Demo Corp holds the Mobile-Nashville corridor', (sellerRows.find(s => s.id === 'sel_demo')?.territoryZips || '').includes('350-374'))
  const stations = (await api('/meetpoints')).body
  check('3 transfer stations seeded incl. Nashville', stations.length >= 3 && stations.some(m => m.name.includes('Nashville')))
  const rl1 = await api('/auth/login', { method: 'POST', body: { email: 'admin@mvpcontainer.com', password: 'test1234' } })
  const rl2 = await api('/auth/login/verify', { method: 'POST', body: { pendingToken: rl1.body?.pendingToken, code: rl1.body?.devCode } })
  check('reseller admin logs in scoped to MVP', rl2.status === 200 && rl2.body?.user?.sellerId === 'sel_mvp')
  const mvpAdmin = rl2.body.token
  const tOrders = (await api('/orders', { token: mvpAdmin })).body
  check('orders list scoped to MVP Container', Array.isArray(tOrders) && tOrders.length > 0 && tOrders.every(o => (o.sellerId || 'sel_mvp') === 'sel_mvp'))
  const tDrivers = (await api('/drivers', { token: mvpAdmin })).body
  check('drivers list scoped to the MVP fleet', tDrivers.length > 0 && tDrivers.every(d => (d.sellerId || 'sel_mvp') === 'sel_mvp'))
  const tUsers = (await api('/users', { token: mvpAdmin })).body
  check('users list hides HQ and other resellers', tUsers.some(u => u.email === 'admin@mvpcontainer.com')
    && !tUsers.some(u => u.email === 'tgmoore@gmail.com')
    && !tUsers.some(u => u.email === 'admin@democontainercorp.com'))
  const hqUsers = (await api('/users', { token: admin })).body
  check('HQ still sees every account', hqUsers.some(u => u.email === 'admin@democontainercorp.com') && hqUsers.some(u => u.email === 'admin@mvpcontainer.com'))
  const demoAdminAcct = hqUsers.find(u => u.email === 'admin@democontainercorp.com')
  const forbid = await api(`/users/${demoAdminAcct.id}`, { method: 'PATCH', token: mvpAdmin, body: { name: 'Hijacked' } })
  check("editing another reseller's account is blocked", forbid.status === 403)
  const hqOrders = (await api('/orders', { token: admin })).body
  const tCust = (await api('/customers', { token: mvpAdmin })).body
  check('customers list scoped to MVP buyers', tCust.every(c => c.sellerId === 'sel_mvp' || hqOrders.some(o => (o.sellerId || 'sel_mvp') === 'sel_mvp' && ((o.customerId && o.customerId === c.id) || (o.customerEmail || '').toLowerCase() === (c.email || '').toLowerCase()))))
  const tSched = (await api('/schedule', { token: mvpAdmin })).body
  const demoDriverIds = new Set((await api('/drivers', { token: admin })).body.filter(d => (d.sellerId || 'sel_mvp') !== 'sel_mvp').map(d => d.id))
  check('schedule hides other fleets’ jobs', tSched.every(j => !demoDriverIds.has(j.driverId)))

  // ── Shipping-line directory: admin CRUD feeds the claim picker ──
  console.log('Shipping lines')
  const shpNew = await api('/shippers', { method: 'POST', token: admin, body: { name: 'Pacific Crown Line', line: 'Asia-Gulf', contactName: 'Mei Chen', email: 'claims@pacificcrown.com', phone: '(206) 555-0311', address: '2201 Alaskan Way, Seattle, WA 98121' } })
  check('shipping line created with contact + address', shpNew.status === 201 && shpNew.body?.contactName === 'Mei Chen' && shpNew.body?.address.includes('Seattle'))
  check('new line appears in the picker list', (await api('/shippers', { token: admin })).body.some(s => s.name === 'Pacific Crown Line'))
  const clUnit = containers.find(c => c.status === 'available' && c.id !== unit.id)
  const clm = await api('/claims', { method: 'POST', token: admin, body: { containerId: clUnit.id, supplierId: 'sup_01', shipperId: shpNew.body.id, vesselRef: 'PCL-778' } })
  check('claim against the new line resolves its name', clm.status === 201 && clm.body?.shipperName === 'Pacific Crown Line')
  await api(`/shippers/${shpNew.body.id}`, { method: 'PATCH', token: admin, body: { name: 'Pacific Crown Lines' } })
  const clmAfter = (await api('/claims', { token: admin })).body.find(c => c.id === clm.body.id)
  check('rename cascades to open claims', clmAfter?.shipperName === 'Pacific Crown Lines')
  const shpDel = await api(`/shippers/${shpNew.body.id}`, { method: 'DELETE', token: admin })
  const shpAfter = (await api('/shippers', { token: admin })).body.find(s => s.id === shpNew.body.id)
  check('deactivate is a soft delete (history intact)', shpDel.status === 200 && shpAfter?.active === false)
  const shpForbidden = await api('/shippers', { method: 'POST', token: mvpAdmin, body: { name: 'Rogue Line' } })
  check('reseller admin cannot edit the directory', shpForbidden.status === 403)

  // ── Reject path frees the container ──
  console.log('Reject path')
  const unit2 = containers.find(c => c.status === 'available' && c.id !== unit.id)
  const ord2 = await api('/orders', { method: 'POST', token: admin, body: { containerId: unit2.id, containerSku: unit2.sku, customerName: 'B', customerEmail: 'b@test.dev', amount: 1000 } })
  const rej = await api(`/orders/${ord2.body.id}/review-step`, { method: 'POST', token: admin, body: { step: 'reject' } })
  check('reject cancels the order', rej.status === 200 && rej.body?.status === 'cancelled')
  const unit2After = (await api(`/containers/${unit2.id}`)).body
  check('container back to available', unit2After?.status === 'available')

  console.log(`\n${passes} passed, ${failures} failed`)
} catch (err) {
  failures++
  console.error('Test run crashed:', err.message)
} finally {
  server.kill()
  rmSync(dataDir, { recursive: true, force: true })
}
process.exit(failures ? 1 : 0)
