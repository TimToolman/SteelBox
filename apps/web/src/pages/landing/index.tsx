// ============================================================
// National SteelBox public landing — marketplace-first storefront
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
import { quotes, isZipCovered, type Seller } from '../../lib/api'
import type { Tenant } from '../../tenant'
import { attributionFields } from '../../lib/attribution'
import {
  buildFaq, jsonLdLocalBusiness, jsonLdFaq, jsonLdBreadcrumb,
} from './seo'

// Base-aware internal link ('/SteelBox/' on Pages, '/' in production).
export const u = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

const heroImg = () => u('og/container-hero.jpg')

function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}

// ── "Not built yet" toast ─────────────────────────────────
// The redesign links to destinations that don't exist yet (the reseller
// programme, the warranty page). A dead link that silently does nothing
// reads as a bug during a demo, so those links say so out loud. A window
// event rather than context: two call sites don't justify a provider.

const NOT_BUILT_EVENT = 'sbx:not-built'

export function notBuilt(label: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NOT_BUILT_EVENT, { detail: label }))
}

export function NotBuiltToast() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onEvent = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      clearTimeout(timer)
      timer = setTimeout(() => setMsg(''), 4500)
    }
    window.addEventListener(NOT_BUILT_EVENT, onEvent)
    return () => { window.removeEventListener(NOT_BUILT_EVENT, onEvent); clearTimeout(timer) }
  }, [])
  if (!msg) return null
  return (
    <div className="ld-toast" role="alert" aria-live="polite">
      <span>{msg} isn't built yet — it's on the roadmap.</span>
      <button type="button" aria-label="Dismiss" onClick={() => setMsg('')}>&times;</button>
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────

export type ShopTab = 'buy' | 'rent' | 'custom' | 'bulk' | 'insights'

// 'custom' (Custom Builds) is deliberately unlisted — the shop tab code
// is kept, but it's not linked anywhere until the fab-shop launch.
// 'insights' is likewise unlisted in the nav after the redesign; the tab
// still works by URL, it just lost its top-level slot to Partners.
const NAV_CATEGORIES: { tab: ShopTab; label: string }[] = [
  { tab: 'buy', label: 'Buy' },
  { tab: 'rent', label: 'Rent' },
  { tab: 'bulk', label: 'Bulk' },
]

// The one site-wide header. The landing/city pages render it bare; the
// marketplace passes `active`/`onSelect` (tabs switch in-page instead of
// reloading) and its cart/profile controls via `right`. Keeping every page
// on this component is what keeps the nav identical across the site.
export function SiteNav({ tenant, active, onSelect, right, brand }: {
  tenant: Tenant
  active?: ShopTab
  onSelect?: (t: ShopTab) => void
  right?: React.ReactNode
  // Reseller positioning: when the shopper's delivery ZIP lands in a
  // reseller's territory, the nav wears THAT reseller's logo, name, and
  // colors with a "powered by <platform>" line; outside every territory
  // (or with no ZIP) the platform brand shows as usual.
  brand?: Seller
}) {
  const [open, setOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const navRef = React.useRef<HTMLElement>(null)
  // Close any open dropdown (burger, contact card) on outside click or Escape.
  useEffect(() => {
    if (!open && !contactOpen) return
    const closeAll = () => { setOpen(false); setContactOpen(false) }
    const onDown = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) closeAll() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, contactOpen])
  // Two-tone wordmark: first word plain, the rest in the accent —
  // "National SteelBox" → white / orange on the navy header. A ZIP-resolved
  // reseller brand takes over the wordmark and colors when present.
  const [brandWord, ...accentWords] = (brand?.name || tenant.logoText).split(' ')
  // Section anchors only resolve on the landing page; from the marketplace
  // they need the home path in front of them.
  const sectionLinks = [
    { label: 'Partners', href: u('#partners') },
    { label: 'How It Works', href: u('#how-it-works') },
    { label: 'Why Us', href: u('#why-us') },
    { label: 'FAQ', href: u('#faq') },
  ]
  // Category item: an in-page tab button on the marketplace, a link elsewhere.
  const category = (c: { tab: ShopTab; label: string }, cls: string) => onSelect
    ? (
      <button
        key={c.tab} className={`${cls}${active === c.tab ? ' ld-nav-cat--active' : ''}`}
        onClick={() => { onSelect(c.tab); setOpen(false) }}
      >
        {c.label}
      </button>
    )
    : <a key={c.tab} className={cls} href={u(`shop?tab=${c.tab}`)} onClick={() => setOpen(false)}>{c.label}</a>
  // Brand vars are set here (not only on the .ld page root) so the nav is
  // fully styled on any page, marketplace included.
  const brandVars = {
    '--ld-brand': brand?.brandPrimary || tenant.brand.primary,
    '--ld-accent': brand?.brandAccent || tenant.brand.accent,
    '--ld-ink': tenant.brand.ink,
  } as React.CSSProperties
  return (
    <header className="ld-nav" ref={navRef} style={brandVars}>
      <div className="ld-nav-wrap">
        <div className="ld-nav-row">
          <a className="ld-logo" href={u('')} aria-label={`${tenant.name} home`}>
            {/* Platform pages wear the National SteelBox mark; a ZIP-resolved
                reseller keeps its own two-tone badge identity. */}
            {brand ? (
              <span className="ld-logo-badge" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${brand.brandPrimary || '#0057B8'} 50%, ${brand.brandAccent || '#E65100'} 50%)` }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="6" width="22" height="14" rx="2" /><line x1="6" y1="6" x2="6" y2="20" /><line x1="11" y1="6" x2="11" y2="20" /><line x1="16" y1="6" x2="16" y2="20" /></svg>
              </span>
            ) : (
              <img className="ld-logo-mark" src={u('logo-nsb-mark.svg')} alt="" aria-hidden="true" width="40" height="40" />
            )}
            <span className={`ld-logo-word${brand ? ' ld-logo-word--reseller' : ''}`}>
              <span>
                <span className="ld-logo-brand">{brandWord}</span>
                {accentWords.length > 0 && <span className="ld-logo-accent">&nbsp;{accentWords.join(' ')}</span>}
              </span>
              {/* Reseller storefronts always credit the platform */}
              {brand && <span className="ld-logo-powered">powered by National SteelBox</span>}
            </span>
          </a>
          <nav aria-label="Main" className="ld-nav-main">
            <ul className="ld-nav-links">
              {NAV_CATEGORIES.map(c => <li key={c.tab}>{category(c, 'ld-nav-cat')}</li>)}
              <li className="ld-nav-div ld-nav-sec" aria-hidden="true" />
              {sectionLinks.map(l => (
                <li key={l.label} className="ld-nav-sec"><a href={l.href}>{l.label}</a></li>
              ))}
            </ul>
          </nav>
          <div className="ld-nav-right">
            <a className="ld-nav-phone" href={tenant.phoneHref}>{tenant.phone}</a>
            <span className="ld-nav-contactwrap ld-nav-contact">
              <button
                className="ld-btn ld-btn--ghost ld-btn--sm"
                aria-expanded={contactOpen} aria-haspopup="dialog"
                onClick={() => setContactOpen(o => !o)}
              >
                Contact Us
              </button>
              {contactOpen && (
                <div className="ld-contact-pop" role="dialog" aria-label="Contact information">
                  <a className="ld-contact-phone" href={tenant.phoneHref}>{tenant.phone}</a>
                  <a className="ld-contact-email" href={`mailto:${tenant.email}`}>{tenant.email}</a>
                  <address className="ld-contact-addr">
                    {tenant.address.street}<br />
                    {tenant.address.city}, {tenant.address.state} {tenant.address.zip}
                  </address>
                </div>
              )}
            </span>
            {right ?? (
              // Landing/city pages: sign-in / profile lives on the shop, so the
              // icon deep-links to it (the shop opens its profile sheet on ?profile=1).
              <a className="ld-nav-profile" href={u('shop?profile=1')} title="Sign in / Profile" aria-label="Sign in or view profile">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
              </a>
            )}
            <button className="ld-nav-burger" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(o => !o)}>
              <span /><span /><span />
            </button>
          </div>
        </div>
        {open && (
          <nav className="ld-nav-mobile" aria-label="Menu">
            {NAV_CATEGORIES.map(c => category(c, 'ld-m-cat'))}
            {sectionLinks.map(l => (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
            ))}
            <a href={tenant.phoneHref} onClick={() => setOpen(false)}>{tenant.phone}</a>
          </nav>
        )}
      </div>
    </header>
  )
}

// ── Hero ──────────────────────────────────────────────────

const HERO_BENEFITS = [
  'Your exact unit',
  'Real photos + verified grade',
  'All-in ZIP price',
  'Tracked 3–5 day delivery',
]

function Check() {
  return (
    <svg className="ld-check" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
    </svg>
  )
}

function Hero({ tenant }: { tenant: Tenant }) {
  const [input, setInput] = useState('')
  // ZIP the shopper last checked ('' until they submit) — the form answers
  // "do you deliver to me?", nothing more.
  const [checked, setChecked] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = input.trim().slice(0, 5)
    if (v.length === 5) setChecked(v)
  }
  return (
    <section className="ld-hero">
      <div className="ld-hero-bg">
        <img className="ld-hero-bgimg" src={heroImg()} alt="" aria-hidden="true" />
        <div className="ld-hero-overlay" />
      </div>
      <div className="ld-hero-layout">
        <div className="ld-hero-content">
          <p className="ld-hero-eyebrow">Shipping Containers · Nationwide Marketplace</p>
          <h1 className="ld-hero-title">
            Buy · Rent<br />
            <span className="ld-hero-accent">Pick · Ship</span>
          </h1>
          <p className="ld-hero-sub">
            One marketplace. Dozens of resellers. Your exact box — real photos — delivered
            by local partners in days, not weeks.
          </p>
          <ul className="ld-hero-benefits">
            {HERO_BENEFITS.map(b => <li key={b}><Check />{b}</li>)}
          </ul>
          <div className="ld-hero-ctas">
            <a className="ld-btn ld-btn--brand ld-btn--lg" href={u('shop')}>Browse Inventory</a>
            <a className="ld-btn ld-btn--navy ld-btn--lg" href={u('#how-it-works')}>How It Works</a>
          </div>
          <div className="ld-zipcheck">
            <form className="ld-searchbar" onSubmit={submit}>
              <label htmlFor="hero-zip" className="ld-vh">Delivery ZIP code</label>
              {/* The input and its clear button travel together. Without the wrapper
                  the × becomes its own flex item, and on a phone — where the pill
                  stacks — it drops onto a row of its own below the field. */}
              <div className="ld-zipwrap">
                <input
                  id="hero-zip" inputMode="numeric" pattern="[0-9]{5}"
                  placeholder="Enter your delivery ZIP" value={input} maxLength={5}
                  onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
                />
                {input && (
                  <button
                    type="button" className="ld-zip-clear" title="Clear ZIP code" aria-label="Clear ZIP code"
                    onClick={() => { setInput(''); setChecked('') }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </div>
              <button className="ld-btn ld-btn--accent" type="submit">Check delivery</button>
            </form>
            {checked && (
              <p className={`ld-zipresult ld-zipresult--${isZipCovered(checked) ? 'yes' : 'no'}`} role="status">
                {isZipCovered(checked)
                  ? <>✓ Yes — we deliver to {checked}, typically within 3–5 business days.</>
                  : <>{checked} is outside our standard delivery area — <a href={tenant.phoneHref}>call {tenant.phone}</a> and we'll see what we can do.</>}
              </p>
            )}
          </div>
        </div>

        {/* Hub-and-spoke network: the one picture that explains why a
            nationwide marketplace can promise a local delivery window. */}
        <aside className="ld-hero-map" aria-label="Nationwide transfer hub network">
          <div className="ld-hubcard">
            <p className="ld-hubcard-label">Nationwide hub network</p>
            {/* The stat cards live inside the artwork, so there is no HTML
                overlay to keep aligned with it. */}
            <img
              className="ld-hubcard-img" src={u('hub-network-map.svg')} width="965" height="514"
              alt="Hub-and-spoke network: a central Gulf hub connected to Houston, New Orleans, Mobile, Jackson, Atlanta, Tampa, Miami, Jacksonville, Savannah, Charleston and Wilmington. Average delivery 3–5 days across 11+ active hubs."
            />
          </div>
        </aside>
      </div>
    </section>
  )
}

// ── Warranty bar ──────────────────────────────────────────

export function WarrantyBar() {
  return (
    <section className="ld-warranty" aria-label="Warranty">
      <div className="ld-wrap ld-warranty-row">
        <svg className="ld-warranty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
        </svg>
        <div>
          <strong>90-Day Warranty</strong>
          <span>Doors and seals covered for 90 days from delivery on every unit we sell.</span>
        </div>
        <button className="ld-btn ld-btn--ghost ld-btn--sm" type="button" onClick={() => notBuilt('The warranty page')}>
          Learn more
        </button>
      </div>
    </section>
  )
}

// ── Partner CTAs (resellers + drivers) ────────────────────

export function PartnerCtaBar() {
  return (
    <section className="ld-partnercta" aria-label="Partner calls to action">
      <div className="ld-wrap ld-partnercta-grid">
        <a className="ld-partnercta-card ld-partnercta-card--reseller" href={u('#partners')}>
          <span className="ld-partnercta-eyebrow">For container companies</span>
          <strong>Sign up your container company</strong>
          <span className="ld-partnercta-hint">List on the marketplace · consignment · exclusive ZIPs</span>
        </a>
        <a className="ld-partnercta-card ld-partnercta-card--driver" href={u('#drive-for-us')}>
          <span className="ld-partnercta-eyebrow">For independent drivers</span>
          <strong>Become an independent driver — find out how</strong>
          <span className="ld-partnercta-hint">Haul for local resellers · your truck · your schedule</span>
        </a>
      </div>
    </section>
  )
}

// ── Partners strip ────────────────────────────────────────

export function PartnersStrip() {
  return (
    <section className="ld-partners" id="partners" aria-labelledby="partners-h">
      <div className="ld-wrap">
        <header className="ld-section-head">
          <p className="ld-kicker">For partners</p>
          <h2 id="partners-h" className="ld-h2">Resellers &amp; drivers power the network</h2>
          <p className="ld-section-sub">
            SteelBox is the marketplace. Local resellers own the territory and fulfillment —
            with consignment inventory, exclusive ZIPs, and no upfront container purchases required.
          </p>
        </header>
        <div className="ld-partners-grid">
          <article className="ld-partner-card">
            <div className="ld-partner-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            </div>
            <h3>Resellers</h3>
            <p>
              List your own containers or major-supplier stock on consignment. No inventory
              capital required. Exclusive geographic rights — keep them by meeting SLA and
              customer NPS.
            </p>
            <ul className="ld-partner-points">
              <li>Consignment listing — zero upfront container cost</li>
              <li>Guaranteed ZIPs you own and service</li>
              <li>Pickup &amp; delivery on behalf of the marketplace</li>
            </ul>
            <button className="ld-btn ld-btn--navy ld-btn--sm" type="button" onClick={() => notBuilt('The reseller sign-up')}>
              Sign up your container company
            </button>
          </article>
          <article className="ld-partner-card">
            <div className="ld-partner-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
            </div>
            <h3>Drivers</h3>
            <p>
              Haul for local resellers in their territories. Your truck, your schedule, your
              service area — flexible work supporting buyers who already know exactly which
              container they're getting.
            </p>
            <ul className="ld-partner-points">
              <li>Partner with territory resellers near you</li>
              <li>Clear jobs: set containers for verified buyers</li>
              <li>Independent contractor flexibility</li>
            </ul>
            <a className="ld-btn ld-btn--navy ld-btn--sm" href={u('#drive-for-us')}>Become an independent driver</a>
          </article>
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────

export function HowItWorks() {
  const steps = [
    { t: 'Pick Buy or Rent', d: 'Own it outright or rent by the month — same field-inspected inventory either way.', href: u('shop?tab=buy') },
    { t: 'Pick size & grade', d: '20ft or 40ft, standard or high cube, grades A through R — each verified with a full photo set.', href: u('shop') },
    { t: 'Pick new or used', d: "New one-trip boxes or inspected used units — the photos show exactly what you're getting.", href: u('shop?cond=new') },
    { t: 'Checkout & track', d: 'Add to cart and pick a delivery window. Payment is held until the box is set on your site.', href: u('shop') },
  ]
  return (
    <section className="ld-how" id="how-it-works" aria-labelledby="how-h">
      <div className="ld-wrap">
        <header className="ld-section-head">
          <p className="ld-kicker">How it works</p>
          <h2 id="how-h" className="ld-h2">Get your container in four easy steps</h2>
          <p className="ld-section-sub">From browsing to a box on the ground — clear, transparent, and tracked the whole way.</p>
        </header>
        <div className="ld-steps-grid">
          {steps.map((s, i) => (
            <article className="ld-step-card" key={s.t}>
              <div className="ld-step-num">{String(i + 1).padStart(2, '0')}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
              <a className="ld-step-link" href={s.href}>Start here →</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Why us ────────────────────────────────────────────────

export function TrustBand({ tenant }: { tenant: Tenant }) {
  const cards = [
    {
      t: '8-photo inspection',
      d: 'Roof, seals, floor, corners, doors open and closed — the full set on every listing, taken in our yard, of your exact unit.',
      icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
    },
    {
      t: 'Verified grade',
      d: 'Grades are assigned by our field inspectors against a written standard, not by whoever answers the phone.',
      icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
    },
    {
      t: 'Local resellers & trucks',
      d: `Territory partners with exclusive ZIPs handle pickup and delivery — a real local team you can reach in ${tenant.depots.join(', ')}, not a distant call center.`,
      icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
    },
    {
      t: '90-day warranty',
      d: 'Doors and seals are covered for 90 days from delivery on every container we sell — the two things that decide whether a box actually keeps weather out.',
      icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    },
  ]
  return (
    <section className="ld-why" id="why-us" aria-labelledby="why-h">
      <div className="ld-wrap">
        <header className="ld-section-head">
          <p className="ld-kicker">Why {tenant.name}</p>
          <h2 id="why-h" className="ld-h2">Never buy a container sight-unseen</h2>
        </header>
        <div className="ld-why-grid">
          {cards.map(c => (
            <article className="ld-why-card" key={c.t}>
              <div className="ld-why-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">{c.icon}</svg>
              </div>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </article>
          ))}
        </div>
        {tenant.testimonials.length > 0 && (
          <div className="ld-quotes">
            {tenant.testimonials.map((t, i) => (
              <blockquote className="ld-quote" key={i}>
                <p>“{t.quote}”</p>
                <footer>— {t.who}</footer>
              </blockquote>
            ))}
          </div>
        )}
        <p className="ld-reviews-link">
          <a href={tenant.googleReviewsUrl} rel="noopener noreferrer" target="_blank">Read our reviews on Google →</a>
        </p>
      </div>
    </section>
  )
}

// ── Lead quick form (rental / driver quotes + CTA target) ─

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

// ── Rentals CTA ───────────────────────────────────────────

export function RentalsCta() {
  const [quoting, setQuoting] = useState(false)
  return (
    <section className="ld-rentals" aria-labelledby="rentals-h">
      <div className="ld-wrap">
        <div className="ld-rentals-card">
          <p className="ld-kicker">Not buying today?</p>
          <h2 id="rentals-h" className="ld-h2">Get a rental quote</h2>
          <p>
            One flat monthly rate on inspected units, delivered and picked back up on our
            trucks. Perfect for renovations, jobsites, and seasonal overflow.
          </p>
          {quoting ? (
            <LeadQuickForm need="rent-short" source="landing-rental-teaser" buttonLabel="Get a rental quote" />
          ) : (
            <div className="ld-rentals-actions">
              <a className="ld-btn ld-btn--brand" href={u('shop?tab=rent')}>See rental inventory</a>
              <button className="ld-btn ld-btn--ghost" type="button" onClick={() => setQuoting(true)}>Get a rental quote</button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────

export function FaqSection({ tenant }: { tenant: Tenant }) {
  const faq = useMemo(() => buildFaq(tenant), [tenant])
  return (
    <section className="ld-faq" id="faq" aria-labelledby="faq-h">
      <div className="ld-wrap">
        <header className="ld-section-head">
          <p className="ld-kicker">Straight answers</p>
          <h2 id="faq-h" className="ld-h2">FAQs</h2>
        </header>
        <div className="ld-faq-list">
          {faq.map(f => (
            <details className="ld-faq-item" key={f.q}>
              <summary>{f.q}</summary>
              <div className="ld-faq-answer"><p>{f.a}</p></div>
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
    <section className="ld-newsletter" aria-label="Email updates">
      <div className="ld-wrap">
        <div className="ld-newsletter-card">
          <div>
            <h2>Get notified about new containers</h2>
            <p>One short email when fresh one-trip and like-new units hit the yard. No spam, unsubscribe anytime.</p>
          </div>
          {state === 'done'
            ? <p role="status" className="ld-newsletter-ok">You're on the list. 📦</p>
            : (
              <form className="ld-newsletter-form" onSubmit={submit}>
                <label htmlFor="cap-email" className="ld-vh">Email address</label>
                <input id="cap-email" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
                <button className="ld-btn ld-btn--brand" type="submit" disabled={state === 'busy'}>
                  {state === 'busy' ? 'Adding…' : 'Sign me up'}
                </button>
              </form>
            )}
        </div>
      </div>
    </section>
  )
}

// ── Drive for us ──────────────────────────────────────────

export function DriveCta() {
  const [applying, setApplying] = useState(false)
  return (
    <section className="ld-drive" id="drive-for-us" aria-labelledby="drive-h">
      <div className="ld-wrap">
        <div className="ld-drive-card">
          <h2 id="drive-h">Want to drive for a local reseller?</h2>
          <p>
            Independent contractors haul for territory partners across our markets — your
            truck, your schedule, your service area. See Partners above for resellers and drivers.
          </p>
          {applying ? (
            <LeadQuickForm need="driver-application" source="landing-drive-cta" buttonLabel="Send my application" />
          ) : (
            <div className="ld-drive-actions">
              <button className="ld-btn ld-btn--navy" type="button" onClick={() => setApplying(true)}>Apply to Drive</button>
              <a className="ld-btn ld-btn--ghost" href={u('#partners')}>Partner options</a>
            </div>
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
          <div className="ld-footer-brand">
            <img src={u('logo-nsb.png')} alt={`${tenant.name} — buy, rent, finance`} width="720" height="496" />
            <p>
              The marketplace for field-inspected shipping containers — real photos of your
              exact unit, local resellers, continental USA delivery.
            </p>
            <p>{tenant.address.street}<br />{tenant.address.city}, {tenant.address.state} {tenant.address.zip}</p>
            <p>{tenant.hours}</p>
            <p className="ld-footer-phone">
              <a href={tenant.phoneHref}>{tenant.phone}</a><br />
              <a href={`mailto:${tenant.email}`}>{tenant.email}</a>
            </p>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              <li><a href={u('shop?tab=buy')}>Buy containers</a></li>
              <li><a href={u('shop?tab=rent')}>Rent containers</a></li>
              <li><a href={u('shop?tab=bulk')}>Bulk / Fleet</a></li>
              <li><a href={u('shop?cond=used')}>Used conex boxes</a></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><a href={u('#how-it-works')}>How it works</a></li>
              <li><a href={u('#why-us')}>Why us</a></li>
              <li><a href={u('#faq')}>FAQ</a></li>
              <li><a href={u('#partners')}>Partners</a></li>
              <li><a href={u('#drive-for-us')}>Drive for us</a></li>
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
          <span>90-day warranty on doors and seals.</span>
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
      <a className="ld-btn ld-btn--accent" href={u('shop')}>Shop</a>
    </div>
  )
}

// ── Back to top (mobile) ──────────────────────────────────
// The mobile page is nine screens tall and the ZIP checker — the thing a
// shopper most wants back — lives at the very top. Appears once the hero
// is well off-screen; sits above the call bar, left of the report tab.

export function ScrollTopButton() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setShown(window.scrollY > 600)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!shown) return null
  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }
  return (
    <button className="ld-totop" type="button" onClick={toTop} aria-label="Back to top" title="Back to top">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────

export interface LandingPageProps {
  tenant: Tenant
}

export default function LandingPage({ tenant }: LandingPageProps) {
  // Arriving at /#faq etc. from another page: the sections don't exist
  // until after hydration/first render, so the browser's native anchor
  // jump finds nothing — re-run it once the content is mounted.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])
  const brandVars = {
    '--ld-brand': tenant.brand.primary,
    '--ld-accent': tenant.brand.accent,
    '--ld-ink': tenant.brand.ink,
  } as React.CSSProperties
  return (
    <div className="ld" style={brandVars}>
      <SiteNav tenant={tenant} />
      <main>
        <Hero tenant={tenant} />
        <WarrantyBar />
        <PartnerCtaBar />
        <PartnersStrip />
        <HowItWorks />
        <TrustBand tenant={tenant} />
        <RentalsCta />
        <FaqSection tenant={tenant} />
        <EmailCaptureBand />
        <DriveCta />
      </main>
      <SiteFooter tenant={tenant} />
      <CallBar tenant={tenant} />
      <ScrollTopButton />
      <NotBuiltToast />
      <JsonLd data={jsonLdLocalBusiness(tenant)} />
      <JsonLd data={jsonLdBreadcrumb([{ name: 'Home', path: '/' }], tenant.primaryDomain)} />
    </div>
  )
}
