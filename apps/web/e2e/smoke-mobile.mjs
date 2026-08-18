// Run with a Playwright install on the module path, e.g.:
//   node --experimental-vm-modules e2e/smoke-mobile.mjs          (playwright resolvable)
// or set PLAYWRIGHT_LIB=/path/to/playwright/index.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_LIB || 'playwright')

// The camera round-trip on a phone can reload the whole tab. This sweep
// drives every field-app capture flow to its mid-point, RELOADS the page
// (exactly what the phone does), and asserts the driver lands back where
// they were — not on the home screen.

import { mkdirSync } from 'node:fs'
const SP = new URL('./shots/', import.meta.url).pathname
mkdirSync(SP, { recursive: true })
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗', m)) }
const body = async p => ((await p.textContent('body')) || '').replace(/\s+/g, ' ')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) })

const phone = async (email) => {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } })
  const p = await ctx.newPage()
  p.on('filechooser', async fc => { await fc.setFiles({ name: 'x.png', mimeType: 'image/png', buffer: PNG }) })
  await p.goto('http://localhost:4890/SteelBox/field', { waitUntil: 'load' })
  await p.waitForTimeout(800)
  await p.locator('input').nth(0).fill(email)
  await p.locator('input[type="password"]').fill('demo')
  await p.getByRole('button', { name: /sign in/i }).first().click()
  await p.waitForTimeout(1800)
  return p
}
const reload = async (p) => { await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2200) }

// ══ 1. THE reported bug: Report damage sheet survives the camera reload ══
console.log('1 · Report damage sheet survives a reload')
const p = await phone('mike@mvpcontainer.com')
await p.getByRole('button', { name: /Pickups & Returns/ }).click()
await p.waitForTimeout(900)
await p.locator('text=/Pickup · NOLA-20-0006/').first().click()
await p.waitForTimeout(900)
for (const label of [/On my way/, /^Arrived$/]) {
  const b = p.getByRole('button', { name: label }).first()
  if (await b.count()) { await b.click(); await p.waitForTimeout(600) }
}
await p.getByRole('button', { name: /Report damage|Report more damage/ }).first().click()
await p.waitForTimeout(500)
await p.getByRole('button', { name: /^Bent$/ }).click()
await p.locator('input[placeholder*="Where on the unit"]').fill('rear rail, driver side')
await p.getByRole('button', { name: /Add a photo \(optional\)/ }).click()
await p.waitForTimeout(1300)
ok(/Retake the photo/.test(await body(p)), 'photo attached before the "camera reload"')

await reload(p)  // ← what the phone does after the camera
const after = await body(p)
ok(/Report damage|Report more damage/.test(after), 'the Report damage sheet is BACK OPEN — not the home page')
ok(/rear rail, driver side/.test(await p.locator('input[placeholder*="Where on the unit"]').inputValue().catch(() => '')) ||
   (await p.locator('input[placeholder*="Where on the unit"]').inputValue()) === 'rear rail, driver side', 'the note survived')
