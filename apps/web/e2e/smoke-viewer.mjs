// The photo viewer, everywhere it appears.
//
// One control cluster — previous · zoom out · level · zoom in · next —
// under every image box, on the marketplace gallery, the full-screen
// viewer, the claim page and the shipper's evidence strip.

import { launch, open, openVia, nav, scorer, text, clickCard, SHOTS } from './lib.mjs'

const { ok, done, section } = scorer()
const browser = await launch()

const ORDER = ['Previous photo', 'Zoom out', 'Fit to screen', 'Zoom in', 'Next photo']
const scaleOf = async loc => {
  const t = await loc.evaluate(el => getComputedStyle(el).transform)
  const m = /matrix\(([\d.\-]+)/.exec(t)
  return m ? Number(m[1]) : 1
}

// ══ 1. Marketplace gallery ══
section('1 · Marketplace hero gallery')
const p = await open(browser, { path: 'shop', width: 1360, height: 950 })
await clickCard(p.locator('.mkt-card').first())
await p.waitForTimeout(1200)

const hero = p.locator('.sb-hero')
ok(await hero.count() === 1, 'the detail modal opens on the hero gallery')
const heroBox = await hero.boundingBox()
ok(heroBox.height >= 280, `the hero is tall (${Math.round(heroBox.height)}px)`)

const bar = p.locator('.sb-vc').first()
const barBox = await bar.boundingBox()
ok(barBox.y > heroBox.y + heroBox.height - 2, 'the controls sit under the image box')
ok(Math.abs((barBox.x + barBox.width / 2) - (heroBox.x + heroBox.width / 2)) < 24, 'and are centred under it')
const order = await bar.locator('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
ok(JSON.stringify(order) === JSON.stringify(ORDER), `previous · zoom out · zoom in · next, in order`)

const thumbs = p.locator('.sb-thumb')
ok(await thumbs.count() === 9, 'the strip shows all 9 slots')
ok(await thumbs.nth(0).evaluate(el => el.classList.contains('is-active')), 'the first is active')
const activeOp = Number(await thumbs.nth(0).evaluate(el => getComputedStyle(el).opacity))
const restOp = Number(await thumbs.nth(3).evaluate(el => getComputedStyle(el).opacity))
ok(activeOp === 1 && restOp < 0.7, `the active thumbnail reads at full strength (${activeOp} vs ${restOp})`)

// ══ 2. Zoom in place ══
section('2 · Zoom on the hero')
const heroImg = p.locator('.sb-hero img').first()
ok(await scaleOf(heroImg) === 1, 'opens fit to the stage')
await p.getByRole('button', { name: 'Zoom in' }).first().click()
await p.waitForTimeout(250)
ok(await scaleOf(heroImg) > 1, 'zoom in enlarges it without leaving the page')
ok(/150%/.test(await text(p)), 'and reports the level')
await p.getByRole('button', { name: 'Fit to screen' }).first().click()
await p.waitForTimeout(250)
ok(await scaleOf(heroImg) === 1, 'fit-to-screen resets it')
await p.getByRole('button', { name: 'Next photo' }).first().click()
await p.waitForTimeout(350)
ok(/2 \/ 9/.test(await text(p)), 'next steps the gallery')
ok(await thumbs.nth(1).evaluate(el => el.classList.contains('is-active')), 'the active thumbnail follows')
await p.getByRole('button', { name: 'Previous photo' }).first().click()
await p.waitForTimeout(300)

// ══ 3. Full screen ══
section('3 · Full screen')
await heroImg.click()
await p.waitForTimeout(500)
const dlg = p.locator('[role="dialog"][aria-modal="true"]')
ok(await dlg.count() === 1, 'clicking the hero opens the full-screen viewer')
const lbImg = dlg.locator('img').first()
const imgBox = await lbImg.boundingBox()
ok(imgBox.height > heroBox.height, 'bigger than the hero')
const closeBox = await dlg.getByRole('button', { name: 'Close', exact: true }).boundingBox()
ok(closeBox.y < imgBox.y + 60, 'Close sits on the image box, not the far corner')
ok(await dlg.getByRole('button', { name: /Show 3D View/ }).count() === 1, 'the Show 3D View pill is there')
const label = dlg.locator('span', { hasText: /^\d+ \/ \d+$/ }).first()
const ctlBox = await dlg.locator('.sb-vc').boundingBox()
ok((await label.boundingBox()).y > imgBox.y + imgBox.height - 60, 'the counter sits at the bottom by the controls')
ok(ctlBox.y > imgBox.y + imgBox.height - 2, 'controls under the image here too')
await p.screenshot({ path: `${SHOTS}/vw-fullscreen.png` })

const skuBefore = (await text(p)).match(/[A-Z]{2,4}-\d\d-\d{4}/)?.[0]
await p.getByRole('button', { name: 'Zoom in' }).nth(1).click()
await p.waitForTimeout(250)
ok(await scaleOf(lbImg) > 1, 'zoom works full screen')
await p.keyboard.press('ArrowRight')
await p.waitForTimeout(400)
ok(await scaleOf(lbImg) === 1, 'moving photo resets the zoom')
const skuAfter = (await text(p)).match(/[A-Z]{2,4}-\d\d-\d{4}/)?.[0]
ok(!!skuBefore && skuAfter === skuBefore, 'the arrow moved the photo, not the container behind it')
await p.keyboard.press('Escape')
await p.waitForTimeout(350)
ok(await dlg.count() === 0, 'Escape closes it')

// Show 3D View exits to the gallery's 3D slot.
await heroImg.click()
await p.waitForTimeout(450)
await p.getByRole('button', { name: /Show 3D View/ }).click()
await p.waitForTimeout(600)
ok(await dlg.count() === 0, 'the 3D pill leaves the viewer')
ok(/9 \/ 9/.test(await text(p)), 'and lands on the 3D slot')

// ══ 4. The claim page ══
section('4 · Claim workspace galleries')
const ws = await open(browser, { path: 'supplier', email: 'supplier@oceanbox.com' })
await nav(ws, 'claim?id=clm_demo2')
await ws.waitForSelector('text=/1 · Review/', { timeout: 15000 })
await ws.waitForTimeout(600)
const evidence = ws.locator('figure img')
ok(await evidence.count() >= 2, 'the claim carries evidence photos')
ok(await evidence.first().evaluate(el => getComputedStyle(el).cursor) === 'zoom-in', 'they signal they open')
await evidence.first().click()
await ws.waitForTimeout(450)
const wsDlg = ws.locator('[role="dialog"][aria-modal="true"]')
ok(await wsDlg.count() === 1, 'a claim photo opens the same viewer')
const wsOrder = await wsDlg.locator('.sb-vc button').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
ok(JSON.stringify(wsOrder) === JSON.stringify(ORDER), 'with the identical controls')
ok(/1 \/ 2/.test(await text(ws)), 'and the position in the set')
await ws.getByRole('button', { name: 'Next photo' }).click()
await ws.waitForTimeout(350)
ok(/2 \/ 2/.test(await text(ws)), 'next moves through that set only')
await ws.keyboard.press('Escape')
await ws.waitForTimeout(300)
// Unit documentation is its own set.
const unitShots = ws.locator('img[alt^="Unit documentation"]')
const un = await unitShots.count()
ok(un >= 8, `unit documentation shows ${un} shots`)
await unitShots.nth(2).click()
await ws.waitForTimeout(400)
ok(new RegExp(`3 / ${un}`).test(await text(ws)), 'opening one lands in its own set')
await ws.keyboard.press('Escape')

// ══ 5. Shipper evidence ══
section('5 · Shipper evidence strip')
const shp = await open(browser, { path: 'shipper', email: 'shipper@meridianlines.com' })
const ev = shp.locator('div[style*="overflow-x"] img').first()
if (await ev.count()) {
  ok(await ev.evaluate(el => getComputedStyle(el).cursor) === 'zoom-in', 'evidence photos signal they open')
  await ev.click()
  await shp.waitForTimeout(450)
  ok(await shp.locator('[role="dialog"][aria-modal="true"]').count() === 1, 'a shipper can zoom into what they are paying for')
} else { ok(false, 'no evidence strip on the shipper queue') }

await browser.close()
process.exit(done() ? 1 : 0)
