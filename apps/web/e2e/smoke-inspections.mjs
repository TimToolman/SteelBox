// Inspections: who inspects what, and what an inspector gets to see.
//
// Covers the driver's end-of-walk options, the three inspection queues and
// who can see them, the walk an inspector reads back (answers + photos +
// findings), the original-inspection case, and the desk-side Inspections
// tab on the marketplace.

import { launch, open, openVia, scorer, text, walkUnit, SHOTS } from './lib.mjs'

const { ok, done, section } = scorer()
const browser = await launch()

// ══ 1. Driver's walk ends in exactly two ways ══
section('1 · Driver end-of-walk options')
const drv = await open(browser, { path: 'field', email: 'mike@ntlsb.com', width: 480, height: 900 })
await drv.getByRole('button', { name: /Pickups & Returns/ }).click()
await drv.waitForTimeout(900)
await drv.locator('text=/Pickup · NOLA-20-0006/').first().click()
await drv.waitForTimeout(900)
for (const label of [/On my way/, /^Arrived$/]) {
  const b = drv.getByRole('button', { name: label }).first()
  if (await b.count()) { await b.click(); await drv.waitForTimeout(600) }
}
await drv.getByRole('button', { name: /Start Walk-Around|Re-Walk \/ Review/ }).first().click()
await drv.waitForTimeout(1200)
ok(/STOP 1 OF 8/.test(await text(drv)), 'the guided walk opens at stop 1')

// Worst answer at stop 1 → a finding, so the walk ends in the hand-off.
await walkUnit(drv, { damageAt: 0 })

const endBody = await text(drv)
ok(/Damage reported — an inspector grades this one/.test(endBody), 'a walk that found damage ends at the hand-off, not a grade')
ok(!/Approve — apply grade/.test(endBody), 'no grade is offered to the driver')
ok(await drv.getByRole('button', { name: /Send to inspector/ }).count() === 1, 'Send to inspector is the one way on')
ok(await drv.getByRole('button', { name: /← Previous/ }).count() === 1, 'with Previous as the only other option')
await drv.screenshot({ path: `${SHOTS}/ins-driver-handoff.png` })

// Sending lands back on the job, standing on Load.
await drv.getByRole('button', { name: /Send to inspector/ }).click()
await drv.waitForTimeout(1800)
const backBody = await text(drv)
ok(/NOLA-20-0006/.test(backBody), 'sending returns to the job')
ok(/Loaded|Load container/.test(backBody), 'standing on the Load step')
await drv.screenshot({ path: `${SHOTS}/ins-back-to-task.png` })

// ══ 2. A plain driver sees no damage queue ══
section('2 · Queue visibility by role')
await drv.getByRole('button', { name: /Inspections/i }).first().click()
await drv.waitForTimeout(1200)
const drvQueues = await text(drv)
ok(/Needs inspection/.test(drvQueues), 'a driver gets the Needs inspection queue')
ok(/Reviewed/.test(drvQueues), 'and the Reviewed queue')
ok(!/Damage review/.test(drvQueues), 'but no Damage review queue without inspector rights')
await drv.screenshot({ path: `${SHOTS}/ins-driver-queues.png` })

// ══ 3. The inspector gets all three ══
const ins = await open(browser, { path: 'field', email: 'inspector@ntlsb.com', width: 480, height: 900 })
await ins.getByRole('button', { name: /Inspections/i }).first().click()
await ins.waitForTimeout(1200)
const insQueues = await text(ins)
ok(/Needs inspection/.test(insQueues) && /Damage review/.test(insQueues) && /Reviewed/.test(insQueues),
  'an inspector gets all three queues')

// ══ 4. Reading someone else's walk ══
section('3 · The walk an inspector reads back')
await ins.getByRole('button', { name: /Damage review/ }).click()
await ins.waitForTimeout(900)
ok(/NOLA-20-0003/.test(await text(ins)), 'the held unit is in Damage review')
await ins.locator('text=/NOLA-20-0003/').first().click()
await ins.waitForTimeout(1400)
const walkBody = await text(ins)
ok(/Walk on file · Mike Torres/.test(walkBody), 'it names who walked it')
ok(/Doors & seals/.test(walkBody) && /Rust & corrosion|Seam|corrosion/i.test(walkBody), 'the station questions are listed')
ok(/Perforating or structural rust/.test(walkBody), 'with the answer that was actually picked')
ok(/Rust/.test(walkBody) && /bottom rail/i.test(walkBody), 'the reported damage and its note come through')
ok(/Photos from that walk/.test(walkBody), 'and the photos that walk produced')
await ins.screenshot({ path: `${SHOTS}/ins-walk-readback.png`, fullPage: true })

