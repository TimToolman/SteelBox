// ============================================================
// SteelBox Admin Portal — Internal ops dashboard
// Route: /admin (role: admin only)
// Design source: Admin Portal.dc.html
// ============================================================

import React, { useState, useCallback, useEffect } from 'react'
import { GradeBadge, StatusBadge, Button, Modal, Snackbar } from '../../components/ui'
import { useContainers, useOrders, useDrivers, useSnackbar } from '../../hooks'
import { orders as ordersApi, containers as containersApi, activity as activityApi, depots as depotsApi, drivers as driversApi, schedule as scheduleApi, customers as customersApi, messages as messagesApi, parseTrucks, encodeTrucks, type Container, type Order, type Driver, type ActivityEvent, type Depot, type Truck, type ContainerSize, type SchedJob, type SchedType, type Customer } from '../../lib/api'

// Container sizes a truck can be certified to pull.
const TRUCK_SIZES: { value: ContainerSize; label: string }[] = [
  { value: '10ft-std', label: '10ft Std' },
  { value: '20ft-std', label: '20ft Std' },
  { value: '20ft-hc', label: '20ft HC' },
  { value: '40ft-std', label: '40ft Std' },
  { value: '40ft-hc', label: '40ft HC' },
]

// ── Types ─────────────────────────────────────────────────

type AdminView = 'dashboard' | 'orders' | 'inventory' | 'schedule' | 'activity' | 'drivers' | 'customers' | 'notifications' | 'settings'

const VIEW_TITLES: Record<AdminView, string> = {
  dashboard:     'Dashboard',
  orders:        'Orders',
  inventory:     'Inventory',
  schedule:      'Schedule',
  activity:      'Activity Log',
  drivers:       'Drivers',
  customers:     'Customers',
  notifications: 'Alerts',
  settings:      'Settings',
}

const ACTIVITY_META: Record<string, { label: string; color: string; bg: string }> = {
  arrived:          { label: 'Arrived',          color: 'var(--cta)',     bg: 'var(--cta-cont)' },
  photos_started:   { label: 'Photos started',   color: 'var(--primary)', bg: 'var(--primary-cont)' },
  photos_submitted: { label: 'Photos submitted', color: 'var(--green)',   bg: 'var(--green-cont)' },
  pickup_complete:  { label: 'Pickup complete',  color: 'var(--green)',   bg: 'var(--green-cont)' },
  return_complete:  { label: 'Return complete',  color: 'var(--primary)', bg: 'var(--primary-cont)' },
  event:            { label: 'Event',            color: 'var(--ink2)',    bg: 'var(--surf1)' },
}

// ── Returns / pickups schedule ─────────────────────────────
// Rental units due back: 'pickup' = we retrieve from the customer site,
// 'return' = customer drops off at a depot. (Demo data pending a rentals backend.)

interface ReturnEvent {
  id: string
  date: string // YYYY-MM-DD
  type: 'pickup' | 'return'
  sku: string
  customer: string
  location: string
  driver: string
  note: string
}

const RETURN_EVENTS: ReturnEvent[] = [
  { id: 'ret_01', date: '2026-07-03', type: 'pickup', sku: 'NOLA-20-0003', customer: 'Gulf Coast Logistics', location: 'Metairie, LA 70001',     driver: 'Mike Torres', note: '6-month rental ended' },
  { id: 'ret_02', date: '2026-07-08', type: 'return', sku: 'HOU-40-0001', customer: 'Bayou Construction',   location: 'Baton Rouge, LA 70802',  driver: '—',           note: 'Customer drop-off' },
  { id: 'ret_03', date: '2026-07-12', type: 'pickup', sku: 'HOU-20-0001', customer: 'Westfield Storage Co.', location: 'Katy, TX 77493',        driver: 'Ray Donovan', note: '3-month rental ended' },
  { id: 'ret_04', date: '2026-07-15', type: 'pickup', sku: 'NOLA-20-0001', customer: 'Delta Freight',        location: 'Gulfport, MS 39501',     driver: 'Mike Torres', note: '12-month rental ended' },
  { id: 'ret_05', date: '2026-07-18', type: 'return', sku: 'NOLA-20-0002', customer: 'Acme Rentals',         location: 'Mobile, AL 36602',       driver: '—',           note: 'Customer drop-off' },
  { id: 'ret_06', date: '2026-07-22', type: 'pickup', sku: 'BR-40-0001', customer: 'Port City Movers',     location: 'New Orleans, LA 70130',  driver: 'Ray Donovan', note: '1-month rental ended' },
  { id: 'ret_07', date: '2026-07-25', type: 'pickup', sku: 'NOLA-20-0004', customer: 'Pelican Storage',      location: 'Slidell, LA 70458',      driver: 'Mike Torres', note: '6-month rental ended' },
  { id: 'ret_08', date: '2026-07-29', type: 'return', sku: 'NOLA-20-0005', customer: 'Crescent Logistics',   location: 'Houston, TX 77002',      driver: '—',           note: 'Customer drop-off' },
]

const RETURN_META = {
  pickup: { label: 'Pickup', color: 'var(--cta)',     bg: 'var(--cta-cont)' },
  return: { label: 'Return', color: 'var(--primary)', bg: 'var(--primary-cont)' },
} as const

// ── Combined delivery/return schedule (types from lib/api) ─

const SCHED_META: Record<SchedType, { label: string; color: string; bg: string }> = {
  pickup:   { label: 'Pickup',   color: 'var(--cta)',     bg: 'var(--cta-cont)' },
  delivery: { label: 'Delivery', color: 'var(--primary)', bg: 'var(--primary-cont)' },
  return:   { label: 'Return',   color: '#6D28D9',        bg: '#EDE9FE' },
  transfer: { label: 'Transfer', color: 'var(--amber)',   bg: 'var(--amb-c,#FEF3C7)' },
}

// On-site job block = 30m load + drive out + 30m unload, at 60 mph (1 mile = 1 min).
// Matches the field app's est-end (start + 60 + miles) so admin & field show identical windows.
const jobMinutes = (miles: number) => 60 + miles
const fmtMin = (m: number) => { const h = Math.floor(m / 60), mm = m % 60, ap = h < 12 ? 'AM' : 'PM', hh = ((h + 11) % 12) + 1; return `${hh}:${String(mm).padStart(2, '0')} ${ap}` }

// ── Simple line icons (shared style across admin) ──────────
const ADMIN_ICONS: Record<string, React.ReactNode> = {
  phone:  <><path d="M6.5 2h7a1 1 0 011 1v14a1 1 0 01-1 1h-7a1 1 0 01-1-1V3a1 1 0 011-1z" /><line x1="9" y1="15.5" x2="11" y2="15.5" /></>,
  truck:  <><rect x="1" y="6" width="11" height="9" rx="1.5" /><path d="M12 9h4l3 3v3h-7V9z" /><circle cx="5" cy="16.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="16.5" r="1.5" fill="currentColor" stroke="none" /></>,
  cart:   <><path d="M1 2h2.5l2 9h9l2-7H5" /><circle cx="8" cy="17.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="13" cy="17.5" r="1.5" fill="currentColor" stroke="none" /></>,
  camera: <><path d="M2 7h2.5L6 5h8l1.5 2H18a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V8a1 1 0 011-1z" /><circle cx="10" cy="11" r="3" /></>,
  check:  <><polyline points="3,10.5 8,16 17,5" /></>,
  card:   <><rect x="1.5" y="4" width="17" height="12" rx="2" /><line x1="1.5" y1="8" x2="18.5" y2="8" /></>,
  bell:   <><path d="M4 8A6 6 0 0 1 16 8L16 12L18 14L2 14L4 12Z" /><path d="M8 16a2 2 0 004 0" /></>,
}
function AIcon({ name, size = 16, color = 'currentColor', sw = 1.6 }: { name: string; size?: number; color?: string; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{ADMIN_ICONS[name]}</svg>
}

// ── KPI Card ──────────────────────────────────────────────

function KpiCard({ label, value, color, bgColor, icon, delta }: {
  label: string; value: string | number; color: string; bgColor: string; icon: React.ReactNode; delta?: string; deltaType?: 'up' | 'warn'
}) {
  return (
    <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '18px 20px' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: 'var(--r12)', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 500, letterSpacing: '0.2px', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '30px', fontWeight: 700, lineHeight: 1, marginBottom: '3px', color }}>{value}</div>
      {delta && <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{delta}</div>}
    </div>
  )
}

// ── Driver Card ───────────────────────────────────────────

