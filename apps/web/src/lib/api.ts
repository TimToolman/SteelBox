// ============================================================
// MVP Container API Client
// Wraps all fetch calls to the Railway-hosted Express API
// ============================================================

// `||` (not ??) so an empty build-time var still falls back to localhost.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// Static demo mode: no backend at all — reads come from the bundled data
// snapshot, writes pretend to succeed (see lib/demo.ts). Set at build time
// for API-less deploys like the GitHub Pages demo.
const DEMO = import.meta.env.VITE_DEMO_STATIC === '1'

function getToken(): string | null {
  return localStorage.getItem('sbx_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (DEMO) {
    const { demoRequest } = await import('./demo')
    return demoRequest<T>(path, options)
  }
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    // fetch() itself failed — the API host is unreachable from this device.
    // A deployed site still pointing at localhost means VITE_API_URL was
    // never set at build time; say so instead of the cryptic "Failed to fetch".
    const deployedButLocal = BASE.includes('localhost') && !['localhost', '127.0.0.1'].includes(window.location.hostname)
    throw new Error(deployedButLocal
      ? 'This site is not connected to a MVP Container API server yet — please call us at (504) 555-0190.'
      : 'Could not reach the MVP Container server. Check your connection and try again.')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────

// 'inspector' handles inspections and grading. 'adjuster' is the legacy name
// for the same role, still accepted on accounts created before the rename.
// A driver may inspect too — it is simply never required of them.
export type Role = 'customer' | 'driver' | 'inspector' | 'adjuster' | 'supplier' | 'shipper' | 'marketing' | 'admin'

export interface AuthUser {
  id: string
  email: string
  role: Role
  name: string
  phone: string
  driverId: string      // links a driver login to drivers.csv
  customerId: string    // links a customer login to customers.csv
  phoneVerified: boolean
  active: boolean
  createdAt: string
  twoFaVerified?: boolean       // true if checkout 2FA completed recently (per session)
  mustChangePassword?: boolean  // true when signed in with the seeded dev password
  sellerId?: string             // set on seller-scoped staff accounts
  supplierId?: string           // links a supplier login to suppliers.csv
  shipperId?: string            // links a shipping-line login to shippers.csv
  // Portal grants on top of the primary role: 'marketplace' is the base
  // (removing it blocks sign-in entirely); 'supplier' / 'shipper' add those
  // portals as tabs behind the single marketplace login.
  roles?: string[]
  digestFreq?: 'per_container' | 'daily' | 'weekly'  // claim-email preference
  lastLoginAt?: string          // login audit (arbitration evidence)
}

// Login either completes immediately (token+user) or — for admins — asks for
// the emailed 6-digit code first (twoFaRequired + pendingToken).
export interface AuthPayload {
  token: string
  user: AuthUser
  twoFaRequired?: undefined
}
export interface AuthPending {
  twoFaRequired: true
  pendingToken: string
  devCode?: string   // dev only — surfaced when the server has no SMTP configured
}

// Does this account carry a role — either as its primary role or as a
// portal grant? The single check every portal tab and route guard uses.
export function hasGrant(user: AuthUser | null | undefined, role: Role | 'marketplace'): boolean {
  if (!user) return false
  return user.role === role || (user.roles || []).includes(role)
}

export const auth = {
  login: (email: string, password: string) =>
    request<AuthPayload | AuthPending>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  // Step 2 of an admin sign-in: the emailed code + the pending token.
  loginVerify: (pendingToken: string, code: string) =>
    request<AuthPayload>('/auth/login/verify', { method: 'POST', body: JSON.stringify({ pendingToken, code }) }),
  // Sign-ups require a profile (name + mobile) and answer with a
  // verification-code step (AuthPending) — the session comes from
  // loginVerify once the emailed code is entered.
  register: (data: { name: string; email: string; password: string; phone?: string }) =>
    request<AuthPayload | AuthPending>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<AuthUser>('/auth/me'),
  // Password reset: request an emailed code, then set the new password with it.
  forgot: (email: string) =>
    request<{ sent: true; devCode?: string }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  reset: (email: string, code: string, password: string) =>
    request<{ reset: true }>('/auth/reset', { method: 'POST', body: JSON.stringify({ email, code, password }) }),
  changePassword: (current: string, next: string) =>
    request<{ changed: true }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ current, next }) }),
  // Checkout two-factor: a 6-digit code emailed to the account address
  // (the mobile number is collected for delivery coordination). Required
  // before every order. devCode is returned only when SMTP isn't configured.
  twoFaSend: (phone: string) =>
    request<{ sent: true; channel?: string; devCode?: string }>('/auth/2fa/send', { method: 'POST', body: JSON.stringify({ phone }) }),
  twoFaVerify: (code: string) =>
    request<{ verified: true }>('/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
}

// ── Users (admin-managed accounts) ────────────────────────

export const users = {
  list: () => request<AuthUser[]>('/users'),
  create: (data: { email: string; password: string; role: Role; name?: string; phone?: string; driverId?: string; sellerId?: string; roles?: string[]; supplierId?: string; shipperId?: string }) =>
    request<AuthUser>('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<AuthUser> & { password?: string }) =>
    request<AuthUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ id: string; archived: true }>(`/users/${id}`, { method: 'DELETE' }),
}

// ── Sellers (multi-tenant marketplace) ────────────────────
// The platform is National SteelBox Corp; each seller owns depots and
// everything (inventory, orders, drivers, service terms) rolls up from
// depot ownership. Public list powers seller branding on listings.

export interface Seller {
  id: string
  name: string
  legalName: string
  brandPrimary: string
  brandAccent: string
  phone: string
  email: string
  tos: string
  active?: boolean
  createdAt?: string
  // Reseller territory: 3-digit ZIP prefix zones, e.g. "700-705,770-778".
  // Drives the marketplace ZIP search and cross-territory relay fees.
  territoryZips?: string
  // Marketing portal tier this reseller subscribes to.
  marketingPlan?: MarketingPlanId
}

