// ============================================================
// Landing SEO content builders
//
// FAQ copy and JSON-LD structured data, generated from the
// canonical constants (SIZE_SPECS / GRADE_META / tenant config)
// so the visible text, the schema markup, and the marketplace
// can never disagree on a number. All ORIGINAL copy — nothing
// sourced from competitor sites.
// ============================================================

import { SIZE_SPECS, GRADE_META, GRADE_ORDER, DELIVERY_CLEARANCE, specOf } from '../../lib/specs'
import type { Tenant, TenantCity } from '../../tenant'
import type { Container } from '../../lib/api'
import { SIZE_LABEL, photoUrl } from '../../lib/api'

export interface FaqItem { q: string; a: string }

const s20 = specOf('20ft-std')!
const s40 = specOf('40ft-std')!
const hc40 = specOf('40ft-hc')!

export function buildFaq(tenant: Tenant, city?: TenantCity): FaqItem[] {
  const place = city ? `${city.name}, ${city.state}` : 'the Gulf Coast'
  return [
    {
      q: 'What are the exact dimensions of a shipping container?',
      a: `A ${s20.label.toLowerCase()} container is ${s20.extL} long × ${s20.extW} wide × ${s20.extH} tall outside, with ${s20.intL} × ${s20.intW} × ${s20.intH} inside (${s20.capacityCuFt.toLocaleString()} cu ft, about ${s20.floorSqFt} sq ft of floor). A ${s40.label.toLowerCase()} is ${s40.extL} × ${s40.extW} × ${s40.extH} outside and ${s40.intL} × ${s40.intW} × ${s40.intH} inside (${s40.capacityCuFt.toLocaleString()} cu ft). High cube versions add a foot of height — ${hc40.intH} of interior clearance.`,
    },
    {
      q: 'How much weight can a 20ft container hold?',
      a: `Read the CSC plate on the door: a standard 20ft is rated at ${s20.maxGrossLb.toLocaleString()} lb max gross. Subtract its ${s20.tareLb.toLocaleString()} lb empty weight and you get a real cargo payload of about ${s20.payloadLb.toLocaleString()} lb. You'll often see 20-footers advertised at less than half that — usually a kilogram figure repeated as pounds. A 40ft carries about ${s40.payloadLb.toLocaleString()} lb of cargo.`,
    },
    {
      q: 'What are the door opening and ceiling clearances?',
      a: `Standard-height containers give you a ${s20.doorW} wide × ${s20.doorH} tall door opening and ${s20.intH} of ceiling inside. High cubes open ${hc40.doorH} tall with ${hc40.intH} ceilings — the difference that lets you rack pallets two-high or walk equipment in without ducking.`,
    },
    {
      q: 'What do the condition grades A, B, C, R, and X mean?',
      a: GRADE_ORDER.map(g => `Grade ${g} (${GRADE_META[g].label}): ${GRADE_META[g].desc}`).join(' ') +
        ' Every unit is field-inspected and photographed before it is listed, so the grade you see is verified — not the seller\'s optimism.',
    },
    {
      q: `How fast is container delivery in ${place}?`,
      a: `Most deliveries in ${place} land in 3–5 business days from order confirmation, dispatched from our nearest stocking yard. Enter your ZIP on any listing for a live estimate, and you don't pay until the container is set on your site.`,
    },
    {
      q: 'How much space does delivery need?',
      a: `Our tilt-bed trucks need roughly ${DELIVERY_CLEARANCE.straightFeet20} ft of straight-line clearance to set a 20ft and about ${DELIVERY_CLEARANCE.straightFeet40} ft for a 40ft, with ${DELIVERY_CLEARANCE.widthFeet} ft of width and ${DELIVERY_CLEARANCE.overheadFeet} ft of overhead clear of branches and wires. Firm, level ground — gravel, packed dirt, or pavement — is all the site prep a container needs.`,
    },
    {
      q: 'Should I rent or buy a conex box?',
      a: 'Renting makes sense for a project measured in months — one monthly rate, and we haul the box back when you\'re done. Buying wins for anything past a year, since a container holds resale value. Many units on our marketplace list both a purchase price and a monthly rental rate, so you can compare directly on the same box.',
    },
    {
      q: 'Are used conex boxes wind and watertight?',
      a: 'Every grade we sell above salvage is verified wind and watertight at inspection: doors sealed, roof sound, floors solid. The 8-photo inspection on each listing shows the actual roof, seals, floor, and corners of the exact unit you\'re buying — not a stock photo of a nicer one.',
    },
  ]
}