function DriverCard({ driver, onAssign, onToast, onSchedule, onRemove }: { driver: Driver; onAssign: () => void; onToast: (m: string) => void; onSchedule?: () => void; onRemove?: () => void }) {
  const isOn = driver.status === 'on_duty'
  const trucks = parseTrucks(driver.trucks || '')
  return (
    <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '14px' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: driver.colorHex ?? 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{driver.initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{driver.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink3)', marginTop: '1px' }}>{driver.driverCode} · CDL {driver.cdlClass} · ${driver.hourlyWage || 0}/hr</div>
        </div>
        <StatusBadge status={isOn ? 'available' : 'sold'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginBottom: '12px' }}>
        {[
          { label: 'Month', val: driver.deliveriesMonth, color: 'var(--green)' },
          { label: 'Rating', val: `${driver.rating}★`, color: 'var(--cta)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surf1)', borderRadius: 'var(--r8)', padding: '9px 11px', border: '1px solid var(--div)' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink3)', fontWeight: 700, marginBottom: '2px' }}>{s.label}</div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--surf1)', borderRadius: 'var(--r8)', padding: '9px 11px', fontSize: '11px', color: 'var(--ink3)', marginBottom: '12px', border: '1px solid var(--div)' }}>
        {driver.cellPhone && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><AIcon name="phone" size={13} color="var(--ink3)" /> {driver.cellPhone}</div>}
        {(trucks.length ? trucks : [{ name: driver.vehicle, sizes: [] as string[] }]).map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '2px' }}><AIcon name="truck" size={13} color="var(--ink3)" /> <span><strong style={{ color: 'var(--ink)' }}>{t.name}</strong>{t.sizes.length ? ` · ${t.sizes.join(', ')}` : ''}</span></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {isOn && <button onClick={onAssign} style={{ padding: '4px 11px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Assign Job</button>}
        <button onClick={() => onSchedule ? onSchedule() : onToast('Schedule opened')} style={{ padding: '4px 11px', borderRadius: 'var(--pill)', border: '1.5px solid var(--div)', background: 'transparent', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Schedule</button>
        {onRemove && <button onClick={onRemove} style={{ padding: '4px 11px', borderRadius: 'var(--pill)', border: '1.5px solid var(--cta-cont)', color: 'var(--cta)', background: 'transparent', fontSize: '11px', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>Remove</button>}
      </div>
    </div>
  )
}

// ── Assign Driver Modal ────────────────────────────────────

function AssignDriverModal({ open, onClose, drivers, orders: orderList, onAssigned, lockedDriverId }: {
  open: boolean; onClose: () => void; drivers: Driver[]; orders: Order[]; onAssigned: (msg: string) => void; lockedDriverId?: string
}) {
  const [orderId, setOrderId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  // When launched from a driver card the driver is already known — lock it in.
  const lockedDriver = lockedDriverId ? drivers.find(d => d.id === lockedDriverId) : undefined
  React.useEffect(() => { if (open) { setDriverId(lockedDriverId || ''); setOrderId(''); setDate('') } }, [open, lockedDriverId])

  const handle = async () => {
    if (!orderId || !driverId || !date) return
    setLoading(true)
    try {
      await ordersApi.assignDriver(orderId, driverId, date)
      onAssigned('Driver assigned successfully')
      onClose()
    } catch {
      onAssigned('Failed to assign driver — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={500}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{lockedDriver ? `Assign a job to ${lockedDriver.name}` : 'Assign Driver'}</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '20px', lineHeight: 1.55 }}>{lockedDriver ? 'Select an order and scheduled delivery date.' : 'Select an order, driver, and scheduled delivery date.'}</p>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Order</label>
        <select value={orderId} onChange={e => setOrderId(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' }}>
          <option value="">— Select order —</option>
          {orderList.filter(o => !o.driverId).map(o => <option key={o.id} value={o.id}>{o.orderNumber} · {o.containerSku} · {o.customerName}</option>)}
        </select>
      </div>
      {!lockedDriver && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Driver</label>
          <select value={driverId} onChange={e => setDriverId(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' }}>
            <option value="">— Select driver —</option>
            {drivers.filter(d => d.status === 'on_duty').map(d => <option key={d.id} value={d.id}>{d.name} ({d.driverCode}) · {d.vehicle}</option>)}
          </select>
        </div>
      )}
      {lockedDriver && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Driver</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', background: 'var(--surf1)', fontSize: '13px' }}>
            <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: lockedDriver.colorHex || '#888', color: '#fff', fontSize: '9px', fontWeight: 700, display: 'grid', placeItems: 'center' }}>{lockedDriver.initials}</span>
            <span style={{ fontWeight: 600 }}>{lockedDriver.name}</span>
            <span style={{ color: 'var(--ink3)', fontFamily: 'var(--mono)', fontSize: '11px' }}>{lockedDriver.driverCode} · {lockedDriver.vehicle}</span>
          </div>
        </div>
      )}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Scheduled Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handle} disabled={loading || !orderId || !driverId || !date}>
          {loading ? 'Assigning…' : 'Assign Driver'}
        </Button>
      </div>
    </Modal>
  )
}

// ── Add Container Modal ────────────────────────────────────

// ── Listing type badge (Buy / Rent / Both) ─────────────────

function ListingBadge({ listingType }: { listingType?: Container['listingType'] }) {
  const lt = listingType ?? 'both'
  const meta: Record<string, { label: string; bg: string; color: string }> = {
    buy:  { label: 'Buy',  bg: 'var(--green-cont)', color: 'var(--green)' },
    rent: { label: 'Rent', bg: 'var(--primary-cont)', color: 'var(--primary)' },
    both: { label: 'Both', bg: '#EDE9FE', color: '#6D28D9' },
  }
  const m = meta[lt] ?? meta.both
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', background: m.bg, color: m.color }}>{m.label}</span>
  )
}

function AddContainerModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (msg: string) => void }) {
  const [form, setForm] = useState({ size: '20ft-std', grade: 'A', listingType: 'both', status: 'available', buyPrice: '', rentMonthly: '', purchaseCost: '', depot: '', bay: '' })
  const [saving, setSaving] = useState(false)
  const [depots, setDepots] = useState<Depot[]>([])

  React.useEffect(() => {
    if (!open) return
    depotsApi.list().then(ds => {
      setDepots(ds)
      setForm(p => (p.depot || !ds.length) ? p : { ...p, depot: ds[0].name })
    }).catch(() => {})
  }, [open])

  const sizeNum = form.size.startsWith('40') ? '40' : form.size.startsWith('10') ? '10' : '20'
  const skuCode = depots.find(d => d.name === form.depot)?.code || ''
  const skuPreview = skuCode ? `${skuCode.toUpperCase()}-${sizeNum}-####` : ''

  const handle = async () => {
    if (saving) return
    setSaving(true)
    try {
      const created = await containersApi.create({
        size: form.size as Container['size'],
        grade: form.grade as Container['grade'],
        listingType: form.listingType as Container['listingType'],
        status: form.status as Container['status'],
        buyPrice: form.buyPrice ? Number(form.buyPrice) : 0,
        rentMonthly: form.rentMonthly ? Number(form.rentMonthly) : null,
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : 0,
        depotLocation: form.depot,
        bayNumber: form.bay,
      })
      onAdded(`Container ${created.sku} added to inventory (${form.size} · Grade ${form.grade})`)
      setForm({ size: '20ft-std', grade: 'A', listingType: 'both', status: 'available', buyPrice: '', rentMonthly: '', purchaseCost: '', depot: '', bay: '' })
      onClose()
    } catch (e) {
      onAdded(`Failed to add container — ${e instanceof Error ? e.message : 'please try again'}`)
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' }}
      />
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} maxWidth={500}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Add Container</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '20px' }}>Create a new container record. Inspector will complete photo documentation in the field app.</p>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Size</label>
        <select value={form.size} onChange={e => setForm(p => ({ ...p, size: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px' }}>
          <option value="10ft-std">10ft Standard</option>
          <option value="20ft-std">20ft Standard</option>
          <option value="20ft-hc">20ft High Cube</option>
          <option value="40ft-std">40ft Standard</option>
          <option value="40ft-hc">40ft High Cube</option>
        </select>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Grade</label>
        <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px' }}>
          <option value="A">A — One-Trip</option>
          <option value="B">B — Cargo-Worthy</option>
          <option value="C">C — Wind & Watertight</option>
          <option value="R">R — Refurbished</option>
          <option value="X">X — Custom Build</option>
        </select>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Listing Type</label>
        <select value={form.listingType} onChange={e => setForm(p => ({ ...p, listingType: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px' }}>
          <option value="both">Buy &amp; Rent</option>
          <option value="buy">Buy only</option>
          <option value="rent">Rent only</option>
        </select>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Status</label>
        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px' }}>
          <option value="available">Available — list on marketplace now</option>
          <option value="draft">Draft — awaiting field photos</option>
        </select>
        <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '-6px' }}>Draft units stay hidden from Buy/Rent until their photo set is complete.</div>
      </div>
      {field('Buy Price ($)', 'buyPrice', 'number', '3500')}
      {field('Rental Price ($/mo)', 'rentMonthly', 'number', '150')}
      {field('Purchase Cost ($ from depot)', 'purchaseCost', 'number', '2100')}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Purchase Depot</label>
        <select value={form.depot} onChange={e => setForm(p => ({ ...p, depot: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' }}>
          {!depots.length && <option value="">— No depots configured —</option>}
          {depots.map(d => <option key={d.id} value={d.name}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}
        </select>
        <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '5px' }}>
          Containers are purchased from a depot. {skuPreview ? <>SKU will be <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink2)' }}>{skuPreview}</span>.</> : 'Add a depot with a code in Settings to enable SKUs.'}
        </div>
      </div>
      {field('Bay Number', 'bay', 'text', 'Bay 4')}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handle} disabled={saving}>{saving ? 'Adding…' : 'Add Container'}</Button>
      </div>
    </Modal>
  )
}

// ── Edit Container Modal ───────────────────────────────────

function EditContainerModal({ container, onClose, onSaved }: {
  container: Container | null; onClose: () => void; onSaved: (msg: string) => void
}) {
  const [form, setForm] = useState({ size: '20ft-std', grade: 'A', status: 'draft', listingType: 'both', buyPrice: '', rentMonthly: '', purchaseCost: '', depot: '', bay: '', inspector: '' })
  const [saving, setSaving] = useState(false)

  // Hydrate the form each time a new container is opened for editing.
  React.useEffect(() => {
    if (!container) return
    setForm({
      size: container.size,
      grade: container.grade,
      status: container.status,
      listingType: container.listingType ?? 'both',
      buyPrice: String(container.buyPrice ?? ''),
      rentMonthly: container.rentMonthly != null ? String(container.rentMonthly) : '',
      purchaseCost: String(container.purchaseCost ?? ''),
      depot: container.depotLocation ?? '',
      bay: container.bayNumber ?? '',
      inspector: container.inspectorName ?? '',
    })
  }, [container])

  const handle = async () => {
    if (!container || saving) return
    setSaving(true)
    try {
      const updated = await containersApi.update(container.id, {
        size: form.size as Container['size'],
        grade: form.grade as Container['grade'],
        status: form.status as Container['status'],
        listingType: form.listingType as Container['listingType'],
        buyPrice: form.buyPrice ? Number(form.buyPrice) : 0,
        rentMonthly: form.rentMonthly ? Number(form.rentMonthly) : null,
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : 0,
        depotLocation: form.depot,
        bayNumber: form.bay,
        inspectorName: form.inspector,
      })
      onSaved(`Container ${updated.sku} updated`)
      onClose()
    } catch (e) {
      onSaved(`Failed to update container — ${e instanceof Error ? e.message : 'please try again'}`)
    } finally {
      setSaving(false)
    }
  }

  const selStyle = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' } as const
  const lblStyle = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' } as const

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: '12px' }}>
      <label style={lblStyle}>{label}</label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        style={selStyle}
      />
    </div>
  )

  return (
    <Modal open={container !== null} onClose={onClose} maxWidth={500}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Edit Container</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '20px' }}>
        {container ? <>Editing <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{container.sku}</span></> : 'Update container details.'}
      </p>
      <div style={{ marginBottom: '12px' }}>
        <label style={lblStyle}>Size</label>
        <select value={form.size} onChange={e => setForm(p => ({ ...p, size: e.target.value }))} style={selStyle}>
          <option value="10ft-std">10ft Standard</option>
          <option value="20ft-std">20ft Standard</option>
          <option value="20ft-hc">20ft High Cube</option>
          <option value="40ft-std">40ft Standard</option>
          <option value="40ft-hc">40ft High Cube</option>
        </select>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={lblStyle}>Grade</label>
        <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} style={selStyle}>
          <option value="A">A — One-Trip</option>
          <option value="B">B — Cargo-Worthy</option>
          <option value="C">C — Wind & Watertight</option>
          <option value="R">R — Refurbished</option>
          <option value="X">X — Custom Build</option>
        </select>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={lblStyle}>Status</label>
        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={selStyle}>
          <option value="draft">Draft</option>
          <option value="available">Available</option>
          <option value="sale_in_progress">Sale in Progress</option>
          <option value="sold">Sold</option>
          <option value="assigned">Assigned</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
        </select>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={lblStyle}>Listing Type</label>
        <select value={form.listingType} onChange={e => setForm(p => ({ ...p, listingType: e.target.value }))} style={selStyle}>
          <option value="both">Buy &amp; Rent</option>
          <option value="buy">Buy only</option>
          <option value="rent">Rent only</option>
        </select>
      </div>
      {field('Buy Price ($)', 'buyPrice', 'number', '3500')}
      {field('Rent / Month ($)', 'rentMonthly', 'number', 'auto')}
      {field('Purchase Cost ($ from depot)', 'purchaseCost', 'number', '2100')}
      {field('Depot Location', 'depot', 'text', 'NOLA Depot')}
      {field('Bay Number', 'bay', 'text', 'Bay 4')}
      {field('Inspector', 'inspector', 'text', 'T. Rivera')}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handle} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
      </div>
    </Modal>
  )
}

// ── Depot Add/Edit Modal ───────────────────────────────────

function DepotModal({ target, onClose, onSaved }: { target: Depot | 'new' | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ name: '', code: '', address: '', attendantName: '', attendantCell: '' })
  const [saving, setSaving] = useState(false)
  const isNew = target === 'new'

  React.useEffect(() => {
    if (target && target !== 'new') setForm({ name: target.name, code: target.code || '', address: target.address, attendantName: target.attendantName, attendantCell: target.attendantCell })
    else if (target === 'new') setForm({ name: '', code: '', address: '', attendantName: '', attendantCell: '' })
  }, [target])

  const handle = async () => {
    if (saving || !form.name) return
    setSaving(true)
    try {
      if (isNew) { const d = await depotsApi.create(form); onSaved(`${d.name} added`) }
      else if (target) { const d = await depotsApi.update(target.id, form); onSaved(`${d.name} updated`) }
      onClose()
    } catch (e) { onSaved(`Failed to save depot — ${e instanceof Error ? e.message : 'try again'}`) }
    finally { setSaving(false) }
  }

  const lbl = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' } as const
  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' } as const
  const fld = (label: string, key: keyof typeof form, placeholder: string) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={lbl}>{label}</label>
      <input value={form[key]} placeholder={placeholder} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inp} />
    </div>
  )

  return (
    <Modal open={target !== null} onClose={onClose} maxWidth={480}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{isNew ? 'Add Pickup Depot' : 'Edit Depot'}</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '20px' }}>Depots are the pickup locations shown to field drivers.</p>
      {fld('Depot name', 'name', 'NOLA Depot')}
      <div style={{ marginBottom: '12px' }}>
        <label style={lbl}>Depot code <span style={{ textTransform: 'none', color: 'var(--ink3)', fontWeight: 400 }}>· used in SKUs, e.g. NOLA-20-0001</span></label>
        <input value={form.code} placeholder="NOLA" onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} style={{ ...inp, textTransform: 'uppercase', fontFamily: 'var(--mono)', maxWidth: '160px' }} maxLength={6} />
      </div>
      {fld('Physical address', 'address', '4200 Chef Menteur Hwy, New Orleans, LA 70126')}
      {fld('Lot attendant', 'attendantName', 'Marcus Boudreaux')}
      {fld('Attendant cell', 'attendantCell', '(504) 555-0142')}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handle} disabled={saving || !form.name}>{saving ? 'Saving…' : isNew ? 'Add Depot' : 'Save Changes'}</Button>
      </div>
    </Modal>
  )
}

// ── Schedule a job modal ───────────────────────────────────

