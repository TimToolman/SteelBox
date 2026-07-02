// ============================================================
// SteelBox API Client
// Wraps all fetch calls to the Railway-hosted Express API
// ============================================================

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

function getToken(): string | null {
  return localStorage.getItem('sbx_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────

export interface AuthPayload {
  token: string
  user: {
    id: string
    email: string
    role: 'customer' | 'employee' | 'driver' | 'admin'
    name: string
  }
}

export const auth = {
  login: (email: string, password: string) =>
    request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthPayload['user']>('/auth/me'),
}

// ── Containers ────────────────────────────────────────────

export type ContainerSize = '10ft-std' | '20ft-std' | '20ft-hc' | '40ft-std' | '40ft-hc'
export type ContainerStatus =
  | 'draft'
  | 'available'
  | 'sale_in_progress'
  | 'sold'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
export type ContainerGrade = 'A' | 'B' | 'C' | 'R' | 'X'
// How a container may be transacted on the marketplace.
export type ListingType = 'buy' | 'rent' | 'both'

export interface Container {
  id: string
  sku: string
  guid: string
  stockNumber: string
  size: ContainerSize
  grade: ContainerGrade
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
}

export interface ContainerFilters {
  size?: ContainerSize
  grade?: ContainerGrade[]
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
}

export const orders = {
  list: () => request<Order[]>('/orders'),
  get: (id: string) => request<Order>(`/orders/${id}`),
  create: (data: Partial<Order>) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }),
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
  return trucks.filter(t => t.name.trim()).map(t => `${t.name.trim()}~${t.sizes.join('+')}`).join(';')
}

export const drivers = {
  list: () => request<Driver[]>('/drivers'),
  get: (id: string) => request<Driver>(`/drivers/${id}`),
  create: (data: Partial<Driver>) =>
    request<Driver>('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Driver>) =>
    request<Driver>(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
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
  address: string
  attendantName: string
  attendantCell: string
  code: string        // SKU prefix, e.g. NOLA, BR
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
