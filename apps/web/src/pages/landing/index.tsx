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
import { quotes, isZipCovered } from '../../lib/api'
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

export type ShopTab = 'buy' | 'rent' | 'custom' | 'bulk'

// 'custom' (Custom Builds) is deliberately unlisted — the shop tab code
// is kept, but it's not linked anywhere until the fab-shop launch.
const NAV_CATEGORIES: { tab: ShopTab; label: string }[] = [
  { tab: 'buy', label: 'Buy' },
  { tab: 'rent', label: 'Rent' },
  { tab: 'bulk', label: 'Bulk / B2B' },
]

// The one site-wide header. The landing/city pages render it bare; the
// marketplace passes `active`/`onSelect` (tabs switch in-page instead of
// reloading) and its cart/profile controls via `right`. Keeping every page
// on this component is what keeps the nav identical across the site.
export function SiteNav({ tenant, active, onSelect, right }: {
  tenant: Tenant
  active?: ShopTab
  onSelect?: (t: ShopTab) => void
  right?: React.ReactNode
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
  // accent — "MVP Container" → blue / orange.
  const [brandWord, ...accentWords] = tenant.logoText.split(' ')
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
  // fully styled on any page, marketplace included.
  const brandVars = {
    '--ld-brand': tenant.brand.primary,
    '--ld-accent': tenant.brand.accent,
    '--ld-ink': tenant.brand.ink,
  } as React.CSSProperties
  return (
    <header className="ld-nav" ref={navRef} style={brandVars}>
      <div className="ld-nav-wrap">
        <div className="ld-nav-row">
          <a className="ld-logo" href={u('')} aria-label={`${tenant.name} home`}>
            <span className="ld-logo-badge" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="6" width="22" height="14" rx="2" /><line x1="6" y1="6" x2="6" y2="20" /><line x1="11" y1="6" x2="11" y2="20" /><line x1="16" y1="6" x2="16" y2="20" /></svg>
            </span>
            <span className="ld-logo-word">
              <span className="ld-logo-brand">{brandWord}</span>
              {accentWords.length > 0 && <span className="ld-logo-accent">&nbsp;{accentWords.join(' ')}</span>}
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
            <button className="ld-nav-burger" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(o => !o)}>☰</button>
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

function Hero({ tenant }: { tenant: Tenant }) {
  const [input, setInput] = useState('')
  // ZIP the shopper last checked ('' until they submit) — the form answers
  // "do you deliver to me?", nothing more.
  const [checked, setChecked] = useState('')
  // Phones: the hero shrinks to headline + ZIP bar once the shopper scrolls,
  // so content is one flick away. Hysteresis (collapse >80, expand <10)
  // prevents jitter from the page shortening under the scroll position.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 940px)')
    const onScroll = () => {
      const y = window.scrollY
      setCollapsed(prev => mq.matches && (prev ? y > 10 : y > 80))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = input.trim().slice(0, 5)
    if (v.length === 5) setChecked(v)
  }
  return (
    <section className={`ld-hero ld-hero--portal${collapsed ? ' ld-hero--collapsed' : ''}`}>
      <img className="ld-hero-bgimg" src={heroImg()} alt="" aria-hidden="true" />
      <div className="ld-hero-inner">
        <h1>See YOUR Container. Know YOUR Price. Track YOUR delivery.'</h1>
        <p className="ld-hero-sub">
          Every container on our marketplace is field-inspected, photo-documented, and priced to your ZIP — no "calling," no mystery, no friction.
        </p>
        <form className="ld-searchbar" onSubmit={submit}>
          <label htmlFor="hero-zip" style={{ position: 'absolute', left: '-9999px' }}>Delivery ZIP code</label>
          <input
            id="hero-zip" inputMode="numeric" pattern="[0-9]{5}"
            placeholder="Enter your delivery ZIP" value={input} maxLength={5}
            onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
          />
          <button className="ld-btn ld-btn--brand" type="submit">Check delivery</button>
        </form>
        {checked && (
          <p className="ld-hero-secondary" role="status">
            {isZipCovered(checked)
              ? <>✓ Yes — we deliver to {checked}, typically within 3–5 business days.</>
              : <>{checked} is outside our standard delivery area — <a href={tenant.phoneHref}>call {tenant.phone}</a> and we'll see what we can do.</>}
          </p>
        )}
        <div className="ld-hero-ctas">
          <a className="ld-btn ld-btn--accent" href={u('shop')}>Browse all inventory</a>
        </div>
        <div className="ld-hero-points">
          <span>8-photo inspection</span>
          <span>3–5 day delivery</span>
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────

export function HowItWorks() {
  const steps = [
    { t: 'Pick Buy or Rent', d: 'Own it outright or rent by the month — it\'s the same field-inspected inventory either way.', href: u('shop?tab=buy') },
    { t: 'Pick your size & grade', d: `20ft or 40ft, standard or high cube, grades A through R — each verified in a field inspection with a full photo set.`, href: u('shop') },
    { t: 'Pick new or used', d: 'New one-trip boxes or inspected used units — the photos show exactly what you\'re getting.', href: u('shop?cond=new') },
    { t: 'Checkout', d: `Add to cart and pick a delivery window. Payment is held until the container is set on your site and you've walked around it.`, href: u('shop') },
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
    { t: '8-photo inspection', d: 'Roof, seals, floor, corners, doors open and closed — the full set on every listing, taken in our yard, of your exact unit.' },
    { t: 'Verified grade', d: 'Grades are assigned by our field inspectors against a written standard, not by whoever answers the phone.' },
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
      </main>
      <SiteFooter tenant={tenant} />
      <CallBar tenant={tenant} />
      <JsonLd data={jsonLdLocalBusiness(tenant)} />
      <JsonLd data={jsonLdBreadcrumb([{ name: 'Home', path: '/' }], tenant.primaryDomain)} />
    </div>
  )
}