function ScheduleJobModal({ target, drivers, events, containers, customers, depots, onCustomersChanged, onClose, onSave }: {
  target: { driverId?: string; edit?: SchedJob } | null; drivers: Driver[]; events: SchedJob[]; containers: Container[]; customers: Customer[]; depots: Depot[]; onCustomersChanged: () => void; onClose: () => void; onSave: (job: Omit<SchedJob, 'id'>, editId?: string) => void
}) {
  const isEdit = !!(target && target.edit)
  // SKUs are only ever assigned when a container is created — the schedule can only reference existing ones.
  const skuOptions = containers.filter(c => c.status !== 'draft' && c.sku)
  const activeCustomers = customers.filter(c => c.active !== false)
  // Places that can be an origin/destination — depots + customers, each with a full address for Maps.
  const custAddr = (c: Customer) => [c.address, [c.city, c.state].filter(Boolean).join(', '), c.zip].filter(Boolean).join(', ')
  const placeOptions = [
    ...depots.map(d => ({ key: `d:${d.id}`, group: 'Depots', name: d.name, address: d.address })),
    ...activeCustomers.map(c => ({ key: `c:${c.id}`, group: 'Customers', name: c.company || c.name, address: custAddr(c) })),
  ]
  // Second modal stacked on top for editing / adding a customer inline.
  const [custModal, setCustModal] = useState<Customer | 'new' | null>(null)
  const DEFAULTS = { driverId: '', dayOffset: '0', time: '09:00', type: 'delivery', sku: '', customerId: '', customer: '', contact: '', origin: '', originAddress: '', destination: '', destinationAddress: '', miles: '20' }
  const [form, setForm] = useState(DEFAULTS)
  const [timeTouched, setTimeTouched] = useState(false)
  const [error, setError] = useState('')
  const to24 = (min: number) => { const m = Math.max(0, Math.min(1439, Math.round(min))); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

  // On open: prepopulate from the job being rescheduled (edit), or reset to a clean form (new).
  React.useEffect(() => {
    if (!target) return
    setError('')
    if (target.edit) {
      const j = target.edit
      const cust = activeCustomers.find(c => c.name === j.customer || c.company === j.customer || (!!j.contact && c.phone === j.contact))
      setTimeTouched(true) // keep the job's existing start time; don't auto-suggest a new one
      setForm({
        driverId: j.driverId, dayOffset: String(j.dayOffset), time: to24(j.startMin),
        type: j.type, sku: j.sku, customerId: cust?.id || '',
        customer: j.customer === '—' ? '' : j.customer, contact: j.contact,
        origin: j.origin, originAddress: j.originAddress || '',
        destination: j.destination, destinationAddress: j.destinationAddress || '', miles: String(j.miles),
      })
    } else {
      setTimeTouched(false)
      setForm({ ...DEFAULTS, driverId: target.driverId || drivers[0]?.id || '' })
    }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  // Until the user edits it, pull in the driver's next-available start (after their last job that day).
  React.useEffect(() => {
    if (!target || timeTouched || !form.driverId) return
    const day = Number(form.dayOffset)
    const dayJobs = events.filter(e => e.driverId === form.driverId && e.dayOffset === day)
    const suggested = dayJobs.length ? to24(Math.max(...dayJobs.map(e => e.startMin + jobMinutes(e.miles)))) : '09:00'
    setForm(f => f.time === suggested ? f : { ...f, time: suggested })
  }, [target, form.driverId, form.dayOffset, events, timeTouched]) // eslint-disable-line react-hooks/exhaustive-deps

  const handle = () => {
    const missing: string[] = []
    if (!form.driverId) missing.push('driver')
    if (!form.sku.trim()) missing.push('SKU')
    if (form.miles === '') missing.push('distance')
    if (missing.length) { setError(`Please fill in: ${missing.join(', ')}`); return }
    setError('')
    const [h, m] = form.time.split(':').map(Number)
    onSave({
      dayOffset: Number(form.dayOffset), startMin: h * 60 + (m || 0), driverId: form.driverId,
      type: form.type as SchedType, sku: form.sku.trim(), customer: form.customer || '—', contact: form.contact,
      origin: form.origin, originAddress: form.originAddress,
      destination: form.destination, destinationAddress: form.destinationAddress, miles: Number(form.miles) || 0,
    }, target?.edit?.id)
    onClose()
  }

  const lbl = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' } as const
  const inp = { width: '100%', padding: '9px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)' } as const
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dayLabel = (o: number) => { const d = new Date(today); d.setDate(d.getDate() + o); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
  const dur = jobMinutes(Number(form.miles) || 0)
  const startMinNum = (() => { const [h, m] = form.time.split(':').map(Number); return (h || 0) * 60 + (m || 0) })()
  const onSiteEndMin = startMinNum + 60 + (Number(form.miles) || 0)
  const fmtClock = (min: number) => { const mm = ((Math.round(min) % 1440) + 1440) % 1440; const h = Math.floor(mm / 60); const m = mm % 60; const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m).padStart(2, '0')} ${ap}` }
  const mapPt = (name: string, addr: string) => (addr.trim() || name.trim())
  const canMap = !!mapPt(form.origin, form.originAddress) && !!mapPt(form.destination, form.destinationAddress)
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(mapPt(form.origin, form.originAddress))}&destination=${encodeURIComponent(mapPt(form.destination, form.destinationAddress))}&travelmode=driving`

  return (
    <Modal open={target !== null} onClose={onClose} maxWidth={520}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{isEdit ? 'Reschedule job' : 'Schedule a job'}</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '18px' }}>On-site window <strong style={{ color: 'var(--ink)' }}>{fmtClock(startMinNum)} – {fmtClock(onSiteEndMin)}</strong> ({Math.round(dur)} min: 30 load + {form.miles || 0} mi @ 60 mph + 30 unload)</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>Driver</label>
          <select value={form.driverId} onChange={e => setForm(p => ({ ...p, driverId: e.target.value }))} style={inp}>
            <option value="">— Select —</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.status === 'on_duty' ? '' : ' (off duty)'}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>Type</label>
          <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inp}>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
            <option value="return">Return</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>Day</label>
          <select value={form.dayOffset} onChange={e => setForm(p => ({ ...p, dayOffset: e.target.value }))} style={inp}>
            {Array.from({ length: 7 }, (_, o) => <option key={o} value={String(o)}>{dayLabel(o)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={lbl}>Start time</label>
            <input type="time" value={form.time} onChange={e => { setTimeTouched(true); setForm(p => ({ ...p, time: e.target.value })) }} style={inp} />
          </div>
          <div>
            <label style={lbl}>Est. end</label>
            <div style={{ ...inp, background: 'var(--surf1)', color: 'var(--ink2)', display: 'flex', alignItems: 'center' }}>{fmtClock(onSiteEndMin)}</div>
          </div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>SKU (container)</label>
          <select value={form.sku} onChange={e => { const c = skuOptions.find(x => x.sku === e.target.value); setForm(p => ({ ...p, sku: e.target.value, origin: c?.depotLocation || p.origin })) }} style={{ ...inp, fontFamily: 'var(--mono)' }}>
            <option value="">— Select container —</option>
            {skuOptions.map(c => <option key={c.id} value={c.sku}>{c.sku} · {c.size} · {c.depotLocation || 'no depot'}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>Distance (mi, one-way)</label>
          <input type="number" value={form.miles} onChange={e => setForm(p => ({ ...p, miles: e.target.value }))} style={inp} />
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={lbl}>Customer <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--ink3)' }}>· from customers.csv</span></label>
          <div style={{ display: 'flex', gap: '10px' }}>
            {form.customerId && <button type="button" onClick={() => { const c = activeCustomers.find(x => x.id === form.customerId); if (c) setCustModal(c) }} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Edit</button>}
            <button type="button" onClick={() => setCustModal('new')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>+ New</button>
          </div>
        </div>
        <select value={form.customerId} onChange={e => { const c = activeCustomers.find(x => x.id === e.target.value); setForm(p => ({ ...p, customerId: e.target.value, customer: c?.name || '', contact: c?.phone || '' })) }} style={inp}>
          <option value="">— Select customer —</option>
          {activeCustomers.map(c => <option key={c.id} value={c.id}>{c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ''}</option>)}
        </select>
        {form.customerId && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '5px', fontFamily: 'var(--mono)' }}>{form.contact || 'no phone on file'}</div>}
      </div>
      <CustomerModal
        target={custModal}
        zIndex={720}
        onClose={() => setCustModal(null)}
        onSaved={(c) => { onCustomersChanged(); setForm(p => ({ ...p, customerId: c.id, customer: c.name, contact: c.phone })) }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {([
          { key: 'origin', addrKey: 'originAddress', label: 'Origin (from)' },
          { key: 'destination', addrKey: 'destinationAddress', label: 'Destination (to)' },
        ] as const).map(({ key, addrKey, label }) => (
          <div key={key} style={{ marginBottom: '4px' }}>
            <label style={lbl}>{label}</label>
            <select value="" onChange={e => { const o = placeOptions.find(p => p.key === e.target.value); if (o) setForm(p => ({ ...p, [key]: o.name, [addrKey]: o.address })) }} style={{ ...inp, marginBottom: '6px' }}>
              <option value="">Quick-fill from…</option>
              <optgroup label="Depots">{placeOptions.filter(o => o.group === 'Depots').map(o => <option key={o.key} value={o.key}>{o.name}</option>)}</optgroup>
              <optgroup label="Customers">{placeOptions.filter(o => o.group === 'Customers').map(o => <option key={o.key} value={o.key}>{o.name}</option>)}</optgroup>
            </select>
            <input value={form[key]} placeholder="Name" onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={{ ...inp, marginBottom: '6px', fontWeight: 600 }} />
            <input value={form[addrKey]} placeholder="Street address, city, ST ZIP" onChange={e => setForm(p => ({ ...p, [addrKey]: e.target.value }))} style={{ ...inp, fontSize: '12px' }} />
          </div>
        ))}
      </div>
      <a
        href={canMap ? mapsUrl : undefined}
        target="_blank"
        rel="noreferrer"
        onClick={e => { if (!canMap) e.preventDefault() }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px', padding: '9px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', textDecoration: 'none', color: canMap ? 'var(--primary)' : 'var(--ink3)', fontSize: '12px', fontWeight: 700, background: 'var(--surf1)', cursor: canMap ? 'pointer' : 'not-allowed', opacity: canMap ? 1 : 0.6 }}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a5.5 5.5 0 0 0-5.5 5.5c0 4 5.5 10 5.5 10s5.5-6 5.5-10A5.5 5.5 0 0 0 10 2z" /><circle cx="10" cy="7.5" r="1.8" /></svg>
        Open route in Google Maps <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>· driving time</span>
      </a>
      {error && <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cta)', marginTop: '8px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handle}>Save</Button>
      </div>
    </Modal>
  )
}

// ── Add Driver modal ───────────────────────────────────────

function AddDriverModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ name: '', address: '', cellPhone: '', cdlClass: 'A', hourlyWage: '65' })
  const [trucks, setTrucks] = useState<Truck[]>([{ name: '', sizes: [] }])
  const [saving, setSaving] = useState(false)

  const reset = () => { setForm({ name: '', address: '', cellPhone: '', cdlClass: 'A', hourlyWage: '65' }); setTrucks([{ name: '', sizes: [] }]) }
  const toggleSize = (ti: number, size: ContainerSize) => setTrucks(prev => prev.map((t, i) => i === ti ? { ...t, sizes: t.sizes.includes(size) ? t.sizes.filter(s => s !== size) : [...t.sizes, size] } : t))
  const canSave = form.name.trim() && trucks.some(t => t.name.trim())

  const handle = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const created = await driversApi.create({
        name: form.name.trim(), address: form.address, cellPhone: form.cellPhone,
        cdlClass: form.cdlClass as Driver['cdlClass'], hourlyWage: Number(form.hourlyWage) || 0,
        vehicle: trucks[0]?.name || '', trucks: encodeTrucks(trucks),
      })
      onSaved(`Driver ${created.name} added (${created.driverCode})`)
      reset(); onClose()
    } catch (e) { onSaved(`Failed to add driver — ${e instanceof Error ? e.message : 'try again'}`) }
    finally { setSaving(false) }
  }

  const lbl = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' } as const
  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)' } as const

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '18px' }}>Add Driver</h2>
      <div style={{ marginBottom: '12px' }}><label style={lbl}>Full name</label><input value={form.name} placeholder="Jordan Blake" onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={inp} /></div>
      <div style={{ marginBottom: '12px' }}><label style={lbl}>Address</label><input value={form.address} placeholder="123 Main St, New Orleans, LA 70130" onChange={e => setForm(p => ({ ...p, address: e.target.value }))} style={inp} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div style={{ marginBottom: '12px' }}><label style={lbl}>Cell phone</label><input value={form.cellPhone} placeholder="(504) 555-0100" onChange={e => setForm(p => ({ ...p, cellPhone: e.target.value }))} style={inp} /></div>
        <div style={{ marginBottom: '12px' }}><label style={lbl}>Hourly wage ($)</label><input type="number" value={form.hourlyWage} onChange={e => setForm(p => ({ ...p, hourlyWage: e.target.value }))} style={inp} /></div>
        <div style={{ marginBottom: '12px' }}><label style={lbl}>CDL class</label><select value={form.cdlClass} onChange={e => setForm(p => ({ ...p, cdlClass: e.target.value }))} style={inp}><option value="A">Class A</option><option value="B">Class B</option></select></div>
      </div>

      <div style={{ ...lbl, marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Trucks &amp; sizes they can pull</span>
        <button onClick={() => setTrucks(p => [...p, { name: '', sizes: [] }])} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>+ Add truck</button>
      </div>
      {trucks.map((t, ti) => (
        <div key={ti} style={{ border: '1px solid var(--div)', borderRadius: 'var(--r8)', padding: '10px 12px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input value={t.name} placeholder="Peterbilt 389 + Tilt Trailer" onChange={e => setTrucks(prev => prev.map((x, i) => i === ti ? { ...x, name: e.target.value } : x))} style={{ ...inp, flex: 1 }} />
            {trucks.length > 1 && <button onClick={() => setTrucks(prev => prev.filter((_, i) => i !== ti))} style={{ border: '1.5px solid var(--div)', background: 'transparent', borderRadius: 'var(--r8)', padding: '0 12px', cursor: 'pointer', color: 'var(--cta)' }}>×</button>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {TRUCK_SIZES.map(s => {
              const on = t.sizes.includes(s.value)
              return (
                <button key={s.value} onClick={() => toggleSize(ti, s.value)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: 'var(--pill)', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--div)'}`, background: on ? 'var(--primary-cont)' : 'transparent', color: on ? 'var(--primary)' : 'var(--ink3)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  {on && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handle} disabled={!canSave || saving}>{saving ? 'Adding…' : 'Add Driver'}</Button>
      </div>
    </Modal>
  )
}

// ── Remove driver (soft-delete) + reschedule their jobs ────

function RemoveDriverModal({ driver, allJobs, drivers, onReassign, onArchive, onClose }: {
  driver: Driver | null; allJobs: SchedJob[]; drivers: Driver[]
  onReassign: (jobId: string, driverId: string) => void; onArchive: () => void; onClose: () => void
}) {
  // Capture this driver's job IDs once when the modal opens, so reassigned jobs stay listed.
  const [jobIds, setJobIds] = useState<string[]>([])
  React.useEffect(() => { if (driver) setJobIds(allJobs.filter(j => j.driverId === driver.id).map(j => j.id)) }, [driver?.id]) // eslint-disable-line
  if (!driver) return null
  const others = drivers.filter(d => d.id !== driver.id && d.active !== false)
  const jobs = allJobs.filter(j => jobIds.includes(j.id))
  const stillMine = jobs.filter(j => j.driverId === driver.id)
  return (
    <Modal open={driver !== null} onClose={onClose} maxWidth={620}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Remove {driver.name}</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '16px' }}>The driver is archived (hidden from lists &amp; scheduling) but stays in history. Reschedule their jobs to another driver first.</p>

      {jobs.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r8)', padding: '14px' }}>No scheduled jobs for this driver — safe to remove.</div>
      ) : (
        <div style={{ border: '1px solid var(--div)', borderRadius: 'var(--r12)', overflow: 'hidden' }}>
          <div style={{ background: 'var(--surf1)', padding: '9px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{jobs.length} scheduled job{jobs.length > 1 ? 's' : ''} · reassign each</div>
          {jobs.map(j => {
            const meta = SCHED_META[j.type]
            const reassigned = j.driverId !== driver.id
            return (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderTop: '1px solid var(--div)' }}>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', background: meta.bg, color: meta.color, flexShrink: 0 }}>{meta.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}><span style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{j.sku}</span> · {fmtMin(j.startMin)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{j.origin} → {j.destination}</div>
                </div>
                <select value={reassigned ? j.driverId : ''} onChange={e => e.target.value && onReassign(j.id, e.target.value)} style={{ padding: '6px 10px', border: `1.5px solid ${reassigned ? 'var(--green)' : 'var(--cta)'}`, borderRadius: 'var(--r8)', fontSize: '12px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)', cursor: 'pointer', flexShrink: 0 }}>
                  <option value="">Reassign to…</option>
                  {others.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {reassigned && <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="3,10.5 8,16 17,5" /></svg>}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onArchive}>{stillMine.length ? `Archive anyway (${stillMine.length} unreassigned)` : 'Archive Driver'}</Button>
      </div>
    </Modal>
  )
}

// ── Main Admin Page ────────────────────────────────────────

// ── Customer add/edit modal (used on the Customers page + stacked on the Schedule modal) ──
function CustomerModal({ target, onClose, onSaved, zIndex }: {
  target: Customer | 'new' | null; onClose: () => void; onSaved: (c: Customer, msg: string) => void; zIndex?: number
}) {
  const BLANK = { name: '', company: '', email: '', phone: '', address: '', city: '', state: '', zip: '', notes: '', notifySms: false }
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const isNew = target === 'new'

  React.useEffect(() => {
    if (target && target !== 'new') setForm({ name: target.name, company: target.company, email: target.email, phone: target.phone, address: target.address, city: target.city, state: target.state, zip: target.zip, notes: target.notes, notifySms: target.notifySms === true })
    else if (target === 'new') setForm(BLANK)
    setErr('')
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const handle = async () => {
    if (saving) return
    if (!form.name.trim()) { setErr('Customer name is required'); return }
    setSaving(true)
    try {
      const c = isNew ? await customersApi.create(form) : await customersApi.update((target as Customer).id, form)
      onSaved(c, `${c.name} ${isNew ? 'added' : 'updated'}`)
      onClose()
    } catch (e) { setErr(`Failed to save — ${e instanceof Error ? e.message : 'try again'}`) }
    finally { setSaving(false) }
  }

  const lbl = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' } as const
  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' } as const
  const fld = (label: string, key: Exclude<keyof typeof form, 'notifySms'>, placeholder: string) => (
    <div style={{ marginBottom: '12px', flex: 1 }}>
      <label style={lbl}>{label}</label>
      <input value={form[key]} placeholder={placeholder} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inp} />
    </div>
  )

  return (
    <Modal open={target !== null} onClose={onClose} maxWidth={540} zIndex={zIndex}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{isNew ? 'Add Customer' : 'Edit Customer'}</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '20px' }}>Saved to customers.csv — the single source of truth for customer records.</p>
      <div style={{ display: 'flex', gap: '12px' }}>{fld('Contact name', 'name', 'Jane Smith')}{fld('Company', 'company', 'Westfield Storage Co.')}</div>
      <div style={{ display: 'flex', gap: '12px' }}>{fld('Email', 'email', 'ops@company.com')}{fld('Phone', 'phone', '(504) 555-0000')}</div>
      {fld('Street address', 'address', '5500 Industrial Pkwy')}
      <div style={{ display: 'flex', gap: '12px' }}>{fld('City', 'city', 'Katy')}{fld('State', 'state', 'TX')}{fld('ZIP', 'zip', '77493')}</div>
      {fld('Notes', 'notes', 'Net-30 terms, prefers high-cube…')}
      <div style={{ marginTop: '4px', marginBottom: '4px', border: '1px solid var(--div)', borderRadius: 'var(--r12)', padding: '12px 14px', background: 'var(--surf1)' }}>
        <label style={lbl}>Notifications · new messages from dispatch &amp; driver</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '4px', marginBottom: '8px' }}>
          <input type="checkbox" checked={form.notifySms} onChange={e => setForm(p => ({ ...p, notifySms: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
          <span style={{ fontSize: '13px' }}>Text (SMS) notifications <span style={{ color: 'var(--ink3)' }}>· customer opt-in</span></span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input type="checkbox" checked disabled style={{ width: '16px', height: '16px', accentColor: 'var(--green)' }} />
          <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>Email notifications <span style={{ color: 'var(--ink3)' }}>· required, always on</span></span>
        </label>
      </div>
      {err && <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cta)', marginTop: '4px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handle} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add Customer' : 'Save Changes'}</Button>
      </div>
    </Modal>
  )
}

// ── Message a driver (admin dispatch → driver Inbox) ──
function MessageDriverModal({ open, drivers, onClose, onSent }: {
  open: boolean; drivers: Driver[]; onClose: () => void; onSent: (msg: string) => void
}) {
  const [driverId, setDriverId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  React.useEffect(() => { if (open) { setDriverId(drivers[0]?.id || ''); setSubject(''); setBody('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (sending || !driverId || !body.trim()) return
    setSending(true)
    try {
      await messagesApi.create({ toDriverId: driverId, fromRole: 'admin', fromName: 'Dispatch (James R.)', fromEmail: 'ops@steelbox.co', subject: subject.trim() || '(no subject)', body: body.trim() })
      onSent(`Message sent to ${drivers.find(d => d.id === driverId)?.name ?? 'driver'}`)
      onClose()
    } catch (e) { onSent(`Failed to send — ${e instanceof Error ? e.message : 'try again'}`) }
    finally { setSending(false) }
  }

  const lbl = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' } as const
  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' } as const
  return (
    <Modal open={open} onClose={onClose} maxWidth={500}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Message a driver</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '18px' }}>Lands in the driver's Inbox in the field app.</p>
      <div style={{ marginBottom: '12px' }}>
        <label style={lbl}>Driver</label>
        <select value={driverId} onChange={e => setDriverId(e.target.value)} style={inp}>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.driverCode})</option>)}
        </select>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={lbl}>Subject</label>
        <input value={subject} placeholder="e.g. Route change" onChange={e => setSubject(e.target.value)} style={inp} />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={lbl}>Message</label>
        <textarea value={body} placeholder="Write your message…" onChange={e => setBody(e.target.value)} rows={5} style={{ ...inp, resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={send} disabled={sending || !driverId || !body.trim()}>{sending ? 'Sending…' : 'Send'}</Button>
      </div>
    </Modal>
  )
}

// ── Nav item ── (module-level + stable identity so the sidebar never remounts on data loads;
// an inner definition would give it a new identity each render, eating the first click after load)
function NavItem({ icon, label, badge, active, onClick }: { icon: React.ReactNode; label: string; badge?: number; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 18px', margin: '1px 8px', borderRadius: 'var(--r12)', cursor: 'pointer', fontSize: '13px', fontWeight: active ? 700 : 500, color: active ? 'var(--primary)' : 'var(--ink2)', background: active ? 'var(--primary-cont)' : 'transparent' }}
    >
      <span style={{ width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{ marginLeft: 'auto', borderRadius: 'var(--pill)', padding: '1px 8px', fontSize: '10px', fontWeight: 700, background: 'var(--cta-cont)', color: 'var(--cta)' }}>{badge}</span>
      )}
    </div>
  )
}

export default function AdminPage() {
  const [view, setView] = useState<AdminView>('dashboard')
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignDriverId, setAssignDriverId] = useState<string | undefined>(undefined)
  const [composeOpen, setComposeOpen] = useState(false)
  const [addContainerOpen, setAddContainerOpen] = useState(false)
  const [editContainer, setEditContainer] = useState<Container | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()

  const { data: containerList, refetch: refetchContainers } = useContainers()
  const { data: orderList, refetch: refetchOrders } = useOrders()
  const { data: driverList, refetch: refetchDrivers } = useDrivers()

  // Only active (non-archived) drivers appear in lists and are schedulable.
  const activeDrivers = driverList.filter(d => d.active !== false)
  const wageById = (id?: string) => driverList.find(d => d.id === id)?.hourlyWage ?? 0
  const [addDriverOpen, setAddDriverOpen] = useState(false)
  const [removeDriver, setRemoveDriver] = useState<Driver | null>(null)

  const reserved = containerList.filter(c => c.status === 'sale_in_progress')
  const available = containerList.filter(c => c.status === 'available')
  // ── Combined delivery/return schedule state (shared CSV via API) ──
  const [scheduleEvents, setScheduleEvents] = useState<SchedJob[]>([])
  const refetchSchedule = useCallback(() => { scheduleApi.list().then(setScheduleEvents).catch(() => {}) }, [])
  useEffect(() => { refetchSchedule() }, [refetchSchedule])
  // Re-sync whenever the admin navigates back to the Schedule page.
  useEffect(() => { if (view === 'schedule') refetchSchedule() }, [view, refetchSchedule])
  // Re-sync with field-app reschedules on window focus (e.g. switching back from the field tab).
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') refetchSchedule() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [refetchSchedule])
  const [schedDay, setSchedDay] = useState(0)              // selected day offset for the by-driver view
  const [calView, setCalView] = useState<'week' | 'day'>('week')  // calendar Week vs Day
  const [schedModal, setSchedModal] = useState<{ driverId?: string; edit?: SchedJob } | null>(null)
  const [detailEvent, setDetailEvent] = useState<SchedJob | null>(null)
  const driverById = (id: string) => driverList.find(d => d.id === id)
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0)
  const dayDate = (offset: number) => { const d = new Date(weekStart); d.setDate(d.getDate() + offset); return d }
  // Overlap detection per driver per day, using the 60mph + 30min-each-end job block.
  const conflictIds = (() => {
    const set = new Set<string>()
    const byKey: Record<string, SchedJob[]> = {}
    scheduleEvents.forEach(e => { const k = `${e.dayOffset}|${e.driverId}`; (byKey[k] ||= []).push(e) })
    Object.values(byKey).forEach(list => {
      const sorted = [...list].sort((a, b) => a.startMin - b.startMin)
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], cur = sorted[i]
        if (cur.startMin < prev.startMin + jobMinutes(prev.miles)) { set.add(prev.id); set.add(cur.id) }
      }
    })
    return set
  })()

  // ── Financials (Inventory page) — computed from real orders ──
  // Labor cost uses each order's assigned driver's hourly wage (no global fee).
  const orderLabor = (o: Order) => (o.driverHours || 0) * wageById(o.driverId || undefined)
  const finToday = new Date(); finToday.setHours(0, 0, 0, 0)
  const orderDaysAgo = (o: Order) => { const d = new Date(o.createdAt); d.setHours(0, 0, 0, 0); return Math.round((finToday.getTime() - d.getTime()) / 86400000) }
  // Sum revenue/profit for orders whose createdAt falls in [startBack, endBack) days ago.
  const periodFin = (startBack: number, endBack: number) => {
    const os = orderList.filter(o => { const i = orderDaysAgo(o); return i >= startBack && i < endBack })
    const rev = os.reduce((s, o) => s + (o.amount || 0), 0)
    const cogs = os.reduce((s, o) => s + (o.unitCost || 0), 0)
    const labor = os.reduce((s, o) => s + orderLabor(o), 0)
    return { rev, profit: rev - cogs - labor }
  }
  const finPeriods = {
    dod: { cur: periodFin(0, 1), prev: periodFin(1, 2) },
    wow: { cur: periodFin(0, 7), prev: periodFin(7, 14) },
    mom: { cur: periodFin(0, 30), prev: periodFin(30, 60) },
  }
  // Realized driver hours + labor over the last 30 days (from orders).
  const orders30 = orderList.filter(o => { const i = orderDaysAgo(o); return i >= 0 && i < 30 })
  const driverHours30 = orders30.reduce((s, o) => s + (o.driverHours || 0), 0)
  const labor30 = orders30.reduce((s, o) => s + orderLabor(o), 0)

  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([])
  useEffect(() => { activityApi.list().then(setActivityLog).catch(() => {}) }, [])
  const [depotList, setDepotList] = useState<Depot[]>([])
  const [editDepot, setEditDepot] = useState<Depot | 'new' | null>(null)
  const refetchDepots = useCallback(() => { depotsApi.list().then(setDepotList).catch(() => {}) }, [])
  useEffect(() => { refetchDepots() }, [refetchDepots])
  // ── Customers (master list, CRUD) ──
  const [customerList, setCustomerList] = useState<Customer[]>([])
  const [editCustomer, setEditCustomer] = useState<Customer | 'new' | null>(null)
  const refetchCustomers = useCallback(() => { customersApi.list().then(setCustomerList).catch(() => {}) }, [])
  useEffect(() => { refetchCustomers() }, [refetchCustomers])
  const handleDeleteCustomer = async (c: Customer) => {
    if (!window.confirm(`Archive ${c.name}? They'll be hidden from lists but kept in order history.`)) return
    try { await customersApi.remove(c.id); toast(`${c.name} archived`); refetchCustomers() }
    catch (e) { toast(`Failed to archive — ${e instanceof Error ? e.message : 'try again'}`) }
  }
  const handleDeleteDepot = async (d: Depot) => {
    if (!window.confirm(`Delete ${d.name}? Field pickups will no longer list it.`)) return
    try { await depotsApi.remove(d.id); toast(`${d.name} removed`); refetchDepots() }
    catch (e) { toast(`Failed to delete — ${e instanceof Error ? e.message : 'try again'}`) }
  }
  const inTransit = orderList.filter(o => o.status === 'in_transit')
  const deliveredMonth = orderList.filter(o => o.status === 'delivered')

  const refreshAll = useCallback(() => {
    refetchContainers()
    refetchOrders()
    toast('Refreshed')
  }, [refetchContainers, refetchOrders, toast])

  const handleDelete = useCallback(async (c: Container) => {
    if (deletingId) return
    if (!window.confirm(`Delete container ${c.sku}? This cannot be undone.`)) return
    setDeletingId(c.id)
    try {
      await containersApi.remove(c.id)
      toast(`Container ${c.sku} deleted`)
      refetchContainers()
    } catch (e) {
      toast(`Failed to delete ${c.sku} — ${e instanceof Error ? e.message : 'please try again'}`)
    } finally {
      setDeletingId(null)
    }
  }, [deletingId, toast, refetchContainers])

  // ── Purchase-in-progress workflow (Orders page) ──
  // Which driver is assigned to each in-flight purchase (containerId → name).
  const [assignedDrivers, setAssignedDrivers] = useState<Record<string, string>>({})
  const [detailPurchase, setDetailPurchase] = useState<Container | null>(null)
  // Reserved / in-fulfilment units awaiting approval or a driver.
  const purchases = containerList.filter(c => ['sale_in_progress', 'sold', 'assigned'].includes(c.status))

  const approvePurchase = async (c: Container) => {
    try { await containersApi.update(c.id, { status: 'sold' }); toast(`${c.sku} purchase approved — ready to assign a driver`); refetchContainers() }
    catch (e) { toast(`Failed to approve — ${e instanceof Error ? e.message : 'try again'}`) }
  }
  const rejectPurchase = async (c: Container) => {
    if (!window.confirm(`Reject ${c.sku} and return it to the marketplace?`)) return
    try { await containersApi.update(c.id, { status: 'available' }); toast(`${c.sku} returned to marketplace`); refetchContainers() }
    catch (e) { toast(`Failed to reject — ${e instanceof Error ? e.message : 'try again'}`) }
  }
  // Assign (or re-assign — drivers can no-show) a driver to an approved purchase.
  const assignPurchaseDriver = async (c: Container, driverId: string) => {
    const driver = driverList.find(d => d.id === driverId)
    if (!driver) return
    try {
      await containersApi.update(c.id, { status: 'assigned' })
      setAssignedDrivers(prev => ({ ...prev, [c.id]: driver.name }))
      toast(`${c.sku} assigned to ${driver.name}`)
      refetchContainers()
    } catch (e) { toast(`Failed to assign — ${e instanceof Error ? e.message : 'try again'}`) }
  }

  // Reassign a scheduled job to another driver (persists to the shared schedule CSV).
  const reassignJob = (jobId: string, driverId: string) => {
    setScheduleEvents(prev => prev.map(j => j.id === jobId ? { ...j, driverId } : j))  // optimistic
    scheduleApi.update(jobId, { driverId }).then(refetchSchedule).catch(() => {})
  }
  const archiveDriver = async () => {
    if (!removeDriver) return
    const name = removeDriver.name
    try { await driversApi.remove(removeDriver.id); toast(`${name} archived — hidden from scheduling`); refetchDrivers() }
    catch (e) { toast(`Failed to archive — ${e instanceof Error ? e.message : 'try again'}`) }
    setRemoveDriver(null)
  }

  // ── Table helpers ──
  const Th = ({ children }: { children: React.ReactNode }) => (
    <th style={{ padding: '9px 13px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink3)', textAlign: 'left', borderBottom: '1px solid var(--div)', whiteSpace: 'nowrap', background: 'var(--surf1)' }}>{children}</th>
  )
  const Td = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
    <td style={{ padding: '11px 13px', borderBottom: '1px solid var(--div)', verticalAlign: 'middle', fontFamily: mono ? 'var(--mono)' : undefined, fontSize: mono ? '11px' : '13px' }}>{children}</td>
  )
  const TblBtn = ({ children, onClick, variant = 'default', title, iconOnly }: { children: React.ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'danger' | 'success'; title?: string; iconOnly?: boolean }) => {
    const styles: Record<string, React.CSSProperties> = {
      default:  { borderColor: 'var(--div)', color: 'var(--ink)' },
      primary:  { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
      danger:   { borderColor: 'var(--cta-cont)', color: 'var(--cta)' },
      success:  { borderColor: 'var(--green-cont)', color: 'var(--green)' },
    }
    const pad = iconOnly ? { padding: '0', width: '30px', height: '30px', borderRadius: '50%', justifyContent: 'center' } : { padding: '4px 11px', borderRadius: 'var(--pill)' }
    return (
      <button onClick={onClick} title={title} aria-label={title} style={{ ...pad, border: '1.5px solid', background: 'transparent', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px', ...styles[variant] }}>{children}</button>
    )
  }
  // Stroke icons matching the left-nav visual language (1.5px, round caps).
  const EditIcon = <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 3.5l3 3L7 16H4v-3z" /><path d="M12 5l3 3" /></svg>
  const DeleteIcon = <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5.5h13" /><path d="M8 5V3.5h4V5" /><path d="M5 5.5l.8 11a1 1 0 001 .9h6.4a1 1 0 001-.9l.8-11" /><path d="M8.5 8.5v6M11.5 8.5v6" /></svg>
  const Spinner = <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'sbxspin 0.7s linear infinite' }}><path d="M10 2a8 8 0 018 8" /></svg>

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', fontFamily: 'var(--sans)', background: 'var(--surf)' }}>

      {/* ── Left nav ── */}
      <nav style={{ width: 'var(--admin-nav-w)', flexShrink: 0, background: 'var(--surf-w)', borderRight: '1px solid var(--div)', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div style={{ padding: '0 18px', height: 'var(--admin-top-h)', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--div)', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--r8)', background: 'var(--primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="6" width="22" height="14" rx="2" /><line x1="6" y1="6" x2="6" y2="20" /><line x1="11" y1="6" x2="11" y2="20" /><line x1="16" y1="6" x2="16" y2="20" /></svg>
          </div>
          <span style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.3px', color: '#2B7FD4' }}>Steel<span style={{ color: 'var(--cta)' }}>Box</span></span>
          <span style={{ marginLeft: 'auto', background: 'var(--primary-cont)', color: 'var(--primary)', borderRadius: 'var(--r4)', padding: '2px 8px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.8px' }}>ADMIN</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink3)', padding: '8px 18px 3px' }}>Operations</div>
          <NavItem active={view === 'dashboard'} onClick={() => setView('dashboard')} label="Dashboard" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="7" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /><rect x="11" y="11" width="7" height="7" rx="1.5" /></svg>} />
          <NavItem active={view === 'orders'} onClick={() => setView('orders')} label="Orders" badge={reserved.length} icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="12" height="16" rx="1.5" /><line x1="7" y1="7" x2="13" y2="7" /><line x1="7" y1="10" x2="13" y2="10" /><line x1="7" y1="13" x2="11" y2="13" /></svg>} />
          <NavItem active={view === 'inventory'} onClick={() => setView('inventory')} label="Inventory" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="5" width="18" height="12" rx="1.5" /><line x1="5" y1="5" x2="5" y2="17" /><line x1="9" y1="5" x2="9" y2="17" /><line x1="13" y1="5" x2="13" y2="17" /></svg>} />
          <NavItem active={view === 'schedule'} onClick={() => setView('schedule')} label="Schedule" badge={scheduleEvents.length} icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="16" height="14" rx="2" /><line x1="2" y1="8.5" x2="18" y2="8.5" /><line x1="7" y1="2" x2="7" y2="6" /><line x1="13" y1="2" x2="13" y2="6" /></svg>} />
          <NavItem active={view === 'activity'} onClick={() => setView('activity')} label="Activity Log" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7.5" /><path d="M10 5.5V10l3 2" /></svg>} />
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink3)', padding: '16px 18px 3px' }}>People</div>
          <NavItem active={view === 'drivers'} onClick={() => setView('drivers')} label="Drivers" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="6.5" r="3" /><path d="M3 18A7 7 0 0 1 17 18" /></svg>} />
          <NavItem active={view === 'customers'} onClick={() => setView('customers')} label="Customers" badge={customerList.filter(c => c.active !== false).length} icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="2.6" /><path d="M2 16.5A5 5 0 0 1 12 16.5" /><path d="M13 4.6a2.6 2.6 0 0 1 0 4.8" /><path d="M14.5 16.5a5 5 0 0 0-2.2-4.1" /></svg>} />
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink3)', padding: '16px 18px 3px' }}>System</div>
          <NavItem active={view === 'notifications'} onClick={() => setView('notifications')} label="Alerts" badge={5} icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 8A6 6 0 0 1 16 8L16 12L18 14L2 14L4 12Z" /><path d="M8 16a2 2 0 004 0" /></svg>} />
          <NavItem active={view === 'settings'} onClick={() => setView('settings')} label="Settings" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="2.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2" /></svg>} />
        </div>

        <div style={{ padding: '10px', borderTop: '1px solid var(--div)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: 'var(--r12)', cursor: 'pointer' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg,#0057B8,#0048A3)', color: '#fff', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>JR</div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>James R.</div>
              <div style={{ fontSize: '10px', color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>Administrator</div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ height: 'var(--admin-top-h)', flexShrink: 0, background: 'var(--surf-w)', borderBottom: '1px solid var(--div)', display: 'flex', alignItems: 'center', padding: '0 22px', gap: '14px', boxShadow: 'var(--sh1)' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>{VIEW_TITLES[view]}</div>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
              {view === 'dashboard' ? `Overview · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : `SteelBox · Gulf Coast`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
            <Button variant="ghost" size="sm" onClick={() => setComposeOpen(true)} icon={<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></svg>}>Message a driver</Button>
            <button onClick={refreshAll} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 10A7 7 0 113 10" /><polyline points="17,6 17,10 13,10" /></svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>

          {/* ── Dashboard ── */}
          {view === 'dashboard' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '24px' }}>
                <KpiCard label="Available Units" value={available.length} color="var(--primary)" bgColor="var(--primary-cont)" delta="Active in marketplace" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="5" width="18" height="12" rx="1.5" /><line x1="5" y1="5" x2="5" y2="17" /><line x1="9" y1="5" x2="9" y2="17" /><line x1="13" y1="5" x2="13" y2="17" /></svg>} />
                <KpiCard label="Purchase in Progress" value={reserved.length} color="var(--cta)" bgColor="var(--cta-cont)" delta="Awaiting driver assignment" deltaType="warn" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--cta)" strokeWidth="1.5" strokeLinecap="round"><path d="M1 2H3.5L5.5 11H14.5L16.5 4H5" /><circle cx="8" cy="17.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="13" cy="17.5" r="1.5" fill="currentColor" stroke="none" /></svg>} />
                <KpiCard label="Deliveries Scheduled" value={inTransit.length} color="var(--green)" bgColor="var(--green-cont)" delta={`Next: ${new Date(Date.now() + 86400000 * 2).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`} icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="8" width="11" height="8" rx="1.5" /><path d="M12 10H16L19 13V16H12Z" /></svg>} />
                <KpiCard label="Revenue (MTD)" value="$87k" color="var(--purple)" bgColor="var(--purple-cont)" delta="↑ 22% vs last month" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--purple)" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="8" /><path d="M10 5v10M7 8H13M7 12H13" /></svg>} />
              </div>

              {/* Recent orders */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>Recent Orders</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>Including live Purchase in Progress reservations from marketplace</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setView('orders')}>View All →</Button>
              </div>
              <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden', marginBottom: '22px' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                    <thead><tr><Th>Order</Th><Th>SKU</Th><Th>Customer</Th><Th>Amount</Th><Th>Status</Th><Th>Driver</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {orderList.slice(0, 5).map(o => (
                        <tr key={o.id}>
                          <Td mono>{o.orderNumber}</Td>
                          <Td mono>{o.containerSku}</Td>
                          <Td>{o.customerName}</Td>
                          <Td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${o.amount.toLocaleString()}</span></Td>
                          <Td><StatusBadge status={o.status as any} /></Td>
                          <Td>{o.driverName ?? <span style={{ color: 'var(--cta)', fontWeight: 600 }}>⚠ Unassigned</span>}</Td>
                          <Td>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              {!o.driverId && <TblBtn variant="primary" onClick={() => { setAssignDriverId(undefined); setAssignOpen(true) }}>Assign</TblBtn>}
                              <TblBtn onClick={() => toast(`Order ${o.orderNumber} details`)}>Details</TblBtn>
                            </div>
                          </Td>
                        </tr>
                      ))}
                      {orderList.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--ink3)', fontSize: '13px' }}>No orders yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Drivers */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Driver Status</div>
                <Button variant="ghost" size="sm" onClick={() => setView('drivers')}>Manage →</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '14px' }}>
                {activeDrivers.map(d => <DriverCard key={d.id} driver={d} onAssign={() => { setAssignDriverId(d.id); setAssignOpen(true) }} onToast={toast} onSchedule={() => setSchedModal({ driverId: d.id })} />)}
              </div>
            </div>
          )}

          {/* ── Orders ── */}
          {view === 'orders' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '24px' }}>
                <KpiCard label="Purchase in Progress" value={reserved.length} color="var(--cta)" bgColor="var(--cta-cont)" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--cta)" strokeWidth="1.5" strokeLinecap="round"><path d="M1 2H3.5L5.5 11H14.5L16.5 4H5" /><circle cx="8" cy="17.5" r="1.5" fill="currentColor" stroke="none" /></svg>} />
                <KpiCard label="In Transit" value={inTransit.length} color="var(--primary)" bgColor="var(--primary-cont)" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="8" width="11" height="8" rx="1.5" /><path d="M12 10H16L19 13V16H12Z" /></svg>} />
                <KpiCard label="Delivered (Month)" value={deliveredMonth.length} color="var(--green)" bgColor="var(--green-cont)" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>} />
              </div>

              {/* Purchase in Progress — approve, then assign (or re-assign) a driver */}
              {purchases.length > 0 && (
                <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1.5px solid var(--cta)', boxShadow: 'var(--sh1)', overflow: 'hidden', marginBottom: '22px' }}>
                  <div style={{ background: 'var(--cta)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M1 2H3.5L5.5 11H14.5L16.5 4H5" /><circle cx="8" cy="17.5" r="1.5" fill="currentColor" stroke="none" /></svg>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', flex: 1 }}>Purchase in Progress — approve, then assign a driver</span>
                    <span style={{ background: 'rgba(255,255,255,.25)', color: '#fff', borderRadius: 'var(--pill)', padding: '2px 10px', fontSize: '11px', fontWeight: 700 }}>{purchases.length}</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                      <thead><tr><Th>SKU</Th><Th>Type</Th><Th>Price</Th><Th>Stage</Th><Th>Driver</Th><Th>Action</Th></tr></thead>
                      <tbody>
                        {purchases.map(c => {
                          const stage = c.status === 'sale_in_progress' ? { label: 'Pending approval', color: 'var(--cta)', bg: 'var(--cta-cont)' }
                            : c.status === 'sold' ? { label: 'Approved · needs driver', color: 'var(--amber)', bg: 'var(--amb-c,#FEF3C7)' }
                            : { label: 'Driver assigned', color: 'var(--green)', bg: 'var(--green-cont)' }
                          const onDuty = activeDrivers.filter(d => d.status === 'on_duty')
                          return (
                            <tr key={c.id} onClick={() => setDetailPurchase(c)} style={{ cursor: 'pointer' }}>
                              <Td mono>{c.sku}</Td>
                              <Td><ListingBadge listingType={c.listingType} /></Td>
                              <Td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${c.buyPrice.toLocaleString()}</span></Td>
                              <Td><span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: stage.bg, color: stage.color }}>{stage.label}</span></Td>
                              <Td>{(assignedDrivers[c.id] || c.status === 'assigned') ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--green)', fontWeight: 600 }}>
                                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,10.5 8,16 17,5" /></svg>
                                  {assignedDrivers[c.id] || 'Assigned'}
                                </span>
                              ) : <span style={{ color: 'var(--ink3)' }}>—</span>}</Td>
                              <Td>
                                <div onClick={e => e.stopPropagation()}>
                                {c.status === 'sale_in_progress' ? (
                                  <div style={{ display: 'flex', gap: '5px' }}>
                                    <TblBtn variant="success" onClick={() => approvePurchase(c)}>Approve</TblBtn>
                                    <TblBtn variant="danger" onClick={() => rejectPurchase(c)}>Reject</TblBtn>
                                  </div>
                                ) : (
                                  <select
                                    value=""
                                    onChange={e => { if (e.target.value) assignPurchaseDriver(c, e.target.value) }}
                                    style={{ padding: '6px 10px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '12px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)', cursor: 'pointer' }}
                                  >
                                    <option value="">{assignedDrivers[c.id] || c.status === 'assigned' ? 'Re-assign driver…' : 'Assign driver…'}</option>
                                    {onDuty.length === 0 && <option value="" disabled>No drivers on duty today</option>}
                                    {onDuty.map(d => <option key={d.id} value={d.id}>{d.name} · {d.vehicle}</option>)}
                                  </select>
                                )}
                                </div>
                              </Td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>All Orders</div>
                <Button variant="ghost" size="sm" onClick={() => toast('Exporting CSV…')}>Export CSV</Button>
              </div>
              <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead><tr><Th>Order / Date</Th><Th>SKU</Th><Th>Customer</Th><Th>Delivery To</Th><Th>Amount</Th><Th>Status</Th><Th>Driver</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {orderList.map(o => (
                        <tr key={o.id}>
                          <Td><div style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{o.orderNumber}</div><div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{new Date(o.createdAt).toLocaleDateString()}</div></Td>
                          <Td mono>{o.containerSku}</Td>
                          <Td>{o.customerName}</Td>
                          <Td><div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{o.deliveryAddress}</div></Td>
                          <Td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${o.amount.toLocaleString()}</span></Td>
                          <Td><StatusBadge status={o.status as any} /></Td>
                          <Td>{o.driverName ?? <span style={{ color: 'var(--cta)', fontWeight: 600, fontSize: '11px' }}>⚠ Unassigned</span>}</Td>
                          <Td>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              {!o.driverId && <TblBtn variant="primary" onClick={() => { setAssignDriverId(undefined); setAssignOpen(true) }}>Assign</TblBtn>}
                              <TblBtn onClick={() => toast(`SMS sent to ${o.customerName}`)}>SMS</TblBtn>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Inventory ── */}
          {view === 'inventory' && (
            <div>
              {/* Financials — Revenue & Profit trends + driver labor */}
              {(() => {
                const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`
                const delta = (cur: number, prev: number) => {
                  if (!prev) return <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)' }}>{cur ? 'new' : '—'}</span>
                  const pct = ((cur - prev) / Math.abs(prev)) * 100
                  const up = pct >= 0
                  return <span style={{ fontSize: '11px', fontWeight: 700, color: up ? 'var(--green)' : 'var(--cta)' }}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
                }
                const cell = (cur: number, prev: number) => (
                  <Td><div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px' }}>{money(cur)}</div><div>{delta(cur, prev)} <span style={{ fontSize: '10px', color: 'var(--ink3)' }}>vs {money(prev)}</span></div></Td>
                )
                return (
                  <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden', marginBottom: '22px' }}>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--div)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, flex: 1 }}>Revenue &amp; Profit</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Labor from each driver's hourly wage</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Driver hours (30d): <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{driverHours30.toFixed(1)}h</strong></div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Labor cost (30d): <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{money(labor30)}</strong></div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
                        <thead><tr><Th>Metric</Th><Th>Day over Day</Th><Th>Week over Week</Th><Th>Month over Month</Th></tr></thead>
                        <tbody>
                          <tr>
                            <Td><span style={{ fontWeight: 700 }}>Revenue</span></Td>
                            {cell(finPeriods.dod.cur.rev, finPeriods.dod.prev.rev)}
                            {cell(finPeriods.wow.cur.rev, finPeriods.wow.prev.rev)}
                            {cell(finPeriods.mom.cur.rev, finPeriods.mom.prev.rev)}
                          </tr>
                          <tr>
                            <Td><span style={{ fontWeight: 700 }}>Profit</span><div style={{ fontSize: '10px', color: 'var(--ink3)' }}>net of COGS + driver labor</div></Td>
                            {cell(finPeriods.dod.cur.profit, finPeriods.dod.prev.profit)}
                            {cell(finPeriods.wow.cur.profit, finPeriods.wow.prev.profit)}
                            {cell(finPeriods.mom.cur.profit, finPeriods.mom.prev.profit)}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>All Containers</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{containerList.length} units · SKU · Stock · Photo status</div>
                </div>
                <Button variant="primary" size="md" onClick={() => setAddContainerOpen(true)} icon={<span>+</span>}>Add Container</Button>
              </div>
              <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                    <thead><tr><Th>SKU</Th><Th>Size</Th><Th>Grade</Th><Th>Listing</Th><Th>Photos</Th><Th>Inspector</Th><Th>Depot</Th><Th>Cost</Th><Th>Price</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {containerList.map(c => (
                        <tr key={c.id}>
                          <Td mono>{c.sku}</Td>
                          <Td>{c.size}</Td>
                          <Td><GradeBadge grade={c.grade as any} showLabel /></Td>
                          <Td><ListingBadge listingType={c.listingType} /></Td>
                          <Td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ flex: 1, height: '4px', background: 'var(--div)', borderRadius: '2px', minWidth: '60px' }}>
                                <div style={{ height: '100%', borderRadius: '2px', background: c.photoCount >= 12 ? 'var(--green)' : c.photoCount > 0 ? 'var(--amber)' : 'var(--div)', width: `${Math.min(100, (c.photoCount / 12) * 100)}%` }} />
                              </div>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{c.photoCount}/12</span>
                            </div>
                          </Td>
                          <Td>{c.inspectorName || '—'}</Td>
                          <Td>{c.depotLocation || '—'}</Td>
                          <Td><span style={{ fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>${(c.purchaseCost ?? 0).toLocaleString()}</span></Td>
                          <Td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${c.buyPrice.toLocaleString()}</span></Td>
                          <Td><StatusBadge status={c.status as any} /></Td>
                          <Td>
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                              <TblBtn iconOnly title="Edit" onClick={() => setEditContainer(c)}>{EditIcon}</TblBtn>
                              {c.status !== 'sale_in_progress' && <TblBtn iconOnly variant="danger" title="Delete" onClick={() => handleDelete(c)}>{deletingId === c.id ? Spinner : DeleteIcon}</TblBtn>}
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Schedule (Deliveries + Returns) ── */}
          {view === 'schedule' && (
            <div>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '20px' }}>
                <KpiCard label="Scheduled (7 days)" value={scheduleEvents.length} color="var(--ink)" bgColor="var(--surf1)" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--ink2)" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="16" height="14" rx="2" /><line x1="2" y1="8.5" x2="18" y2="8.5" /></svg>} />
                <KpiCard label="Deliveries" value={scheduleEvents.filter(e => e.type === 'delivery').length} color="var(--primary)" bgColor="var(--primary-cont)" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="8" width="11" height="8" rx="1.5" /><path d="M12 10H16L19 13V16H12Z" /></svg>} />
                <KpiCard label="Returns" value={scheduleEvents.filter(e => e.type === 'return').length} color="#6D28D9" bgColor="#EDE9FE" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#6D28D9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4L4 8l4 4" /><path d="M4 8h9a4 4 0 0 1 4 4v2" /></svg>} />
                <KpiCard label="Conflicts" value={conflictIds.size} color={conflictIds.size ? 'var(--cta)' : 'var(--green)'} bgColor={conflictIds.size ? 'var(--cta-cont)' : 'var(--green-cont)'} delta={conflictIds.size ? 'Driver double-booked' : 'No overlaps'} deltaType="warn" icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={conflictIds.size ? 'var(--cta)' : 'var(--green)'} strokeWidth="1.5" strokeLinecap="round"><path d="M10 2L1 18h18L10 2z" /><line x1="10" y1="8" x2="10" y2="12" /><circle cx="10" cy="15" r="0.6" fill="currentColor" /></svg>} />
              </div>

              {/* Week calendar */}
              <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden', marginBottom: '22px' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--div)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>{calView === 'week' ? 'This Week' : dayDate(schedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                  <select value={calView} onChange={e => setCalView(e.target.value as 'week' | 'day')} style={{ padding: '6px 10px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', outline: 'none', fontFamily: 'var(--sans)' }}>
                    <option value="week">Week view</option>
                    <option value="day">Day view</option>
                  </select>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--ink3)', marginLeft: 'auto' }}>
                    {(['pickup', 'delivery', 'return', 'transfer'] as SchedType[]).map(t => (
                      <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '9px', height: '9px', borderRadius: '2px', background: SCHED_META[t].color }} />{SCHED_META[t].label}</span>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { refetchSchedule(); toast('Schedule refreshed') }} icon={<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 6.5A6.5 6.5 0 1 0 17 11" /><polyline points="16 2.5 16 6.5 12 6.5" /></svg>}>Refresh</Button>
                  <Button variant="primary" size="sm" onClick={() => setSchedModal({})} icon={<span>+</span>}>Schedule Job</Button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: calView === 'week' ? 'repeat(7,minmax(150px,1fr))' : '1fr', minWidth: calView === 'week' ? '900px' : 'auto' }}>
                    {(calView === 'week' ? Array.from({ length: 7 }, (_, i) => i) : [schedDay]).map((offset) => {
                      const d = dayDate(offset)
                      const jobs = scheduleEvents.filter(e => e.dayOffset === offset).sort((a, b) => a.startMin - b.startMin)
                      return (
                        <div key={offset} style={{ borderRight: offset < 6 ? '1px solid var(--div)' : 'none', minHeight: '150px' }}>
                          <div style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--div)', background: offset === 0 ? 'var(--primary-cont)' : 'var(--surf1)' }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: offset === 0 ? 'var(--primary)' : 'var(--ink3)' }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: offset === 0 ? 'var(--primary)' : 'var(--ink)' }}>{d.getDate()}</div>
                          </div>
                          <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {jobs.map(e => {
                              const drv = driverById(e.driverId)
                              const meta = SCHED_META[e.type]
                              const clash = conflictIds.has(e.id)
                              return (
                                <div key={e.id} onClick={() => setDetailEvent(e)} title={`${meta.label} · ${e.sku}`} style={{ cursor: 'pointer', background: meta.bg, borderLeft: `3px solid ${meta.color}`, border: clash ? '1.5px solid var(--cta)' : '1px solid transparent', borderRadius: 'var(--r8)', padding: '5px 7px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                                    <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: drv?.colorHex || '#888', color: '#fff', fontSize: '8px', fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{drv?.initials || '?'}</span>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: meta.color }}>{meta.label}</span>
                                    {clash && <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--cta)' }}>⚠</span>}
                                  </div>
                                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--ink2)' }}>{e.sku}</div>
                                  <div style={{ fontSize: '9px', color: 'var(--ink3)' }}>{fmtMin(e.startMin)}</div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* By-driver day view */}
              <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--div)', fontSize: '15px', fontWeight: 700 }}>By Driver — double-booking check <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--ink3)' }}>· travel @ 60 mph + 30 min load/unload each end</span></div>
                <div style={{ display: 'flex', gap: '6px', padding: '10px 14px', overflowX: 'auto', borderBottom: '1px solid var(--div)' }}>
                  {Array.from({ length: 7 }, (_, offset) => {
                    const d = dayDate(offset)
                    const active = schedDay === offset
                    return (
                      <button key={offset} onClick={() => setSchedDay(offset)} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 'var(--pill)', border: '1.5px solid', borderColor: active ? 'var(--primary)' : 'var(--div)', background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--ink2)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        {d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                      </button>
                    )
                  })}
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {activeDrivers.filter(drv => scheduleEvents.some(e => e.dayOffset === schedDay && e.driverId === drv.id)).map(drv => {
                    const jobs = scheduleEvents.filter(e => e.dayOffset === schedDay && e.driverId === drv.id).sort((a, b) => a.startMin - b.startMin)
                    const hasClash = jobs.some(e => conflictIds.has(e.id))
                    return (
                      <div key={drv.id} style={{ border: `1px solid ${hasClash ? 'var(--cta)' : 'var(--div)'}`, borderRadius: 'var(--r12)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--surf1)', borderBottom: '1px solid var(--div)' }}>
                          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: drv.colorHex, color: '#fff', fontSize: '11px', fontWeight: 700, display: 'grid', placeItems: 'center' }}>{drv.initials}</span>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>{drv.name}</div>
                          <span style={{ fontSize: '10px', color: 'var(--ink3)' }}>{drv.vehicle}</span>
                          {hasClash
                            ? <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: 'var(--cta)', background: 'var(--cta-cont)', padding: '3px 10px', borderRadius: 'var(--pill)' }}>⚠ Overlap</span>
                            : <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: 'var(--green)' }}>✓ {jobs.length} job{jobs.length > 1 ? 's' : ''}, clear</span>}
                          <button onClick={() => setSchedModal({ driverId: drv.id })} style={{ padding: '4px 11px', borderRadius: 'var(--pill)', border: '1.5px solid var(--div)', background: 'transparent', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Schedule</button>
                        </div>
                        <div>
                          {jobs.map((e, i) => {
                            const end = e.startMin + jobMinutes(e.miles)
                            const meta = SCHED_META[e.type]
                            const clash = conflictIds.has(e.id)
                            return (
                              <div key={e.id} onClick={() => setDetailEvent(e)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', borderBottom: i < jobs.length - 1 ? '1px solid var(--div)' : 'none', cursor: 'pointer', background: clash ? 'rgba(230,81,0,.05)' : 'transparent' }}>
                                <div style={{ minWidth: '128px', flexShrink: 0 }}>
                                  <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700 }}>{fmtMin(e.startMin)} – {fmtMin(end)}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--ink3)' }}>{Math.round(jobMinutes(e.miles))} min · {e.miles} mi</div>
                                </div>
                                <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: meta.bg, color: meta.color, flexShrink: 0 }}>{meta.label}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: 600 }}><span style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{e.sku}</span> · {e.customer}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{e.origin} → {e.destination}</div>
                                </div>
                                {clash && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--cta)', flexShrink: 0 }}>⚠ Overlap</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {activeDrivers.filter(drv => scheduleEvents.some(e => e.dayOffset === schedDay && e.driverId === drv.id)).length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--ink3)', fontSize: '13px' }}>No jobs scheduled for this day.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Activity Log ── */}
          {view === 'activity' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>Field Activity Log</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{activityLog.length} events · timestamped pickups, arrivals & photo sessions · newest first</div>
                </div>
                <Button variant="ghost" size="md" onClick={() => activityApi.list().then(setActivityLog).catch(() => {})} icon={<span>⟳</span>}>Refresh</Button>
              </div>
              <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                    <thead><tr><Th>Timestamp</Th><Th>Activity</Th><Th>Job</Th><Th>SKU</Th><Th>Field Rep</Th><Th>Location</Th><Th>Note</Th></tr></thead>
                    <tbody>
                      {activityLog.length === 0 ? (
                        <tr><Td>—</Td><Td>No activity recorded yet</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td></tr>
                      ) : activityLog.map(e => {
                        const m = ACTIVITY_META[e.type] || ACTIVITY_META.event
                        return (
                          <tr key={e.id}>
                            <Td mono>{new Date(e.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Td>
                            <Td><span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: m.bg, color: m.color }}>{m.label}</span></Td>
                            <Td><span style={{ textTransform: 'capitalize' }}>{e.jobType || '—'}</span></Td>
                            <Td mono>{e.sku || '—'}</Td>
                            <Td>{e.actor || '—'}</Td>
                            <Td>{e.location || '—'}</Td>
                            <Td>{e.note || '—'}</Td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Drivers ── */}
          {view === 'drivers' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Driver Management <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--ink3)' }}>· {activeDrivers.length} active</span></div>
                <Button variant="primary" size="md" onClick={() => setAddDriverOpen(true)} icon={<span>+</span>}>Add Driver</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '14px' }}>
                {activeDrivers.map(d => <DriverCard key={d.id} driver={d} onAssign={() => { setAssignDriverId(d.id); setAssignOpen(true) }} onToast={toast} onSchedule={() => setSchedModal({ driverId: d.id })} onRemove={() => setRemoveDriver(d)} />)}
              </div>
            </div>
          )}

          {/* ── Customers ── */}
          {view === 'customers' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Customers <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--ink3)' }}>· {customerList.filter(c => c.active !== false).length} active · from customers.csv</span></div>
                <Button variant="primary" size="md" onClick={() => setEditCustomer('new')} icon={<span>+</span>}>Add Customer</Button>
              </div>
              <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                    <thead><tr><Th>Customer</Th><Th>Contact</Th><Th>Location</Th><Th>Notes</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {customerList.filter(c => c.active !== false).length === 0 && (
                        <tr><Td>—</Td><Td>No customers yet.</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td></tr>
                      )}
                      {customerList.filter(c => c.active !== false).map(c => (
                        <tr key={c.id}>
                          <Td>
                            <div style={{ fontWeight: 700 }}>{c.name}</div>
                            {c.company && c.company !== c.name && <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{c.company}</div>}
                          </Td>
                          <Td>
                            <div>{c.email || '—'}</div>
                            <div style={{ fontSize: '11px', color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{c.phone || ''}</div>
                          </Td>
                          <Td>{[c.city, c.state].filter(Boolean).join(', ') || '—'}{c.zip ? ` ${c.zip}` : ''}</Td>
                          <Td>{c.notes || '—'}</Td>
                          <Td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <TblBtn onClick={() => setEditCustomer(c)}>Edit</TblBtn>
                              <TblBtn variant="danger" onClick={() => handleDeleteCustomer(c)}>Archive</TblBtn>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {view === 'notifications' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Alert Log</div>
                <Button variant="ghost" size="sm" onClick={() => toast('All marked read')}>Mark All Read</Button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {[
                  { icon: 'cart',   color: 'var(--cta)',     bg: 'var(--cta-cont)', title: 'NEW RESERVATION', body: 'A customer reserved NOLA-20-0002 for $4,850 via marketplace. Container locked as Purchase in Progress. Driver assignment required.', time: `${new Date().toLocaleDateString()} · 10:14 AM`, unread: true },
                  { icon: 'camera', color: '#B45309',        bg: '#FFF3E0', title: 'PHOTO UPLOAD COMPLETE', body: 'T. Rivera uploaded 12 photos for NOLA-20-0003. Container ready for listing review.', time: `${new Date().toLocaleDateString()} · 8:42 AM`, unread: true },
                  { icon: 'truck',  color: 'var(--primary)', bg: '#E3F2FD', title: 'DELIVERY STARTED', body: 'Mike Torres picked up HOU-40-0001 en route to Westfield Storage, Katy TX. ETA 2 hours.', time: `${new Date().toLocaleDateString()} · 7:05 AM`, unread: true },
                  { icon: 'check',  color: 'var(--green)',   bg: 'var(--green-cont)', title: 'DELIVERED', body: 'Dan Park completed delivery of HOU-20-0001 to B&R Construction, Conroe TX. Customer signature captured.', time: 'Jun 28 · 3:22 PM', unread: false },
                  { icon: 'card',   color: '#6D28D9',        bg: 'var(--purple-cont)', title: 'PAYMENT CONFIRMED', body: '$4,850 received for #ORD-0089 · NOLA-20-0001. Container locked as Purchase in Progress.', time: 'Jun 28 · 11:58 AM', unread: false },
                ].map((n, i) => (
                  <div key={i} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r12)', border: '1px solid var(--div)', padding: '13px 15px', display: 'flex', gap: '11px', boxShadow: 'var(--sh1)', opacity: n.unread ? 1 : 0.55 }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: 'var(--r8)', background: n.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AIcon name={n.icon} size={18} color={n.color} sw={1.7} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', lineHeight: 1.55 }}><strong style={{ color: 'var(--primary)' }}>{n.title}</strong> — {n.body}</div>
                      <div style={{ fontSize: '10px', color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: '3px' }}>{n.time}</div>
                    </div>
                    {n.unread && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: '5px' }} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Settings ── */}
          {view === 'settings' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>Pickup Depots</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{depotList.length} location{depotList.length === 1 ? '' : 's'} · shown to field drivers when starting a pickup</div>
                </div>
                <Button variant="primary" size="md" onClick={() => setEditDepot('new')} icon={<span>+</span>}>Add Depot</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: '14px' }}>
                {depotList.map(d => (
                  <div key={d.id} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>{d.name}{d.code && <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r4)', padding: '1px 6px', color: 'var(--ink2)' }}>{d.code}</span>}</div>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <TblBtn iconOnly title="Edit" onClick={() => setEditDepot(d)}>{EditIcon}</TblBtn>
                        <TblBtn iconOnly variant="danger" title="Delete" onClick={() => handleDeleteDepot(d)}>{DeleteIcon}</TblBtn>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12px', color: 'var(--ink2)' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--ink3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}><path d="M10 2a5.5 5.5 0 0 0-5.5 5.5c0 4 5.5 10 5.5 10s5.5-6 5.5-10A5.5 5.5 0 0 0 10 2z" /><circle cx="10" cy="7.5" r="1.8" /></svg>
                        {d.address || '—'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--ink3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
                        {d.attendantName || '—'} {d.attendantCell && <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>· {d.attendantCell}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {depotList.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '20px' }}>No depots yet. Add your first pickup location.</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      <AssignDriverModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        drivers={activeDrivers}
        orders={orderList}
        lockedDriverId={assignDriverId}
        onAssigned={(msg) => { toast(msg); refetchOrders() }}
      />
      <AddContainerModal
        open={addContainerOpen}
        onClose={() => setAddContainerOpen(false)}
        onAdded={(msg) => { toast(msg); refetchContainers() }}
      />
      <EditContainerModal
        container={editContainer}
        onClose={() => setEditContainer(null)}
        onSaved={(msg) => { toast(msg); refetchContainers() }}
      />
      <DepotModal
        target={editDepot}
        onClose={() => setEditDepot(null)}
        onSaved={(msg) => { toast(msg); refetchDepots() }}
      />
      <CustomerModal
        target={editCustomer}
        onClose={() => setEditCustomer(null)}
        onSaved={(_c, msg) => { toast(msg); refetchCustomers() }}
      />
      <MessageDriverModal
        open={composeOpen}
        drivers={activeDrivers}
        onClose={() => setComposeOpen(false)}
        onSent={(msg) => toast(msg)}
      />
      <ScheduleJobModal
        target={schedModal}
        drivers={activeDrivers}
        events={scheduleEvents}
        containers={containerList}
        customers={customerList}
        depots={depotList}
        onCustomersChanged={refetchCustomers}
        onClose={() => setSchedModal(null)}
        onSave={(job, editId) => {
          if (editId) { scheduleApi.update(editId, job).then(refetchSchedule).catch(() => {}); toast(`${SCHED_META[job.type].label} rescheduled`) }
          else { scheduleApi.create(job).then(refetchSchedule).catch(() => {}); toast(`${SCHED_META[job.type].label} scheduled for ${driverById(job.driverId)?.name ?? 'driver'}`) }
          setSchedDay(job.dayOffset)
        }}
      />
      <AddDriverModal
        open={addDriverOpen}
        onClose={() => setAddDriverOpen(false)}
        onSaved={(msg) => { toast(msg); refetchDrivers() }}
      />
      <RemoveDriverModal
        driver={removeDriver}
        allJobs={scheduleEvents}
        drivers={driverList}
        onReassign={reassignJob}
        onArchive={archiveDriver}
        onClose={() => setRemoveDriver(null)}
      />

      {/* Schedule event detail (like the order modal) */}
      {detailEvent && (() => {
        const e = detailEvent
        const drv = driverById(e.driverId)
        const meta = SCHED_META[e.type]
        const end = e.startMin + jobMinutes(e.miles)
        const clash = conflictIds.has(e.id)
        const order = orderList.find(o => o.containerSku === e.sku)
        const row = (label: string, val: React.ReactNode) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--div)', fontSize: '13px' }}>
            <span style={{ color: 'var(--ink3)' }}>{label}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{val}</span>
          </div>
        )
        return (
          <Modal open onClose={() => setDetailEvent(null)} maxWidth={520}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: meta.bg, color: meta.color }}>{meta.label}</span>
              <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--mono)' }}>{e.sku}</h2>
              {clash && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: 'var(--cta)', background: 'var(--cta-cont)', padding: '3px 10px', borderRadius: 'var(--pill)' }}>⚠ Overlaps another job</span>}
            </div>
            <div style={{ marginTop: '14px' }}>
              {row('Driver', <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '18px', height: '18px', borderRadius: '50%', background: drv?.colorHex || '#888', color: '#fff', fontSize: '8px', fontWeight: 700, display: 'grid', placeItems: 'center' }}>{drv?.initials}</span>{drv?.name ?? '—'}</span>)}
              {row('When', `${dayDate(e.dayOffset).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · ${fmtMin(e.startMin)}–${fmtMin(end)}`)}
              {row('Duration', `${Math.round(jobMinutes(e.miles))} min · ${e.miles} mi one-way`)}
              {row('From', <span style={{ textAlign: 'right' }}>{e.origin}{e.originAddress && <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--ink3)' }}>{e.originAddress}</div>}</span>)}
              {row('To', <span style={{ textAlign: 'right' }}>{e.destination}{e.destinationAddress && <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--ink3)' }}>{e.destinationAddress}</div>}</span>)}
              {row('Customer', e.customer)}
              {order && row('Order #', <span style={{ fontFamily: 'var(--mono)' }}>{order.orderNumber}</span>)}
              {order && row('Amount', <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${order.amount.toLocaleString()}</span>)}
            </div>
            {(() => {
              const o = (e.originAddress || e.origin || '').trim(), d = (e.destinationAddress || e.destination || '').trim()
              if (!o || !d) return null
              const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=driving`
              return (
                <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '14px', padding: '10px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', background: 'var(--surf1)', textDecoration: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 700 }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a5.5 5.5 0 0 0-5.5 5.5c0 4 5.5 10 5.5 10s5.5-6 5.5-10A5.5 5.5 0 0 0 10 2z" /><circle cx="10" cy="7.5" r="1.8" /></svg>
                  Open route in Google Maps <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>· driving time</span>
                </a>
              )
            })()}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button variant="ghost" onClick={() => { setSchedModal({ edit: e }); setDetailEvent(null) }}>Reschedule</Button>
              <Button variant="primary" onClick={() => setDetailEvent(null)}>Close</Button>
            </div>
          </Modal>
        )
      })()}

      {/* Purchase detail + driver assignment */}
      {detailPurchase && (() => {
        const c = detailPurchase
        const order = orderList.find(o => o.containerId === c.id || o.containerSku === c.sku)
        const deposit = c.rentMonthly ?? 0
        const onDuty = activeDrivers.filter(d => d.status === 'on_duty')
        const stage = c.status === 'sale_in_progress' ? { label: 'Pending approval', color: 'var(--cta)', bg: 'var(--cta-cont)' }
          : c.status === 'sold' ? { label: 'Approved · needs driver', color: 'var(--amber)', bg: 'var(--amb-c,#FEF3C7)' }
          : { label: 'Driver assigned', color: 'var(--green)', bg: 'var(--green-cont)' }
        const lblRow = (label: string, val: React.ReactNode, opts: { mono?: boolean; strong?: boolean } = {}) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--div)', fontSize: '13px' }}>
            <span style={{ color: 'var(--ink3)' }}>{label}</span>
            <span style={{ fontFamily: opts.mono ? 'var(--mono)' : undefined, fontWeight: opts.strong ? 700 : 600, textAlign: 'right' }}>{val}</span>
          </div>
        )
        const sectionHd: React.CSSProperties = { fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ink3)', margin: '16px 0 4px' }
        return (
          <Modal open onClose={() => setDetailPurchase(null)} maxWidth={560}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--mono)' }}>{c.sku}</h2>
              <ListingBadge listingType={c.listingType} />
              <span style={{ marginLeft: 'auto', display: 'inline-block', padding: '3px 10px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: stage.bg, color: stage.color }}>{stage.label}</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '4px' }}>{c.size} · Grade {c.grade} · {c.depotLocation || 'depot TBD'}</p>

            {/* Customer */}
            <div style={sectionHd}>Customer</div>
            {order ? (
              <>
                {lblRow('Name', order.customerName)}
                {lblRow('Email', order.customerEmail || '—')}
                {lblRow('Phone', order.customerPhone || '—', { mono: true })}
                {lblRow('Delivery address', `${order.deliveryAddress}${order.deliveryZip ? `, ${order.deliveryZip}` : ''}`)}
                {order.orderNumber && lblRow('Order #', order.orderNumber, { mono: true })}
              </>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--ink3)', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r8)', padding: '10px 12px' }}>
                Reserved via the marketplace — customer contact & delivery details are collected at checkout and will appear here once the order syncs.
              </div>
            )}

            {/* Costs */}
            <div style={sectionHd}>Costs</div>
            {lblRow('Purchase price', `$${c.buyPrice.toLocaleString()}`, { mono: true })}
            {c.rentMonthly != null && lblRow('Monthly rent', `$${c.rentMonthly.toLocaleString()}/mo`, { mono: true })}
            {c.rentMonthly != null && lblRow('Refundable deposit', `$${deposit.toLocaleString()}`, { mono: true })}
            {lblRow('Delivery', <span style={{ color: 'var(--green)' }}>Included</span>)}
            {order && lblRow('Order total', `$${order.amount.toLocaleString()}`, { mono: true, strong: true })}

            {/* Driver assignment */}
            <div style={sectionHd}>Driver Assignment</div>
            {(() => {
              const driverName = assignedDrivers[c.id] || (c.status === 'assigned' ? 'Assigned' : '')
              return driverName ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', marginBottom: '10px', background: 'var(--green-cont)', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 'var(--pill)', padding: '5px 12px', fontWeight: 600 }}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,10.5 8,16 17,5" /></svg>
                  Assigned to {driverName}
                </div>
              ) : (
                <div style={{ fontSize: '13px', marginBottom: '10px', color: 'var(--ink3)' }}>Current: <strong>— not assigned</strong></div>
              )
            })()}
            {c.status === 'sale_in_progress' ? (
              <div style={{ fontSize: '12px', color: 'var(--ink3)', background: 'var(--amb-c,#FEF3C7)', borderRadius: 'var(--r8)', padding: '10px 12px', marginBottom: '14px' }}>
                Approve this {c.listingType === 'rent' ? 'rental' : 'purchase'} before assigning a driver.
              </div>
            ) : (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>{assignedDrivers[c.id] || c.status === 'assigned' ? 'Re-assign driver' : 'Assign driver'}</label>
                <select
                  value=""
                  onChange={e => { if (e.target.value) { assignPurchaseDriver(c, e.target.value); setDetailPurchase(prev => prev ? { ...prev, status: 'assigned' } : prev) } }}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)', cursor: 'pointer' }}
                >
                  <option value="">Select a driver…</option>
                  {onDuty.length === 0 && <option value="" disabled>No drivers on duty today</option>}
                  {onDuty.map(d => <option key={d.id} value={d.id}>{d.name} · {d.vehicle} · {d.status === 'on_duty' ? 'on duty' : 'off'}</option>)}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '6px' }}>Drivers can no-show — you can re-assign at any time.</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              {c.status === 'sale_in_progress' ? (
                <>
                  <Button variant="ghost" onClick={() => { rejectPurchase(c); setDetailPurchase(null) }}>Reject</Button>
                  <Button variant="primary" onClick={() => { approvePurchase(c); setDetailPurchase(prev => prev ? { ...prev, status: 'sold' } : prev) }}>Approve Purchase</Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setDetailPurchase(null)}>Close</Button>
              )}
            </div>
          </Modal>
        )
      })()}

      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
