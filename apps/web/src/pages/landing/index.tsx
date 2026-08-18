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
import { quotes, isZipCovered, driverApps, type Seller } from '../../lib/api'
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

// ── Nav ───────────────────────────────────────────────────

export type ShopTab = 'buy' | 'rent' | 'custom' | 'bulk' | 'insights'

// 'custom' (Custom Builds) is deliberately unlisted — the shop tab code
// is kept, but it's not linked anywhere until the fab-shop launch.
const NAV_CATEGORIES: { tab: ShopTab; label: string }[] = [
  { tab: 'buy', label: 'Buy' },
  { tab: 'rent', label: 'Rent' },
  { tab: 'bulk', label: 'Bulk / B2B' },
  { tab: 'insights', label: 'Insights' },
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
  // Two-tone wordmark: first word in the brand color, the rest in the
  // accent — "MVP Container" → blue / orange. A ZIP-resolved reseller
  // brand takes over the wordmark and colors when present.
  const [brandWord, ...accentWords] = (brand?.name || tenant.logoText).split(' ')
  const sectionLinks = [
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
  // fully styled on any page, marketplace included. A ZIP-resolved reseller
  // repaints the nav in its own colors.
  const brandVars = {
    '--ld-brand': brand?.brandPrimary || tenant.brand.primary,
    '--ld-accent': brand?.brandAccent || tenant.brand.accent,
    '--ld-ink': tenant.brand.ink,
  } as React.CSSProperties
  return (
    <header className="ld-nav" ref={navRef} style={brandVars}>
      <div className="ld-nav-wrap">
        <div className="ld-nav-row">
          <button className="ld-nav-burger" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(o => !o)}>☰</button>
          <a className="ld-logo" href={u('')} aria-label={`${tenant.name} home`}>
            {/* Platform pages wear the National SteelBox mark; a ZIP-resolved
                reseller keeps its two-tone badge identity. */}
            {brand ? (
              <span className="ld-logo-badge" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${brand.brandPrimary || '#0057B8'} 50%, ${brand.brandAccent || '#E65100'} 50%)` }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="6" width="22" height="14" rx="2" /><line x1="6" y1="6" x2="6" y2="20" /><line x1="11" y1="6" x2="11" y2="20" /><line x1="16" y1="6" x2="16" y2="20" /></svg>
              </span>
            ) : (
              <img className="ld-logo-mark" src={u('logo-nsb-mark.svg')} alt="" aria-hidden="true" width="36" height="36" />
            )}
            <span className="ld-logo-word" style={brand ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 } : undefined}>
              <span>
                <span className="ld-logo-brand">{brandWord}</span>
                {accentWords.length > 0 && <span className="ld-logo-accent">&nbsp;{accentWords.join(' ')}</span>}
              </span>
              {/* Reseller storefronts always credit the platform */}
              {brand && (
                <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.4px', color: 'var(--ld-ink)', opacity: 0.62, whiteSpace: 'nowrap' }}>
                  powered by National SteelBox
                </span>
              )}
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
          </div>
        </div>
        {open && (
          <nav className="ld-nav-mobile" aria-label="Menu">
            {NAV_CATEGORIES.map(c => category(c, 'ld-m-cat'))}
            {sectionLinks.map(l => (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
            ))}
            <a href={tenant.phoneHref} onClick={() => setOpen(false)}>Contact</a>
          </nav>
        )}
      </div>
    </header>
  )
}

// ── Hero ──────────────────────────────────────────────────

const HERO_TRUST = ['Your exact unit', 'Photos + AI grade', 'All-in ZIP price', 'Tracked 3–5 day delivery']

// Checkmark used by the hero trust row.
function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function Hero({ tenant }: { tenant: Tenant }) {
  const [input, setInput] = useState('')
  // ZIP the shopper last checked ('' until they submit) — the form answers
  // "do you deliver to me?", nothing more.
  const [checked, setChecked] = useState('')
  // Phones: the hero shrinks to headline + ZIP bar once the shopper scrolls,
  // so content is one flick away. Hysteresis (collapse >80, expand <10)
  // prevents jitter from the page shortening under the scroll position.
  const [collapsed, setCollapsed] = useState(false)
  const heroRef = React.useRef<HTMLElement>(null)
  const zipRef = React.useRef<HTMLInputElement>(null)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 940px)')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    const apply = () => {
      raf = 0
      const y = window.scrollY
      setCollapsed(prev => mq.matches && (prev ? y > 10 : y > 80))
      // Parallax: the photo layer drifts down (and fades) as the hero
      // scrolls away, the copy drifts at ~45% of that — classic depth.
      // Skipped entirely for reduced-motion and while collapsed on phones.
      const el = heroRef.current
      if (!el) return
      const h = el.offsetHeight || 1
      const t = still.matches ? 0 : Math.min(1, Math.max(0, y / h))
      el.style.setProperty('--ld-par-bg', `${(t * 118).toFixed(1)}px`)
      el.style.setProperty('--ld-par-fg', `${(t * 52).toFixed(1)}px`)
      el.style.setProperty('--ld-par-o', String(1 - t * 0.6))
    }
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(apply) }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = input.trim().slice(0, 5)
    if (v.length === 5) {
      setChecked(v)
      // Carry the ZIP into the marketplace: branding, service-area filter,
      // and the delivery estimate all pick it up on arrival.
      try { localStorage.setItem('sbx_zip', v) } catch { /* private mode */ }
    }
  }
  // Clearing the field is a full reset: the verdict goes away and the
  // remembered ZIP is dropped, so the marketplace won't stay scoped to it.
  const clearZip = () => {
    setInput('')
    setChecked('')
    try { localStorage.removeItem('sbx_zip') } catch { /* private mode */ }
    zipRef.current?.focus()
  }
  return (
    <section ref={heroRef} className={`ld-hero ld-hero--portal${collapsed ? ' ld-hero--collapsed' : ''}`}>
      {/* Parallax photo layer: image + industrial scrim + steel corrugation */}
      <div className="ld-hero-bglayer" aria-hidden="true">
        <img className="ld-hero-bgimg" src={heroImg()} alt="" />
        <div className="ld-hero-scrim" />
        <div className="ld-hero-texture" />
      </div>
      <div className="ld-hero-inner">
        <div className="ld-hero-badge ld-rise ld-rise--1">
          <i aria-hidden="true" />Live inventory · Real photos · AI-verified grades
        </div>
        <h1 className="ld-rise ld-rise--2">
          Pick It. See It.{' '}
          <span className="ld-hero-accent">Price It. Track It.</span>
        </h1>
        <p className="ld-hero-sub ld-rise ld-rise--3">
          Your exact container — real photos, AI-verified grade, an all-in price to your ZIP,
          and tracked delivery in 3–5 days. No stock photos. No call-for-quote. No mystery.
        </p>
        <form className="ld-searchbar ld-rise ld-rise--4" onSubmit={submit}>
          <label htmlFor="hero-zip" style={{ position: 'absolute', left: '-9999px' }}>Delivery ZIP code</label>
          <input
            id="hero-zip" ref={zipRef} inputMode="numeric" pattern="[0-9]{5}"
            placeholder="Enter your delivery ZIP" value={input} maxLength={5}
            onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
          />
          {input && (
            <button type="button" className="ld-zip-clear" onClick={clearZip} aria-label="Clear ZIP code" title="Clear ZIP code">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
          <button className="ld-btn ld-btn--brand" type="submit">Check delivery</button>
        </form>
        {/* Coverage answer — a slim status label under the pill. The single
            CTA below stays constant, so the label just reports the verdict. */}
        {checked && (isZipCovered(checked) ? (
          <p className="ld-zipres ld-zipres--yes" role="status">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
            {/* One text node keeps the copy flowing — separate children would
                each become their own flex item and break mid-sentence. */}
            <span>Great news — we deliver to {checked} in 3–5 business days!</span>
          </p>
        ) : (
          <p className="ld-zipres ld-zipres--no" role="status">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v5" /><circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="9" /></svg>
            <span>{checked} is outside our standard area — <a href={tenant.phoneHref}>call {tenant.phone}</a> and we'll quote it.</span>
          </p>
        ))}
        <div className="ld-hero-ctas ld-rise ld-rise--4">
          <a className="ld-btn ld-btn--accent ld-btn--hero" href={u('shop')}>
            Browse all inventory <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="ld-hero-trust ld-rise ld-rise--5">
          {HERO_TRUST.map(t => <span key={t}><CheckIcon />{t}</span>)}
        </div>
        <p className="ld-hero-tagline ld-rise ld-rise--5">Grading performed by Machine Learning / AI technology</p>
      </div>
      <div className="ld-hero-fade" aria-hidden="true" />
    </section>
  )
}

// ── How it works ──────────────────────────────────────────

// Step icons — 2D stroke set, currentColor so they flip with the tile.
const STEP_ICONS: Record<string, React.ReactNode> = {
  cart: <><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17" /><circle cx="9" cy="20" r="1.6" /><circle cx="17" cy="20" r="1.6" /></>,
  grid: <><rect x="4" y="4" width="16" height="4.5" rx="1" /><rect x="4" y="12" width="8" height="8" rx="1" /><rect x="16" y="12" width="4" height="8" rx="1" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.2l2.5 2.5 4.5-5" /></>,
  truck: <><path d="M3 7h10v9H3z" /><path d="M13 10h4l3 3v3h-7z" /><circle cx="7" cy="18.5" r="1.7" /><circle cx="17" cy="18.5" r="1.7" /></>,
}
function StepIcon({ name }: { name: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {STEP_ICONS[name]}
    </svg>
  )
}

export function HowItWorks() {
  const steps = [
    { n: '01', icon: 'cart', t: 'Pick Buy or Rent', d: 'Own it outright or rent by the month — the same field-inspected inventory either way.', href: u('shop?tab=buy') },
    { n: '02', icon: 'grid', t: 'Pick size & grade', d: '20ft or 40ft, standard or high cube, grades A through R — each verified with a full photo set.', href: u('shop') },
    { n: '03', icon: 'check', t: 'Pick new or used', d: 'New one-trip boxes or inspected used units — the photos show exactly what you\'re getting.', href: u('shop?cond=new') },
    { n: '04', icon: 'truck', t: 'Checkout & track', d: 'Add to cart and pick a delivery window. Payment is held until the box is set on your site.', href: u('shop') },
  ]
  // Cards cascade in the first time the grid scrolls into view. Progressive
  // enhancement: the reveal class is added by JS, so the prerendered
  // (and no-JS) page always shows the cards.
  const gridRef = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    el.classList.add('ld-hiw-reveal')
    if (typeof IntersectionObserver !== 'function') { el.classList.add('is-in'); return }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect() } })
    }, { rootMargin: '-60px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section className="ld-section ld-section--tint" id="how-it-works" aria-labelledby="how-h">
      <div className="ld-wrap">
        <p className="ld-kicker">How it works</p>
        <h2 id="how-h" className="ld-h2">From browsing to a box on the ground in four clear steps</h2>
        <div className="ld-hiw-grid" ref={gridRef}>
          {steps.map(s => (
            <a className="ld-hiw-card" key={s.n} href={s.href}>
              <div className="ld-hiw-top">
                <span className="ld-hiw-num" aria-hidden="true">{s.n}</span>
                <span className="ld-hiw-icon"><StepIcon name={s.icon} /></span>
              </div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
              <span className="ld-hiw-go">
                Start here
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </span>
              <span className="ld-hiw-accent" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Trust band ────────────────────────────────────────────

export function TrustBand({ tenant }: { tenant: Tenant }) {
  const cards = [
    { t: '8-photo inspection', d: 'Roof, seals, floor, corners, doors open and closed — the full set on every listing, taken in our yard, of your exact unit.' },
    { t: 'Verified grade', d: 'Grades are assigned by our field inspectors against a written standard, not by whoever answers the phone.' },
    { t: 'One marketplace, local sellers', d: 'Every listing is sold and delivered by the vetted regional seller that owns its yard — their drivers, their pricing, their service agreement, one checkout.' },
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
        <div className="ld-teasers" style={{ gridTemplateColumns: '1fr', maxWidth: 640 }}>
          <div className="ld-teaser">
            <h3>Container rentals by the month</h3>
            <p>One flat monthly rate on inspected units, delivered and picked back up on our trucks. Perfect for renovations, jobsites, and seasonal overflow.</p>
            <a className="ld-btn ld-btn--brand ld-btn--sm" href={u('shop?tab=rent')} style={{ marginBottom: 14 }}>See rental inventory</a>
            <LeadQuickForm need="rent-short" source="landing-rental-teaser" buttonLabel="Get a rental quote" />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────

export function FaqSection({ tenant }: { tenant: Tenant }) {
  const faq = useMemo(() => buildFaq(tenant), [tenant])
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
            <h3>One trip / like new inventory listings and prices, delivered weekly to your email</h3>
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

// ── Drive-for-us band — independent-contractor recruiting ──
// Bottom-of-page call to action; the button reveals the application
// form in place (no modal — plays nice with the SSG prerender).

const HAUL_CAP_OPTIONS = ['20ft', '40ft', '45ft high cube', 'Chassis / drayage', 'Tilt-bed self-offload', 'Crane / HIAB']

export function DriveBand() {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', state: '', zip: '', cdl: 'yes', cdlClass: 'A', truckType: '', experienceYears: '', notes: '' })
  const [caps, setCaps] = useState<Set<string>>(new Set())
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  const toggleCap = (c: string) => setCaps(prev => {
    const next = new Set(prev)
    if (next.has(c)) next.delete(c); else next.add(c)
    return next
  })
  const submit = async () => {
    setError('')
    if (!form.name.trim()) { setError('Your name is required.'); return }
    if (!form.email.includes('@')) { setError('A valid email is required.'); return }
    if (form.phone.replace(/\D/g, '').length < 10) { setError('A valid mobile number is required.'); return }
    setBusy(true)
    try {
      await driverApps.apply({
        name: form.name, email: form.email, phone: form.phone,
        city: form.city, state: form.state, zip: form.zip,
        cdl: form.cdl === 'yes', cdlClass: form.cdl === 'yes' ? form.cdlClass : '',
        truckType: form.truckType, haulCaps: [...caps],
        experienceYears: Number(form.experienceYears) || 0, notes: form.notes,
      })
      setSent(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send your application — please call us.') } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid rgba(255,255,255,.35)', borderRadius: '10px', fontSize: '14px', outline: 'none', background: 'rgba(255,255,255,.95)', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,.85)', margin: '0 0 5px' }

  return (
    <section id="drive-for-us" style={{ background: 'var(--ld-brand, #0057B8)', padding: '48px 0' }}>
      <div className="ld-wrap">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ color: '#fff', fontSize: '26px', fontWeight: 800, margin: 0 }}>Want to drive for National SteelBox?</h2>
            <p style={{ color: 'rgba(255,255,255,.85)', fontSize: '15px', margin: '6px 0 0', maxWidth: '560px' }}>
              We partner with independent contractor drivers across our markets — haul containers on your truck, your schedule, your service area. Contact us now!
            </p>
          </div>
          {!open && !sent && (
            <button onClick={() => setOpen(true)} className="ld-btn ld-btn--accent" style={{ fontSize: '15px', padding: '13px 26px', cursor: 'pointer', border: 'none' }}>
              Apply to Drive
            </button>
          )}
        </div>

        {sent && (
          <div style={{ marginTop: '22px', background: 'rgba(255,255,255,.12)', border: '1.5px solid rgba(255,255,255,.3)', borderRadius: '14px', padding: '18px 20px', color: '#fff', maxWidth: '640px' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, marginBottom: '4px' }}>✓ Application received!</div>
            <div style={{ fontSize: '14px', lineHeight: 1.55, color: 'rgba(255,255,255,.9)' }}>
              Thanks — our team reviews every application and will call you to set up a quick interview.
              Once you're approved we'll email your Driver Portal invite to finish onboarding.
            </div>
          </div>
        )}

        {open && !sent && (
          <div style={{ marginTop: '24px', maxWidth: '760px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
              <div><label style={lbl}>Full name *</label><input style={inp} value={form.name} onChange={set('name')} placeholder="Sam Carter" /></div>
              <div><label style={lbl}>Email *</label><input style={inp} type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" /></div>
              <div><label style={lbl}>Mobile *</label><input style={inp} type="tel" value={form.phone} onChange={set('phone')} placeholder="(504) 555-0000" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={set('city')} /></div>
              <div><label style={lbl}>State</label><input style={inp} value={form.state} onChange={set('state')} placeholder="LA" /></div>
              <div><label style={lbl}>ZIP</label><input style={inp} inputMode="numeric" maxLength={5} value={form.zip} onChange={set('zip')} placeholder="70112" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={lbl}>CDL license?</label>
                <select style={{ ...inp, cursor: 'pointer' }} value={form.cdl} onChange={set('cdl')}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              {form.cdl === 'yes' && (
                <div>
                  <label style={lbl}>CDL class</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={form.cdlClass} onChange={set('cdlClass')}>
                    <option value="A">Class A</option>
                    <option value="B">Class B</option>
                  </select>
                </div>
              )}
              <div><label style={lbl}>Truck / equipment</label><input style={inp} value={form.truckType} onChange={set('truckType')} placeholder="Tilt-bed roll-off" /></div>
              <div><label style={lbl}>Years hauling</label><input style={inp} inputMode="numeric" value={form.experienceYears} onChange={set('experienceYears')} placeholder="5" /></div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={lbl}>Container hauling capabilities</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {HAUL_CAP_OPTIONS.map(c => (
                  <button key={c} type="button" onClick={() => toggleCap(c)} style={{
                    padding: '7px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
                    border: `1.5px solid ${caps.has(c) ? '#fff' : 'rgba(255,255,255,.4)'}`,
                    background: caps.has(c) ? '#fff' : 'transparent',
                    color: caps.has(c) ? 'var(--ld-brand, #0057B8)' : '#fff',
                  }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={lbl}>Anything else? (optional)</label>
              <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={form.notes} onChange={set('notes')} placeholder="Routes you run, ports you know, references…" />
            </div>
            {error && <div style={{ marginTop: '10px', background: 'rgba(255,255,255,.95)', color: '#B3261E', borderRadius: '10px', padding: '9px 12px', fontSize: '13px', fontWeight: 600 }}>{error}</div>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={submit} disabled={busy} className="ld-btn ld-btn--accent" style={{ fontSize: '15px', padding: '12px 26px', cursor: 'pointer', border: 'none' }}>
                {busy ? 'Sending…' : 'Send My Application'}
              </button>
              <span style={{ color: 'rgba(255,255,255,.75)', fontSize: '12.5px' }}>We'll call you for a quick interview — approval invites you into the Driver Portal.</span>
            </div>
          </div>
        )}
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
            <img src={u('logo-nsb.svg')} alt={`${tenant.name} — Buy, Ship, Deliver`} style={{ width: '190px', maxWidth: '100%', height: 'auto', marginBottom: '10px' }} />
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
              <li><a href={u('shop?tab=bulk')}>Bulk &amp; B2B</a></li>
              <li><a href={u('shop?cond=used')}>Used conex boxes</a></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><a href={u('#how-it-works')}>How it works</a></li>
              <li><a href={u('#why-us')}>Why us</a></li>
              <li><a href={u('#faq')}>FAQ</a></li>
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
      <a className="ld-btn ld-btn--accent" href={u('shop')}>Shop</a>
    </div>
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
        <HowItWorks />
        <TrustBand tenant={tenant} />
        <Teasers />
        <FaqSection tenant={tenant} />
        <EmailCaptureBand />
        <DriveBand />
      </main>
      <SiteFooter tenant={tenant} />
      <CallBar tenant={tenant} />
      <JsonLd data={jsonLdLocalBusiness(tenant)} />
      <JsonLd data={jsonLdBreadcrumb([{ name: 'Home', path: '/' }], tenant.primaryDomain)} />
    </div>
  )
}