export const sellers = {
  list: () => request<Seller[]>('/sellers'),
  create: (data: Partial<Seller>) =>
    request<Seller>('/sellers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Seller>) =>
    request<Seller>(`/sellers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
}

// ── Outbox (sent email/SMS log — admin only) ──────────────

export interface OutboxMessage {
  id: string
  channel: 'email' | 'sms'
  to: string
  subject: string
  body: string
  relatedType: string
  relatedId: string
  status: string
  createdAt: string
}

export const outbox = {
  list: () => request<OutboxMessage[]>('/outbox'),
}

// ── Containers ────────────────────────────────────────────

export type ContainerSize =
  | '10ft-std' | '20ft-std' | '20ft-hc' | '40ft-std' | '40ft-hc'
  // Specialty type codes from depot inventory sheets
  | '20ft-dd'      // 20' Double Door
  | '20ft-dvq'     // 20' DV Quad
  | '20ft-dvos'    // 20' DV Open Side
  | '20ft-dvosnf'  // 20' DV Open Side No Frame
  | '40ft-hcq'     // 40' HC Quad
  | '40ft-hcdd'    // 40' HC Double Door
  | '40ft-hcos'    // 40' HC Open Side

// Canonical display labels for every size/type code.
export const SIZE_LABEL: Record<ContainerSize, string> = {
  '10ft-std': '10ft Standard',
  '20ft-std': '20ft Standard',
  '20ft-hc': '20ft High Cube',
  '40ft-std': '40ft Standard',
  '40ft-hc': '40ft High Cube',
  '20ft-dd': "20' Double Door",
  '20ft-dvq': "20' DV Quad",
  '20ft-dvos': "20' DV Open Side",
  '20ft-dvosnf': "20' DV Open Side NF",
  '40ft-hcq': "40' HC Quad",
  '40ft-hcdd': "40' HC Double Door",
  '40ft-hcos': "40' HC Open Side",
}

// Factory condition — separate from the field-inspected grade. Both new and
// used units can be listed to buy, rent, or both.
export type ContainerCondition = 'new' | 'used'
export type ContainerStatus =
  | 'draft'
  | 'available'
  | 'sale_in_progress'
  | 'sold'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  // Custom-build estimate → fabrication pipeline (estimates are settled over the phone)
  | 'estimate_requested'
  | 'estimate_in_progress'
  | 'estimate_sent'
  | 'estimate_approved'
  | 'custom_in_progress'   // build underway (customEta = promised completion)
  // Phone-payment order pipeline (orders only, not containers)
  | 'pending_review'       // new order awaiting staff validation + payment call
  | 'confirmed'            // payment collected — ready to assign a driver
  | 'cancelled'            // rejected during review; container returned to market

// Every stage a custom build passes through before entering the normal
// delivery pipeline — shared by admin views and the customer portal.
export const CUSTOM_STAGES: ContainerStatus[] = [
  'estimate_requested', 'estimate_in_progress', 'estimate_sent', 'estimate_approved', 'custom_in_progress',
]
export type ContainerGrade = 'A' | 'B' | 'C' | 'R' | 'X' | 'D'
// How a container may be transacted on the marketplace.
export type ListingType = 'buy' | 'rent' | 'both'

export interface Container {
  id: string
  sku: string
  guid: string
  stockNumber: string
  size: ContainerSize
  grade: ContainerGrade
  condition: ContainerCondition
  color: string              // exterior color (e.g. Beige, Gray); '' if unspecified
  status: ContainerStatus
  listingType: ListingType
  buyPrice: number
  purchaseCost: number       // acquisition cost from the depot (COGS)
  conditionScore: number     // field-scored condition 1–5 (0 = not inspected)
  rentMonthly: number | null
  photos: string[]          // CloudFront URLs
  photoCount: number
  has360: boolean
  depotLocation: string
  bayNumber: string
  inspectorName: string
  inspectedAt: string | null
  deliveryIncluded: boolean
  createdAt: string
  customEta: string          // custom builds: promised completion date (YYYY-MM-DD)
  customBuildName: string    // custom builds: which catalog product is being fabricated
  aiGraded?: boolean         // grade assigned by the AI/ML imaging pipeline (set by the field app)
  // Damage reported on a walk-around holds the unit off the marketplace
  // until an inspector grades it. Set from the field app's job flow.
  inspectionRequired?: boolean
  inspectionReason?: string      // what the driver saw ("Bent — rear rail")
  inspectionFlaggedBy?: string
  inspectionFlaggedAt?: string | null
  inspectionFindings?: string    // JSON DamageFinding[] from the guided walk-around
  // Why it's held: 'damage' (something was found) or 'opinion' (the walk came
  // back clean and the driver wanted an inspector to make the call).
  inspectionKind?: '' | 'damage' | 'opinion'
  supplierId?: string        // owning supplier (companies resellers buy stock from)
  damagePhotos?: string[]    // claim evidence shots shown on sell-as-damaged listings
  damageSeverity?: number    // D·1 (minor) – D·5 (severe); set by the damage inspection
  preDamagePrice?: number    // list price before the damage discount (strike-through)
  // Multi-tenant: derived server-side from the unit's depot ownership.
  sellerId: string
  sellerName: string
}

export interface ContainerFilters {
  size?: ContainerSize
  grade?: ContainerGrade[]
  condition?: ContainerCondition
  status?: ContainerStatus[]
  minPrice?: number
  maxPrice?: number
  sort?: 'price-asc' | 'price-desc' | 'grade' | 'photos' | 'newest'
  tab?: 'buy' | 'rent' | 'custom'
  zip?: string
}

export const containers = {
  list: (filters?: ContainerFilters) => {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          if (Array.isArray(v)) v.forEach((i) => params.append(k, i))
          else params.set(k, String(v))
        }
      })
    }
    return request<Container[]>(`/containers?${params}`)
  },
  get: (id: string) => request<Container>(`/containers/${id}`),
  create: (data: Partial<Container>) =>
    request<Container>('/containers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Container>) =>
    request<Container>(`/containers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ id: string; sku: string; deleted: true }>(`/containers/${id}`, { method: 'DELETE' }),
  reserve: (id: string) =>
    request<{ lockExpiresAt: string }>(`/containers/${id}/reserve`, { method: 'POST' }),
  photoUploadUrl: (id: string, filename: string) =>
    request<{ uploadUrl: string; publicUrl: string }>(
      `/containers/${id}/photo-upload-url?filename=${filename}`
    ),
  // Upload one shot into a photo slot (0–11 = the 12-shot standard). The API
  // stores the file under data/photos and records /photos/<file> in that slot.
  uploadPhoto: (id: string, data: { slot: number; label?: string; dataUrl: string; inspectorName?: string }) =>
    request<Container>(`/containers/${id}/photos`, { method: 'POST', body: JSON.stringify(data) }),
  // Evidence for one walk-around finding — stored outside the 8-shot set and
  // referenced by URL from the finding itself.
  damagePhoto: (id: string, dataUrl: string) =>
    request<{ url: string }>(`/containers/${id}/damage-photo`, { method: 'POST', body: JSON.stringify({ dataUrl }) }),
  deletePhoto: (id: string, slot: number) =>
    request<Container>(`/containers/${id}/photos/${slot}`, { method: 'DELETE' }),
  // Generate the AI-stitched 3D render (slot 8) from the 8 documentation shots.
  render: (id: string) =>
    request<Container>(`/containers/${id}/render`, { method: 'POST' }),
}

// Photo URLs in CSV are API-relative (/photos/x.jpg) — resolve against the API host.
export function photoUrl(p: string | undefined | null): string {
  if (!p) return ''
  if (/^https?:|^data:/.test(p)) return p
  // Static demo: the documented units' photo files ship with the site.
  if (DEMO && p.startsWith('/photos/')) return `${import.meta.env.BASE_URL}demo-photos/${p.slice('/photos/'.length)}`
  return `${BASE}${p}`
}

// The 8-shot documentation standard — one slot per labelled shot. Shared by
// the field app (capture), marketplace (gallery), and admin portal
// (review/fix) so slot i always means the same photo everywhere.
// Slot 7 is the stock-number (SKU sticker) shot.
// Slot 8 (RENDER_SLOT) holds the AI-stitched 3D render generated from the 8
// shots — "image 9" in the marketplace gallery. Slots 9+ are extras
// (proof of delivery, return condition).
export const SHOT_LABELS = [
  'Front doors closed', 'Front doors open', 'Right hand side', 'Back', 'Left hand side',
  'Inside back', 'Inside out', 'Stock number',
] as const

export const RENDER_SLOT = 8
export const RENDER_LABEL = 'Rendered 3D view'
export const EXTRA_SLOT_START = 9

// HEIC/HEIF (iPhone camera default) can't be decoded by <img> outside Safari —
// convert to JPEG first with a lazy-loaded wasm decoder so the bundle only
// pays for it when a HEIC file is actually picked.
function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

async function heicToJpegBlob(file: File): Promise<Blob> {
  try {
    const { default: heic2any } = await import('heic2any')
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    return Array.isArray(out) ? out[0] : out
  } catch {
    throw new Error('Could not convert that HEIC photo — try exporting it as JPEG')
  }
}

// Cut the container out of a shot — background removed and the image trimmed
// to the container's bounding box — so galleries and the 3D texture wrap show
// only the actual unit. Segmentation runs in the browser via a lazy-loaded
// wasm model (downloaded once, then cached); if it fails or produces an
// implausible mask, the original photo is uploaded unchanged.
// onProgress reports 0–100 plus a human stage label ("Downloading AI model",
// "Cropping container", …) so upload UIs can show a live progress indicator.
export async function cutoutContainer(
  dataUrl: string,
  onProgress?: (pct: number, stage: string) => void,
): Promise<string> {
  try {
    onProgress?.(4, 'Preparing photo')
    const { removeBackground } = await import('@imgly/background-removal')
    const blob = await removeBackground(dataUrl, {
      output: { format: 'image/png' },
      progress: (key, current, total) => {
        if (!onProgress) return
        const frac = total ? current / total : 0
        // Asset downloads (model is ~40 MB on first use, then cached) map to
        // 5–55%; inference maps to 55–88%.
        if (key.startsWith('fetch')) onProgress(5 + frac * 50, 'Downloading AI model')
        else onProgress(55 + frac * 33, 'Cropping container')
      },
    })
    onProgress?.(90, 'Trimming')
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = URL.createObjectURL(blob)
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.width; canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(img.src)
    // Trim to the opaque bounding box so the container fills the frame.
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let minX = width, minY = height, maxX = -1, maxY = -1
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (data[(y * width + x) * 4 + 3] > 24) {
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
      }
    }
    const w = maxX - minX, h = maxY - minY
    // Sanity check — a mask that kept almost nothing means segmentation missed.
    if (w < width * 0.2 || h < height * 0.2) return dataUrl
    const pad = Math.round(Math.max(w, h) * 0.02)
    const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad)
    const cw = Math.min(width - cx, w + pad * 2), ch = Math.min(height - cy, h + pad * 2)
    const out = document.createElement('canvas')
    out.width = cw; out.height = ch
    out.getContext('2d')!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)
    // WebP keeps the alpha channel at a fraction of PNG's size.
    const webp = out.toDataURL('image/webp', 0.85)
    onProgress?.(94, 'Uploading')
    return webp.startsWith('data:image/webp') ? webp : out.toDataURL('image/png')
  } catch {
    return dataUrl
  }
}

