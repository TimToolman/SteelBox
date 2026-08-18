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

  // ── Customer register: profile + verification required up front ──
  console.log('Customer auth')
  const regNoPhone = await api('/auth/register', { method: 'POST', body: { name: 'No Phone', email: 'nophone@test.dev', password: 'buyerpass1' } })
  check('register requires a mobile number', regNoPhone.status === 400)
  const reg = await api('/auth/register', { method: 'POST', body: { name: 'Test Buyer', email: 'buyer@test.dev', password: 'buyerpass1', phone: '5045550111' } })
  check('register returns a verification step, not a session', reg.status === 200 && reg.body?.twoFaRequired === true && !!reg.body?.devCode)
  const early = await api('/auth/login', { method: 'POST', body: { email: 'buyer@test.dev', password: 'buyerpass1' } })
  check('login before verifying re-issues the code step', early.status === 200 && early.body?.twoFaRequired === true)
  const regV = await api('/auth/login/verify', { method: 'POST', body: { pendingToken: early.body.pendingToken, code: early.body.devCode } })
  check('verification code activates the account', regV.status === 200 && !!regV.body?.token)
  const customer = regV.body.token
  check('activated account has API access', (await api('/auth/me', { token: customer })).status === 200)
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
  const supLogin = await api('/auth/login', { method: 'POST', body: { email: 'supplier@oceanbox.com', password: 'test1234' } })
  check('supplier signs in', supLogin.status === 200 && !!supLogin.body?.token)
  const supplier = supLogin.body.token
  const shpLogin = await api('/auth/login', { method: 'POST', body: { email: 'shipper@meridianlines.com', password: 'test1234' } })
  check('shipper signs in', shpLogin.status === 200 && !!shpLogin.body?.token)
  const shipper = shpLogin.body.token

  // Give the supplier a unit, then file a claim against the seeded shipper.
  const dmgUnit = [...containers].reverse().find(c => c.status === 'available' && c.id !== unit.id) || containers[0]
  await api(`/containers/${dmgUnit.id}`, { method: 'PATCH', token: admin, body: { supplierId: 'sup_01' } })
  const shippers = (await api('/shippers', { token: supplier })).body
  const dmgPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  // A claim is evidence or it is nothing — one without a photo of the damage
  // is refused outright.
  const bare = await api('/claims', { method: 'POST', token: supplier, body: { containerId: dmgUnit.id, shipperId: shippers[0].id, notes: 'Fork damage, no evidence' } })
  check('a claim with no damage photo is refused', bare.status === 400 && /at least one damage photo/i.test(bare.body?.message || ''))
  const claim = await api('/claims', { method: 'POST', token: supplier, body: { containerId: dmgUnit.id, shipperId: shippers[0].id, vesselRef: 'MV-TEST-042', notes: 'Fork damage at transship', photos: [dmgPng], photoReasons: ['Gouge'], photoNotes: ['Corner post, ocean side'] } })
  // A claim is raised only after an inspection, so it opens at the estimate.
  check('a filed claim opens at the estimate, not an inspection', claim.status === 201 && claim.body?.status === 'awaiting_estimate' && claim.body?.claimNumber?.startsWith('CLM-'))
  check('and carries the inspection evidence in with it', claim.body?.photos?.length === 1 && claim.body?.photoReasons?.[0] === 'Gouge')
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
  check('audit timeline records the chain of custody', evs.length >= 3 && evs.some(e => e.text.includes('shared with')) && evs.some(e => e.text.includes('Claim filed')))

  // Inspector → supplier: reviewed and priced, handed over to be filed.
  const claimHandoff = await api(`/claims/${claimId}/share`, { method: 'POST', token: admin, body: { mode: 'handoff' } })
  check('an inspector can hand a priced claim to the supplier', claimHandoff.status === 200)
  const handMail = (await api('/outbox', { token: admin })).body.find(m => m.subject.startsWith('Claim ready to submit'))
  check('the hand-off email goes to the supplier, not the line', !!handMail && handMail.to === 'supplier@oceanbox.com')
  check('and carries the estimate and a link to the claim', !!handMail && handMail.body.includes('$2,400') && handMail.body.includes('/claim?id='))
  check('the timeline records the hand-off', JSON.parse(claimHandoff.body.events || '[]').some(e => /handed to .* to submit/.test(e.text)))
  const outboxShare = (await api('/outbox', { token: admin })).body
  check('shipper share email queued with login link', outboxShare.some(m => m.to === 'shipper@meridianlines.com' && m.body.includes('/shipper?claim=')))
  const pref = await api('/auth/me', { method: 'PATCH', token: shipper, body: { digestFreq: 'weekly' } })
  check('digest preference saved', pref.status === 200 && pref.body?.digestFreq === 'weekly')

  // ── Damage photos as their own reason-tagged collection ──
  console.log('Damage collection + packaging')
  // The claim already opened with one shot from the inspection; the crew
  // keeps adding to that same collection.
  const shot1 = await api(`/claims/${claimId}/photos`, { method: 'POST', token: admin, body: { dataUrl: dmgPng, reason: 'Bent', note: 'Top rail, door end' } })
  check('damage photo appends with its reason', shot1.status === 200 && shot1.body?.photos?.length === 2 && shot1.body?.photoReasons?.[1] === 'Bent' && shot1.body?.photoNotes?.[1] === 'Top rail, door end')
  const shot2 = await api(`/claims/${claimId}/photos`, { method: 'POST', token: admin, body: { dataUrl: dmgPng, reason: 'Hole' } })
  const shot3 = await api(`/claims/${claimId}/photos`, { method: 'POST', token: admin, body: { dataUrl: dmgPng, reason: 'Rust' } })
  check('collection keeps appending in order', shot3.body?.photos?.length === 4 && shot3.body?.photoReasons?.join(',') === 'Gouge,Bent,Hole,Rust')
  const delShot = await api(`/claims/${claimId}/photos/2`, { method: 'DELETE', token: admin })
  check('removing a shot drops its reason with it', delShot.body?.photos?.length === 3 && delShot.body?.photoReasons?.join(',') === 'Gouge,Bent,Rust')

  // Package: a real .zip with the summary + one file per photo
  const linkRes = await api(`/claims/${claimId}/package-link`, { token: supplier })
  check('package link issued', linkRes.status === 200 && /package\.zip\?t=\d+\./.test(linkRes.body?.url || ''))
  const signed = new URL(linkRes.body.url).search
  const zipRes = await fetch(`${BASE}/claims/${claimId}/package.zip${signed}`)
  const zipBuf = Buffer.from(await zipRes.arrayBuffer())
  check('signed link downloads without a session', zipRes.status === 200 && zipRes.headers.get('content-type') === 'application/zip')
  check('response is a real zip archive', zipBuf.subarray(0, 4).toString('hex') === '504b0304')
  check('zip attaches with the claim filename', (zipRes.headers.get('content-disposition') || '').includes(`claim-${claim.body.claimNumber}.zip`))
  const zipText = zipBuf.toString('latin1')
  check('zip holds the summary + every photo named by reason', zipText.includes('summary.html') && zipText.includes('01-gouge.png') && zipText.includes('02-bent.png') && zipText.includes('03-rust.png'))
  check('summary carries the claim details', zipText.includes(claim.body.claimNumber) && zipText.includes('Bent'))
  const badTok = await fetch(`${BASE}/claims/${claimId}/package.zip?t=123.deadbeef`)
  check('forged package links are rejected', badTok.status === 401 || badTok.status === 403)
  const pkgShare = await api(`/claims/${claimId}/share`, { method: 'POST', token: supplier, body: { mode: 'package' } })
  check('package can be emailed as a download link', pkgShare.status === 200)
  const pkgMail = (await api('/outbox', { token: admin })).body.find(m => m.to === 'shipper@meridianlines.com' && m.body.includes('package.zip?t='))
  check('email carries the direct download link', !!pkgMail)

  // ── The claim document + estimate: review → estimate → send ──
  console.log('Claim document & estimate')
  const estPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const estPdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 fake estimate').toString('base64')
  const estUp = await api(`/claims/${claimId}/estimate-doc`, { method: 'POST', token: supplier, body: { dataUrl: estPdf, estimateShop: 'Bayou Container Repair' } })
  check('repair-shop estimate uploads as a PDF', estUp.status === 201 && /\.pdf$/.test(estUp.body?.estimateDocUrl || ''))
  check('the shop name rides along', estUp.body?.estimateShop === 'Bayou Container Repair')
  const estImg = await api(`/claims/${claimId}/estimate-doc`, { method: 'POST', token: supplier, body: { dataUrl: estPng } })
  check('a photo of the estimate sheet works too', estImg.status === 201 && /\.png$/.test(estImg.body?.estimateDocUrl || ''))
  const estBad = await api(`/claims/${claimId}/estimate-doc`, { method: 'POST', token: supplier, body: { dataUrl: 'data:text/plain;base64,aGk=' } })
  check('a non-document upload is rejected', estBad.status === 400)

  await api(`/claims/${claimId}`, { method: 'PATCH', token: supplier, body: { estimateAmount: 2750, estimateNotes: 'Rail section + repaint', notes: 'Corner post crushed in transit' } })
  const docLink = await api(`/claims/${claimId}/document-link`, { token: supplier })
  check('document link issued', docLink.status === 200 && /document\.html\?t=\d+\./.test(docLink.body?.url || ''))
  const docRes = await fetch(`${BASE}/claims/${claimId}/document.html${new URL(docLink.body.url).search}`)
  const docHtml = await docRes.text()
  check('the signed link opens the document without a session', docRes.status === 200 && (docRes.headers.get('content-type') || '').includes('text/html'), `status ${docRes.status}: ${docHtml.slice(0, 120)}`)
  check('the document carries the estimate', docHtml.includes('$2,750') && docHtml.includes('Bayou Container Repair'))
  check('the document carries the note and scope', docHtml.includes('Corner post crushed in transit') && docHtml.includes('Rail section + repaint'))
  check('the document embeds the damage photos by reason', docHtml.includes('<figure>') && docHtml.includes('Bent') && docHtml.includes('Rust'))
  check('it links the shop\'s own estimate file', docHtml.includes(estImg.body.estimateDocUrl))
  check('it offers print to PDF', docHtml.includes('window.print()'))
  const docForged = await fetch(`${BASE}/claims/${claimId}/document.html?t=123.deadbeef`)
  check('a forged document link is rejected', docForged.status === 401 || docForged.status === 403)

  const submitted = await api(`/claims/${claimId}/share`, { method: 'POST', token: supplier, body: { mode: 'submit' } })
  check('submitting to the shipper works', submitted.status === 200)
  const submitMail = (await api('/outbox', { token: admin })).body.find(m => m.subject.startsWith('Damage claim for your review'))
  check('the submission email carries all three routes in', !!submitMail
    && submitMail.body.includes('document.html?t=') && submitMail.body.includes('package.zip?t=') && submitMail.body.includes('/shipper?claim='))
  check('and states the estimate', !!submitMail && submitMail.body.includes('$2,750'))
  const docMail = await api(`/claims/${claimId}/share`, { method: 'POST', token: supplier, body: { mode: 'document' } })
  check('emailing the document alone works', docMail.status === 200)
  check('that email points at the document', (await api('/outbox', { token: admin })).body.some(m => m.subject.startsWith('Claim document') && m.body.includes('document.html?t=')))

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
  const clmPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const clm = await api('/claims', { method: 'POST', token: admin, body: { containerId: clUnit.id, supplierId: 'sup_01', shipperId: shpNew.body.id, vesselRef: 'PCL-778', photos: [clmPng], photoReasons: ['Dent'] } })
  check('claim against the new line resolves its name', clm.status === 201 && clm.body?.shipperName === 'Pacific Crown Line')
  await api(`/shippers/${shpNew.body.id}`, { method: 'PATCH', token: admin, body: { name: 'Pacific Crown Lines' } })
  const clmAfter = (await api('/claims', { token: admin })).body.find(c => c.id === clm.body.id)
  check('rename cascades to open claims', clmAfter?.shipperName === 'Pacific Crown Lines')
  const shpDel = await api(`/shippers/${shpNew.body.id}`, { method: 'DELETE', token: admin })
  const shpAfter = (await api('/shippers', { token: admin })).body.find(s => s.id === shpNew.body.id)
  check('deactivate is a soft delete (history intact)', shpDel.status === 200 && shpAfter?.active === false)
  const shpForbidden = await api('/shippers', { method: 'POST', token: mvpAdmin, body: { name: 'Rogue Line' } })
  check('reseller admin cannot edit the directory', shpForbidden.status === 403)

  // ── Walk-around damage report → inspection hold ──
  // A driver spots damage while shooting the saleable photo set. Reporting it
  // pulls the unit off the marketplace until an inspector grades it.
  console.log('Inspection hold')
  const insAcct = await api('/users', { method: 'POST', token: admin, body: { email: 'inspector@test.dev', password: 'test1234', role: 'inspector', name: 'Ivy Nakamura' } })
  check('inspector role accepted on an account', insAcct.status === 201 && insAcct.body?.role === 'inspector')
  const drvAcct = await api('/users', { method: 'POST', token: admin, body: { email: 'walkaround@test.dev', password: 'test1234', role: 'driver', name: 'Ray Okonkwo' } })
  const inspector = (await api('/auth/login', { method: 'POST', body: { email: 'inspector@test.dev', password: 'test1234' } })).body.token
  const fieldDriver = (await api('/auth/login', { method: 'POST', body: { email: 'walkaround@test.dev', password: 'test1234' } })).body.token
  check('inspector and driver both sign in', !!inspector && !!fieldDriver && drvAcct.status === 201)

  // A unit with the full photo set — so the hold is the only thing keeping it
  // out of 'available' when the promotion rule would otherwise fire.
  const held = containers.find(c => c.status === 'available' && (c.photos || []).filter(Boolean).length >= 8
    && ![unit.id, dmgUnit.id, clUnit.id].includes(c.id))
  const flag = await api(`/containers/${held.id}`, { method: 'PATCH', token: fieldDriver, body: { inspectionRequired: true, inspectionReason: 'Bent — rear rail bowed' } })
  check('a driver can report damage from the walk-around', flag.status === 200 && flag.body?.inspectionRequired === true)
  check('reporting stamps who flagged it and when', flag.body?.inspectionFlaggedBy === 'Ray Okonkwo' && !!flag.body?.inspectionFlaggedAt)
  check('a reported unit drops off the marketplace', flag.body?.status === 'draft')
  const stillHeld = (await api(`/containers/${held.id}`)).body
  check('the hold survives a full photo set', stillHeld.status === 'draft' && stillHeld.photos.filter(Boolean).length >= 8)
  const priceEdit = await api(`/containers/${held.id}`, { method: 'PATCH', token: admin, body: { buyPrice: 3400 } })
  check('an unrelated edit does not release the hold', priceEdit.body?.status === 'draft' && priceEdit.body?.inspectionRequired === true)

  const graded = await api(`/containers/${held.id}`, { method: 'PATCH', token: inspector, body: { grade: 'B', conditionScore: 4, aiGraded: true, inspectorName: 'Ivy Nakamura', inspectedAt: new Date().toISOString() } })
  check('the inspector clears the hold by grading it', graded.status === 200 && graded.body?.inspectionRequired === false)
  check('grading releases the unit back to the marketplace', graded.body?.status === 'available' && graded.body?.grade === 'B')

  // A clean walk the driver didn't want to call: held for a second opinion,
  // not for damage — the inspector needs to know which it is.
  const opinionUnit = containers.find(c => c.status === 'available' && ![unit.id, dmgUnit.id, clUnit.id, held.id].includes(c.id))
  const handoff = await api(`/containers/${opinionUnit.id}`, { method: 'PATCH', token: fieldDriver, body: { inspectionRequired: true, inspectionKind: 'opinion', inspectionReason: 'Second opinion requested by Ray Okonkwo — model proposed A·3' } })
  check('a driver can hand a clean walk to an inspector', handoff.status === 200 && handoff.body?.inspectionRequired === true)
  check('the hold records that it is an opinion, not damage', handoff.body?.inspectionKind === 'opinion')
  check('a handed-off unit waits off the marketplace too', handoff.body?.status === 'draft')
  const opinionGraded = await api(`/containers/${opinionUnit.id}`, { method: 'PATCH', token: inspector, body: { grade: 'A', conditionScore: 3, aiGraded: true, inspectorName: 'Ivy Nakamura', inspectedAt: new Date().toISOString() } })
  check("the inspector's grade clears an opinion hold too", opinionGraded.body?.inspectionRequired === false && opinionGraded.body?.inspectionKind === '')
  check('and puts it back on the marketplace', opinionGraded.body?.status === 'available' && opinionGraded.body?.grade === 'A')

  // The other track: sea-freight damage the field crew files a claim for.
  const claimUnit = containers.find(c => c.status === 'available' && ![unit.id, dmgUnit.id, clUnit.id, held.id, opinionUnit.id].includes(c.id))
  // Claims are a granted privilege for the field crew, not a role perk.
  const ungranted = await api('/claims', { method: 'POST', token: fieldDriver, body: { containerId: claimUnit.id, notes: 'Hole — left panel' } })
  check('a driver without the claims grant cannot open one', ungranted.status === 403 || ungranted.status === 401)
  const drvListBlocked = await api('/claims', { token: fieldDriver })
  check('and cannot read the claim queue either', drvListBlocked.status === 403 || drvListBlocked.status === 401)
  const grantClaims = await api(`/users/${drvAcct.body.id}`, { method: 'PATCH', token: admin, body: { roles: ['marketplace', 'claims'] } })
  check('an admin can grant claims access', grantClaims.status === 200 && grantClaims.body?.roles.includes('claims'))
  // Even with the grant, the claim needs evidence — and the evidence the
  // walk-around already captured is what it carries in.
  const noShots = await api('/claims', { method: 'POST', token: fieldDriver, body: { containerId: claimUnit.id, notes: 'Hole — left panel' } })
  check('a granted driver still cannot open a claim with no photo', noShots.status === 400)
  const walkPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  await api(`/containers/${claimUnit.id}`, { method: 'PATCH', token: admin, body: { inspectionFindings: JSON.stringify([{ station: 'Left hand side', question: 'structure', level: 'major', reasons: ['Hole'], note: 'Left panel, fist-sized', photo: walkPng, at: new Date().toISOString(), by: 'Field Driver' }]) } })
  const fieldClaim = await api('/claims', { method: 'POST', token: fieldDriver, body: { containerId: claimUnit.id, notes: 'Hole — left panel, fist-sized' } })
  check('with the grant, the field crew can open a damage claim', fieldClaim.status === 201 && fieldClaim.body?.notes.includes('left panel'))
  check('and the walk-around findings become its evidence', fieldClaim.body?.photos?.length === 1 && fieldClaim.body?.photoReasons?.[0] === 'Hole' && fieldClaim.body?.photoNotes?.[0] === 'Left panel, fist-sized')
  check('and can read the queue', (await api('/claims', { token: fieldDriver })).status === 200)
  const insListBlocked = await api('/claims', { token: inspector })
  check('an inspector without the grant is refused the same way', insListBlocked.status === 403 || insListBlocked.status === 401)
  const claimHold = await api(`/containers/${claimUnit.id}`, { method: 'PATCH', token: fieldDriver, body: { inspectionRequired: true, inspectionReason: 'Hole — left panel' } })
  check('a claimed unit is held the same way', claimHold.body?.status === 'draft' && claimHold.body?.inspectionRequired === true)
  const custDenied = await api(`/containers/${claimUnit.id}`, { method: 'PATCH', token: customer, body: { inspectionRequired: false } })
  check('a shopper cannot release a held unit', custDenied.status === 403 || custDenied.status === 401)

  // ── Multi-role portal grants behind the single marketplace login ──
  console.log('Portal grants')
  const buyerUsers = (await api('/users', { token: admin })).body
  const buyerAcct = buyerUsers.find(u2 => u2.email === 'buyer@test.dev')
  check('accounts default to the marketplace grant', Array.isArray(buyerAcct?.roles) && buyerAcct.roles.includes('marketplace'))
  // Grant the buyer the supplier portal, linked to sup_01
  const grantRes = await api(`/users/${buyerAcct.id}`, { method: 'PATCH', token: admin, body: { roles: ['marketplace', 'supplier'], supplierId: 'sup_01' } })
  check('supplier grant saved on a customer account', grantRes.status === 200 && grantRes.body?.roles.includes('supplier') && grantRes.body?.supplierId === 'sup_01')
  const buyerLogin = await api('/auth/login', { method: 'POST', body: { email: 'buyer@test.dev', password: 'buyerpass2' } })
  check('granted account logs in with roles attached', buyerLogin.status === 200 && buyerLogin.body?.user?.roles?.includes('supplier'))
  const buyer2 = buyerLogin.body.token
  const supClaims = await api('/claims', { token: buyer2 })
  check('supplier grant opens the claims list (own only)', supClaims.status === 200 && supClaims.body.every(c => c.supplierId === 'sup_01'))
  const supUnit = (await api('/containers')).body.find(c => c.supplierId === 'sup_01' && c.status === 'available')
  if (supUnit) {
    const priceRes = await api(`/containers/${supUnit.id}`, { method: 'PATCH', token: buyer2, body: { buyPrice: supUnit.buyPrice + 25 } })
    check('supplier grant can reprice their own unit', priceRes.status === 200 && priceRes.body?.buyPrice === supUnit.buyPrice + 25)
  } else {
    check('supplier grant can reprice their own unit', true, 'no sup_01 unit seeded — skipped')
  }
  check('grants cannot smuggle admin', !(await api(`/users/${buyerAcct.id}`, { method: 'PATCH', token: admin, body: { roles: ['marketplace', 'admin'] } })).body.roles.includes('admin'))
  // Removing the marketplace grant blocks sign-in entirely
  await api(`/users/${buyerAcct.id}`, { method: 'PATCH', token: admin, body: { roles: ['supplier'] } })
  const blocked = await api('/auth/login', { method: 'POST', body: { email: 'buyer@test.dev', password: 'buyerpass2' } })
  check('removing the marketplace grant blocks sign-in', blocked.status === 403)
  const selfLock = await api('/auth/me', { token: admin })
  const lockTry = await api(`/users/${selfLock.body.id}`, { method: 'PATCH', token: admin, body: { roles: ['supplier'] } })
  check('admin cannot remove their own marketplace access', lockTry.status === 400)

  // ── Repair-shop network: HQ CRUD + per-site assignments ──
  console.log('Repair shops')
  const shopsSeed = (await api('/repairshops', { token: admin })).body
  check('3 shops seeded with contacts + site assignments', shopsSeed.length >= 3 && shopsSeed.every(s => s.contactName) && shopsSeed.some(s => (s.siteIds || []).includes('dep_hou')))
  const shopNew = await api('/repairshops', { method: 'POST', token: admin, body: { name: 'Music City Container Repair', city: 'Nashville', state: 'TN', specialty: 'Full refurb', contactName: 'Gus Harlan', email: 'gus@musiccityrepair.com', phone: '(615) 555-0344', siteIds: ['mp_03'] } })
  check('shop created with site assignment', shopNew.status === 201 && shopNew.body?.siteIds?.includes('mp_03'))
  const shopPatch = await api(`/repairshops/${shopNew.body.id}`, { method: 'PATCH', token: admin, body: { siteIds: ['mp_03', 'dep_fc'] } })
  check('site assignments editable', shopPatch.status === 200 && shopPatch.body?.siteIds?.length === 2)
  const shopDel = await api(`/repairshops/${shopNew.body.id}`, { method: 'DELETE', token: admin })
  const shopAfter = (await api('/repairshops', { token: admin })).body.find(s => s.id === shopNew.body.id)
  check('delete is a soft un-approve', shopDel.status === 200 && shopAfter?.approved === false)
  const shopForbidden = await api('/repairshops', { method: 'POST', token: mvpAdmin, body: { name: 'Rogue Repair' } })
  check('reseller admin cannot edit the network', shopForbidden.status === 403)

  // ── Marketing portal: tenancy, CSV import, campaign funnel, plans ──
  console.log('Marketing portal')
  const mkLogin = await api('/auth/login', { method: 'POST', body: { email: 'marketing@mvpcontainer.com', password: 'test1234' } })
  check('marketing persona signs in with the grant', mkLogin.status === 200 && !!mkLogin.body?.token && (mkLogin.body.user?.roles || []).includes('marketing'))
  const mkt = mkLogin.body.token
  const myContacts = await api('/marketing/contacts', { token: mkt })
  check('contacts scoped to own reseller', myContacts.status === 200 && myContacts.body.length === 8 && myContacts.body.every(c => c.sellerId === 'sel_mvp'))
  const hqContacts = await api('/marketing/contacts', { token: admin })
  check("HQ sees every reseller's contacts", hqContacts.body.length === 10)
  const demoContact = hqContacts.body.find(c => c.sellerId === 'sel_demo')
  const crossDel = await api(`/marketing/contacts/${demoContact.id}`, { method: 'DELETE', token: mkt })
  check("cannot touch another reseller's contact", crossDel.status === 404)
  const noAccess = await api('/marketing/contacts', { token: buyer2 })
  check('no marketing grant → no marketing API', noAccess.status === 403)
  const imp = await api('/marketing/contacts/import', { method: 'POST', token: mkt, body: { source: 'csv', rows: [
    { name: 'Existing Dup', email: 'albert.fontenot@gmail.com', zip: '70119' },
    { name: 'Nadia Brooks', email: 'nadia.brooks@gmail.com', zip: '70115', city: 'New Orleans', state: 'LA' },
    { name: 'No Email Row', zip: '70119' },
  ] } })
  check('CSV import dedupes + validates rows', imp.status === 200 && imp.body?.imported === 1 && imp.body?.skipped === 2 && imp.body?.total === 9)
  const seededCamps = await api('/marketing/campaigns', { token: mkt })
  check('campaign history scoped to own reseller', seededCamps.status === 200 && seededCamps.body.length === 3 && seededCamps.body.every(c => c.sellerId === 'sel_mvp'))
  const campNew = await api('/marketing/campaigns', { method: 'POST', token: mkt, body: { name: 'Houston ZIP blast', type: 'email', subject: 'Local units near you', content: 'Hi {{firstName}} — graded units near {{zip}}.', audienceKind: 'zip', zipPrefixes: ['770'] } })
  check('campaign drafts with a ZIP-prefix audience', campNew.status === 201 && campNew.body?.status === 'draft' && campNew.body?.zipPrefixes?.length === 1)
  const launched = await api(`/marketing/campaigns/${campNew.body.id}/launch`, { method: 'POST', token: mkt })
  check('launch freezes the ZIP-matched audience', launched.status === 200 && launched.body?.status === 'sent' && launched.body?.audienceCount === 2 && !!launched.body?.sentAt)
  check('launch simulates a coherent funnel', launched.body.delivered <= launched.body.audienceCount && launched.body.opens <= launched.body.delivered && launched.body.clicks <= launched.body.opens && launched.body.spend >= 25)
  const relaunch = await api(`/marketing/campaigns/${campNew.body.id}/launch`, { method: 'POST', token: mkt })
  check('sent campaigns cannot relaunch', relaunch.status === 400)
  const connNew = await api('/marketing/connections', { method: 'POST', token: mkt, body: { provider: 'google', apiKey: 'AIzaSyExample1234' } })
  check('integration stores only a masked key', connNew.status === 201 && connNew.body?.apiKeyMasked === 'AIz****1234' && !JSON.stringify(connNew.body).includes('AIzaSyExample1234'))
  const planSet = await api('/marketing/plan', { method: 'POST', token: mvpAdmin, body: { plan: 'pro' } })
  const planGet = await api('/marketing/plan', { token: mkt })
  check('marketing plan upgrades stick per reseller', planSet.status === 200 && planGet.body?.plan === 'pro')
  const planBad = await api('/marketing/plan', { method: 'POST', token: mkt, body: { plan: 'diamond' } })
  check('unknown plan tiers rejected', planBad.status === 400)
  // HQ manages campaigns on a reseller's behalf (managedBy stamp + sellerId routing)
  const hqCamp = await api('/marketing/campaigns', { method: 'POST', token: admin, body: { name: 'HQ boost for Demo Corp', type: 'social', platform: 'facebook', content: 'New arrivals in Baltimore', sellerId: 'sel_demo' } })
  check("HQ drafts on the reseller's behalf", hqCamp.status === 201 && hqCamp.body?.sellerId === 'sel_demo' && hqCamp.body?.managedBy === 'hq')
  const demoLogin1 = await api('/auth/login', { method: 'POST', body: { email: 'admin@democontainercorp.com', password: 'test1234' } })
  const demoLogin2 = await api('/auth/login/verify', { method: 'POST', body: { pendingToken: demoLogin1.body?.pendingToken, code: demoLogin1.body?.devCode } })
  const demoSees = (await api('/marketing/campaigns', { token: demoLogin2.body.token })).body
  check('the reseller sees the HQ-managed campaign', demoSees.some(c => c.id === hqCamp.body.id && c.managedBy === 'hq'))
  check("HQ campaign never leaks to other tenants", !(await api('/marketing/campaigns', { token: mkt })).body.some(c => c.id === hqCamp.body.id))
  // A tenant passing sellerId cannot escape their own reseller
  const escape = await api('/marketing/campaigns', { method: 'POST', token: mkt, body: { name: 'Escape attempt', type: 'email', sellerId: 'sel_demo' } })
  check('tenants cannot write into another reseller', escape.status === 201 && escape.body?.sellerId === 'sel_mvp')
  // Customer opt-out from the profile: flips consent everywhere, honored at launch
  await api('/marketing/contacts/import', { method: 'POST', token: mkt, body: { rows: [{ name: 'Buyer Test', email: 'buyer@test.dev', zip: '70119' }] } })
  const optState = await api('/marketing/consent', { token: buyer2 })
  check('customer sees their own opt-in state', optState.status === 200 && optState.body?.optedIn === true && optState.body?.listed === true)
  const optOut = await api('/marketing/consent', { method: 'POST', token: buyer2, body: { optIn: false } })
  check('profile opt-out flips their contact rows', optOut.status === 200 && optOut.body?.changed >= 1)
  const afterOut = (await api('/marketing/contacts', { token: mkt })).body.find(c => c.email === 'buyer@test.dev')
  check('opt-out lands on the reseller list', afterOut?.consent === false)
  const optCamp = await api('/marketing/campaigns', { method: 'POST', token: mkt, body: { name: 'NOLA re-blast', type: 'email', audienceKind: 'zip', zipPrefixes: ['701'] } })
  const optLaunch = await api(`/marketing/campaigns/${optCamp.body.id}/launch`, { method: 'POST', token: mkt })
  check('launch excludes opted-out contacts', optLaunch.status === 200 && optLaunch.body?.audienceCount === 3) // 4 in 701xx minus the opt-out
  const optIn = await api('/marketing/consent', { method: 'POST', token: buyer2, body: { optIn: true } })
  const afterIn = (await api('/marketing/contacts', { token: mkt })).body.find(c => c.email === 'buyer@test.dev')
  check('opt back in restores consent', optIn.status === 200 && afterIn?.consent === true)

  // ── Independent-contractor drivers: apply → approve → portal ──
  console.log('Contractor drivers')
  const appRes = await api('/driver-apps', { method: 'POST', body: { name: 'Test Hauler', email: 'hauler@test.dev', phone: '(504) 555-0777', city: 'Metairie', state: 'LA', zip: '70001', cdl: true, cdlClass: 'A', truckType: 'Tilt-bed roll-off', haulCaps: ['20ft', '40ft'], experienceYears: 6, notes: 'Own truck.' } })
  check('public application accepted without auth', appRes.status === 201 && appRes.body?.received === true)
  const appBad = await api('/driver-apps', { method: 'POST', body: { name: 'No Phone', email: 'nope@test.dev' } })
  check('application validates the phone number', appBad.status === 400)
  check('staff notified of the new application', (await api('/outbox', { token: admin })).body.some(m => m.subject.startsWith('New driver application')))
  const appList = await api('/driver-apps', { token: admin })
  const myApp = appList.body.find(a => a.email === 'hauler@test.dev')
  check('admin sees the queue incl. seeded applications', appList.status === 200 && appList.body.length >= 3 && !!myApp)
  check('public cannot read the queue', (await api('/driver-apps')).status === 401)
  const toInterview = await api(`/driver-apps/${myApp.id}`, { method: 'PATCH', token: admin, body: { status: 'interviewing' } })
  check('application moves to interviewing', toInterview.status === 200 && toInterview.body?.status === 'interviewing')
  const approve = await api(`/driver-apps/${myApp.id}/approve`, { method: 'POST', token: admin, body: {} })
  check('approve mints a contractor driver + login', approve.status === 200 && approve.body?.driver?.contractor === true && !!approve.body?.tempPassword && approve.body?.application?.status === 'invited')
  const inviteMail = (await api('/outbox', { token: admin })).body.find(m => m.to === 'hauler@test.dev' && m.subject.includes('approved to drive'))
  check('invite email queued with portal instructions', !!inviteMail && inviteMail.body.includes('Temporary password'))
  const dLogin = await api('/auth/login', { method: 'POST', body: { email: 'hauler@test.dev', password: approve.body.tempPassword } })
  check('new contractor signs in with the temp password', dLogin.status === 200 && dLogin.body?.user?.role === 'driver' && dLogin.body?.user?.driverId === approve.body.driver.id)
  const dTok = dLogin.body.token
  const avail = await api(`/drivers/${approve.body.driver.id}`, { method: 'PATCH', token: dTok, body: { serviceZips: '700,701,704', availableDays: ['Mon', 'Wed', 'Fri'], truckType: 'Tilt-bed roll-off', haulCaps: ['20ft', '40ft', 'chassis'] } })
  check('driver self-serves service area + days', avail.status === 200 && avail.body?.availableDays?.length === 3 && avail.body?.serviceZips === '700,701,704')
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const doc = await api(`/drivers/${approve.body.driver.id}/docs`, { method: 'POST', token: dTok, body: { kind: 'license', dataUrl: png } })
  check('license doc uploads onto the driver record', doc.status === 200 && String(doc.body?.licenseDocUrl || '').startsWith('/photos/'))
  const docOther = await api(`/drivers/${drivers[0].id}/docs`, { method: 'POST', token: dTok, body: { kind: 'insurance', dataUrl: png } })
  check("cannot upload docs to someone else's record", docOther.status === 403)
  const plateDoc = await api(`/drivers/${approve.body.driver.id}/docs`, { method: 'POST', token: dTok, body: { kind: 'plate', dataUrl: png } })
  check('plate photo stores + reports OCR availability', plateDoc.status === 200 && String(plateDoc.body?.plateDocUrl || '').startsWith('/photos/') && plateDoc.body?.ocrSource === 'unavailable')
  const plateSet = await api(`/drivers/${approve.body.driver.id}`, { method: 'PATCH', token: dTok, body: { licensePlate: 'LA 4471-TX' } })
  check('driver confirms/corrects the plate number', plateSet.status === 200 && plateSet.body?.licensePlate === 'LA 4471-TX')
  const dup = await api(`/driver-apps/${myApp.id}/approve`, { method: 'POST', token: admin })
  check('re-approving an invited application is blocked', dup.status === 400)

  // Ratings: deliver the pipeline order, buyer rates it, driver average moves
  const del = await api(`/orders/${orderId}/delivered`, { method: 'POST', token: admin })
  check('pipeline order marked delivered', del.status === 200 && del.body?.status === 'delivered')
  const foreign = await api(`/orders/${orderId}/rate`, { method: 'POST', token: mkt, body: { rating: 1 } })
  check('only the buyer can rate an order', foreign.status === 403)
  const rated = await api(`/orders/${orderId}/rate`, { method: 'POST', token: customer, body: { rating: 5 } })
  check('buyer rates the delivered order 5 stars', rated.status === 200 && rated.body?.rating === 5)
  const badRate = await api(`/orders/${orderId}/rate`, { method: 'POST', token: customer, body: { rating: 9 } })
  check('out-of-range ratings rejected', badRate.status === 400)
  const drvAfter = (await api(`/drivers/${drivers[0].id}`, { token: admin })).body
  check("driver's headline rating tracks order ratings", drvAfter?.rating >= 1 && drvAfter?.rating <= 5)

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
