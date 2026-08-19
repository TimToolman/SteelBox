// Admin and the marketplace chrome.
//
// Shipping lines and their contacts, the shipper-needs-a-line rule, beta
// issue triage, the filter rail's order, and the card hover affordance.

import { launch, open, scorer, text, clickCard, adminNav, SHOTS } from './lib.mjs'

const { ok, done, section } = scorer()
const browser = await launch()

// ══ 0. Landing hero ══
// The hero says one thing and starts at the top of a phone screen — the
// live-inventory badge is gone and the 88vh centred stage is desktop-only.
section('0 · Landing hero')
const phone = await open(browser, { path: '', width: 412, height: 915 })
ok(await phone.locator('.ld-hero-badge').count() === 0, 'the Live inventory badge is gone')
ok(!/Live inventory · Real photos/.test(await text(phone)), 'and its copy with it')
const navBottom = (await phone.locator('header').first().boundingBox()).y
  + (await phone.locator('header').first().boundingBox()).height
// The redesign opens the hero with an eyebrow line, so the first thing under
// the nav is that, not the h1 — measure what the shopper actually sees first.
const eyebrow = phone.locator('.ld-hero-eyebrow').first()
const eyebrowBox = await eyebrow.boundingBox()
ok(eyebrowBox.y - navBottom < 40, `the hero starts right under the nav on a phone (${Math.round(eyebrowBox.y - navBottom)}px gap)`)
ok(eyebrowBox.height < 26, `and its eyebrow stays on one line (${Math.round(eyebrowBox.height)}px tall)`)
const h1Top = (await phone.locator('h1').first().boundingBox()).y
ok(h1Top - navBottom < 90, `with the headline right behind it (${Math.round(h1Top - navBottom)}px gap)`)
ok(/How it works|From browsing to a box/i.test(await text(phone)), 'and the next section is reachable on the first screen')
await phone.screenshot({ path: `${SHOTS}/hero-mobile.png` })

const wide = await open(browser, { path: '', width: 1440, height: 900 })
const heroH = (await wide.locator('.ld-hero').boundingBox()).height
ok(heroH > 600, `desktop keeps its full-stage hero (${Math.round(heroH)}px)`)

// ══ 1. Marketplace rail + card hover ══
section('1 · Marketplace rail & card hover')
const shop = await open(browser, { path: 'shop', width: 1360, height: 950 })
const railText = ((await shop.locator('aside').first().textContent()) || '').replace(/\s+/g, ' ')
const zi = railText.indexOf('Zip Destination'), so = railText.indexOf('Sort By')
const fi = railText.indexOf('Filters'), si = railText.indexOf('Size'), ri = railText.indexOf('Reset')
ok(zi >= 0 && so > zi && fi > so && si > fi, 'the rail reads ZIP → Sort By → Filters → Size')
ok(ri > so, 'Reset sits with the Filters header, below Sort By')

const card = shop.locator('.mkt-card').first()
await card.hover()
await shop.waitForTimeout(350)
const veil = card.locator('.card-hover-veil')
ok(await veil.count() === 1, 'the card has its hover veil')
ok(Number(await veil.evaluate(el => getComputedStyle(el).opacity)) === 1, 'hovering shows the magnifier')
await clickCard(card)
await shop.waitForTimeout(1100)
ok(await shop.locator('.sb-hero').count() === 1, 'and clicking opens the detail')

// ══ 1b. The delivery ZIP survives the trip to checkout ══
// A relay fee quoted on the unit page has to reach the cart: the shopper
// already said where it's going, twice.
section('1b · ZIP carries into the cart')
// An Atlanta (FC-) unit delivered to Baltimore crosses territories — that is
// what puts a relay fee on the order.
await shop.keyboard.press('Escape')
await shop.waitForTimeout(500)
await clickCard(shop.locator('.mkt-card').filter({ hasText: /FC-/ }).first())
await shop.waitForTimeout(1300)
await shop.locator('input[placeholder="70112"]').fill('21224')
await shop.getByRole('button', { name: 'Check', exact: true }).click()
await shop.waitForTimeout(900)
const quoted = ((await text(shop)).match(/\+\$([\d,]+)/) || [])[1]
ok(!!quoted, `the unit page quotes a cross-territory relay (+$${quoted})`)
await shop.getByRole('button', { name: /Add to Cart —/ }).click()
await shop.waitForTimeout(900)
await shop.getByRole('button', { name: /^Cart/ }).first().click()
await shop.waitForTimeout(1500)
ok(await shop.locator('input[placeholder="77493"]').inputValue() === '21224', 'checkout opens with that ZIP already filled')
const cartBody = await text(shop)
ok(/Cross-territory relay/.test(cartBody), 'the relay line is on the order')
ok(cartBody.includes(quoted), `and Due today carries the $${quoted} fee`)
await shop.screenshot({ path: `${SHOTS}/cart-relay.png`, fullPage: true })
// Editing the delivery address takes over from the carried ZIP.
await shop.locator('input[placeholder="77493"]').fill('70112')
await shop.waitForTimeout(900)
ok(!/Cross-territory relay/.test(await text(shop)), 'changing the delivery ZIP re-prices it — in-territory drops the relay')
await shop.getByRole('button', { name: /^Close|✕/ }).first().click().catch(() => {})
await shop.waitForTimeout(500)