// Downscale a camera/library image file to a JPEG data URL ready to upload.
// 1600px covers the 940px detail modal / 360° spinner at retina density while
// cutting a 4000px phone original to a fraction of its size.
export async function fileToDataUrl(file: File, maxDim = 1600, quality = 0.8): Promise<string> {
  const blob: Blob = isHeic(file) ? await heicToJpegBlob(file) : file
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas unavailable'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}

// ── Orders ────────────────────────────────────────────────

export interface Order {
  id: string
  orderNumber: string
  containerId: string
  containerSku: string
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  deliveryAddress: string
  deliveryZip: string
  amount: number
  status: ContainerStatus
  driverId: string | null
  driverName: string | null
  scheduledDate: string | null
  completedAt: string | null
  createdAt: string
  saleType: 'buy' | 'rent'
  unitCost: number       // container acquisition cost snapshot (COGS)
  deposit: number        // refundable rental deposit
  driverHours: number    // labor hours for this job
  notifySms?: boolean     // transient: customer's SMS opt-in from checkout (drives customers.csv, not stored on order)
  // Phone-payment review pipeline timestamps (null until each step is done)
  validatedAt: string | null   // availability confirmed by staff
  calledAt: string | null      // customer reached by phone
  paidAt: string | null        // payment collected (status → confirmed)
  // Multi-tenant: the seller who owns this sale, snapshotted at order time.
  sellerId?: string
  sellerName?: string
  // Cross-territory relay: delivery lands in another reseller's territory,
  // so the container travels in two legs through a SteelBox Co. meet point.
  crossTerritory?: boolean
  sellerToId?: string        // receiving reseller (owns the delivery ZIP)
  sellerToName?: string
  meetPointId?: string
  meetPointName?: string
  relayFee?: number          // buyer-paid relay fee (on top of amount)
  relayLinehaul?: number     // fee share: selling reseller's linehaul leg
  relayLastMile?: number     // fee share: receiving reseller's last-mile leg
  relayPlatform?: number     // fee share: SteelBox Co.
  relayLinehaulMiles?: number
  relayLastMiles?: number
  rating?: number            // customer's 1–5 star delivery rating (0 = unrated)
}

export const orders = {
  list: () => request<Order[]>('/orders'),
  get: (id: string) => request<Order>(`/orders/${id}`),
  create: (data: Partial<Order>) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Order>) =>
    request<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Customer rates their delivered order's driver, 1–5 stars.
  rate: (id: string, rating: number) =>
    request<Order>(`/orders/${id}/rate`, { method: 'POST', body: JSON.stringify({ rating }) }),
  // Advance a custom build through the estimate → build pipeline (admin).
  // estimate_sent requires the settled amount; customer is notified each step.
  customStage: (id: string, stage: ContainerStatus, amount?: number) =>
    request<Order>(`/orders/${id}/custom-stage`, { method: 'POST', body: JSON.stringify({ stage, amount }) }),
  // Phone-payment review checklist: validated → called → paid (status becomes
  // 'confirmed'); 'reject' cancels and frees the container.
  reviewStep: (id: string, step: 'validated' | 'called' | 'paid' | 'reject') =>
    request<Order>(`/orders/${id}/review-step`, { method: 'POST', body: JSON.stringify({ step }) }),
  assignDriver: (id: string, driverId: string, scheduledDate: string) =>
    request<Order>(`/orders/${id}/assign-driver`, {
      method: 'POST',
      body: JSON.stringify({ driverId, scheduledDate }),
    }),
  markDelivered: (id: string) =>
    request<Order>(`/orders/${id}/delivered`, { method: 'POST' }),
}

