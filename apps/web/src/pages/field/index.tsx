// ============================================================
// SteelBox Field App — Mobile web app for drivers + inspectors
// Route: /field (role: driver | employee)
// Design source: Field App.dc.html
// Responsive web route — no Expo required
// ============================================================

import React, { useState, useRef, useEffect } from 'react'
import { useSnackbar } from '../../hooks'
import { Snackbar } from '../../components/ui'

// ── Types ─────────────────────────────────────────────────

type Screen = 'dashboard' | 'delivery' | 'camera' | 'review' | 'success' | 'schedule'

interface PhotoShot {
  id: number
  group: 'exterior' | 'interior' | 'optional'
  label: string
  required: boolean
  done: boolean
  tip: string
}

// ── Photo checklist — mirrors the 16-shot standard ────────

const SHOT_LIST: PhotoShot[] = [
  // Exterior (required)
  { id: 1,  group: 'exterior', label: 'Front face full',       required: true,  done: false, tip: 'Stand 15–20 ft back. Frame the entire front panel.' },
  { id: 2,  group: 'exterior', label: 'Rear doors closed',     required: true,  done: false, tip: 'Center the doors. Capture full door height.' },
  { id: 3,  group: 'exterior', label: 'Driver side full',      required: true,  done: false, tip: 'Step back to frame the complete side panel.' },
  { id: 4,  group: 'exterior', label: 'Passenger side full',   required: true,  done: false, tip: 'Mirror the driver side shot.' },
  { id: 5,  group: 'exterior', label: 'Roof top',              required: true,  done: false, tip: 'Use a ladder or elevated position if available.' },
  { id: 6,  group: 'exterior', label: 'Undercarriage / floor', required: true,  done: false, tip: 'Capture forklift pockets and base rails.' },
  { id: 7,  group: 'exterior', label: 'Corner castings ×4',    required: true,  done: false, tip: 'Frame all four ISO corner castings.' },
  { id: 8,  group: 'exterior', label: 'CSC / ID plate',        required: true,  done: false, tip: 'Plate must be fully legible. Use flash if needed.' },
  { id: 9,  group: 'exterior', label: 'Rear doors open',       required: true,  done: false, tip: 'Open both doors fully. Capture inside threshold.' },
  // Interior (required)
  { id: 10, group: 'interior', label: 'Interior front wall',   required: true,  done: false, tip: 'Stand at rear opening. Capture full front wall.' },
  { id: 11, group: 'interior', label: 'Interior rear wall',    required: true,  done: false, tip: 'Stand at front. Capture rear wall and door seams.' },
  { id: 12, group: 'interior', label: 'Interior floor',        required: true,  done: false, tip: 'Show full floor surface including corners.' },
  { id: 13, group: 'interior', label: 'Interior ceiling',      required: true,  done: false, tip: 'Point up. Capture full ceiling and roof panel.' },
  { id: 14, group: 'interior', label: 'Door seals close-up',   required: true,  done: false, tip: 'Close-up of rubber gasket condition.' },
  // Optional
  { id: 15, group: 'optional', label: 'Damage notation',       required: false, done: false, tip: 'Any dents, rust, or damage not shown above.' },
  { id: 16, group: 'optional', label: 'Extra angle',           required: false, done: false, tip: 'Any additional angle useful for listing.' },
]

const CHIP_COLORS = {
  blue:   { bg: '#D6E4FF', color: '#0057B8' },
  orange: { bg: '#FFE0CC', color: '#E65100' },
  green:  { bg: '#B7F0DA', color: '#1B7A5A' },
  warn:   { bg: '#FFF8E1', color: '#7B4F00' },
  grey:   { bg: '#EEF2FF', color: '#44475A' },
}

