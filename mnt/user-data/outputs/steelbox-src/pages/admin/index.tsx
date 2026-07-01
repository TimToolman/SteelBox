// ============================================================
// SteelBox Admin Portal — Internal ops dashboard
// Route: /admin (role: admin only)
// Design source: Admin Portal.dc.html
// ============================================================

import React, { useState, useCallback } from 'react'
import { GradeBadge, StatusBadge, Button, Modal, Snackbar } from '../../components/ui'
import { useContainers, useOrders, useDrivers, useSnackbar } from '../../hooks'
import { orders as ordersApi, type Container, type Order, type Driver } from '../../lib/api'

// ── Types ─────────────────────────────────────────────────

type AdminView = 'dashboard' | 'orders' | 'inventory' | 'delivery' | 'drivers' | 'notifications'

const VIEW_TITLES: Record<AdminView, string> = {
  dashboard:     'Dashboard',
  orders:        'Orders',
  inventory:     'Inventory',
  delivery:      'Deliveries',
  drivers:       'Drivers',
  notifications: 'Alerts',
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

function DriverCard({ driver, onAssign, onToast }: { driver: Driver; onAssign: () => void; onToast: (m: string) => void }) {
  const isOn = driver.status === 'on_duty'
  return (
    <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '14px' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: driver.colorHex ?? 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{driver.initials}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{driver.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink3)', marginTop: '1px' }}>{driver.driverCode} · CDL {driver.cdlClass}</div>
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
        {driver.vehicle} · <strong style={{ color: 'var(--ink)' }}>{driver.activeOrderSku ? `Active: ${driver.activeOrderSku}` : 'Available — no active job'}</strong>
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        {isOn && <button onClick={onAssign} style={{ padding: '4px 11px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Assign Job</button>}
        <button onClick={() => onToast('Schedule opened')} style={{ padding: '4px 11px', borderRadius: 'var(--pill)', border: '1.5px solid var(--div)', background: 'transparent', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Schedule</button>
        {!isOn && <button onClick={onAssign} style={{ padding: '4px 11px', borderRadius: 'var(--pill)', border: '1.5px solid var(--div)', background: 'transparent', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Pre-Assign</button>}
      </div>
    </div>
  )
}

// ── Assign Driver Modal ────────────────────────────────────

function AssignDriverModal({ open, onClose, drivers, orders: orderList, onAssigned }: {
  open: boolean; onClose: () => void; drivers: Driver[]; orders: Order[]; onAssigned: (msg: string) => void
}) {
  const [orderId, setOrderId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)

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
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Assign Driver</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '20px', lineHeight: 1.55 }}>Select an order, driver, and scheduled delivery date.</p>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Order</label>
        <select value={orderId} onChange={e => setOrderId(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' }}>
          <option value="">— Select order —</option>
          {orderList.filter(o => !o.driverId).map(o => <option key={o.id} value={o.id}>{o.orderNumber} · {o.containerSku} · {o.customerName}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Driver</label>
        <select value={driverId} onChange={e => setDriverId(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)' }}>
          <option value="">— Select driver —</option>
          {drivers.filter(d => d.status === 'on_duty').map(d => <option key={d.id} value={d.id}>{d.name} ({d.driverCode}) · {d.vehicle}</option>)}
        </select>
      </div>
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

function AddContainerModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (msg: string) => void }) {
  const [form, setForm] = useState({ size: '20ft-std', grade: 'A', buyPrice: '', depot: '', bay: '' })

  const handle = () => {
    // In production: POST /containers with form data
    onAdded(`Container added to inventory (${form.size} · Grade ${form.grade})`)
    onClose()
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
      {field('Buy Price ($)', 'buyPrice', 'number', '3500')}
      {field('Depot Location', 'depot', 'text', 'NOLA Depot')}
      {field('Bay Number', 'bay', 'text', 'Bay 4')}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handle}>Add Container</Button>
      </div>
    </Modal>
  )
}

// ── Main Admin Page ────────────────────────────────────────

export default function AdminPage() {
  const [view, setView] = useState<AdminView>('dashboard')
  const [assignOpen, setAssignOpen] = useState(false)
  const [addContainerOpen, setAddContainerOpen] = useState(false)
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()

  const { data: containerList, refetch: refetchContainers } = useContainers()
  const { data: orderList, refetch: refetchOrders } = useOrders()
  const { data: driverList } = useDrivers()

  const reserved = containerList.filter(c => c.status === 'sale_in_progress')
  const available = containerList.filter(c => c.status === 'available')
  const inTransit = orderList.filter(o => o.status === 'in_transit')
  const deliveredMonth = orderList.filter(o => o.status === 'delivered')

  const refreshAll = useCallback(() => {
    refetchContainers()
    refetchOrders()
    toast('Refreshed')
  }, [refetchContainers, refetchOrders, toast])

  // ── Nav item ──
  const NavItem = ({ id, icon, label, badge }: { id: AdminView; icon: React.ReactNode; label: string; badge?: number }) => (
    <div
      onClick={() => setView(id)}
      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 18px', margin: '1px 8px', borderRadius: 'var(--r12)', cursor: 'pointer', fontSize: '13px', fontWeight: view === id ? 700 : 500, color: view === id ? 'var(--primary)' : 'var(--ink2)', background: view === id ? 'var(--primary-cont)' : 'transparent' }}
    >
      <span style={{ width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{ marginLeft: 'auto', borderRadius: 'var(--pill)', padding: '1px 8px', fontSize: '10px', fontWeight: 700, background: 'var(--cta-cont)', color: 'var(--cta)' }}>{badge}</span>
      )}
    </div>
  )

  // ── Table helpers ──
  const Th = ({ children }: { children: React.ReactNode }) => (
    <th style={{ padding: '9px 13px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink3)', textAlign: 'left', borderBottom: '1px solid var(--div)', whiteSpace: 'nowrap', background: 'var(--surf1)' }}>{children}</th>
  )
  const Td = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
    <td style={{ padding: '11px 13px', borderBottom: '1px solid var(--div)', fontSize: '13px', verticalAlign: 'middle', fontFamily: mono ? 'var(--mono)' : undefined, fontSize: mono ? '11px' : '13px' }}>{children}</td>
  )
  const TblBtn = ({ children, onClick, variant = 'default' }: { children: React.ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'danger' | 'success' }) => {
    const styles: Record<string, React.CSSProperties> = {
      default:  { borderColor: 'var(--div)', color: 'var(--ink)' },
      primary:  { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
      danger:   { borderColor: 'var(--cta-cont)', color: 'var(--cta)' },
      success:  { borderColor: 'var(--green-cont)', color: 'var(--green)' },
    }
    return (
      <button onClick={onClick} style={{ padding: '4px 11px', borderRadius: 'var(--pill)', border: '1.5px solid', background: 'transparent', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px', ...styles[variant] }}>{children}</button>
    )
  }

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
          <NavItem id="dashboard" label="Dashboard" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="7" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /><rect x="11" y="11" width="7" height="7" rx="1.5" /></svg>} />
          <NavItem id="orders" label="Orders" badge={reserved.length} icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="12" height="16" rx="1.5" /><line x1="7" y1="7" x2="13" y2="7" /><line x1="7" y1="10" x2="13" y2="10" /><line x1="7" y1="13" x2="11" y2="13" /></svg>} />
          <NavItem id="inventory" label="Inventory" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="5" width="18" height="12" rx="1.5" /><line x1="5" y1="5" x2="5" y2="17" /><line x1="9" y1="5" x2="9" y2="17" /><line x1="13" y1="5" x2="13" y2="17" /></svg>} />
          <NavItem id="delivery" label="Deliveries" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="8" width="11" height="8" rx="1.5" /><path d="M12 10H16L19 13V16H12Z" /><circle cx="5" cy="17.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="17.5" r="1.5" fill="currentColor" stroke="none" /></svg>} />
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink3)', padding: '16px 18px 3px' }}>People</div>
          <NavItem id="drivers" label="Drivers" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="6.5" r="3" /><path d="M3 18A7 7 0 0 1 17 18" /></svg>} />
          <NavItem id="notifications" label="Alerts" badge={5} icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 8A6 6 0 0 1 16 8L16 12L18 14L2 14L4 12Z" /><path d="M8 16a2 2 0 004 0" /></svg>} />
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink3)', padding: '16px 18px 3px' }}>System</div>
          <NavItem id={'settings' as AdminView} label="Settings" icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="2.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2" /></svg>} />
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
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button onClick={refreshAll} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 10A7 7 0 113 10" /><polyline points="17,6 17,10 13,10" /></svg>
            </button>
            <Button variant="ghost" size="md" onClick={() => setAddContainerOpen(true)} icon={<span>+</span>}>Add Container</Button>
            <Button variant="primary" size="md" onClick={() => setAssignOpen(true)} icon={<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="8" width="11" height="8" rx="1.5" /><path d="M12 10H16L19 13V16H12Z" /></svg>}>Assign Driver</Button>
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
                              {!o.driverId && <TblBtn variant="primary" onClick={() => setAssignOpen(true)}>Assign</TblBtn>}
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
                {driverList.map(d => <DriverCard key={d.id} driver={d} onAssign={() => setAssignOpen(true)} onToast={toast} />)}
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
                              {!o.driverId && <TblBtn variant="primary" onClick={() => setAssignOpen(true)}>Assign</TblBtn>}
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
              {/* Reserved banner */}
              {reserved.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#FFF3E0,#FFF8F5)', border: '1.5px solid var(--cta)', borderRadius: 'var(--r16)', overflow: 'hidden', marginBottom: '22px' }}>
                  <div style={{ background: 'var(--cta)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M1 2H3.5L5.5 11H14.5L16.5 4H5" /><circle cx="8" cy="17.5" r="1.5" fill="currentColor" stroke="none" /></svg>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', flex: 1 }}>Purchase in Progress — Reserved in Marketplace</span>
                    <span style={{ background: 'rgba(255,255,255,.25)', color: '#fff', borderRadius: 'var(--pill)', padding: '2px 10px', fontSize: '11px', fontWeight: 700 }}>{reserved.length}</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                      <thead><tr><Th>SKU</Th><Th>Size</Th><Th>Grade</Th><Th>Price</Th><Th>Inspector</Th><Th>Actions</Th></tr></thead>
                      <tbody>
                        {reserved.map(c => (
                          <tr key={c.id}>
                            <Td mono>{c.sku}</Td>
                            <Td>{c.size}</Td>
                            <Td><GradeBadge grade={c.grade as any} showLabel /></Td>
                            <Td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${c.buyPrice.toLocaleString()}</span></Td>
                            <Td>{c.inspectorName}</Td>
                            <Td><div style={{ display: 'flex', gap: '5px' }}><TblBtn variant="primary" onClick={() => setAssignOpen(true)}>Assign Driver</TblBtn></div></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>All Containers</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{containerList.length} units · SKU · GUID · Stock · Photo status</div>
                </div>
                <Button variant="primary" size="md" onClick={() => setAddContainerOpen(true)} icon={<span>+</span>}>Add Container</Button>
              </div>
              <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                    <thead><tr><Th>SKU / GUID</Th><Th>Size</Th><Th>Grade</Th><Th>Photos</Th><Th>Inspector</Th><Th>Depot</Th><Th>Price</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {containerList.map(c => (
                        <tr key={c.id}>
                          <Td><div style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{c.sku}</div><div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--ink3)' }}>{c.guid?.slice(0, 12)}…</div></Td>
                          <Td>{c.size}</Td>
                          <Td><GradeBadge grade={c.grade as any} showLabel /></Td>
                          <Td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ flex: 1, height: '4px', background: 'var(--div)', borderRadius: '2px', minWidth: '60px' }}>
                                <div style={{ height: '100%', borderRadius: '2px', background: c.photoCount >= 16 ? 'var(--green)' : c.photoCount > 0 ? 'var(--amber)' : 'var(--div)', width: `${Math.min(100, (c.photoCount / 16) * 100)}%` }} />
                              </div>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{c.photoCount}/16</span>
                            </div>
                          </Td>
                          <Td>{c.inspectorName || '—'}</Td>
                          <Td>{c.depotLocation || '—'}</Td>
                          <Td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${c.buyPrice.toLocaleString()}</span></Td>
                          <Td><StatusBadge status={c.status as any} /></Td>
                          <Td>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <TblBtn onClick={() => toast(`Editing ${c.sku}`)}>Edit</TblBtn>
                              {c.status === 'sale_in_progress' && <TblBtn variant="primary" onClick={() => setAssignOpen(true)}>Assign Driver</TblBtn>}
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

          {/* ── Deliveries ── */}
          {view === 'delivery' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Delivery Schedule</div>
                <Button variant="primary" size="md" onClick={() => setAssignOpen(true)} icon={<span>+</span>}>Schedule Delivery</Button>
              </div>
              {orderList.filter(o => ['assigned','in_transit','delivered'].includes(o.status)).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink3)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🚚</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>No deliveries scheduled yet</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {orderList.filter(o => ['assigned','in_transit','delivered'].includes(o.status)).map(o => (
                    <div key={o.id} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: `1px solid ${!o.driverId ? 'var(--cta)' : 'var(--div)'}`, borderLeft: !o.driverId ? '3px solid var(--cta)' : undefined, boxShadow: 'var(--sh1)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'center', minWidth: '48px', flexShrink: 0 }}>
                        <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>{o.scheduledDate ? new Date(o.scheduledDate).getDate() : '—'}</div>
                        <div style={{ fontSize: '10px', color: 'var(--ink3)', fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString('en-US', { month: 'short' }) : ''}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{o.orderNumber} · {o.containerSku} · {o.customerName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{o.deliveryAddress}</div>
                      </div>
                      <div style={{ minWidth: '130px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: o.driverName ? 'var(--ink)' : 'var(--cta)' }}>{o.driverName ?? '⚠ Unassigned'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
                        <StatusBadge status={o.status as any} />
                        {!o.driverId && <TblBtn variant="primary" onClick={() => setAssignOpen(true)}>Assign Now</TblBtn>}
                        <TblBtn onClick={() => toast(`SMS sent to ${o.customerName}`)}>SMS</TblBtn>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Drivers ── */}
          {view === 'drivers' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Driver Management</div>
                <Button variant="primary" size="md" onClick={() => toast('Add driver form — coming soon')} icon={<span>+</span>}>Add Driver</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '14px' }}>
                {driverList.map(d => <DriverCard key={d.id} driver={d} onAssign={() => setAssignOpen(true)} onToast={toast} />)}
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
                  { icon: '🛒', bg: 'var(--cta-cont)', title: 'NEW RESERVATION', body: 'A customer reserved SBX-20-0052 for $4,850 via marketplace. Container locked as Purchase in Progress. Driver assignment required.', time: `${new Date().toLocaleDateString()} · 10:14 AM`, unread: true },
                  { icon: '📷', bg: '#FFF3E0', title: 'PHOTO UPLOAD COMPLETE', body: 'T. Rivera uploaded 16 photos for SBX-20-0061. Container ready for listing review.', time: `${new Date().toLocaleDateString()} · 8:42 AM`, unread: true },
                  { icon: '🚚', bg: '#E3F2FD', title: 'DELIVERY STARTED', body: 'Mike Torres picked up SBX-20-0038 en route to Westfield Storage, Katy TX. ETA 2 hours.', time: `${new Date().toLocaleDateString()} · 7:05 AM`, unread: true },
                  { icon: '✓', bg: 'var(--green-cont)', title: 'DELIVERED', body: 'Dan Park completed delivery of SBX-20-0029 to B&R Construction, Conroe TX. Customer signature captured.', time: 'Jun 28 · 3:22 PM', unread: false },
                  { icon: '💳', bg: 'var(--purple-cont)', title: 'PAYMENT CONFIRMED', body: '$4,850 received for #ORD-0089 · SBX-20-0041. Container locked as Purchase in Progress.', time: 'Jun 28 · 11:58 AM', unread: false },
                ].map((n, i) => (
                  <div key={i} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r12)', border: '1px solid var(--div)', padding: '13px 15px', display: 'flex', gap: '11px', boxShadow: 'var(--sh1)', opacity: n.unread ? 1 : 0.55 }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: 'var(--r8)', background: n.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0 }}>{n.icon}</div>
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
        </div>
      </div>

      {/* ── Modals ── */}
      <AssignDriverModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        drivers={driverList}
        orders={orderList}
        onAssigned={(msg) => { toast(msg); refetchOrders() }}
      />
      <AddContainerModal
        open={addContainerOpen}
        onClose={() => setAddContainerOpen(false)}
        onAdded={(msg) => { toast(msg); refetchContainers() }}
      />

      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
