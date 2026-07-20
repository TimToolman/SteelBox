// ============================================================
// MVP Container public landing — marketplace-first storefront
// Route: / (public). Statically prerendered at build time
// (see src/entry-ssg.tsx + prerender.mjs), then hydrated with
// live inventory client-side.
//
// SSR rules for everything in this file: no window/document
// access during render (effects only), plain <a> navigation,
// all brand/contact/territory data from the resolved Tenant,
// all numbers from lib/specs.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import '../../styles/landing.css'
import { SIZE_SPECS, GRADE_META, GRADE_ORDER, CUSTOM_MODS } from '../../lib/specs'
import { photoUrl, quotes, isZipCovered, SIZE_LABEL, type Container } from '../../lib/api'
import { getInventory } from '../../tenant/inventory'
import type { Tenant, TenantCity } from '../../tenant'
import { attributionFields } from '../../lib/attribution'
import {
  buildFaq, jsonLdLocalBusiness, jsonLdProducts, jsonLdFaq, jsonLdBreadcrumb,
} from './seo'

// Base-aware internal link ('/SteelBox/' on Pages, '/' in production).
export const u = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

const heroImg = () => u('og/container-hero.jpg')

function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}

// ── Nav ───────────────────────────────────────────────────

export function SiteNav({ tenant }: { tenant: Tenant }) {
  const [open, setOpen] = useState(false)
  const navRef = React.useRef<HTMLElement>(null)
  // Close the burger dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const links = [
    { label: 'For Sale', href: u('shop?tab=buy'), cat: true },
    { label: 'Rentals', href: u('shop?tab=rent'), cat: true },
    { label: 'Custom Builds', href: u('shop?tab=custom'), cat: true },
    { label: 'How It Works', href: u('#how-it-works') },
    { label: 'Why Us', href: u('#why-us') },
    { label: 'FAQ', href: u('#faq') },
    { label: 'Service Area', href: u('service-area/') },
    { label: 'Contact', href: tenant.phoneHref },
  ]
  return (
    <header className="ld-nav" ref={navRef}>
      <div className="ld-wrap">
        <div className="ld-nav-row">
          <a className="ld-logo" href={u('')} aria-label={`${tenant.name} home`}>
            <span className="ld-logo-mark" aria-hidden="true" />
            {tenant.logoText}
          </a>
          <nav aria-label="Main">
            <ul className="ld-nav-links">
              {links.map(l => (
                <li key={l.label} className={l.cat ? '' : 'ld-nav-sec'}>
                  <a className={l.cat ? 'ld-nav-cat' : ''} href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ld-nav-right">
            <a className="ld-nav-phone" href={tenant.phoneHref}>{tenant.phone}</a>
            <a className="ld-btn ld-btn--accent ld-btn--sm" href={u('#instant-price')}>Get Instant Price</a>
            <button className="ld-nav-burger" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(o => !o)}>☰</button>
          </div>
        </div>
        {open && (
          <nav className="ld-nav-mobile" aria-label="Menu">
            {links.map(l => (
              <a key={l.label} className={l.cat ? 'ld-m-cat' : ''} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}

// ── Hero ──────────────────────────────────────────────────

function Hero({ tenant, zip, setZip, city }: { tenant: Tenant; zip: string; setZip: (z: string) => void; city?: TenantCity }) {
  const [input, setInput] = useState(city?.zip ?? '')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = input.trim().slice(0, 5)
    if (v.length === 5) {
      setZip(v)
      document.getElementById('inventory')?.scrollIntoView({ behavior: 'smooth' })
    }
  }
  return (
    <section className="ld-hero" id="instant-price">
      <div className="ld-wrap">
        <div className="ld-hero-grid">
          <div>
            <h1>
              {city
                ? `Shipping Containers for Sale in ${city.name}, ${city.state}`
                : 'Shipping Containers With Real Photos, Real Grades, and a Real Delivered Price'}
            </h1>
            <p className="ld-hero-sub">
              {city
                ? `Field-inspected new and used conex boxes delivered to ${city.name} in 3–5 business days. Every unit photographed, every grade verified, and you don't pay until it's on the ground.`
                : `Every container on our marketplace is field-inspected, photo-documented, and priced to your ZIP — no "call for price," no mystery box on a truck. Pay when it lands.`}
            </p>
            <form className="ld-zip-form" onSubmit={submit}>
              <label htmlFor="hero-zip" style={{ position: 'absolute', left: '-9999px' }}>Delivery ZIP code</label>
              <input
                id="hero-zip" className="ld-zip-input" inputMode="numeric" pattern="[0-9]{5}"
                placeholder="Delivery ZIP" value={input} maxLength={5}
                onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
              />
              <button className="ld-btn ld-btn--accent" type="submit">See your delivered price</button>
            </form>
            {zip && !isZipCovered(zip) && (
              <p className="ld-hero-secondary" role="status">
                {zip} is outside our standard delivery area — <a href={tenant.phoneHref}>call {tenant.phone}</a> and we'll quote it anyway.
              </p>
            )}
            <p className="ld-hero-secondary">
              or <a href={u('shop')}>browse all inventory →</a>
            </p>
            <div className="ld-hero-points">
              <span>16-photo inspection</span>
              <span>Pay on delivery</span>
              <span>3–5 day delivery</span>
            </div>
          </div>
          <div className="ld-hero-photo">
            <img
              src={heroImg()} width="750" height="1000"
              alt={`Field-inspected steel shipping container ready for delivery by ${tenant.name}`}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Shop-by strip ─────────────────────────────────────────

function ShopBy() {
  const cards: { title: string; sub: string; href: string }[] = [
    { title: '20ft Containers', sub: 'Standard & high cube', href: u('shop?size=20ft-std,20ft-hc') },
    { title: '40ft Containers', sub: 'Standard & high cube', href: u('shop?size=40ft-std,40ft-hc') },
    { title: 'Standard Height', sub: `8'6" — the workhorse`, href: u('shop?size=20ft-std,40ft-std') },
    { title: 'High Cube', sub: `9'6" — extra ceiling`, href: u('shop?size=20ft-hc,40ft-hc') },
    ...GRADE_ORDER.filter(g => g !== 'X').map(g => ({
      title: `Grade ${g} · ${GRADE_META[g].label}`, sub: GRADE_META[g].desc.split('.')[0], href: u(`shop?grade=${g}`),
    })),
    { title: 'Conex Boxes', sub: 'New one-trip units', href: u('shop?cond=new') },
    { title: 'Used Conex Boxes', sub: 'Inspected & watertight', href: u('shop?cond=used') },
  ]
  return (
    <section className="ld-shopby" aria-labelledby="shopby-h">
      <div className="ld-wrap">
        <p className="ld-kicker">Shop by</p>
        <h2 id="shopby-h" className="ld-h2">Find the right box fast</h2>
        <div className="ld-shopby-row">
          {cards.map(c => (
            <a key={c.title} className="ld-shopby-card" href={c.href}>
              <b>{c.title}</b>
              <span>{c.sub}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Live inventory grid ───────────────────────────────────

function UnitCard({ c, zip }: { c: Container; zip: string }) {
  const photo = c.photos?.filter(Boolean)[0]
  const covered = zip ? isZipCovered(zip) : false
  return (
    <article className="ld-inv-card">
      <div className="ld-inv-photo">
        {photo
          ? <img src={photoUrl(photo)} alt={`${SIZE_LABEL[c.size] ?? c.size} container ${c.sku}, grade ${c.grade}`} loading="lazy" width="480" height="270" />
          : <img src={heroImg()} alt={`${SIZE_LABEL[c.size] ?? c.size} container ${c.sku}`} loading="lazy" width="480" height="270" />}
        <span className="ld-inv-grade" style={{ background: GRADE_META[c.grade]?.color ?? '#374151' }}>Grade {c.grade}</span>
      </div>
      <div className="ld-inv-body">
        <h3 className="ld-inv-title">{SIZE_LABEL[c.size] ?? c.size}</h3>
        <p className="ld-inv-meta">{GRADE_META[c.grade]?.label} · {c.condition === 'new' ? 'New' : 'Used'} · {c.sku}</p>
        <p className="ld-inv-price">
          ${c.buyPrice.toLocaleString()}
          {c.rentMonthly ? <small> or ${c.rentMonthly}/mo</small> : null}
        </p>
        <p className="ld-inv-delivered">
          {zip && covered
            ? `Delivered to ${zip}${c.deliveryIncluded ? ' — delivery included' : ' — delivery quoted at checkout'}`
            : c.deliveryIncluded ? 'Delivery included' : 'Enter ZIP for delivered price'}
        </p>
        <div className="ld-inv-cta">
          <a className="ld-btn ld-btn--brand ld-btn--sm" href={u(`shop?size=${c.size}`)}>View &amp; buy</a>
        </div>
      </div>
    </article>
  )
}

// Static category cards — the SSG fallback when live stock isn't
// baked in, and the client's skeleton until the fetch lands.
function CategoryCard({ size }: { size: (typeof SIZE_SPECS)[number] }) {
  return (
    <article className="ld-inv-card">
      <div className="ld-inv-photo">
        <img src={heroImg()} alt={`${size.label} shipping container`} loading="lazy" width="480" height="270" />
      </div>
      <div className="ld-inv-body">
        <h3 className="ld-inv-title">{size.label}</h3>
        <ul className="ld-spec-list">
          <li>{size.extL} × {size.extW} × {size.extH} outside</li>
          <li>{size.capacityCuFt.toLocaleString()} cu ft · {size.floorSqFt} sq ft floor</li>
          <li>Payload {size.payloadLb.toLocaleString()} lb</li>
        </ul>
        <div className="ld-inv-cta">
          <a className="ld-btn ld-btn--brand ld-btn--sm" href={u(`shop?size=${size.size}`)}>See live prices</a>
        </div>
      </div>
    </article>
  )
}

export function InventorySection({ tenant, zip, initialInventory, city }: {
  tenant: Tenant; zip: string; initialInventory: Container[] | null; city?: TenantCity
}) {
  const [units, setUnits] = useState<Container[] | null>(initialInventory)
  useEffect(() => {
    let live = true
    getInventory({ tenantId: tenant.id, nearZip: zip || undefined, scope: 'tenant' })
      .then(r => { if (live) setUnits(r.units) })
      .catch(() => { /* keep SSG-baked units (or category cards) if the API is unreachable */ })
    return () => { live = false }
  }, [tenant.id, zip])

  const show = units?.slice(0, 8)
  return (
    <section className="ld-section" id="inventory" aria-labelledby="inv-h">
      <div className="ld-wrap">
        <div className="ld-inv-head">
          <div>
            <p className="ld-kicker">Live inventory</p>
            <h2 id="inv-h" className="ld-h2">{city ? `In stock for ${city.name} delivery` : 'In stock right now'}</h2>
            <p className="ld-section-sub">
              These are the actual units in our yards — the photos are of the box you'll get, and the price is the price.
            </p>
          </div>
          <a className="ld-btn ld-btn--ghost ld-btn--sm" href={u('shop')}>Browse all inventory</a>
        </div>
        <div className="ld-inv-grid">
          {show && show.length > 0
            ? show.map(c => <UnitCard key={c.id} c={c} zip={zip} />)
            : SIZE_SPECS.map(s => <CategoryCard key={s.size} size={s} />)}
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────

export function HowItWorks() {
  const steps = [
    { t: 'Pick your grade', d: 'A through R, each verified in a field inspection with a full photo set — you see exactly what "used" means on that unit.', href: u('shop?grade=A') },
    { t: 'Pick your size', d: `20ft or 40ft, standard or high cube. Not sure? The specs on every card show floor space, ceiling, and payload.`, href: u('shop') },
    { t: 'Add your options', d: 'Rental term, custom modifications, lock boxes — options price out on the spot, not in a callback.', href: u('shop?tab=custom') },
    { t: 'Schedule delivery', d: `Pick a window that works. Payment is held until the container is set on your site and you've walked around it.`, href: u('shop') },
  ]
  return (
    <section className="ld-section ld-section--tint" id="how-it-works" aria-labelledby="how-h">
      <div className="ld-wrap">
        <p className="ld-kicker">How it works</p>
        <h2 id="how-h" className="ld-h2">From browsing to a box on the ground in four steps</h2>
        <ol className="ld-steps" style={{ listStyle: 'none', padding: 0 }}>
          {steps.map((s, i) => (
            <li className="ld-step" key={s.t}>
              <span className="ld-step-num" aria-hidden="true">{i + 1}</span>
              <b>{s.t}</b>
              <p>{s.d} <a href={s.href} style={{ fontWeight: 700 }}>Start here</a></p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ── Trust band ────────────────────────────────────────────

export function TrustBand({ tenant }: { tenant: Tenant }) {
  const cards = [
    { t: '16-photo inspection', d: 'Roof, seals, floor, corners, doors open and closed — the full set on every listing, taken in our yard, of your exact unit.' },
    { t: 'Verified grade', d: 'Grades are assigned by our field inspectors against a written standard, not by whoever answers the phone.' },
    { t: 'Pay on delivery', d: 'Your card is authorized at checkout but only charged after the container is delivered and you\'ve confirmed it matches the listing.' },
    { t: 'Local trucks, local yards', d: `Dispatched from ${tenant.depots.join(', ')} — a real dispatcher you can text, not a broker in another time zone.` },
  ]
  return (
    <section className="ld-section" id="why-us" aria-labelledby="why-h">
      <div className="ld-wrap">
        <p className="ld-kicker">Why {tenant.name}</p>
        <h2 id="why-h" className="ld-h2">Built so you never buy a container sight-unseen</h2>
        <div className="ld-trust-grid">
          {cards.map(c => (
            <div className="ld-trust-card" key={c.t}><b>{c.t}</b><p>{c.d}</p></div>
          ))}
        </div>
        {tenant.testimonials.length > 0 && (
          <div className="ld-quotes">
            {tenant.testimonials.map((t, i) => (
              <blockquote className="ld-quote" key={i}>
                “{t.quote}”
                <footer>— {t.who}</footer>
              </blockquote>
            ))}
          </div>
        )}
        <p className="ld-section-sub" style={{ marginTop: 18 }}>
          <a href={tenant.googleReviewsUrl} rel="noopener noreferrer" target="_blank" style={{ fontWeight: 700 }}>
            Read our reviews on Google →
          </a>
        </p>
      </div>
    </section>
  )
}

// ── Lead quick form (rental / custom quotes + CTA target) ─

export function LeadQuickForm({ need, source, buttonLabel }: { need: string; source: string; buttonLabel: string }) {
  const [form, setForm] = useState({ firstName: '', phone: '', email: '', deliveryZip: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName.trim() || (!form.phone.trim() && !form.email.trim())) { setState('error'); return }
    setState('busy')
    const payload = { ...form, lastName: '', need, notes: '', ...attributionFields(source) }
    try {
      await quotes.submit(payload)
      setState('done')
    } catch {
      // Lead pipeline unreachable — keep the payload visible for retry/debug.
      console.warn('[lead] submit failed, payload:', payload)
      setState('error')
    }
  }
  if (state === 'done') return <p className="ld-lead-ok" role="status">Got it — we'll reach out within one business day (usually a lot faster).</p>
  return (
    <form className="ld-lead-form" onSubmit={submit}>
      <input aria-label="First name" placeholder="First name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
      <input aria-label="Phone" type="tel" placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      <input aria-label="Email" type="email" placeholder="Email (optional if phone given)" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
      <input aria-label="Delivery ZIP" inputMode="numeric" maxLength={5} placeholder="Delivery ZIP" value={form.deliveryZip} onChange={e => setForm(f => ({ ...f, deliveryZip: e.target.value.replace(/\D/g, '') }))} />
      {state === 'error' && <p className="ld-lead-err">Add your first name plus a phone or email, then try again.</p>}
      <button className="ld-btn ld-btn--accent" type="submit" disabled={state === 'busy'}>
        {state === 'busy' ? 'Sending…' : buttonLabel}
      </button>
    </form>
  )
}

// ── Rentals + Custom teasers ──────────────────────────────

export function Teasers() {
  return (
    <section className="ld-section ld-section--tint" aria-labelledby="teaser-h">
      <div className="ld-wrap">
        <h2 id="teaser-h" className="ld-h2" style={{ marginBottom: 20 }}>Not buying today?</h2>
        <div className="ld-teasers">
          <div className="ld-teaser">
            <h3>Container rentals by the month</h3>
            <p>One flat monthly rate on inspected units, delivered and picked back up on our trucks. Perfect for renovations, jobsites, and seasonal overflow.</p>
            <a className="ld-btn ld-btn--brand ld-btn--sm" href={u('shop?tab=rent')} style={{ marginBottom: 14 }}>See rental inventory</a>
            <LeadQuickForm need="rent-short" source="landing-rental-teaser" buttonLabel="Get a rental quote" />
          </div>
          <div className="ld-teaser">
            <h3>Custom builds from our fab shop</h3>
            <ul>
              {CUSTOM_MODS.slice(0, 5).map(m => <li key={m.name}><b>{m.name}</b> — {m.blurb}</li>)}
            </ul>
            <a className="ld-btn ld-btn--brand ld-btn--sm" href={u('shop?tab=custom')} style={{ marginBottom: 14 }}>Browse custom builds</a>
            <LeadQuickForm need="custom" source="landing-custom-teaser" buttonLabel="Get a build quote" />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Service area ──────────────────────────────────────────

export function ServiceAreaSection({ tenant, heading = 'Delivering across the Gulf Coast' }: { tenant: Tenant; heading?: string }) {
  return (
    <section className="ld-section" id="service-area" aria-labelledby="area-h">
      <div className="ld-wrap">
        <p className="ld-kicker">Service area</p>
        <h2 id="area-h" className="ld-h2">{heading}</h2>
        <p className="ld-section-sub">
          Our trucks run Louisiana, Mississippi, Alabama, Texas, Arkansas, and the Florida Panhandle from yards in {tenant.depots.join(', ')}. Pick your city for local delivered pricing:
        </p>
        <div className="ld-cities">
          {tenant.cities.map(c => (
            <a key={c.slug} className="ld-city-link" href={u(`service-area/${c.slug}/`)}>
              {c.name}, {c.state}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────

export function FaqSection({ tenant, city }: { tenant: Tenant; city?: TenantCity }) {
  const faq = useMemo(() => buildFaq(tenant, city), [tenant, city])
  return (
    <section className="ld-section ld-section--tint" id="faq" aria-labelledby="faq-h">
      <div className="ld-wrap">
        <p className="ld-kicker">Straight answers</p>
        <h2 id="faq-h" className="ld-h2">Container buying FAQ</h2>
        <div className="ld-faq">
          {faq.map(f => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <JsonLd data={jsonLdFaq(faq)} />
      </div>
    </section>
  )
}

// ── Email capture ─────────────────────────────────────────

export function EmailCaptureBand() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/.+@.+\..+/.test(email)) return
    setState('busy')
    const payload = {
      firstName: '', lastName: '', phone: '', email, deliveryZip: '', need: 'newsletter',
      notes: 'Email capture: new inventory + delivered prices', ...attributionFields('landing-email-capture'),
    }
    try { await quotes.submit(payload) } catch { console.warn('[lead] email capture failed, payload:', payload) }
    setState('done')
  }
  return (
    <section className="ld-section" aria-label="Email updates">
      <div className="ld-wrap">
        <div className="ld-capture">
          <div>
            <h3>New inventory + delivered prices, weekly</h3>
            <p>One short email when fresh units hit the yard. No spam, unsubscribe anytime.</p>
          </div>
          {state === 'done'
            ? <p role="status" style={{ fontWeight: 700 }}>You're on the list. 📦</p>
            : (
              <form onSubmit={submit}>
                <label htmlFor="cap-email" style={{ position: 'absolute', left: '-9999px' }}>Email address</label>
                <input id="cap-email" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
                <button className="ld-btn ld-btn--accent" type="submit" disabled={state === 'busy'}>
                  {state === 'busy' ? 'Adding…' : 'Sign me up'}
                </button>
              </form>
            )}
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────

export function SiteFooter({ tenant }: { tenant: Tenant }) {
  return (
    <footer className="ld-footer">
      <div className="ld-wrap">
        <div className="ld-footer-grid">
          <div>
            <h4>{tenant.name}</h4>
            <p>{tenant.address.street}<br />{tenant.address.city}, {tenant.address.state} {tenant.address.zip}</p>
            <p style={{ marginTop: 8 }}>{tenant.hours}</p>
            <p style={{ marginTop: 8 }}>
              <a href={tenant.phoneHref}>{tenant.phone}</a><br />
              <a href={`mailto:${tenant.email}`}>{tenant.email}</a>
            </p>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              <li><a href={u('shop?tab=buy')}>Containers for sale</a></li>
              <li><a href={u('shop?tab=rent')}>Container rentals</a></li>
              <li><a href={u('shop?tab=custom')}>Custom builds</a></li>
              <li><a href={u('shop?cond=used')}>Used conex boxes</a></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><a href={u('#how-it-works')}>How it works</a></li>
              <li><a href={u('#why-us')}>Why us</a></li>
              <li><a href={u('#faq')}>FAQ</a></li>
              <li><a href={u('service-area/')}>Service area</a></li>
            </ul>
          </div>
          <div>
            <h4>Follow</h4>
            <ul>
              {tenant.social.map(s => (
                <li key={s.label}><a href={s.url} rel="noopener noreferrer" target="_blank">{s.label}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="ld-footer-bottom">
          <span>© {new Date().getFullYear()} {tenant.legalName}. All rights reserved.</span>
          <span>Field-inspected containers, delivered across the Gulf Coast.</span>
        </div>
      </div>
    </footer>
  )
}

// ── Sticky mobile call/text bar ───────────────────────────

export function CallBar({ tenant }: { tenant: Tenant }) {
  return (
    <div className="ld-callbar" role="navigation" aria-label="Quick contact">
      <a className="ld-btn ld-btn--brand" href={tenant.phoneHref}>Call</a>
      <a className="ld-btn ld-btn--ghost" href={tenant.smsHref}>Text</a>
      <a className="ld-btn ld-btn--accent" href={u('#instant-price')}>Instant price</a>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export interface LandingPageProps {
  tenant: Tenant
  initialInventory: Container[] | null
}

export default function LandingPage({ tenant, initialInventory }: LandingPageProps) {
  const [zip, setZip] = useState('')
  const brandVars = {
    '--ld-brand': tenant.brand.primary,
    '--ld-accent': tenant.brand.accent,
    '--ld-ink': tenant.brand.ink,
  } as React.CSSProperties
  return (
    <div className="ld" style={brandVars}>
      <SiteNav tenant={tenant} />
      <main>
        <Hero tenant={tenant} zip={zip} setZip={setZip} />
        <ShopBy />
        <InventorySection tenant={tenant} zip={zip} initialInventory={initialInventory} />
        <HowItWorks />
        <TrustBand tenant={tenant} />
        <Teasers />
        <ServiceAreaSection tenant={tenant} />
        <FaqSection tenant={tenant} />
        <EmailCaptureBand />
      </main>
      <SiteFooter tenant={tenant} />
      <CallBar tenant={tenant} />
      <JsonLd data={jsonLdLocalBusiness(tenant)} />
      <JsonLd data={jsonLdProducts(tenant, initialInventory)} />
      <JsonLd data={jsonLdBreadcrumb([{ name: 'Home', path: '/' }], tenant.primaryDomain)} />
    </div>
  )
}