// ── Drivers ───────────────────────────────────────────────

export interface Driver {
  id: string
  driverCode: string
  name: string
  initials: string
  cdlClass: 'A' | 'B'
  vehicle: string
  licensePlate: string
  status: 'on_duty' | 'off_duty'
  rating: number
  deliveriesMonth: number
  deliveriesTotal: number
  onTimePercent: number
  activeOrderId: string | null
  activeOrderSku: string | null
  nextShift: string | null
  colorHex: string
  active: boolean            // false = soft-deleted (archived)
  address: string
  cellPhone: string
  hourlyWage: number         // used to calculate profit labor cost
  trucks: string             // encoded: "Name~size+size;Name2~size+size"
  workHours: string          // driver availability, encoded: "d:start-end|…" (d 0=Sun..6=Sat, 24h)
  sellerId?: string          // multi-tenant: which seller's fleet this driver belongs to
  // Independent-contractor profile (Uber-style B2B onboarding)
  cdl?: boolean
  truckType?: string
  haulCaps?: string[]        // container hauling capabilities ('20ft', '40ft', 'chassis', …)
  serviceZips?: string       // 3-digit ZIP prefixes they cover, comma-separated
  availableDays?: string[]   // 'Mon'…'Sun'
  licenseDocUrl?: string     // uploaded CDL/license photo
  insuranceDocUrl?: string   // uploaded insurance card photo
  plateDocUrl?: string       // uploaded license-plate photo (OCR fills licensePlate)
  contractor?: boolean       // true = independent contractor (vs employee)
}

// Application from the public "drive for us" form; approving one mints
// the driver record + login and emails the invite.
export interface DriverApplication {
  id: string
  name: string
  email: string
  phone: string
  city: string
  state: string
  zip: string
  cdl: boolean
  cdlClass: string
  truckType: string
  haulCaps: string[]
  experienceYears: number
  notes: string
  status: 'new' | 'interviewing' | 'invited' | 'rejected'
  createdAt: string
  decidedAt: string | null
  driverId: string
}

