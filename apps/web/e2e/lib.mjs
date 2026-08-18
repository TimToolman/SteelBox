// Shared plumbing for the browser sweeps. See README.md for the run recipe.

import { mkdirSync } from 'node:fs'

export const BASE = process.env.SBX_BASE || 'http://localhost:4890/SteelBox'
export const SHOTS = new URL('./shots/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })

// A 1×1 PNG — every capture path takes a file, none of them care what's in it.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64')

export async function launch() {
  const { chromium } = await import(process.env.PLAYWRIGHT_LIB || 'playwright')
  return chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) })
}

// A tiny assertion recorder — every sweep prints the same shape so a runner
// can total them without parsing prose.
export function scorer() {
  let pass = 0, fail = 0
  const ok = (cond, msg) => { cond ? (pass++, console.log('  ✓', msg)) : (fail++, console.log('  ✗', msg)) }
  const done = () => {
    console.log(`\n${pass} passed, ${fail} failed`)
    return fail
  }
  return { ok, done, section: t => console.log(t) }
}

export const text = async page => ((await page.textContent('body')) || '').replace(/\s+/g, ' ')

// Every sweep signs in the same way: any password works on seeded demo
// accounts, and the ZIP prompt is pre-dismissed so it never eats a click.
export async function open(browser, { path = '', email, width = 1280, height = 950, files = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true })
  const page = await ctx.newPage()
  await page.addInitScript(() => { try { sessionStorage.setItem('sbx_zip_prompted', '1') } catch {} })
  if (files) page.on('filechooser', async fc => { await fc.setFiles({ name: 'x.png', mimeType: 'image/png', buffer: PNG }) })
  await page.goto(`${BASE}/${path}`, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  if (email && await page.locator('input[type="password"]').count()) {
    await page.locator('input').nth(0).fill(email)
    await page.locator('input[type="password"]').fill('demo')
    await page.getByRole('button', { name: /sign in/i }).first().click()
    await page.waitForTimeout(1800)
  }
  return page
}

// Navigate within the app, same session.
export async function nav(page, path, wait = 1500) {
  await page.goto(`${BASE}/${path}`, { waitUntil: 'load' })
  await page.waitForTimeout(wait)
}

// The marketplace has no sign-in form of its own (it lives behind the
// account menu), so sign in on a gated route first and carry the session
// over — which is what a tester following a portal link actually does.
export async function openVia(browser, { gate = 'field', path = 'shop', email, width = 1360, height = 950 } = {}) {
  const page = await open(browser, { path: gate, email, width, height })
  await nav(page, path)
  return page
}

// The marketplace card grid intercepts real clicks with its hover veil;
// dispatching the click on the element itself is what a tap actually does.
export const clickCard = loc => loc.evaluate(el => el.click())

// Admin left-nav items are divs with a count badge, so neither getByRole
// nor an exact-text match finds them.
export const adminNav = (page, label) => page.getByText(new RegExp(`^${label}`)).first()

// ── Walking a unit ──────────────────────────────────────────
// Several sweeps need a completed walk-around. The station chrome is stable;
// the answers are not, so "the clean answer" is simply the first option
// button on the card — the walk always lists them best-first.
const CHROME = /^(← |Retake|Capture|Found damage|Next stop|Finish|Home|Pickups|Inspections|Inbox|Profile|Report an issue|✕|Take the damage photo|Retake damage photo|Add a photo|Send to inspector|Done)/

const nextBtn = page => page.getByRole('button', { name: /Next stop|Finish walk-around/ }).first()
const blocked = async page => {
  const b = nextBtn(page)
  return !(await b.count()) ? true : (await b.getAttribute('aria-disabled')) === 'true'
}

export async function answerStation(page, { clean = true } = {}) {
  const next = nextBtn(page)
  if (!(await next.count())) return false
  if (!(await blocked(page))) return true
  // Pick an answer: first option = clean, last = the capped/structural one.
  const opts = await page.locator('button').all()
  const choices = []
  for (const b of opts) {
    const t = ((await b.textContent()) || '').trim()
    if (t && !CHROME.test(t) && t.length > 12) choices.push(b)
  }
  if (choices.length) await (clean ? choices[0] : choices[choices.length - 1]).click()
  await page.waitForTimeout(350)
  // Photo gates: shoot whatever the station still wants.
  for (const cap of await page.getByRole('button', { name: /^Capture$/ }).all()) {
    await cap.click(); await page.waitForTimeout(1100)
  }
  if (await blocked(page)) {
    const cam = page.getByRole('button', { name: /Photograph the damage|damage photo/i }).first()
    if (await cam.count()) { await cam.click(); await page.waitForTimeout(1400) }
  }
  return !(await blocked(page))
}

// Walk every station to the summary. `damageAt` picks the worst answer at
// that stop (0-based) so the walk ends in a finding.
export async function walkUnit(page, { damageAt = -1, stations = 8 } = {}) {
  for (let i = 0; i < stations; i++) {
    await answerStation(page, { clean: i !== damageAt })
    const next = nextBtn(page)
    if (!(await next.count()) || await blocked(page)) break
    await next.click()
    await page.waitForTimeout(800)
  }
}