// ── JSON-LD builders ──────────────────────────────────────

export function jsonLdLocalBusiness(tenant: Tenant) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${tenant.primaryDomain}/#business`,
    name: tenant.name,
    legalName: tenant.legalName,
    url: `${tenant.primaryDomain}/`,
    telephone: tenant.phone,
    email: tenant.email,
    image: `${tenant.primaryDomain}/og/og-card.jpg`,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: tenant.address.street,
      addressLocality: tenant.address.city,
      addressRegion: tenant.address.state,
      postalCode: tenant.address.zip,
      addressCountry: 'US',
    },
    openingHours: 'Mo-Sa 07:00-18:00',
    areaServed: ['Louisiana', 'Mississippi', 'Alabama', 'Texas', 'Arkansas', 'Florida Panhandle'].map(name => ({ '@type': 'State', name })),
    sameAs: tenant.social.map(s => s.url),
  }
}

// Live units when available (real offers), otherwise the four core
// size categories (no offer — prices are live-only).
export function jsonLdProducts(tenant: Tenant, units: Container[] | null) {
  const items = units && units.length
    ? units.slice(0, 8).map(u => ({
        '@type': 'Product',
        name: `${SIZE_LABEL[u.size] ?? u.size} shipping container — Grade ${u.grade} (${GRADE_META[u.grade]?.label ?? ''})`,
        sku: u.sku,
        image: u.photos?.filter(Boolean).slice(0, 1).map(p => photoUrl(p)),
        description: `Field-inspected ${SIZE_LABEL[u.size] ?? u.size} container, grade ${u.grade}, photo-documented, delivered across the Gulf Coast.`,
        offers: {
          '@type': 'Offer',
          price: u.buyPrice,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: `${tenant.primaryDomain}/shop`,
        },
      }))
    : SIZE_SPECS.map(s => ({
        '@type': 'Product',
        name: `${s.label} shipping container`,
        description: `${s.keyword} — ${s.extL} × ${s.extW} × ${s.extH}, ${s.capacityCuFt.toLocaleString()} cu ft, payload ${s.payloadLb.toLocaleString()} lb. Field-inspected and delivered.`,
      }))
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })),
  }
}

export function jsonLdFaq(faq: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

export function jsonLdBreadcrumb(items: { name: string; path: string }[], origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${origin}${it.path}`,
    })),
  }
}

// Route-level meta (title/description/path) — shared by the SSG
// prerenderer and any future client-side head manager.
export interface RouteMeta {
  path: string           // production path, leading slash, trailing slash for dirs
  title: string
  description: string
}

export function homeMeta(tenant: Tenant): RouteMeta {
  return {
    path: '/',
    title: `Shipping Containers for Sale & Rent | New + Used Conex Boxes Delivered | ${tenant.name}`,
    description: `Buy or rent field-inspected shipping containers with real photos, verified grades, and instant ZIP-delivered pricing. 20ft & 40ft conex boxes delivered across the Gulf Coast in 3–5 days. Pay on delivery.`,
  }
}

export function cityMeta(tenant: Tenant, city: TenantCity): RouteMeta {
  return {
    path: `/service-area/${city.slug}/`,
    title: `Shipping Containers for Sale in ${city.name}, ${city.state} | Conex Boxes Delivered | ${tenant.name}`,
    description: `New & used shipping containers delivered to ${city.name}, ${city.state}. Field-inspected 20ft & 40ft conex boxes with real photos, verified grades, and instant delivered pricing. Pay on delivery.`,
  }
}

export function serviceAreaMeta(tenant: Tenant): RouteMeta {
  return {
    path: '/service-area/',
    title: `Service Area — Container Delivery Across the Gulf Coast | ${tenant.name}`,
    description: `${tenant.name} delivers shipping containers across Louisiana, Mississippi, Alabama, Texas, Arkansas, and the Florida Panhandle. Find delivered pricing for your city.`,
  }
}