export const driverApps = {
  // Public — the landing page form posts here with no session.
  apply: (data: Partial<DriverApplication>) =>
    request<{ received: true; id: string }>('/driver-apps', { method: 'POST', body: JSON.stringify(data) }),
  list: () => request<DriverApplication[]>('/driver-apps'),
  update: (id: string, data: Partial<DriverApplication>) =>
    request<DriverApplication>(`/driver-apps/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // One-click approve & invite: creates driver + login, emails the invite.
  approve: (id: string, sellerId?: string) =>
    request<{ application: DriverApplication; driver: Driver; tempPassword: string }>(`/driver-apps/${id}/approve`, { method: 'POST', body: JSON.stringify({ sellerId }) }),
}

export interface DayHours { start: number; end: number }  // hours 6..22, or null = off
export function parseWorkHours(s: string): Record<number, DayHours> {
  const out: Record<number, DayHours> = {}
  ;(s || '').split('|').filter(Boolean).forEach(part => {
    const [d, span] = part.split(':')
    const [a, b] = (span || '').split('-').map(Number)
    if (!Number.isNaN(a) && !Number.isNaN(b)) out[Number(d)] = { start: a, end: b }
  })
  return out
}
export function encodeWorkHours(days: Record<number, DayHours | null>): string {
  return [0, 1, 2, 3, 4, 5, 6].filter(d => days[d]).map(d => `${d}:${days[d]!.start}-${days[d]!.end}`).join('|')
}

export interface Truck { name: string; sizes: ContainerSize[] }
// Parse/encode the trucks field (avoids commas so it stays CSV-clean).
export function parseTrucks(s: string): Truck[] {
  return (s || '').split(';').filter(Boolean).map(t => {
    const [name, sizesStr] = t.split('~')
    return { name: (name || '').trim(), sizes: (sizesStr || '').split('+').filter(Boolean) as ContainerSize[] }
  })
}
export function encodeTrucks(trucks: Truck[]): string {
  // ~ + ; | are structural delimiters of this packed field — strip them from
  // user-entered truck names so one odd character can't corrupt the record.
  const clean = (s: string) => s.replace(/[~;+|]/g, ' ').replace(/\s+/g, ' ').trim()
  return trucks.filter(t => clean(t.name)).map(t => `${clean(t.name)}~${t.sizes.join('+')}`).join(';')
}

export const drivers = {
  list: () => request<Driver[]>('/drivers'),
  get: (id: string) => request<Driver>(`/drivers/${id}`),
  create: (data: Partial<Driver>) =>
    request<Driver>('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Driver>) =>
    request<Driver>(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Contractor compliance docs — license / insurance / plate photo upload.
  // A plate photo is OCR'd server-side; the read comes back as plateText.
  uploadDoc: (id: string, kind: 'license' | 'insurance' | 'plate', dataUrl: string) =>
    request<Driver & { plateText?: string; ocrSource?: string }>(`/drivers/${id}/docs`, { method: 'POST', body: JSON.stringify({ kind, dataUrl }) }),
  remove: (id: string) =>
    request<{ id: string; archived: true }>(`/drivers/${id}`, { method: 'DELETE' }),
}

// ── Quotes ────────────────────────────────────────────────

export interface QuoteRequest {
  firstName: string
  lastName: string
  phone: string
  email: string
  deliveryZip: string
  need: string
  notes?: string
  containerSku?: string
  containerId?: string
  // Lead attribution (spread in via lib/attribution.attributionFields)
  source?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  gclid?: string
  referrer?: string
  landingPath?: string
}

export const quotes = {
  submit: (data: QuoteRequest) =>
    request<{ id: string }>('/quotes', { method: 'POST', body: JSON.stringify(data) }),
}

// ── Activity log ──────────────────────────────────────────

export type ActivityType =
  | 'arrived'
  | 'photos_started'
  | 'photos_submitted'
  | 'pickup_complete'
  | 'delivery_complete'
  | 'return_complete'
  | 'sms_sent'
  | 'signature'
  | 'receipt_sent'
  | 'event'

export interface ActivityEvent {
  id: string
  timestamp: string      // ISO
  type: ActivityType
  jobType: 'pickup' | 'delivery' | 'return' | ''
  sku: string
  containerId: string
  actor: string
  location: string
  note: string
}

export const activity = {
  list: () => request<ActivityEvent[]>('/activity'),
  log: (data: Partial<ActivityEvent>) =>
    request<ActivityEvent>('/activity', { method: 'POST', body: JSON.stringify(data) }),
}

// ── Depots (pickup locations) ─────────────────────────────

export interface Depot {
  id: string
  name: string
  destination: string // delivery market the depot serves, e.g. "Atlanta, GA"
  address: string
  attendantName: string
  attendantCell: string
  code: string        // SKU prefix, e.g. NOLA, BR
  sellerId?: string   // multi-tenant: which seller owns/services this yard
  zip?: string                // yard location (drives the geo-fence)
  serviceRadiusMiles?: number // geo-fence radius, set by the global admin
}

export const depots = {
  list: () => request<Depot[]>('/depots'),
  create: (data: Partial<Depot>) =>
    request<Depot>('/depots', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Depot>) =>
    request<Depot>(`/depots/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ id: string; deleted: true }>(`/depots/${id}`, { method: 'DELETE' }),
}

// ── Customers (master list — CRUD in admin portal) ───────

export interface Customer {
  id: string
  name: string
  company: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  notes: string
  active: boolean
  createdAt: string
  notifySms: boolean    // customer opt-in for text notifications
  notifyEmail: boolean  // always true — email is mandatory
  sellerId?: string     // set when a reseller admin creates the customer; otherwise derived from orders
}

export const customers = {
  list: () => request<Customer[]>('/customers'),
  create: (data: Partial<Customer>) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ id: string; archived: true }>(`/customers/${id}`, { method: 'DELETE' }),
}

// ── Messages (driver Inbox/Trash — from admin or customers) ──