// ══ 5. A unit nobody walked needs an original inspection ══
section('4 · Original inspection')
await ins.getByRole('button', { name: /← Back|← Previous/ }).first().click().catch(() => {})
await ins.waitForTimeout(700)
await ins.getByRole('button', { name: /Needs inspection/ }).click()
await ins.waitForTimeout(900)
const firstUnit = ins.locator('button').filter({ hasText: /-\d{2}-\d{4}/ }).first()
if (await firstUnit.count()) {
  await firstUnit.click()
  await ins.waitForTimeout(1300)
  const freshBody = await text(ins)
  ok(/No inspection on file — this one is yours/.test(freshBody), 'a never-walked unit says so plainly')
  ok(/moved this unit without inspecting/.test(freshBody), 'and explains the inspector runs the original inspection')
  await ins.screenshot({ path: `${SHOTS}/ins-original.png` })
} else {
  ok(false, 'no unit in the Needs inspection queue')
}

// ══ 6. The desk: marketplace Inspections tab ══
section('5 · Marketplace Inspections tab')
const desk = await openVia(browser, { gate: 'field', path: 'shop', email: 'inspector@ntlsb.com' })
const deskTab = desk.getByRole('button', { name: 'Inspections', exact: true })
ok(await deskTab.count() === 1, 'an inspector gets an Inspections tab on the marketplace')
await deskTab.click()
await desk.waitForTimeout(1400)
const deskBody = await text(desk)
ok(/Needs inspection/.test(deskBody) && /Damage review/.test(deskBody) && /Reviewed/.test(deskBody), 'with the same three queues')
await desk.getByRole('button', { name: /^Damage review/ }).click()
await desk.waitForTimeout(900)
ok(/NOLA-20-0003/.test(await text(desk)), 'the held unit is listed')
await desk.locator('text=/NOLA-20-0003/').first().click()
await desk.waitForTimeout(1200)
const deskUnit = await text(desk)
ok(/HELD OFF THE MARKETPLACE/.test(deskUnit), 'opening it shows the hold')
ok(/Reported damage/.test(deskUnit) && /Walk on file/.test(deskUnit), 'the findings and the walk, side by side')
ok(/Unit documentation/.test(deskUnit), 'and every documentation photo at desk size')
ok(await desk.getByRole('button', { name: /Open a damage claim/ }).count() === 1, 'with the way into a claim')
await desk.screenshot({ path: `${SHOTS}/ins-desk-unit.png`, fullPage: true })

// The claim opens into the shared review → estimate → send workspace.
await desk.getByRole('button', { name: /Open a damage claim/ }).click()
await desk.waitForTimeout(2000)
const wsBody = await text(desk)
ok(/1 · Review/.test(wsBody) && /2 · Estimate/.test(wsBody) && /3 · Send/.test(wsBody), 'a new claim opens in the claim workspace')
await desk.getByRole('button', { name: /Reviewed — add the estimate/ }).click()
await desk.waitForTimeout(700)
const estBody = await text(desk)
ok(/Upload the estimate \(photo or PDF\)/.test(estBody) && /The shop.s estimate/.test(estBody),
  'with the repair-shop estimate upload on the desk')
await desk.screenshot({ path: `${SHOTS}/ins-desk-estimate.png`, fullPage: true })

// ══ 7. A shopper never sees any of it ══
section('6 · Not for shoppers')
const shopper = await open(browser, { path: 'shop', width: 1280, height: 900 })
ok(await shopper.getByRole('button', { name: 'Inspections', exact: true }).count() === 0, 'a signed-out shopper gets no Inspections tab')

await browser.close()
process.exit(done() ? 1 : 0)