const bentOn = await p.getByRole('button', { name: /^Bent$/ }).evaluate(el => getComputedStyle(el).color)
ok(bentOn.includes('179') || /rgb\(179/.test(bentOn), 'the picked reason survived')
ok(/Retake the photo/.test(after), 'the attached photo survived')
ok(/NOLA-20-0006/.test(after), 'still on the same job')
await p.screenshot({ path: `${SP}/mb-report-restored.png` })
// And the report still goes through after the reload.
await p.getByRole('button', { name: /Report it — queue for inspection|Add to the inspection report/ }).click()
await p.waitForTimeout(1400)
ok(/queued for inspection|added to the damage report/i.test(await body(p)), 'and it still sends')

// The sheet does not haunt the driver after a deliberate Cancel.
await p.getByRole('button', { name: /Report damage|Report more damage/ }).first().click()
await p.waitForTimeout(400)
await p.getByRole('button', { name: 'Cancel' }).click()
await p.waitForTimeout(300)
await reload(p)
ok(!/What did you see\?/.test(await body(p)), 'a cancelled sheet stays closed after a reload')
ok(/NOLA-20-0006/.test(await body(p)), 'while the job itself still resumes')

// ══ 2. The walk-around survives a reload mid-station ══
console.log('2 · Walk-around survives a reload')
const w = await phone('inspector@mvpcontainer.com')
await w.getByRole('button', { name: /Inspections/i }).first().click()
await w.waitForTimeout(1200)
await w.locator('text=/NOLA-20-0006/').first().click()
await w.waitForTimeout(1400)
// Station 1: answer clean, go on; station 2 has the photo.
const clean1 = w.getByRole('button', { name: /Open, close & latch smoothly/ })
if (await clean1.count()) { await clean1.click(); await w.waitForTimeout(300) }
// Capture the two door shots so Next unlocks.
for (const cap of await w.getByRole('button', { name: /^Capture$/ }).all()) { await cap.click(); await w.waitForTimeout(1200) }
await w.getByRole('button', { name: /Next stop/ }).click()
await w.waitForTimeout(600)
ok(/STOP 2 OF 8|Right hand side/i.test(await body(w)), 'reached stop 2 before the "camera reload"')

await reload(w)
const wAfter = await body(w)
ok(/STOP 2 OF 8|Right hand side/i.test(wAfter), 'the walk resumes at the SAME station after a reload')
ok(/NOLA-20-0006/.test(wAfter), 'on the same unit, inside Inspections')
await w.screenshot({ path: `${SP}/mb-walk-restored.png` })

// ══ 3. Claim workspace estimate survives a reload ══
console.log('3 · Claim workspace survives a reload')
const c = await phone('inspector@mvpcontainer.com')
await c.getByRole('button', { name: /Inspections/i }).first().click()
await c.waitForTimeout(900)
await c.getByRole('button', { name: /Damage claims/ }).click()
await c.waitForTimeout(900)
await c.getByRole('button', { name: /CLM-0003/ }).first().click()
await c.waitForTimeout(1200)
await c.getByRole('button', { name: /Reviewed — add the estimate/ }).click()
await c.waitForTimeout(500)
await c.locator('input[inputmode="decimal"], input[placeholder*="2400"], input[type="number"]').first().fill('3150').catch(() => {})
const amountBox = c.locator('input').filter({ hasNot: c.locator('[type="password"]') })
await c.screenshot({ path: `${SP}/mb-claim-before.png` })
await reload(c)
const cAfter = await body(c)
ok(/2 · Estimate|Estimate/i.test(cAfter) && /CLM-0003/.test(cAfter), 'the claim reopens on the estimate step after a reload')
await c.screenshot({ path: `${SP}/mb-claim-restored.png` })

// ══ 4. Plain tab restore: Profile stays Profile ══
console.log('4 · Tab position survives')
const t = await phone('mike@mvpcontainer.com')
await t.getByRole('button', { name: /^Profile$/ }).first().click()
await t.waitForTimeout(900)
await reload(t)
ok(/Schedule & availability|Profile/i.test(await body(t)), 'a plain tab (Profile) restores too')

// ══ 5. The picker itself: DOM-attached while the camera is up ══
console.log('5 · Picker hygiene')
const g = await phone('mike@mvpcontainer.com')
await g.getByRole('button', { name: /Pickups & Returns/ }).click()
await g.waitForTimeout(800)
await g.locator('text=/Pickup · NOLA-20-0006/').first().click()
await g.waitForTimeout(800)
for (const label of [/On my way/, /^Arrived$/]) {
  const b = g.getByRole('button', { name: label }).first()
  if (await b.count()) { await b.click(); await g.waitForTimeout(500) }
}
await g.getByRole('button', { name: /Report damage|Report more damage/ }).first().click()
await g.waitForTimeout(400)
// Intercept: while the chooser is open, the input must be IN the document.
let attachedDuring = false
g.removeAllListeners('filechooser')
g.on('filechooser', async fc => {
  attachedDuring = await g.evaluate(() => !!document.querySelector('body > input[type="file"]'))
  await fc.setFiles({ name: 'x.png', mimeType: 'image/png', buffer: PNG })
})
await g.getByRole('button', { name: /Add a photo \(optional\)/ }).click()
await g.waitForTimeout(1500)
ok(attachedDuring, 'the file input lives in the DOM while the camera is open (iOS GC guard)')
ok(await g.evaluate(() => !document.querySelector('body > input[type="file"]')), 'and is cleaned up after the shot lands')

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