function Chip({ label, color = 'grey' }: { label: string; color?: keyof typeof CHIP_COLORS }) {
  const s = CHIP_COLORS[color]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

// ── Bottom nav ─────────────────────────────────────────────

function BottomNav({ active, onNav }: { active: Screen; onNav: (s: Screen) => void }) {
  const items: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Home', icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="7" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /><rect x="11" y="11" width="7" height="7" rx="1.5" /></svg> },
    { id: 'delivery',  label: 'Delivery', icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="8" width="11" height="8" rx="1.5" /><path d="M12 10h4l3 3v3h-7V10z" strokeLinejoin="round" /><circle cx="5" cy="17.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="17.5" r="1.5" fill="currentColor" stroke="none" /></svg> },
    { id: 'camera',    label: 'Camera', icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 7h2.5L6 5h8l1.5 2H18a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V8a1 1 0 011-1z" /><circle cx="10" cy="11" r="3" /></svg> },
    { id: 'schedule',  label: 'Schedule', icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="16" height="14" rx="2" /><line x1="2" y1="8.5" x2="18" y2="8.5" strokeWidth="1.2" /><line x1="7" y1="2" x2="7" y2="6" /><line x1="13" y1="2" x2="13" y2="6" /></svg> },
  ]
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '72px', background: '#fff', borderTop: '1px solid #E1E2EC', display: 'flex', alignItems: 'center', padding: '0 4px 8px', boxShadow: '0 -3px 16px rgba(26,28,46,.07)', zIndex: 20 }}>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => onNav(item.id)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '6px 0', borderRadius: '999px', cursor: 'pointer', flex: 1, border: 'none', background: active === item.id ? '#D6E4FF' : 'transparent', transition: 'all 0.15s', color: active === item.id ? '#0057B8' : '#44475A' }}
        >
          <div style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</div>
          <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.3px' }}>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Stepper ────────────────────────────────────────────────

interface StepItem { label: string; detail?: string; time?: string; status: 'done' | 'active' | 'pending' }

