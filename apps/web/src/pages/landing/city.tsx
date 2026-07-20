// ============================================================
// City landing page — /service-area/<slug>/
// One statically prerendered page per city in the tenant's
// service area, targeting "shipping containers for sale <city>",
// "conex box <city>", and "container rental <city>". Each page
// gets a unique angle sentence from the tenant config so no two
// city pages share boilerplate copy.
// ============================================================

import React, { useState } from 'react'
import '../../styles/landing.css'
import type { Container } from '../../lib/api'
import type { Tenant, TenantCity } from '../../tenant'
import {
  SiteNav, SiteFooter, CallBar, InventorySection, HowItWorks, TrustBand,
  FaqSection, LeadQuickForm, u,
} from './index'
import { jsonLdLocalBusiness, jsonLdBreadcrumb, serviceAreaMeta } from './seo'

function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}

export interface CityPageProps {
  tenant: Tenant
  city: TenantCity
  initialInventory: Container[] | null
}

export default function CityPage({ tenant, city, initialInventory }: CityPageProps) {
  const [zip, setZip] = useState(city.zip)
  const [input, setInput] = useState(city.zip)
  const brandVars = {
    '--ld-brand': tenant.brand.primary,
    '--ld-accent': tenant.brand.accent,
    '--ld-ink': tenant.brand.ink,
  } as React.CSSProperties

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = input.trim().slice(0, 5)
    if (v.length === 5) {
      setZip(v)
      document.getElementById('inventory')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="ld" style={brandVars}>
      <SiteNav tenant={tenant} />
      <main>
        <section className="ld-hero" id="instant-price">
          <div className="ld-wrap">
            <div className="ld-hero-grid">
              <div>
                <nav aria-label="Breadcrumb" style={{ fontSize: 13, marginBottom: 10 }}>
                  <a href={u('')}>Home</a> › <a href={u('service-area/')}>Service Area</a> › <span aria-current="page">{city.name}, {city.state}</span>
                </nav>
                <h1>Shipping Containers for Sale &amp; Rent in {city.name}, {city.state}</h1>
                <p className="ld-hero-sub">
                  Field-inspected new and used conex boxes delivered to {city.name} in 3–5 business days — with real photos of the exact unit, a verified grade, and payment held until the box is on your site. {city.angle}
                </p>
                <form className="ld-zip-form" onSubmit={submit}>
                  <label htmlFor="city-zip" style={{ position: 'absolute', left: '-9999px' }}>Delivery ZIP code</label>
                  <input
                    id="city-zip" className="ld-zip-input" inputMode="numeric" pattern="[0-9]{5}"
                    value={input} maxLength={5} placeholder="Delivery ZIP"
                    onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
                  />
                  <button className="ld-btn ld-btn--accent" type="submit">See your delivered price</button>
                </form>
                <p className="ld-hero-secondary">
                  Serving ZIP codes starting {city.zipPrefixes.map(p => `${p}xx`).join(', ')} · or <a href={u('shop')}>browse all inventory →</a>
                </p>
              </div>
              <div className="ld-hero-photo">
                <img
                  src={u('og/container-hero.jpg')} width="1000" height="750"
                  alt={`Shipping container ready for delivery to ${city.name}, ${city.state}`}
                />
              </div>
            </div>
          </div>
        </section>

        <InventorySection tenant={tenant} zip={zip} initialInventory={initialInventory} city={city} />
        <HowItWorks />
        <TrustBand tenant={tenant} />

        <section className="ld-section ld-section--tint" aria-labelledby="cityquote-h">
          <div className="ld-wrap">
            <p className="ld-kicker">{city.name} quotes</p>
            <h2 id="cityquote-h" className="ld-h2">Want a human to price it for you?</h2>
            <p className="ld-section-sub">
              Tell us what you're storing and where in {city.name} it's going — we'll call back with a delivered price, usually within the hour during business hours.
            </p>
            <div style={{ maxWidth: 420 }}>
              <LeadQuickForm need="buy" source={`city-${city.slug}`} buttonLabel={`Get my ${city.name} quote`} />
            </div>
          </div>
        </section>

        <FaqSection tenant={tenant} city={city} />

        <section className="ld-section" aria-labelledby="othercities-h">
          <div className="ld-wrap">
            <h2 id="othercities-h" className="ld-h2" style={{ fontSize: 20 }}>Other delivery areas</h2>
            <div className="ld-cities">
              {tenant.cities.filter(c => c.slug !== city.slug).map(c => (
                <a key={c.slug} className="ld-city-link" href={u(`service-area/${c.slug}/`)}>{c.name}, {c.state}</a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter tenant={tenant} />
      <CallBar tenant={tenant} />
      <JsonLd data={jsonLdLocalBusiness(tenant)} />
      <JsonLd data={jsonLdBreadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Service Area', path: serviceAreaMeta(tenant).path },
        { name: `${city.name}, ${city.state}`, path: `/service-area/${city.slug}/` },
      ], tenant.primaryDomain)} />
    </div>
  )
}

// Simple index for /service-area/ listing every city.
export function ServiceAreaIndexPage({ tenant }: { tenant: Tenant }) {
  const brandVars = {
    '--ld-brand': tenant.brand.primary,
    '--ld-accent': tenant.brand.accent,
    '--ld-ink': tenant.brand.ink,
  } as React.CSSProperties
  return (
    <div className="ld" style={brandVars}>
      <SiteNav tenant={tenant} />
      <main>
        <section className="ld-section">
          <div className="ld-wrap">
            <nav aria-label="Breadcrumb" style={{ fontSize: 13, marginBottom: 10 }}>
              <a href={u('')}>Home</a> › <span aria-current="page">Service Area</span>
            </nav>
            <p className="ld-kicker">Service area</p>
            <h1 className="ld-h2" style={{ fontSize: 'clamp(24px,3.5vw,34px)' }}>Container delivery across the Gulf Coast</h1>
            <p className="ld-section-sub">
              {tenant.name} delivers field-inspected shipping containers from yards in {tenant.depots.join(', ')}. Pick your market for local pricing and delivery details:
            </p>
            <div className="ld-cities">
              {tenant.cities.map(c => (
                <a key={c.slug} className="ld-city-link" href={u(`service-area/${c.slug}/`)}>{c.name}, {c.state}</a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter tenant={tenant} />
      <CallBar tenant={tenant} />
      <JsonLd data={jsonLdLocalBusiness(tenant)} />
      <JsonLd data={jsonLdBreadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Service Area', path: '/service-area/' },
      ], tenant.primaryDomain)} />
    </div>
  )
}
