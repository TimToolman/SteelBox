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
import { mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 4791
const BASE = `http://localhost:${PORT}`

const dataDir = mkdtempSync(join(tmpdir(), 'sbx-test-'))
cpSync(join(__dirname, 'data'), dataDir, { recursive: true })

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
