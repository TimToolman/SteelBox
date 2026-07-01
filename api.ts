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

export type ContainerSize = '20ft-std' | '20ft-hc' | '40ft-std' | '40ft-hc'
export type ContainerStatus =
  | 'draft'
  | 'available'
  | 'sale_in_progress'
  | 'sold'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
export type ContainerGrade = 'A' | 'B' | 'C' | 'R' | 'X'

export interface Container {
  id: string
  sku: string
  guid: string
  stockNumber: string
  size: ContainerSize
  grade: ContainerGrade
  status: ContainerStatus
  buyPrice: number
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
}

export const orders = {
  list: () => request<Order[]>('/orders'),
  get: (id: string) => request<Order>(`/orders/${id}`),
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
}

export const drivers = {
  list: () => request<Driver[]>('/drivers'),
  get: (id: string) => request<Driver>(`/drivers/${id}`),
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
