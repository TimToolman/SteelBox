// The damage-claim pipeline, portal by portal.
//
// A claim is post-inspection work: review the evidence, price the repair,
// send it on. Who may open one, what the list refuses to do, and the
// shipper's read-before-you-decide gate.

import { launch, open, nav, scorer, text, SHOTS } from './lib.mjs'

const { ok, done, section } = scorer()
const browser = await launch()

  // The estimate is gated on a note and a figure — fill them like a user.
  const fillEstimate = async page => {
    await page.locator('textarea[placeholder^="What happened"]').fill('Rail and door frame repair after transship damage.')
    await page.locator('input[placeholder="0"]').fill('2400')
    await page.locator('input[placeholder="Repair shop (who wrote it)"]').fill('Bayou Container Repair')
    await page.waitForTimeout(300)
  }

// ══ 1. Supplier claims list ══
section('1 · Supplier claims list')
const sup = await open(browser, { path: 'supplier', email: 'supplier@oceanbox.com' })
const list = await text(sup)
ok(/Damage Claims/i.test(list), 'the claims list renders')
for (const gone of ['Email packet', 'Email full package', 'Download .zip', 'Copy share link', 'Claim packet (PDF)']) {
  ok(!new RegExp(gone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(list), `"${gone}" is not on the list`)
}
ok(/Open claim workspace/.test(list), 'the only route in is the workspace')
ok(!/Awaiting inspection/.test(list), 'the retired "Awaiting inspection" stage appears nowhere')
ok(!/AUDIT TIMELINE/i.test(list), 'the timeline lives in the workspace, not the list')

// ══ 2. The workspace, full page in its own tab ══
section('2 · Claim workspace')
const popup = sup.waitForEvent('popup', { timeout: 8000 }).catch(() => null)
await sup.getByRole('button', { name: /Open claim workspace/ }).first().click()
const ws = await popup
ok(!!ws, 'the workspace opens in a new tab')
if (ws) {
  await ws.waitForSelector('text=/1 · Review/', { timeout: 15000 }).catch(() => {})
  ok(/\/claim\?id=/.test(ws.url()), 'on its own full-page route')
  const w = await text(ws)
  ok(/1 · Review/.test(w) && /2 · Estimate/.test(w) && /3 · Send/.test(w), 'the three steps are there')
  ok(/Audit timeline/i.test(w), 'with the audit timeline')
  // Review → estimate → send, with the gate in the middle.
  await ws.getByRole('button', { name: /Reviewed — add the estimate/ }).click()
  await ws.waitForTimeout(600)
  ok(/Upload the estimate \(photo or PDF\)/.test(await text(ws)), 'the estimate step wants the shop document')
  await fillEstimate(ws)
  await ws.getByRole('button', { name: /Save — go to send/ }).click()
  await ws.waitForTimeout(900)
  const sendBody = await text(ws)
  ok(/Submit to Shipper/i.test(sendBody), 'a supplier submits to the shipping line')
  ok(/Download|\.zip/i.test(sendBody) && /Email/i.test(sendBody), 'with the download and email routes')
  await ws.screenshot({ path: `${SHOTS}/clm-send.png`, fullPage: true })
}

// ══ 3. Inspector hands to the supplier instead ══
section('3 · Inspector hand-off')
const ins = await open(browser, { path: 'field', email: 'inspector@mvpcontainer.com', width: 480, height: 900 })
await ins.getByRole('button', { name: /Inspections/i }).first().click()
await ins.waitForTimeout(1000)
await ins.getByRole('button', { name: /^Reviewed/ }).click()
await ins.waitForTimeout(900)
const clm = ins.getByRole('button', { name: /CLM-000/ }).first()
if (await clm.count()) {
  await clm.click()
  await ins.waitForTimeout(1200)
  await ins.getByRole('button', { name: /Reviewed — add the estimate/ }).click()
  await ins.waitForTimeout(500)
  await fillEstimate(ins)
  await ins.getByRole('button', { name: /Save — go to send/ }).click()
  await ins.waitForTimeout(1300)
  const send = await text(ins)
  ok(/Send to /.test(send) && !/Submit to Shipper/.test(send),
    'an inspector sends to the supplier, never straight to the line')
  ok(/they own the relationship with/i.test(send), 'and the copy says why')
} else { ok(false, 'no claim in the inspector’s Reviewed queue') }

// ══ 4. Shipper must read before deciding ══
section('4 · Shipper review gate')
const shp = await open(browser, { path: 'shipper', email: 'shipper@meridianlines.com' })
const before = await text(shp)
ok(/Meridian Lines · Claims Review/.test(before), 'the header leads with the line name')
ok(/Review the claim before deciding/.test(before), 'the decision is gated on a read')
ok(!/Approve estimate/.test(before), 'no approve button until it is read')
const docPop = shp.waitForEvent('popup', { timeout: 8000 }).catch(() => null)
await shp.getByRole('button', { name: /Open the full claim/ }).click()
const docTab = await docPop
ok(!!docTab, 'the full claim opens')
if (docTab) {
  await docTab.waitForTimeout(800)
  const d = await text(docTab)
  ok(/damage claim/i.test(d) && /Repair estimate/i.test(d), 'with the photos, damages and estimate')
}
await shp.waitForTimeout(600)
const after = await text(shp)
ok(/✓ Reviewed/.test(after), 'it records that the claim was read')
ok(/Approve estimate/.test(after) && /Reject/.test(after), 'and only then unlocks the decision')

// ══ 5. Claims are a granted privilege for the field crew ══
section('5 · Claims RBAC')
const drv = await open(browser, { path: 'field', email: 'mike@mvpcontainer.com', width: 480, height: 900 })
await drv.getByRole('button', { name: /Inspections/i }).first().click()
await drv.waitForTimeout(1100)
ok(!/Damage review/.test(await text(drv)), 'a driver without the grant sees no damage queue')
await drv.getByRole('button', { name: /^Reviewed/ }).click()
await drv.waitForTimeout(900)
ok(!/CLM-000/.test(await text(drv)), 'and no claims inside Reviewed either')

await browser.close()
process.exit(done() ? 1 : 0)