export type MsgRole = 'admin' | 'customer' | 'driver'
export interface Message {
  id: string
  fromRole: MsgRole
  fromName: string
  fromEmail: string
  toDriverId: string   // the driver party in the conversation (sender or recipient)
  toRole: MsgRole
  toName: string
  toEmail: string
  subject: string
  body: string
  createdAt: string
  read: boolean
  trashed: boolean
}

export const messages = {
  list: (driverId?: string) => request<Message[]>(`/messages${driverId ? `?driverId=${encodeURIComponent(driverId)}` : ''}`),
  create: (data: Partial<Message>) =>
    request<Message>('/messages', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Message>) =>
    request<Message>(`/messages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ id: string; deleted: true }>(`/messages/${id}`, { method: 'DELETE' }),
  emptyTrash: (driverId: string) =>
    request<{ emptied: true; removed: number }>(`/messages?driverId=${encodeURIComponent(driverId)}&trashed=true`, { method: 'DELETE' }),
}

// ── Schedule (shared by admin Schedule + field app) ───────

export type SchedType = 'pickup' | 'delivery' | 'return' | 'transfer'
export interface SchedJob {
  id: string
  dayOffset: number   // days from today (relative model; maps to a date at render)
  startMin: number    // minutes from midnight
  driverId: string
  type: SchedType
  sku: string
  customer: string
  origin: string              // display name (depot or customer)
  originAddress: string       // full street address (for Google Maps + clarity)
  destination: string         // display name (depot or customer)
  destinationAddress: string  // full street address
  miles: number
  contact: string     // customer phone for delivery/return jobs
}

export const schedule = {
  list: () => request<SchedJob[]>('/schedule'),
  create: (data: Partial<SchedJob>) =>
    request<SchedJob>('/schedule', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<SchedJob>) =>
    request<SchedJob>(`/schedule/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ id: string; deleted: true }>(`/schedule/${id}`, { method: 'DELETE' }),
}

// ── Availability (per-week driver working hours) ──────────

export interface Availability {
  id: string
  driverId: string
  weekStart: string   // Monday of the week, YYYY-MM-DD
  workHours: string   // same encoding as Driver.workHours
}

export const availability = {
  list: () => request<Availability[]>('/availability'),
  // Upsert by (driverId, weekStart).
  save: (data: { driverId: string; weekStart: string; workHours: string }) =>
    request<Availability>('/availability', { method: 'POST', body: JSON.stringify(data) }),
}

// ── Custom builds (marketplace catalog · managed in Admin → Settings) ──

export interface CustomBuild {
  id: string
  name: string
  tag: string            // short badge, e.g. POPULAR
  description: string
  features: string[]
  fromPrice: number
  photo: string          // /photos/… showcase shot; '' = show built-in clipart
  sortOrder: number
  active: boolean
}