// ══ 2. Beta issue reporter, end to end ══
section('2 · Beta issue reporter')
await shop.keyboard.press('Escape')
await shop.waitForTimeout(400)
const tab = shop.getByRole('button', { name: 'Report an issue' })
ok(await tab.count() === 1, 'the floating tab is on the marketplace')
await tab.click()
await shop.waitForTimeout(350)
ok(await shop.locator('textarea[placeholder*="What happened"]').count() === 1, 'it opens the report panel')
await shop.getByRole('button', { name: 'Send report' }).click()
await shop.waitForTimeout(500)
ok(/whole point of the report|Say what happened/i.test(await text(shop)), 'an empty report is refused')
await shop.locator('textarea').fill('Zoom did nothing on the third photo of this unit.')
await shop.getByRole('button', { name: 'Send report' }).click()
await shop.waitForTimeout(800)
ok(/Logged — thank you/.test(await text(shop)), 'a guest report goes through')

// ══ 3. Reseller admin is fenced in, and triages what it filed ══
// Demo writes are session-scoped, so the report has to be filed and read
// in the same browser session — which is also how a tester works.
section('3 · Reseller admin scope & issue triage')
const res = await open(browser, { path: 'admin', email: 'admin@mvpcontainer.com', width: 1440, height: 950 })
const resBody = await text(res)
ok(!/Shipping Lines/.test(resBody), 'a reseller admin has no Shipping Lines nav')
ok(!/Sellers/.test(resBody), 'and no Sellers nav')
ok(/Beta Issues/.test(resBody), 'but does triage beta issues')

await res.getByRole('button', { name: 'Report an issue' }).click()
await res.waitForTimeout(400)
await res.locator('textarea').fill('Orders table header overlaps the first row on narrow windows.')
await res.getByRole('button', { name: 'Send report' }).click()
await res.waitForTimeout(2900)   // the panel confirms, then closes itself
await adminNav(res, 'Beta Issues').click()
await res.waitForTimeout(900)
const issues = await text(res)
ok(/Orders table header overlaps/.test(issues), 'the report reached the queue')
ok(/Copy as prompt/.test(issues), 'with a copy-as-prompt action')
ok(/Mozilla|Chrome|HeadlessChrome/i.test(issues), 'and the reporter’s browser')
await res.getByRole('button', { name: 'Mark resolved' }).first().click()
await res.waitForTimeout(600)
ok(/RESOLVED/.test(await text(res)), 'resolving works')
await res.screenshot({ path: `${SHOTS}/adm-issues.png`, fullPage: true })

// ══ 4. HQ: shipping lines + contacts ══
section('4 · Shipping lines & contacts')
const hq = await open(browser, { path: 'admin', email: 'tgmoore@gmail.com', width: 1440, height: 950 })
await adminNav(hq, 'Shipping Lines').click()
await hq.waitForTimeout(900)
ok(/Meridian Lines/.test(await text(hq)), 'HQ sees the directory')
await hq.getByRole('button', { name: 'Contacts' }).first().click()
await hq.waitForTimeout(900)
const cView = await text(hq)
ok(/Contacts at Meridian Lines/.test(cView), 'the contacts panel opens for the line')
ok(/shipper@meridianlines.com/.test(cView), 'listing the existing account')
ok(/CAN SIGN IN/.test(cView), 'with its access state')
await hq.locator('input[placeholder="Full name"]').fill('Ana Osei')
await hq.locator('input[placeholder="email@line.com"]').fill('ana.osei@meridianlines.com')
await hq.getByRole('button', { name: 'Invite' }).click()
await hq.waitForTimeout(1000)
ok(/ana.osei@meridianlines.com/.test(await text(hq)), 'inviting adds the contact')
await hq.getByRole('button', { name: 'Hide access' }).last().click()
await hq.waitForTimeout(700)
ok(/ACCESS HIDDEN/.test(await text(hq)), 'hide access flips the state without dropping the contact')
await hq.screenshot({ path: `${SHOTS}/adm-contacts.png`, fullPage: true })

// ══ 5. A shipper account must carry a line ══
section('5 · Shipper needs a line')
await adminNav(hq, 'Users & Access').click()
await hq.waitForTimeout(900)
await hq.getByRole('button', { name: 'Add User' }).click()
await hq.waitForTimeout(500)
await hq.locator('input[placeholder="Jane Smith"]').fill('Lineless Larry')
await hq.locator('input[placeholder="user@mvpcontainer.co"]').fill('larry@nowhere.dev')
await hq.locator('select:has(option[value="shipper"])').first().selectOption('shipper')
await hq.waitForTimeout(350)
ok(/Shipping line \(required\)/.test(await text(hq)), 'the shipper role surfaces a mandatory line picker')
await hq.locator('input[placeholder="At least 8 characters"]').fill('test1234x')
await hq.getByRole('button', { name: 'Create Account' }).click()
await hq.waitForTimeout(700)
ok(/Pick which shipping line/.test(await text(hq)), 'saving without a line is refused')

// ══ 6. The retired adjuster role is gone from the picker ══
const roleOpts = await hq.locator('select:has(option[value="shipper"])').first()
  .locator('option').evaluateAll(els => els.map(e => e.value))
ok(!roleOpts.includes('adjuster'), 'the retired adjuster role is not offered')
ok(roleOpts.includes('inspector'), 'inspector is')

await browser.close()
process.exit(done() ? 1 : 0)
