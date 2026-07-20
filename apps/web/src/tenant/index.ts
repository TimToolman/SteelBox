// ============================================================
// Tenant configuration seam
//
// Everything brand-, contact-, or territory-specific lives here
// and is resolved from the request hostname. Pages must never
// hardcode a brand name, phone number, domain, or service area —
// they read the resolved Tenant. A second tenant (or a national
// umbrella site) becomes a new entry in TENANTS, not a code change.
// ============================================================

import { SERVICE_ZIP_PREFIXES } from '../lib/api'

export interface TenantCity {
  slug: string          // URL segment under /service-area/
  name: string
  state: string         // two-letter
  zip: string           // representative ZIP (prefills the quote flow)
  zipPrefixes: string[] // subset of the tenant's service prefixes
  angle: string         // one unique, city-specific sentence — keeps every
                        // city page's copy original (no boilerplate dupes)
}

export interface Tenant {
  id: string
  name: string
  legalName: string
  primaryDomain: string          // canonical origin, no trailing slash
  brand: { primary: string; accent: string; ink: string }
  logoText: string
  phone: string                  // display format
  phoneHref: string              // tel: target
  smsHref: string                // sms: target
  email: string
  address: { street: string; city: string; state: string; zip: string }
  hours: string
  social: { label: string; url: string }[]
  googleReviewsUrl: string
  // Placeholder quotes — replace with real customer quotes before launch.
  // Rendered as plain text only; never emitted as Review/Rating schema.
  testimonials: { quote: string; who: string }[]
  depots: string[]               // display names of stocking yards
  serviceZipPrefixes: string[]
  cities: TenantCity[]
}

const MVP_CITIES: TenantCity[] = [
  { slug: 'new-orleans', name: 'New Orleans', state: 'LA', zip: '70112', zipPrefixes: ['700', '701'], angle: 'From Mid-City renovations to hurricane-season prep on the Northshore, sealed dry storage that shrugs off humidity is what New Orleans buyers ask us for most.' },
  { slug: 'baton-rouge', name: 'Baton Rouge', state: 'LA', zip: '70801', zipPrefixes: ['707', '708'], angle: 'Plant turnarounds and campus moves keep Baton Rouge crews on tight schedules — most deliveries here land within a couple of days of the order call.' },
  { slug: 'lafayette', name: 'Lafayette', state: 'LA', zip: '70501', zipPrefixes: ['705'], angle: 'Oilfield service yards around Lafayette use our 20-footers as lockable parts cribs that move between job sites on a gooseneck.' },
  { slug: 'lake-charles', name: 'Lake Charles', state: 'LA', zip: '70601', zipPrefixes: ['706'], angle: 'LNG construction traffic means Lake Charles sites need storage that arrives on schedule and locks down overnight.' },
  { slug: 'gulfport-biloxi', name: 'Gulfport–Biloxi', state: 'MS', zip: '39501', zipPrefixes: ['394', '395'], angle: 'Salt air is hard on cheap boxes — for the Mississippi Gulf Coast we steer buyers toward one-trip and refurbished units with sound door seals.' },
  { slug: 'jackson', name: 'Jackson', state: 'MS', zip: '39201', zipPrefixes: ['390', '391', '392'], angle: 'Contractors across metro Jackson rent by the month during buildouts, then swap up to a purchase when the yard becomes permanent.' },
  { slug: 'hattiesburg', name: 'Hattiesburg', state: 'MS', zip: '39401', zipPrefixes: ['393', '396'], angle: 'Between the universities and the timber trade, Hattiesburg orders split about evenly between seasonal rentals and owned site storage.' },
  { slug: 'mobile', name: 'Mobile', state: 'AL', zip: '36602', zipPrefixes: ['365', '366'], angle: 'Being a port town, Mobile gets first pick of fresh one-trip imports before they travel inland.' },
  { slug: 'montgomery', name: 'Montgomery', state: 'AL', zip: '36104', zipPrefixes: ['360', '361'], angle: 'Montgomery buyers lean toward 40ft high cubes — the extra foot of ceiling turns a storage box into workable shop space.' },
  { slug: 'houston', name: 'Houston', state: 'TX', zip: '77002', zipPrefixes: ['770', '771', '772', '773', '774', '775'], angle: 'Houston is our busiest Texas market — jobsite offices, laydown-yard storage, and buyer pickups near the Port of Houston.' },
  { slug: 'beaumont', name: 'Beaumont', state: 'TX', zip: '77701', zipPrefixes: ['776', '777'], angle: 'Refinery contractors around Beaumont and Port Arthur want wind-and-watertight units they can chain down before a storm.' },
  { slug: 'dallas', name: 'Dallas', state: 'TX', zip: '75201', zipPrefixes: ['750', '751', '752', '753'], angle: 'DFW deliveries run daily — Dallas buyers compare grades side by side more than any other market, so every unit shows its full photo set.' },
  { slug: 'fort-worth', name: 'Fort Worth', state: 'TX', zip: '76102', zipPrefixes: ['760', '761', '762'], angle: 'Ranch and acreage owners west of Fort Worth buy 40-footers as equipment barns that go up in an afternoon, not a season.' },
  { slug: 'san-antonio', name: 'San Antonio', state: 'TX', zip: '78205', zipPrefixes: ['780', '781', '782'], angle: 'San Antonio builders like the pay-on-delivery model — the container shows up, gets inspected on the truck, then the card is charged.' },
  { slug: 'austin', name: 'Austin', state: 'TX', zip: '78701', zipPrefixes: ['786', '787'], angle: 'Austin orders skew toward custom builds — insulated backyard offices and vented storage for hill-country properties.' },
  { slug: 'corpus-christi', name: 'Corpus Christi', state: 'TX', zip: '78401', zipPrefixes: ['783', '784'], angle: 'On the Coastal Bend we recommend marine-grade paint touch-ups and door gasket checks — included in every Corpus Christi inspection.' },
  { slug: 'el-paso', name: 'El Paso', state: 'TX', zip: '79901', zipPrefixes: ['798', '799'], angle: 'El Paso is our western edge — desert sun fades paint long before rust starts, so grade photos here matter more than grade letters.' },
  { slug: 'little-rock', name: 'Little Rock', state: 'AR', zip: '72201', zipPrefixes: ['720', '721', '722'], angle: 'Central Arkansas farms buy containers ahead of harvest; ordering a few weeks early beats the fall rush on 40-footers.' },
  { slug: 'texarkana', name: 'Texarkana', state: 'AR', zip: '71854', zipPrefixes: ['718', '719'], angle: 'Straddling two states, Texarkana deliveries dispatch from whichever depot has your unit closest — you see that in the delivered price.' },
  { slug: 'fayetteville', name: 'Fayetteville', state: 'AR', zip: '72701', zipPrefixes: ['727', '728', '729'], angle: 'Northwest Arkansas warehousing overflow keeps 40ft high cubes moving through Fayetteville, Springdale, and Rogers.' },
  { slug: 'pensacola', name: 'Pensacola', state: 'FL', zip: '32501', zipPrefixes: ['325'], angle: 'Pensacola buyers ask first about wind rating — an anchored conex is rated far beyond what a portable shed survives.' },
  { slug: 'panama-city', name: 'Panama City', state: 'FL', zip: '32401', zipPrefixes: ['324'], angle: 'Post-storm rebuilds made Panama City a container town — secure tool storage that a crew can move between lots in one trip.' },
  { slug: 'tallahassee', name: 'Tallahassee', state: 'FL', zip: '32301', zipPrefixes: ['323'], angle: 'Tallahassee orders cluster around the state fiscal year — agencies and contractors rent for the season and return on our truck.' },
]