export const customBuilds = {
  list: () => request<CustomBuild[]>('/custombuilds'),
  create: (data: Partial<CustomBuild>) =>
    request<CustomBuild>('/custombuilds', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CustomBuild>) =>
    request<CustomBuild>(`/custombuilds/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ id: string; deleted: true }>(`/custombuilds/${id}`, { method: 'DELETE' }),
  uploadPhoto: (id: string, dataUrl: string) =>
    request<CustomBuild>(`/custombuilds/${id}/photo`, { method: 'POST', body: JSON.stringify({ dataUrl }) }),
  // Request an estimate for a custom build — open to guests (no account needed).
  order: (id: string, data: { size?: ContainerSize; customerName?: string; customerEmail?: string; customerPhone?: string; company?: string; deliveryAddress?: string; deliveryZip?: string; notifySms?: boolean; amount?: number }) =>
    request<{ order: Order; container: Container }>(`/custombuilds/${id}/order`, { method: 'POST', body: JSON.stringify(data) }),
}

// ── ZIP coverage check ────────────────────────────────────

export const SERVICE_ZIP_PREFIXES = [
  '700','701','702','703','704','705','706','707','708', // Louisiana
  '390','391','392','393','394','395','396','397',       // Mississippi
  '360','361','362','363','364','365','366','367','368', // Alabama
  '750','751','752','753','754','755','756','757','758','759',
  '760','761','762','763','764','765','766','767','768','769',
  '770','771','772','773','774','775','776','777','778','779',
  '780','781','782','783','784','785','786','787','788','789',
  '790','791','792','793','794','795','796','797','798','799', // Texas
  '716','717','718','719','720','721','722','723','724','725',
  '726','727','728','729',                               // Arkansas
  '323','324','325','326','327','328','329','344','346','347','349', // FL Panhandle
]

export function isZipCovered(zip: string): boolean {
  if (!zip || zip.length < 3) return false
  return SERVICE_ZIP_PREFIXES.some((p) => zip.startsWith(p))
}

export async function estimateDelivery(zip: string): Promise<string> {
  if (!isZipCovered(zip)) return 'Outside service area'
  try {
    const result = await request<{ days: number }>(`/delivery/estimate?zip=${zip}`)
    const days = result.days
    const date = new Date()
    date.setDate(date.getDate() + days)
    return `${days} business days (est. ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
  } catch {
    return '3–5 business days'
  }
}

// ── Suppliers, shippers, repair shops & damage claims ──────
// Suppliers own containers (resellers buy from them and sell to customers).
// Sea-freight damage is claimed against the shipping line: the field app
// documents the damage, the supplier attaches a repair estimate, the shipper
// approves or rejects it (their insurance carrier reviews off-platform), and
// the supplier then routes the unit to repair (retail) or sells it as
// damaged (wholesale, grade D).

export interface Supplier {
  id: string; name: string; contactName: string; email: string; phone: string
  active: boolean; createdAt: string
}

export interface Shipper {
  id: string; name: string; line: string; email: string; phone: string
  contactName?: string   // claims contact at the line
  address?: string       // head office / claims department
  notes?: string
  active: boolean; createdAt: string
}

export interface RepairShop {
  id: string; name: string; city: string; state: string; phone: string
  specialty: string; approved: boolean
  contactName?: string
  email?: string
  // Depot / transfer-station ids this shop serves; empty = every site.
  siteIds?: string[]
}

// The supplier-facing tracker follows these stages in order; the last two
// are terminal outcomes of the supplier's retail-or-wholesale decision.
export type ClaimStatus =
  | 'awaiting_inspection'   // field inspector documents the damage
  | 'awaiting_estimate'     // supplier attaches the repair estimate
  | 'awaiting_shipper'      // shipping line reviews the estimate
  | 'awaiting_decision'     // supplier decides: repair (retail) or sell as damaged
  | 'repair_scheduled'      // booked with an approved repair shop
  | 'sell_as_damaged'       // listed on the marketplace as grade D
  | 'closed'

export const CLAIM_STAGES: { key: ClaimStatus; label: string }[] = [
  { key: 'awaiting_inspection', label: 'Awaiting inspection' },
  { key: 'awaiting_estimate', label: 'Awaiting estimate' },
  { key: 'awaiting_shipper', label: 'Awaiting shipper approval' },
  { key: 'awaiting_decision', label: 'Awaiting supplier decision — retail or wholesale' },
]

// Damage evidence gets its own photo slots — never mixed into the unit's
// retail 8-shot gallery.
// Quick reasons a field inspector taps when collecting damage evidence.
// Kept short so the whole set fits one thumb-reachable row set on a phone.
export const DAMAGE_REASONS = [
  'Bent', 'Hole', 'Rust', 'Scrape', 'Warped', 'Dent',
  'Crack', 'Water damage', 'Missing part', 'Door / seal', 'Floor', 'Other',
] as const
export type DamageReason = typeof DAMAGE_REASONS[number]

// One thing found at one station of the guided walk-around. `level` is how
// the answer scored: 'minor' is a cosmetic finding, 'major' is the capped
// answer — which cannot be recorded without a photo.
export interface DamageFinding {
  station: string
  question: string
  level: 'minor' | 'major'
  reasons: string[]
  note: string
  photo: string
  at: string
  by: string
}

export function findingsOf(c: Container | null | undefined): DamageFinding[] {
  if (!c?.inspectionFindings) return []
  try {
    const parsed = JSON.parse(c.inspectionFindings)
    return Array.isArray(parsed) ? parsed as DamageFinding[] : []
  } catch { return [] }
}

export const DAMAGE_SHOT_LABELS = [
  'Wide shot of unit', 'Damage close-up 1', 'Damage close-up 2',
  'Damage close-up 3', 'Doors & seals', 'Interior at damage',
] as const

export interface DamageClaim {
  id: string
  claimNumber: string
  containerId: string
  containerSku: string
  supplierId: string
  supplierName: string
  shipperId: string
  shipperName: string
  vesselRef: string            // voyage/BOL reference for the arbitration file
  status: ClaimStatus
  severity: number             // D·1 (minor) – D·5 (severe), set at inspection
  photos: string[]             // damage evidence — its own collection, appended
  photoReasons?: string[]      // quick reason per photo (Bent, Hole, Rust…)
  photoNotes?: string[]        // optional free note per photo
  notes: string
  estimateAmount: number       // supplier's repair estimate (USD)
  estimateNotes: string
  shipperDecision: '' | 'approved' | 'rejected'
  shipperNotes: string
  shipperDecidedAt: string | null
  repairShopId: string
  repairShopName: string
  repairDate: string
  decision: '' | 'retail' | 'wholesale'
  inspectorName: string
  inspectedAt: string | null
  createdAt: string
  events?: string              // JSON audit timeline: [{t, actor, text}]
  sharedAt?: string | null     // last time the estimate was shared with the shipper
  shipperViewedAt?: string | null // login-audit stamp: shipper opened the claim
}

export interface ClaimEvent { t: string; actor: string; text: string }
export function claimEvents(c: DamageClaim): ClaimEvent[] {
  try { return JSON.parse(c.events || '[]') } catch { return [] }
}

export const suppliersApi = {
  list: () => request<Supplier[]>('/suppliers'),
}

export const shippersApi = {
  list: () => request<Shipper[]>('/shippers'),
  create: (data: Partial<Shipper>) =>
    request<Shipper>('/shippers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Shipper>) =>
    request<Shipper>(`/shippers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Deactivates (soft delete) so existing claims keep their reference.
  remove: (id: string) =>
    request<{ id: string; archived: true }>(`/shippers/${id}`, { method: 'DELETE' }),
}

export const repairShops = {
  list: () => request<RepairShop[]>('/repairshops'),
  create: (data: Partial<RepairShop>) =>
    request<RepairShop>('/repairshops', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<RepairShop>) =>
    request<RepairShop>(`/repairshops/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Un-approves (soft delete) so claim history keeps its reference.
  remove: (id: string) =>
    request<{ id: string; archived: true }>(`/repairshops/${id}`, { method: 'DELETE' }),
}

// ── Marketing portal (reseller campaigns) ──────────────────
// Contacts uploaded by a reseller, the campaigns they run over them, and
// their connected send/ad providers. All strictly tenant-scoped server-side.

export type MarketingPlanId = 'starter' | 'growth' | 'pro'
export type CampaignType = 'email' | 'social' | 'ad'
export type CampaignStatus = 'draft' | 'sent' | 'running'

export interface MarketingContact {
  id: string
  sellerId: string
  name: string
  email: string
  phone: string
  zip: string
  city: string
  state: string
  tags: string[]
  source: string      // 'csv' | 'manual' | 'seed'
  consent: boolean    // opted in to receive marketing
  createdAt: string
}

export interface MarketingCampaign {
  id: string
  sellerId: string
  name: string
  type: CampaignType
  status: CampaignStatus
  subject: string     // email only
  content: string     // body copy; {{firstName}} / {{zip}} merge tags
  platform: string    // social/ad: 'facebook' | 'instagram' | 'google'
  cta: string
  audienceKind: 'all' | 'zip'
  zipPrefixes: string[]   // 3-digit prefixes when audienceKind === 'zip'
  audienceCount: number
  budget: number
  spend: number
  delivered: number
  opens: number       // ads: impressions viewed
  clicks: number
  conversions: number
  revenue: number
  unsubs: number
  sentAt: string | null
  createdAt: string
  // 'hq' when National SteelBox ran this campaign on the reseller's
  // behalf; '' when the reseller ran it themselves.
  managedBy?: string
}

export interface MarketingConnection {
  id: string
  sellerId: string
  provider: string
  status: string
  apiKeyMasked: string
  connectedAt: string
}

export const marketingApi = {
  contacts: () => request<MarketingContact[]>('/marketing/contacts'),
  // Bulk CSV import (rows parsed client-side). Dedupes by email per tenant.
  // sellerId lets HQ import on a reseller's behalf (ignored for tenants).
  importContacts: (rows: Array<Partial<MarketingContact>>, source = 'csv', sellerId?: string) =>
    request<{ imported: number; skipped: number; total: number }>('/marketing/contacts/import', { method: 'POST', body: JSON.stringify({ rows, source, sellerId }) }),
  addContact: (data: Partial<MarketingContact>) =>
    request<MarketingContact>('/marketing/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id: string, data: Partial<MarketingContact>) =>
    request<MarketingContact>(`/marketing/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeContact: (id: string) =>
    request<{ deleted: true }>(`/marketing/contacts/${id}`, { method: 'DELETE' }),
  campaigns: () => request<MarketingCampaign[]>('/marketing/campaigns'),
  createCampaign: (data: Partial<MarketingCampaign>) =>
    request<MarketingCampaign>('/marketing/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateCampaign: (id: string, data: Partial<MarketingCampaign>) =>
    request<MarketingCampaign>(`/marketing/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeCampaign: (id: string) =>
    request<{ deleted: true }>(`/marketing/campaigns/${id}`, { method: 'DELETE' }),
  // Freeze the audience, stamp sentAt, and fill the engagement funnel.
  launchCampaign: (id: string) =>
    request<MarketingCampaign>(`/marketing/campaigns/${id}/launch`, { method: 'POST' }),
  connections: () => request<MarketingConnection[]>('/marketing/connections'),
  connect: (provider: string, apiKey: string, sellerId?: string) =>
    request<MarketingConnection>('/marketing/connections', { method: 'POST', body: JSON.stringify({ provider, apiKey, sellerId }) }),
  disconnect: (id: string) =>
    request<{ deleted: true }>(`/marketing/connections/${id}`, { method: 'DELETE' }),
  plan: (sellerId?: string) =>
    request<{ sellerId: string; plan: MarketingPlanId }>(`/marketing/plan${sellerId ? `?sellerId=${sellerId}` : ''}`),
  setPlan: (plan: MarketingPlanId, sellerId?: string) =>
    request<{ sellerId: string; plan: MarketingPlanId }>(`/marketing/plan${sellerId ? `?sellerId=${sellerId}` : ''}`, { method: 'POST', body: JSON.stringify({ plan }) }),
  // The signed-in customer's own marketing opt-out / opt-in (profile dialog).
  consent: () => request<{ optedIn: boolean; listed: boolean }>('/marketing/consent'),
  setConsent: (optIn: boolean) =>
    request<{ optedIn: boolean; changed: number }>('/marketing/consent', { method: 'POST', body: JSON.stringify({ optIn }) }),
}

export const claims = {
  list: () => request<DamageClaim[]>('/claims'),
  create: (data: Partial<DamageClaim>) =>
    request<DamageClaim>('/claims', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<DamageClaim>) =>
    request<DamageClaim>(`/claims/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Damage evidence: omit `slot` to append the next shot. `reason` is the
  // quick tag (Bent, Hole, Rust…) that names the file inside the package.
  uploadPhoto: (id: string, data: { slot?: number; label?: string; reason?: string; note?: string; dataUrl: string }) =>
    request<DamageClaim>(`/claims/${id}/photos`, { method: 'POST', body: JSON.stringify(data) }),
  deletePhoto: (id: string, slot: number) =>
    request<DamageClaim>(`/claims/${id}/photos/${slot}`, { method: 'DELETE' }),
  // Email the shipper the claim packet, a login link, or the packaged .zip;
  // all land on the audit timeline and re-arm the shipper-viewed stamp.
  share: (id: string, mode: 'packet' | 'link' | 'package') =>
    request<DamageClaim>(`/claims/${id}/share`, { method: 'POST', body: JSON.stringify({ mode }) }),
  // Signed 30-day download link for the whole claim file (photos + summary).
  packageLink: (id: string) =>
    request<{ url: string; expiresInDays: number }>(`/claims/${id}/package-link`),
}

// Per-user notification preference for claim activity.
export const prefs = {
  update: (data: { digestFreq: 'per_container' | 'daily' | 'weekly' }) =>
    request<AuthUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
}

// ── SteelBox Co. meet points (cross-territory handoffs) ─────
// Platform-run sub-depots near territory borders where drivers swap
// containers when a sale crosses reseller territories.
export interface MeetPoint {
  id: string
  name: string
  address: string
  zip: string
  notes: string
  active: boolean
}

export const meetPoints = {
  list: () => request<MeetPoint[]>('/meetpoints'),
  create: (data: Partial<MeetPoint>) =>
    request<MeetPoint>('/meetpoints', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<MeetPoint>) =>
    request<MeetPoint>(`/meetpoints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ deleted: boolean }>(`/meetpoints/${id}`, { method: 'DELETE' }),
}