function Stepper({ steps }: { steps: StepItem[] }) {
  return (
    <div style={{ margin: '0 12px 10px', background: '#fff', borderRadius: '16px', border: '1px solid #E1E2EC', padding: '16px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#44475A', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px' }}>Delivery Progress</div>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: i < steps.length - 1 ? '12px' : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid',
              background: step.status === 'done' ? '#1B7A5A' : step.status === 'active' ? '#0057B8' : '#fff',
              borderColor: step.status === 'done' ? '#1B7A5A' : step.status === 'active' ? '#0057B8' : '#E1E2EC',
            }}>
              {step.status === 'done' && <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>}
              {step.status === 'active' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fff' }} />}
              {step.status === 'pending' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E1E2EC' }} />}
            </div>
            {i < steps.length - 1 && <div style={{ width: '2px', height: '20px', margin: '3px 0', background: step.status === 'done' ? '#1B7A5A' : '#E1E2EC', borderRadius: '1px' }} />}
          </div>
          <div style={{ flex: 1, paddingTop: '5px' }}>
            <div style={{ fontSize: '13px', fontWeight: step.status === 'pending' ? 400 : 700, color: step.status === 'pending' ? '#44475A' : '#1A1C2E', marginBottom: '2px' }}>{step.label}</div>
            {step.detail && <div style={{ fontSize: '11px', color: '#44475A' }}>{step.detail}</div>}
            {step.time && <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#1B7A5A', marginTop: '2px' }}>{step.time}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Field App ─────────────────────────────────────────

export default function FieldAppPage() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [shots, setShots] = useState<PhotoShot[]>(SHOT_LIST.map(s => ({ ...s })))
  const [onDuty, setOnDuty] = useState(true)
  const [signedDelivery, setSignedDelivery] = useState(false)
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()

  const doneCount = shots.filter(s => s.done).length
  const progress = Math.round((doneCount / 16) * 100)

  const toggleShot = (id: number) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, done: !s.done } : s))
  }

  const scrollTop = () => window.scrollTo({ top: 0 })
  const goTo = (s: Screen) => { setScreen(s); scrollTop() }

  // Fonts for field app
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500&family=Roboto+Mono:wght@400;500&display=swap'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  const base: React.CSSProperties = {
    fontFamily: "'Roboto', system-ui, sans-serif",
    background: '#F8F9FF',
    minHeight: '100vh',
    color: '#1A1C2E',
    paddingBottom: '88px',
    maxWidth: '430px',
    margin: '0 auto',
  }

  const secLabel = (text: string) => (
    <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#44475A', padding: '14px 16px 6px' }}>{text}</div>
  )

  const card = (children: React.ReactNode, style: React.CSSProperties = {}) => (
    <div style={{ background: '#fff', border: '1px solid #E1E2EC', borderRadius: '16px', boxShadow: '0 1px 4px rgba(26,28,46,.08)', margin: '0 12px 10px', overflow: 'hidden', ...style }}>{children}</div>
  )

  // ── Dashboard ──────────────────────────────────────────

  const renderDashboard = () => (
    <div>
      {/* Hero */}
      <div style={{ background: onDuty ? 'linear-gradient(135deg,#0057B8,#003882)' : 'linear-gradient(135deg,#374151,#1F2937)', padding: '44px 20px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(255,255,255,.15)', display: 'grid', placeItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="5" width="18" height="12" rx="1.5" /><line x1="5" y1="5" x2="5" y2="17" strokeWidth="1" /><line x1="9" y1="5" x2="9" y2="17" strokeWidth="1" /><line x1="13" y1="5" x2="13" y2="17" strokeWidth="1" /></svg>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700 }}><span style={{ color: '#90C4FF' }}>Steel</span><span style={{ color: '#E65100' }}>Box</span></span>
        </div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,.7)', marginBottom: '3px' }}>{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'},</div>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>Mike Torres</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setOnDuty(d => !d)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: onDuty ? 'rgba(61,255,160,.15)' : 'rgba(255,255,255,.15)', border: `1.5px solid ${onDuty ? 'rgba(61,255,160,.4)' : 'rgba(255,255,255,.3)'}`, borderRadius: '999px', padding: '8px 16px', cursor: 'pointer' }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: onDuty ? '#4DFFB4' : 'rgba(255,255,255,.5)', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{onDuty ? 'On Duty' : 'Off Duty'}</span>
          </button>
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(255,255,255,.6)', background: 'rgba(255,255,255,.1)', padding: '4px 10px', borderRadius: '8px', marginLeft: 'auto' }}>Kenworth T880</span>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '14px 12px 0' }}>
        {[
          { icon: '🚚', num: 2, label: 'Deliveries', color: '#0057B8', bg: '#EEF2FF' },
          { icon: '📷', num: 3, label: 'Photo Jobs', color: '#E65100', bg: '#FFE0CC' },
          { icon: '⭐', num: '4.9', label: 'Rating', color: '#F9A825', bg: '#FFF8E1' },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E1E2EC', padding: '12px', boxShadow: '0 1px 4px rgba(26,28,46,.08)', textAlign: 'center' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: '14px' }}>{k.icon}</div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '24px', fontWeight: 700, lineHeight: 1, color: k.color }}>{k.num}</div>
            <div style={{ fontSize: '10px', color: '#44475A', marginTop: '2px', letterSpacing: '0.3px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Active delivery */}
      {secLabel('Active Delivery')}
      <div
        onClick={() => goTo('delivery')}
        style={{ margin: '0 12px 10px', background: 'linear-gradient(135deg,#D6E4FF,#C8DBFF)', borderRadius: '16px', border: '1px solid rgba(0,87,184,.2)', padding: '18px', cursor: 'pointer', position: 'relative', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,87,184,.12)' }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#0057B8', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#0057B8', flexShrink: 0 }} />
          In Progress
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#44475A', marginBottom: '4px' }}>#ORD-0085 · SBX-20-0038</div>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>Westfield Storage Co.</div>
        <div style={{ fontSize: '12px', color: '#44475A', lineHeight: 1.5, marginBottom: '12px' }}>5500 Industrial Pkwy, Katy TX 77493<br />Window: 10:00 AM – 2:00 PM</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Chip label="In Transit" color="blue" />
          <Chip label="Est. 14 min" color="warn" />
          <Chip label="18/18 photos ✓" color="green" />
        </div>
        <div style={{ position: 'absolute', top: '50%', right: '16px', transform: 'translateY(-50%)', opacity: 0.45 }}>›</div>
      </div>

      {/* Nearby photos */}
      {secLabel('Photos Needed Nearby')}
      <div style={{ margin: '0 12px 10px', background: 'linear-gradient(135deg,#FFF3E0,#FFE8CC)', borderRadius: '16px', border: '1.5px solid rgba(230,81,0,.2)', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#E65100', flexShrink: 0 }} />
          <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#E65100' }}>NOLA DEPOT</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '10px', color: '#E65100', background: 'rgba(230,81,0,.1)', padding: '2px 8px', borderRadius: '999px' }}>0.3 mi away</span>
        </div>
        <div style={{ fontSize: '12px', color: '#44475A', marginBottom: '12px' }}>3 containers need listing photos after your current delivery</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {[{ sku: 'SBX-20-0067', bay: 'Bay 4', count: 9 }, { sku: 'SBX-20-0068', bay: 'Bay 7', count: 0 }, { sku: 'SBX-20-0041', bay: 'Bay 2', count: 14 }].map(nc => (
            <div key={nc.sku} style={{ flex: 1, background: 'rgba(255,255,255,.75)', borderRadius: '12px', padding: '10px', border: '1px solid rgba(230,81,0,.1)' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '9px', color: '#44475A', marginBottom: '2px' }}>{nc.sku}</div>
              <div style={{ fontSize: '11px', color: '#44475A', marginBottom: '4px' }}>{nc.bay}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>{nc.count}/16</div>
              <div style={{ height: '4px', background: 'rgba(0,0,0,.08)', borderRadius: '2px' }}>
                <div style={{ height: '100%', borderRadius: '2px', background: '#E65100', width: `${Math.round(nc.count / 16 * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => goTo('camera')} style={{ width: '100%', padding: '12px', background: '#E65100', color: '#fff', border: 'none', borderRadius: '999px', fontFamily: "'Google Sans', sans-serif", fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(230,81,0,.3)' }}>
          📷 Start Photo Session
        </button>
      </div>

      {/* Upcoming */}
      {secLabel('Upcoming Today')}
      {card(
        <>
          {[
            { icon: '🚚', label: 'Ray Donovan — Delivery', detail: '#ORD-0089 · SBX-20-0041 · Austin TX', time: '2:00 PM', screen: 'schedule' as Screen },
            { icon: '📷', label: 'Photo Session — NOLA Depot', detail: 'SBX-20-0068 · Bay 7 · 0/16 shots', time: 'After', screen: 'camera' as Screen },
          ].map((item, i) => (
            <div key={i} onClick={() => goTo(item.screen)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', borderBottom: i === 0 ? '1px solid #E1E2EC' : 'none', cursor: 'pointer' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: i === 0 ? '#EEF2FF' : '#FFE0CC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{item.label}</div>
                <div style={{ fontSize: '11px', color: '#44475A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail}</div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', flexShrink: 0 }}>{item.time}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )

  // ── Delivery ───────────────────────────────────────────

  const renderDelivery = () => (
    <div>
      <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '44px 16px 14px', flexShrink: 0 }}>
        <button onClick={() => goTo('dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#0057B8', cursor: 'pointer', background: 'none', border: 'none', marginBottom: '10px' }}>
          ← Dashboard
        </button>
        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', marginBottom: '3px' }}>#ORD-0085 · SBX-20-0038 · 20ft Standard</div>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '20px', fontWeight: 700 }}>Westfield Storage Co.</div>
      </div>

      <Stepper steps={[
        { label: 'Job Assigned', status: 'done', time: '8:00 AM' },
        { label: 'Container Picked Up + Photographed', status: 'done', detail: '18/18 photos ✓', time: '9:15 AM' },
        { label: 'En Route to Customer', status: 'active', detail: 'Currently driving · Est. 14 min' },
        { label: 'Arrived at Destination', status: 'pending', detail: 'Confirm on-site arrival' },
        { label: 'Delivery Complete', status: 'pending', detail: 'Signature + delivery photo' },
      ]} />

      {/* Map placeholder */}
      <div onClick={() => toast('Opening navigation…')} style={{ margin: '0 12px 10px', borderRadius: '16px', overflow: 'hidden', border: '1px solid #E1E2EC', height: '150px', background: 'linear-gradient(135deg,#E3F0FF,#D6E9FF)', position: 'relative', cursor: 'pointer' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,87,184,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,87,184,.05) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
        <div style={{ position: 'absolute', top: '55%', left: 0, right: 0, height: '6px', background: 'rgba(255,255,255,.88)', borderRadius: '3px' }} />
        <div style={{ position: 'absolute', left: '35%', top: 0, bottom: 0, width: '6px', background: 'rgba(255,255,255,.88)', borderRadius: '3px' }} />
        <div style={{ position: 'absolute', top: 'calc(55% - 16px)', left: '30%', width: '32px', height: '32px', borderRadius: '50%', background: '#E65100', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(230,81,0,.4)' }}>🚚</div>
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: '#fff', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', fontWeight: 700, border: '1px solid #E1E2EC' }}>ETA <span style={{ color: '#1B7A5A' }}>14 min</span></div>
        <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#fff', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, color: '#0057B8', border: '1px solid #E1E2EC', cursor: 'pointer' }}>🗺 Maps</div>
      </div>

      {/* Customer info */}
      {card(
        <>
          <div style={{ background: '#EEF2FF', padding: '10px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#44475A', borderBottom: '1px solid #E1E2EC' }}>Customer</div>
          {[
            { icon: '🏢', label: 'Customer', val: 'Westfield Storage Co.' },
            { icon: '📍', label: 'Address', val: '5500 Industrial Pkwy, Katy TX 77493' },
            { icon: '📞', label: 'Site Contact', val: '(281) 555-0993', blue: true, onClick: () => toast('Calling (281) 555-0993…') },
            { icon: '🕐', label: 'Window', val: '10:00 AM – 2:00 PM', green: true },
            { icon: '📝', label: 'Instructions', val: 'Enter via south gate. Ask for Greg.' },
          ].map((row, i) => (
            <div key={i} onClick={row.onClick} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '11px 16px', borderBottom: '1px solid #E1E2EC', fontSize: '13px', cursor: row.onClick ? 'pointer' : 'default' }}>
              <span style={{ width: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>{row.icon}</span>
              <div>
                <div style={{ fontSize: '11px', color: '#44475A', marginBottom: '1px' }}>{row.label}</div>
                <div style={{ fontWeight: 600, color: row.blue ? '#0057B8' : row.green ? '#1B7A5A' : '#1A1C2E', textDecoration: row.blue ? 'underline' : 'none' }}>{row.val}</div>
              </div>
            </div>
          ))}
        </>,
        { marginBottom: '10px' }
      )}

      {/* Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '0 12px', marginBottom: '10px' }}>
        <button onClick={() => toast('Texting customer ETA…')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '999px', background: '#EEF2FF', color: '#0057B8', border: 'none', fontFamily: "'Google Sans', sans-serif", fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>💬 SMS Customer</button>
        <button onClick={() => toast('Calling dispatch…')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '999px', background: '#EEF2FF', color: '#0057B8', border: 'none', fontFamily: "'Google Sans', sans-serif", fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>📡 Dispatch</button>
      </div>

      <div style={{ padding: '0 12px', marginBottom: '10px' }}>
        <button onClick={() => { setSignedDelivery(false); toast('Arrival marked. Customer notified.') }} style={{ width: '100%', padding: '15px', background: '#E65100', color: '#fff', border: 'none', borderRadius: '999px', fontFamily: "'Google Sans', sans-serif", fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(230,81,0,.3)' }}>📍 Mark Arrived</button>
      </div>

      {/* Signature pad */}
      <div
        onClick={() => { setSignedDelivery(true); toast('Signature captured') }}
        style={{ margin: '0 12px 10px', background: signedDelivery ? '#B7F0DA' : 'transparent', border: `2px ${signedDelivery ? 'solid #1B7A5A' : 'dashed #C4C6D0'}`, borderRadius: '16px', padding: '20px 16px', textAlign: 'center', cursor: 'pointer' }}
      >
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>{signedDelivery ? '✅' : '✍️'}</div>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '3px' }}>{signedDelivery ? 'Signature Captured' : 'Customer Signature Required'}</div>
        <div style={{ fontSize: '11px', color: '#44475A' }}>{signedDelivery ? 'Tap to re-capture' : 'Tap to capture on-site'}</div>
      </div>

      <div style={{ padding: '0 12px 4px' }}>
        <button
          onClick={() => { if (signedDelivery) { goTo('success') } else { toast('Capture customer signature first') } }}
          style={{ width: '100%', padding: '15px', background: signedDelivery ? '#1B7A5A' : '#C4C6D0', color: '#fff', border: 'none', borderRadius: '999px', fontFamily: "'Google Sans', sans-serif", fontSize: '15px', fontWeight: 700, cursor: signedDelivery ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          ✓ Mark as Delivered
        </button>
      </div>
    </div>
  )

  // ── Camera / Photo Checklist ───────────────────────────

  const renderCamera = () => (
    <div>
      <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '44px 16px 14px' }}>
        <button onClick={() => goTo('dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#0057B8', cursor: 'pointer', background: 'none', border: 'none', marginBottom: '10px' }}>← Dashboard</button>
        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', marginBottom: '2px' }}>Bay 4 · NOLA Depot</div>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '19px', fontWeight: 700 }}>SBX-20-0067</div>
      </div>

      {/* Progress */}
      <div style={{ margin: '10px 12px 0', background: '#fff', borderRadius: '12px', border: '1px solid #E1E2EC', padding: '14px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#44475A' }}>Progress</span>
          <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#0057B8' }}>{doneCount} / 16 shots</span>
        </div>
        <div style={{ height: '6px', background: '#E1E2EC', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,#0057B8,#1B7A5A)', borderRadius: '3px', width: `${progress}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Shot list */}
      {(['exterior', 'interior', 'optional'] as const).map(group => (
        <div key={group}>
          <div style={{ padding: '12px 16px 6px', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#44475A' }}>
            {group === 'exterior' ? 'Exterior — Required' : group === 'interior' ? 'Interior — Required' : 'Optional'}
          </div>
          {shots.filter(s => s.group === group).map(shot => (
            <div
              key={shot.id}
              onClick={() => toggleShot(shot.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 12px 6px', padding: '10px 12px', background: '#fff', borderRadius: '12px', border: '1px solid #E1E2EC', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', width: '20px', textAlign: 'right', flexShrink: 0 }}>{shot.id}</span>
              <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>
                {shot.label}
                {shot.required && <span style={{ color: '#E65100', fontWeight: 700 }}> *</span>}
              </span>
              <div style={{ width: '38px', height: '30px', borderRadius: '6px', background: shot.done ? '#B7F0DA' : '#EEF2FF', border: `1.5px solid ${shot.done ? '#1B7A5A' : '#E1E2EC'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {shot.done
                  ? <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#1B7A5A" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>
                  : <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#44475A" strokeWidth="1.4" strokeLinecap="round"><path d="M2 7h2.5L6 5h8l1.5 2H18a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V8a1 1 0 011-1z" /><circle cx="10" cy="11" r="3" /></svg>
                }
              </div>
            </div>
          ))}
        </div>
      ))}

      <button onClick={() => goTo('review')} style={{ margin: '12px', width: 'calc(100% - 24px)', background: '#0057B8', color: '#fff', border: 'none', borderRadius: '16px', padding: '16px', fontFamily: "'Google Sans', sans-serif", fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(0,87,184,.3)' }}>
        📷 Open Camera
      </button>
      <div style={{ textAlign: 'center', padding: '4px 12px 10px', fontSize: '11px', color: '#44475A' }}>Tap any row to toggle done · Open Camera captures next required shot</div>
    </div>
  )

  // ── Review & Submit ────────────────────────────────────

  const renderReview = () => (
    <div>
      <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '44px 16px 14px' }}>
        <button onClick={() => goTo('camera')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#0057B8', cursor: 'pointer', background: 'none', border: 'none', marginBottom: '10px' }}>← Checklist</button>
        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', marginBottom: '2px' }}>SBX-20-0067 · {doneCount} photos captured</div>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '19px', fontWeight: 700 }}>Review & Submit</div>
      </div>

      <div style={{ margin: '12px', background: '#B7F0DA', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#1B7A5A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(27,122,90,.2)' }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#1B7A5A" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>
        All 14 required shots {doneCount >= 14 ? 'complete' : `— ${14 - Math.min(doneCount, 14)} remaining`}
      </div>

      {/* Photo grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px', padding: '0 12px', marginBottom: '12px' }}>
        {shots.map(shot => (
          <div key={shot.id} style={{ aspectRatio: '1', borderRadius: '8px', border: `2px solid ${shot.done ? '#1B7A5A' : '#E1E2EC'}`, background: shot.done ? 'linear-gradient(135deg,#D1FAE5,#ECFDF5)' : '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', position: 'relative' }}>
            {shot.done ? '✓' : shot.id}
            {shot.done && <div style={{ position: 'absolute', top: '3px', right: '3px', width: '10px', height: '10px', borderRadius: '50%', background: '#1B7A5A' }} />}
          </div>
        ))}
      </div>

      {/* Metadata */}
      {card(
        <>
          {[
            { label: 'SKU', val: 'SBX-20-0067', blue: true },
            { label: 'GUID', val: 'a3f9-b22e-4d1c-9f83', small: true },
            { label: 'Condition', val: 'One Trip', orange: true },
            { label: 'Photos', val: `${doneCount} / 16 ready`, green: doneCount >= 14 },
            { label: 'Upload size', val: '~48 MB' },
            { label: 'Captured by', val: 'Mike Torres · DRV-001' },
            { label: 'GPS stamp', val: '29.7604° N · 95.3698° W', green: true, small: true },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', borderBottom: '1px solid #E1E2EC', fontSize: '12px' }}>
              <span style={{ color: '#44475A' }}>{row.label}</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: row.small ? '9px' : '12px', color: row.blue ? '#0057B8' : row.orange ? '#E65100' : row.green ? '#1B7A5A' : '#1A1C2E' }}>{row.val}</span>
            </div>
          ))}
        </>
      )}

      {/* Notes */}
      <div style={{ margin: '0 12px 12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#44475A', marginBottom: '6px' }}>Inspector Notes (optional)</div>
        <textarea placeholder="Condition observations, location notes, damage details…" rows={3} style={{ width: '100%', background: '#fff', border: '1.5px solid #C4C6D0', borderRadius: '12px', padding: '12px', color: '#1A1C2E', fontFamily: "'Roboto', sans-serif", fontSize: '13px', resize: 'none', height: '64px', outline: 'none' }} />
      </div>

      <button onClick={() => goTo('success')} style={{ margin: '0 12px 12px', width: 'calc(100% - 24px)', background: '#0057B8', color: '#fff', border: 'none', borderRadius: '16px', padding: '16px', fontFamily: "'Google Sans', sans-serif", fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,87,184,.3)' }}>
        Submit to Admin Portal →
      </button>
      <div style={{ textAlign: 'center', padding: '0 12px 12px', fontSize: '11px', color: '#44475A' }}>Uploads via WiFi or LTE · Admin notified instantly</div>
    </div>
  )

  // ── Success ────────────────────────────────────────────

  const renderSuccess = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#B7F0DA', border: '3px solid #1B7A5A', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
        <svg width="36" height="36" viewBox="0 0 20 20" fill="none" stroke="#1B7A5A" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>
      </div>
      <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Photos Submitted!</div>
      <p style={{ fontSize: '13px', color: '#44475A', lineHeight: 1.65, marginBottom: '24px', maxWidth: '260px' }}>All {doneCount} photos for SBX-20-0067 uploaded. Admin has been notified and will review for listing approval.</p>
      <div style={{ background: '#EEF2FF', color: '#0057B8', borderRadius: '16px', padding: '7px 18px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, marginBottom: '28px', border: '1px solid rgba(0,87,184,.2)' }}>SBX-20-0067 · a3f9-b22e</div>
      <button onClick={() => { setShots(SHOT_LIST.map(s => ({ ...s }))); goTo('camera') }} style={{ width: '100%', padding: '13px', borderRadius: '16px', background: '#0057B8', color: '#fff', border: 'none', fontFamily: "'Google Sans', sans-serif", fontSize: '14px', fontWeight: 700, cursor: 'pointer', marginBottom: '10px', boxShadow: '0 4px 14px rgba(0,87,184,.3)' }}>
        📷 Next: SBX-20-0068 (0/16)
      </button>
      <button onClick={() => goTo('dashboard')} style={{ width: '100%', padding: '13px', borderRadius: '16px', background: '#EEF2FF', color: '#1A1C2E', border: '1.5px solid #E1E2EC', fontFamily: "'Google Sans', sans-serif", fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Back to Dashboard</button>
      <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', marginTop: '14px', letterSpacing: '0.5px' }}>UPLOADED IN 41s · 48.2 MB · WiFi</div>
    </div>
  )

  // ── Schedule ───────────────────────────────────────────

  const renderSchedule = () => (
    <div>
      <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '44px 16px 14px' }}>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '20px', fontWeight: 700, marginBottom: '2px' }}>My Schedule</div>
        <div style={{ fontSize: '12px', color: '#44475A' }}>Today · 2 deliveries · 3 photo jobs</div>
      </div>

      {/* Week strip */}
      <div style={{ display: 'flex', gap: '6px', padding: '12px 12px 0', overflowX: 'auto' }}>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => {
          const num = i + 6
          const isToday = i === 3
          const hasJob = [2, 3, 5].includes(i)
          return (
            <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px 10px', borderRadius: '16px', cursor: 'pointer', flexShrink: 0, border: `1.5px solid ${isToday ? 'transparent' : hasJob ? '#E1E2EC' : 'transparent'}`, background: isToday ? '#0057B8' : 'transparent' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: isToday ? 'rgba(255,255,255,.8)' : '#44475A' }}>{day}</div>
              <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '19px', fontWeight: 700, lineHeight: 1, color: isToday ? '#fff' : '#1A1C2E' }}>{num}</div>
              {hasJob && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: isToday ? '#FFD54F' : '#E65100' }} />}
            </div>
          )
        })}
      </div>

      {card(
        <>
          <div style={{ padding: '12px 16px', background: '#EEF2FF', borderBottom: '1px solid #E1E2EC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '13px', fontWeight: 700 }}>Thursday — Today</div>
            <Chip label="5 tasks" color="orange" />
          </div>
          {[
            { time: '9:00 AM', dot: 'blue', name: 'Delivery — Westfield Storage Co.', addr: '#ORD-0085 · Katy TX · In Progress', chip: <Chip label="Active" color="blue" />, onClick: () => goTo('delivery') },
            { time: 'After',   dot: 'orange', name: 'Photos — SBX-20-0067', addr: 'NOLA Depot · Bay 4 · 9/16 shots', chip: <Chip label="9 left" color="orange" />, onClick: () => goTo('camera') },
            { time: 'After',   dot: 'orange', name: 'Photos — SBX-20-0068', addr: 'NOLA Depot · Bay 7 · 0/16 shots', chip: <Chip label="New" color="orange" />, onClick: () => goTo('camera') },
            { time: 'After',   dot: 'orange', name: 'Photos — SBX-20-0041', addr: 'NOLA Depot · Bay 2 · 14/16 shots', chip: <Chip label="2 left" color="warn" />, onClick: () => goTo('camera') },
            { time: '2:00 PM', dot: 'blue', name: 'Delivery — Ray Donovan', addr: '#ORD-0089 · Austin TX', chip: <Chip label="Scheduled" color="grey" />, onClick: () => goTo('delivery') },
          ].map((job, i) => (
            <div key={i} onClick={job.onClick} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', borderBottom: i < 4 ? '1px solid #E1E2EC' : 'none', cursor: 'pointer' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: '#0057B8', minWidth: '52px', textAlign: 'right', flexShrink: 0 }}>{job.time}</div>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: job.dot === 'blue' ? '#0057B8' : '#E65100', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{job.name}</div>
                <div style={{ fontSize: '11px', color: '#44475A' }}>{job.addr}</div>
              </div>
              {job.chip}
            </div>
          ))}
        </>,
        { marginTop: '10px' }
      )}
    </div>
  )

  const screens: Record<Screen, React.ReactNode> = {
    dashboard: renderDashboard(),
    delivery:  renderDelivery(),
    camera:    renderCamera(),
    review:    renderReview(),
    success:   renderSuccess(),
    schedule:  renderSchedule(),
  }

  return (
    <div style={base}>
      {screens[screen]}
      <BottomNav active={screen === 'review' ? 'camera' : screen === 'success' ? 'camera' : screen} onNav={goTo} />
      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