// ── Seeded tenants ────────────────────────────────────────

const MVP_CONTAINER: Tenant = {
  id: 'mvp-container',
  name: 'MVP Container',
  legalName: 'MVP Container LLC',
  primaryDomain: 'https://www.mvpcontainers.com',
  brand: { primary: '#2B7FD4', accent: '#E65100', ink: '#13293D' },
  logoText: 'MVP Container',
  phone: '(504) 555-0190',
  phoneHref: 'tel:+15045550190',
  smsHref: 'sms:+15045550190',
  email: 'sales@mvpcontainers.com',
  address: { street: '2800 Almonaster Ave', city: 'New Orleans', state: 'LA', zip: '70126' },
  hours: 'Mon–Sat 7am–6pm CT',
  social: [
    { label: 'Facebook', url: 'https://www.facebook.com/mvpcontainers' },
    { label: 'Instagram', url: 'https://www.instagram.com/mvpcontainers' },
    { label: 'YouTube', url: 'https://www.youtube.com/@mvpcontainers' },
  ],
  googleReviewsUrl: 'https://www.google.com/search?q=MVP+Container+New+Orleans+reviews',
  testimonials: [
    { quote: 'Ordered Tuesday, set in my yard Thursday. The photos matched the box that showed up — exactly.', who: 'Sample quote — replace before launch' },
    { quote: 'Grade B was honest. Dings where the pictures showed dings, doors swing easy, floor is clean.', who: 'Sample quote — replace before launch' },
    { quote: 'Not paying until it was on the ground was the reason I picked them over the 800-number guys.', who: 'Sample quote — replace before launch' },
  ],
  depots: ['New Orleans, LA', 'Baton Rouge, LA', 'Houston, TX', 'Dallas, TX'],
  serviceZipPrefixes: SERVICE_ZIP_PREFIXES,
  cities: MVP_CITIES,
}

const TENANTS: Record<string, Tenant> = {
  [MVP_CONTAINER.id]: MVP_CONTAINER,
}

// hostname → tenant id. Unknown hosts (localhost, *.github.io preview,
// Vercel preview URLs) fall back to the seed tenant.
const HOST_MAP: Record<string, string> = {
  'www.mvpcontainers.com': 'mvp-container',
  'mvpcontainers.com': 'mvp-container',
}

export const DEFAULT_TENANT_ID = MVP_CONTAINER.id

export function resolveTenant(hostname?: string): Tenant {
  const id = (hostname && HOST_MAP[hostname.toLowerCase()]) || DEFAULT_TENANT_ID
  return TENANTS[id]
}

export function getTenantById(id: string): Tenant | undefined {
  return TENANTS[id]
}

export function cityBySlug(tenant: Tenant, slug: string): TenantCity | undefined {
  return tenant.cities.find(c => c.slug === slug)
}
