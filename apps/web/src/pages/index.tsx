// ============================================================
// SteelBox Marketplace — Public storefront
// Route: / (public, no auth required)
// Design source: Marketplace.dc.html
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { GradeBadge, StatusBadge, Button, Modal, Snackbar, Input, Select } from '../components/ui'
import { useContainers, useSnackbar, useAuth } from '../hooks'
import { containers, quotes, orders, isZipCovered, estimateDelivery, drivers as driversApi, messages as messagesApi, customers as customersApi, type Container, type ContainerGrade, type ContainerSize, type Driver, type Customer, type Order, type Message } from '../lib/api'

// ── Types ─────────────────────────────────────────────────

type Tab = 'buy' | 'rent' | 'custom' | 'bulk'
type SortKey = 'price-asc' | 'price-desc' | 'condition' | 'newest'
type CartMode = 'buy' | 'rent'
interface CartItem { container: Container; mode: CartMode; rentTerm: number }

// Which transaction modes a container allows, from its listingType.
function allowedModes(c: Container): { buy: boolean; rent: boolean } {
  const lt = c.listingType ?? 'both'
  return { buy: lt !== 'rent', rent: lt !== 'buy' && c.rentMonthly != null }
}

// ── Constants ─────────────────────────────────────────────

const GRADE_META: Record<ContainerGrade, { label: string; desc: string; color: string }> = {
  A: { label: 'One-Trip', desc: 'Direct import, single use. Like new inside and out.', color: '#1B7A5A' },
  B: { label: 'Cargo-Worthy', desc: 'Used, structurally sound, wind and watertight.', color: '#2563EB' },
  C: { label: 'Wind & Watertight', desc: 'Older unit with visible rust. Structurally solid.', color: '#D97706' },
  R: { label: 'Refurbished', desc: 'Repainted, resealed, and reconditioned.', color: '#6D28D9' },
  X: { label: 'Custom Build', desc: 'Modified to specification.', color: '#374151' },
}

const SIZE_LABELS: Record<ContainerSize, string> = {
  '10ft-std': '10ft Standard',
  '20ft-std': '20ft Standard',
  '20ft-hc':  '20ft High Cube',
  '40ft-std': '40ft Standard',
  '40ft-hc':  '40ft High Cube',
}

// Canonical ordered size list for filters and forms.
const SIZE_OPTIONS = Object.entries(SIZE_LABELS) as [ContainerSize, string][]

const CUSTOM_BUILDS = [
  { name: 'Roll-Up Door', tag: 'POPULAR', desc: 'Single or double roll-up doors for easy forklift access.', features: ['8×7 roll-up', 'Galvanized steel', 'Lockable'], fromPrice: 3200 },
  { name: 'Personnel Door + Window', tag: 'COMMON', desc: 'Man door and sliding window for office or site use.', features: ['36" steel door', 'Deadbolt', 'Slider window'], fromPrice: 2800 },
  { name: 'Workshop Container', tag: 'TURNKEY', desc: 'Wired for power, vented, shelving included.', features: ['110v outlets', 'Fluorescent lighting', 'Vent fans'], fromPrice: 5500 },
  { name: 'Pop-Up Retail Shell', tag: 'TRENDING', desc: 'Fold-out panels, branded exterior, ready for signage.', features: ['Fold-out counter', 'Service window', 'Awning mounts'], fromPrice: 7200 },
  { name: 'Refrigerated Conversion', tag: 'SPECIALTY', desc: 'Insulated walls, cooling unit, floor drains.', features: ['R-19 insulation', 'Commercial cooler', 'NSF floor'], fromPrice: 9800 },
  { name: 'Security Vault', tag: 'HEAVY DUTY', desc: 'Reinforced doors, CCTV mount points, alarm wiring.', features: ['10-gauge steel door', '3-point lock', 'CCTV prep'], fromPrice: 4400 },
]

// ── Quote Dialog ───────────────────────────────────────────

interface QuoteDialogProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  defaultNeed?: string
  containerSku?: string
  onSuccess?: () => void
}

function QuoteDialog({ open, onClose, title, subtitle, defaultNeed = '', containerSku, onSuccess }: QuoteDialogProps) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    deliveryZip: '', need: defaultNeed, notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset stale errors each time the dialog opens.
  useEffect(() => { if (open) setError('') }, [open])

  const handleSubmit = async () => {
    if (!form.firstName.trim() || (!form.phone.trim() && !form.email.trim())) {
      setError('Please give us your first name and a phone number or email so we can reach you.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await quotes.submit({ ...form, containerSku })
      onSuccess?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please try again or call (504) 555-0190.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={460}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{title}</h2>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '22px', lineHeight: 1.5 }}>{subtitle}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Input label="First Name" placeholder="Jane" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} />
        <Input label="Last Name" placeholder="Smith" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} />
      </div>
      <Input label="Phone" type="tel" placeholder="(504) 555-0000" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
      <Input label="Email" type="email" placeholder="jane@company.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
      <Input label="Delivery ZIP" placeholder="70112" value={form.deliveryZip} onChange={e => setForm(p => ({ ...p, deliveryZip: e.target.value }))} />
      <Select label="What do you need?" value={form.need} onChange={e => setForm(p => ({ ...p, need: e.target.value }))}>
        <option value="">— Select —</option>
        <option value="buy">Buy a container</option>
        <option value="rent-short">Short-term rental (1–3 months)</option>
        <option value="rent-long">Long-term rental (6–12 months)</option>
        <option value="custom">Custom build quote</option>
        <option value="bulk">Bulk / B2B pricing</option>
      </Select>
      <div style={{ marginBottom: '13px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Notes</label>
        <textarea
          placeholder="Container size, intended use, access constraints…"
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          rows={3}
          style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--div)', borderRadius: 'var(--r12)', fontSize: '14px', resize: 'vertical', fontFamily: 'var(--sans)', outline: 'none' }}
        />
      </div>
      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '4px' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Sending…' : 'Submit Request'}
        </Button>
      </div>
    </Modal>
  )
}

// ── Container Card ─────────────────────────────────────────

interface ContainerCardProps {
  container: Container
  onSelect: (c: Container) => void
  mode?: 'buy' | 'rent'
  inCart?: boolean
  onAddToCart?: (c: Container, mode: 'buy' | 'rent') => void
}

function ContainerCard({ container, onSelect, mode = 'buy', inCart = false, onAddToCart }: ContainerCardProps) {
  const { sku, grade, status, size, buyPrice, rentMonthly, photos } = container
  const gradeMeta = GRADE_META[grade]
  const isLocked = status === 'sale_in_progress'
  const isDraft = status === 'draft' // admin-only preview — not purchasable yet
  // On the Rent tab, lead with the monthly rate; on Buy, lead with purchase price.
  const rentLead = mode === 'rent' && rentMonthly != null
  const disabled = isLocked || inCart || isDraft

  return (
    <div
      className="mkt-card"
      onClick={() => onSelect(container)}
      style={{
        background: 'var(--surf-w)',
        borderRadius: 'var(--r16)',
        border: '1px solid var(--div)',
        boxShadow: 'var(--sh1)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh2)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh1)' }}
    >
      {/* Photo area */}
      <div style={{ position: 'relative', background: 'linear-gradient(135deg,#CBD5E8,#A8BFDF)', paddingBottom: '52%', height: 0, overflow: 'hidden' }}>
        {photos?.[0] ? (
          <img
            src={photos[0]}
            alt={sku}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ContainerSVGIcon size={size} />
          </div>
        )}
        {/* Grade badge */}
        <span style={{ position: 'absolute', top: '8px', right: '8px', background: gradeMeta.color, color: '#fff', borderRadius: 'var(--r4)', padding: '3px 8px', fontSize: '10px', fontWeight: 700 }}>{grade}</span>
        {/* Draft badge — admin-only preview of unlisted units */}
        {isDraft && (
          <span style={{ position: 'absolute', top: '8px', left: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--amber, #B45309)', color: '#fff', borderRadius: 'var(--r4)', padding: '3px 8px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff' }} />Draft
          </span>
        )}
        {/* Sale in progress veil */}
        {isLocked && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}>
            <span style={{ background: 'var(--cta)', color: '#fff', padding: '6px 16px', borderRadius: 'var(--r4)', fontSize: '12px', fontWeight: 700 }}>Sale in Progress</span>
          </div>
        )}
        {/* Hover veil + view affordance (matches design .card-hover-veil / .card-hover-icon) */}
        {!isLocked && (
          <div className="card-hover-veil" style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div className="card-hover-icon" style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(255,255,255,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5" /><line x1="12.5" y1="12.5" x2="17" y2="17" /></svg>
            </div>
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '9px 11px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>{SIZE_LABELS[size]}</span>
          <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 'var(--r4)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: rentLead ? 'var(--pri-c,#D6E4FF)' : 'var(--green-cont)', color: rentLead ? 'var(--primary)' : 'var(--green)' }}>
            {rentLead ? 'Rent' : 'Buy'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          <span style={{ background: 'var(--surf1)', borderRadius: 'var(--r4)', padding: '3px 7px', fontSize: '10px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{gradeMeta.label}</span>
          {container.has360 && <span style={{ background: 'var(--pri-c, #D6E4FF)', borderRadius: 'var(--r4)', padding: '3px 7px', fontSize: '10px', color: 'var(--primary)', fontFamily: 'var(--mono)' }}>360°</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--div)' }}>
          {rentLead ? (
            <div>
              <div style={{ fontSize: '21px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.3px' }}>${rentMonthly}<span style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>/mo</span></div>
              <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '1px' }}>or ${buyPrice.toLocaleString()} to buy</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '21px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.3px' }}>${buyPrice.toLocaleString()}</div>
              <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '1px' }}>{rentMonthly ? `or $${rentMonthly}/mo rental` : 'One-time purchase'}</div>
            </div>
          )}
          {/* Add to Cart — greyed once in cart or while a sale is in progress */}
          <button
            onClick={e => { e.stopPropagation(); if (!disabled) onAddToCart?.(container, rentLead ? 'rent' : 'buy') }}
            disabled={disabled}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: 'var(--pill)',
              background: disabled ? 'var(--surf1)' : 'var(--cta)', color: disabled ? 'var(--ink3)' : '#fff',
              fontSize: '12px', fontWeight: 700, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
              boxShadow: disabled ? 'none' : '0 2px 8px rgba(230,81,0,.25)',
            }}
          >
            {!disabled && <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h2.5l2 9h9l2-7H5" /><circle cx="8" cy="17.5" r="1.5" fill="#fff" stroke="none" /><circle cx="13" cy="17.5" r="1.5" fill="#fff" stroke="none" /></svg>}
            {isDraft ? 'Not Listed' : inCart ? 'In Cart' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Simple container SVG placeholder ──────────────────────

function ContainerSVGIcon({ size }: { size: ContainerSize }) {
  const is40ft = size.startsWith('40')
  return (
    <svg width={is40ft ? 140 : 90} height="52" viewBox="0 0 160 60" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round">
      <rect x="4" y="10" width={is40ft ? 152 : 100} height="44" rx="2" />
      <line x1="34" y1="10" x2="34" y2="54" />
      <line x1="64" y1="10" x2="64" y2="54" />
      <line x1="94" y1="10" x2="94" y2="54" />
      {is40ft && <><line x1="114" y1="10" x2="114" y2="54" /><line x1="134" y1="10" x2="134" y2="54" /></>}
      <text x="80" y="40" fontSize="9" fill="rgba(255,255,255,0.3)" textAnchor="middle" fontFamily="monospace">
        {size.toUpperCase()}
      </text>
    </svg>
  )
}

// ── 360° / 3D viewer ───────────────────────────────────────
// The 12 field photos are the frames of a 360° spin; with no real photos we
// render a rotatable 3D container model (drag to rotate around it).

const SHOT_LABELS = [
  'Front doors closed', 'Front doors open', 'Right side', 'Back', 'Left side', 'SKU sticker · outside',
  'Inside back', 'Inside right', 'Inside left', 'Inside ceiling', 'Inside floor', 'SKU sticker · inside',
]

function Container3D({ size, grade, rotY, rotX }: { size: ContainerSize; grade: ContainerGrade; rotY: number; rotX: number }) {
  const is40 = size.startsWith('40'), is10 = size.startsWith('10')
  const W = is40 ? 300 : is10 ? 110 : 180, H = 118, D = 118
  const accent = GRADE_META[grade].color
  const steel = 'repeating-linear-gradient(90deg,#4a6ea5 0,#4a6ea5 5px,#3d5c8c 5px,#3d5c8c 11px)'
  const corr = 'repeating-linear-gradient(0deg,#5578ad 0,#5578ad 5px,#48699a 5px,#48699a 11px)'
  const faceBase: React.CSSProperties = { position: 'absolute', left: '50%', top: '50%', boxSizing: 'border-box', border: '1px solid rgba(0,0,0,.3)' }
  return (
    <div style={{ perspective: '1200px', width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'relative', width: `${W}px`, height: `${H}px`, transformStyle: 'preserve-3d', transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)` }}>
        {/* front — doors */}
        <div style={{ ...faceBase, width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2, transform: `translateZ(${D / 2}px)`, background: steel, display: 'flex' }}>
          {[0, 1].map(k => (
            <div key={k} style={{ flex: 1, borderRight: k === 0 ? '2px solid rgba(0,0,0,.35)' : 'none', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '12%', bottom: '12%', left: k === 0 ? 'auto' : '10%', right: k === 0 ? '10%' : 'auto', width: '4px', background: 'rgba(0,0,0,.35)', borderRadius: '2px' }} />
            </div>
          ))}
          <div style={{ position: 'absolute', top: '8px', left: '8px', background: '#fff', color: accent, fontFamily: 'var(--mono)', fontSize: is10 ? '7px' : '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '2px' }}>{grade}</div>
        </div>
        {/* back */}
        <div style={{ ...faceBase, width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2, transform: `rotateY(180deg) translateZ(${D / 2}px)`, background: steel }} />
        {/* right */}
        <div style={{ ...faceBase, width: D, height: H, marginLeft: -D / 2, marginTop: -H / 2, transform: `rotateY(90deg) translateZ(${W / 2}px)`, background: corr }} />
        {/* left */}
        <div style={{ ...faceBase, width: D, height: H, marginLeft: -D / 2, marginTop: -H / 2, transform: `rotateY(-90deg) translateZ(${W / 2}px)`, background: corr }} />
        {/* top */}
        <div style={{ ...faceBase, width: W, height: D, marginLeft: -W / 2, marginTop: -D / 2, transform: `rotateX(90deg) translateZ(${H / 2}px)`, background: '#2f466a', borderTop: `3px solid ${accent}` }} />
        {/* bottom */}
        <div style={{ ...faceBase, width: W, height: D, marginLeft: -W / 2, marginTop: -D / 2, transform: `rotateX(-90deg) translateZ(${H / 2}px)`, background: '#16233c' }} />
      </div>
    </div>
  )
}

function Spin360Gallery({ container }: { container: Container }) {
  const [rotY, setRotY] = useState(-28)
  const [rotX, setRotX] = useState(-12)
  const drag = useRef<{ x: number; y: number; ry: number; rx: number } | null>(null)
  const photos = container.photos || []
  const frame = ((Math.round(rotY / 30) % 12) + 12) % 12
  const pt = (e: React.MouseEvent | React.TouchEvent) => 'touches' in e ? e.touches[0] : e as React.MouseEvent
  const onDown = (e: React.MouseEvent | React.TouchEvent) => { const p = pt(e); drag.current = { x: p.clientX, y: p.clientY, ry: rotY, rx: rotX } }
  const onMove = (e: React.MouseEvent | React.TouchEvent) => { if (!drag.current) return; const p = pt(e); setRotY(drag.current.ry + (p.clientX - drag.current.x) * 0.7); setRotX(Math.max(-45, Math.min(15, drag.current.rx - (p.clientY - drag.current.y) * 0.3))) }
  const onUp = () => { drag.current = null }
  return (
    <div style={{ background: '#0B1629' }}>
      <div
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        style={{ position: 'relative', height: '230px', overflow: 'hidden', background: 'radial-gradient(circle at 50% 38%,#1a2b47,#0a1526)', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {photos.length >= 12
            ? <img src={photos[frame]} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Container3D size={container.size} grade={container.grade} rotY={rotY} rotX={rotX} />}
        </div>
        <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,87,184,.9)', color: '#fff', borderRadius: 'var(--r4)', padding: '4px 10px', fontSize: '10px', fontWeight: 700 }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"><path d="M3 10a7 7 0 0 1 12-5" /><path d="M17 10a7 7 0 0 1-12 5" /><polyline points="15,2 15,5 12,5" /><polyline points="5,18 5,15 8,15" /></svg>
          360° · drag to rotate
        </div>
        <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.55)', borderRadius: 'var(--pill)', padding: '3px 10px', fontFamily: 'var(--mono)', fontSize: '10px', color: '#fff' }}>{frame + 1} / 12 · stitched from 12 photos</div>
      </div>
      {/* 12 photo frames */}
      <div style={{ display: 'flex', gap: '3px', padding: '6px', background: '#060F1E', overflowX: 'auto' }}>
        {SHOT_LABELS.map((label, i) => (
          <button key={i} onClick={() => { setRotY(i * 30); setRotX(-12) }} title={label}
            style={{ width: '74px', height: '52px', flexShrink: 0, borderRadius: 'var(--r4)', overflow: 'hidden', cursor: 'pointer', border: `2px solid ${i === frame ? 'var(--cta)' : 'transparent'}`, background: '#162030', color: 'rgba(255,255,255,.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '3px' }}>
            {photos[i]
              ? <img src={photos[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <><span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: '#fff' }}>{i + 1}</span><span style={{ fontSize: '7px', lineHeight: 1.1, textAlign: 'center' }}>{label}</span></>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Container Detail Modal ─────────────────────────────────

interface DetailModalProps {
  container: Container | null
  onClose: () => void
  onAddToCart: (c: Container, mode: CartMode) => void
  mode: CartMode
  inCart: boolean
  onNavigate: (dir: -1 | 1) => void
  index: number
  total: number
}

function DetailModal({ container, onClose, onAddToCart, mode, inCart, onNavigate, index, total }: DetailModalProps) {
  const [delivery, setDelivery] = useState('Enter your ZIP above')
  const [zip, setZip] = useState('')

  // Reset the gallery (and ZIP result) whenever the viewed container changes.
  useEffect(() => { setDelivery('Enter your ZIP above'); setZip('') }, [container?.id])

  // Keyboard ← / → step between containers (ignored while typing in a field).
  useEffect(() => {
    if (!container) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); onNavigate(-1) }
      else if (e.key === 'ArrowRight' && index >= 0 && index < total - 1) { e.preventDefault(); onNavigate(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [container?.id, index, total, onNavigate])

  if (!container) return null
  const hasPrev = index > 0
  const hasNext = index >= 0 && index < total - 1
  const { sku, grade, size, buyPrice, rentMonthly, photos, photoCount, has360 } = container
  const gradeMeta = GRADE_META[grade]
  const isLocked = container.status === 'sale_in_progress'
  const isDraft = container.status === 'draft' // admin-only preview — not purchasable
  const cannotBuy = isLocked || inCart || isDraft

  const checkDelivery = async () => {
    if (!zip || zip.length < 5) return
    setDelivery('Checking…')
    setDelivery(await estimateDelivery(zip))
  }

  return (
    <Modal open={!!container} onClose={onClose} maxWidth={940} noPadding closeVariant="dark">
      {/* Gallery — 360° / 3D spin stitched from the 12 field photos */}
      <Spin360Gallery container={container} />

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '22px', padding: '22px 26px 26px' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink3)', marginBottom: '5px' }}>
            {sku} · 12 photos · 360° spin
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '14px' }}>
            {SIZE_LABELS[size]} Container
          </h2>
          {/* Grade card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surf1)', borderRadius: 'var(--r12)', padding: '13px 14px', marginBottom: '16px', border: '1px solid var(--div)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--r12)', background: gradeMeta.color, display: 'grid', placeItems: 'center', fontSize: '24px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{grade}</div>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink3)', fontWeight: 700 }}>Condition Grade</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>Grade {grade} — {gradeMeta.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px', lineHeight: 1.5 }}>{gradeMeta.desc}</div>
            </div>
          </div>
          {/* Specs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '16px' }}>
            {[
              { label: 'Size', val: SIZE_LABELS[size] },
              { label: 'SKU', val: sku },
              { label: 'Depot', val: container.depotLocation || 'NOLA' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surf1)', borderRadius: 'var(--r12)', padding: '11px 12px', border: '1px solid var(--div)' }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink3)', fontWeight: 700, marginBottom: '3px' }}>{s.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Price card */}
        <div style={{ background: 'var(--surf-w)', border: '1.5px solid var(--div)', borderRadius: 'var(--r16)', padding: '18px', position: 'sticky', top: '20px' }}>
          <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px', background: mode === 'rent' ? 'var(--pri-c,#D6E4FF)' : 'var(--green-cont)', color: mode === 'rent' ? 'var(--primary)' : 'var(--green)' }}>
            {mode === 'rent' ? 'Rental' : 'Purchase'}
          </span>
          <div style={{ fontSize: '30px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.4px' }}>
            {mode === 'rent'
              ? (rentMonthly ? <>${rentMonthly}<span style={{ fontSize: '15px', color: 'var(--ink3)', fontWeight: 600 }}>/mo</span></> : 'Call for pricing')
              : `$${buyPrice.toLocaleString()}`}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px', marginBottom: '14px' }}>
            {mode === 'rent' ? `Monthly rental rate${buyPrice ? ` · or $${buyPrice.toLocaleString()} to buy` : ''}` : `One-time purchase price${rentMonthly ? ` · or $${rentMonthly}/mo to rent` : ''}`}
          </div>

          {/* Delivery estimator */}
          <div style={{ background: 'var(--surf1)', borderRadius: 'var(--r8)', padding: '9px 11px', fontSize: '12px', marginBottom: '12px' }}>
            <div style={{ marginBottom: '6px', color: 'var(--ink3)' }}>Check delivery to your ZIP</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={zip}
                onChange={e => setZip(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && checkDelivery()}
                placeholder="70112"
                maxLength={5}
                style={{ flex: 1, padding: '6px 9px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '13px', outline: 'none' }}
              />
              <button onClick={checkDelivery} style={{ padding: '6px 12px', borderRadius: 'var(--r8)', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Check</button>
            </div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: isZipCovered(zip) ? 'var(--green)' : 'var(--ink3)', fontWeight: isZipCovered(zip) ? 600 : 400 }}>{delivery}</div>
          </div>

          {isDraft && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'var(--amb-c,#FEF3C7)', color: 'var(--amber,#B45309)', borderRadius: 'var(--r8)', padding: '9px 11px', fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
              Draft — admin preview. Not yet live for customers.
            </div>
          )}
          <button
            onClick={() => { if (!cannotBuy) onAddToCart(container, mode) }}
            disabled={cannotBuy}
            style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: cannotBuy ? 'var(--surf1)' : 'var(--cta)', color: cannotBuy ? 'var(--ink3)' : '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: cannotBuy ? 'not-allowed' : 'pointer', boxShadow: cannotBuy ? 'none' : '0 4px 14px rgba(230,81,0,.3)', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {isDraft ? 'Not Listed (Draft)' : isLocked ? 'Currently Reserved' : inCart ? 'In Cart ✓' : (
              <>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h2.5l2 9h9l2-7H5" /><circle cx="8" cy="17.5" r="1.5" fill="#fff" stroke="none" /><circle cx="13" cy="17.5" r="1.5" fill="#fff" stroke="none" /></svg>
                Add to Cart
              </>
            )}
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.5, paddingTop: '12px', borderTop: '1px solid var(--div)' }}>
            <span style={{ color: 'var(--green)', flexShrink: 0, marginTop: '1px' }}>✓</span>
            Normal 3–5 business day delivery · Most site drop-off included
          </div>
        </div>
      </div>

      {/* Prev / Next container footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 26px', borderTop: '1px solid var(--div)', background: 'var(--surf1)' }}>
        <button
          onClick={() => hasPrev && onNavigate(-1)}
          disabled={!hasPrev}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: 'var(--pill)', background: 'var(--surf-w)', border: '1.5px solid var(--div)', fontSize: '13px', fontWeight: 600, color: hasPrev ? 'var(--ink)' : 'var(--ink3)', cursor: hasPrev ? 'pointer' : 'not-allowed', opacity: hasPrev ? 1 : 0.5 }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="12,4 6,10 12,16" /></svg>
          Previous
        </button>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink3)' }}>{total > 0 ? `${index + 1} of ${total}` : ''}</span>
          <span style={{ fontSize: '10px', color: 'var(--ink3)', opacity: 0.7 }}>Use ← → keys</span>
        </span>
        <button
          onClick={() => hasNext && onNavigate(1)}
          disabled={!hasNext}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: 'var(--pill)', background: 'var(--surf-w)', border: '1.5px solid var(--div)', fontSize: '13px', fontWeight: 600, color: hasNext ? 'var(--ink)' : 'var(--ink3)', cursor: hasNext ? 'pointer' : 'not-allowed', opacity: hasNext ? 1 : 0.5 }}
        >
          Next
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8,4 14,10 8,16" /></svg>
        </button>
      </div>
    </Modal>
  )
}

// ── Cart / Checkout ────────────────────────────────────────

interface CheckoutDetails {
  firstName: string; lastName: string; email: string; phone: string
  address: string; city: string; state: string; zip: string
  deliveryDate: string; accessNotes: string
  rentStart: string
  notifySms: boolean
}

const EMPTY_CHECKOUT: CheckoutDetails = {
  firstName: '', lastName: '', email: '', phone: '',
  address: '', city: '', state: '', zip: '',
  deliveryDate: '', accessNotes: '',
  rentStart: '',
  notifySms: false,
}

interface CartModalProps {
  open: boolean
  cart: CartItem[]
  onClose: () => void
  onRemove: (id: string) => void
  onUpdateItem: (id: string, patch: Partial<CartItem>) => void
  onLongTermInquiry: () => void
  onPlaceOrder: (d: CheckoutDetails) => Promise<void>
}

const fieldLabel: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }
const fieldInput: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)' }
const sectionTitle: React.CSSProperties = { fontSize: '14px', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }

function CartModal({ open, cart, onClose, onRemove, onUpdateItem, onLongTermInquiry, onPlaceOrder }: CartModalProps) {
  const [form, setForm] = useState<CheckoutDetails>(EMPTY_CHECKOUT)
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [placedCount, setPlacedCount] = useState(0)

  const set = (k: keyof CheckoutDetails, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  const buyItems = cart.filter(i => i.mode === 'buy')
  const rentItems = cart.filter(i => i.mode === 'rent')
  const buyTotal = buyItems.reduce((s, i) => s + i.container.buyPrice, 0)
  const rentMonthly = rentItems.reduce((s, i) => s + (i.container.rentMonthly || 0), 0) // combined /mo rate
  const rentContract = rentItems.reduce((s, i) => s + (i.container.rentMonthly || 0) * i.rentTerm, 0) // months × rate
  const deposit = rentMonthly // one-month refundable deposit per unit
  const dueToday = buyTotal + rentContract + deposit

  const contactOk = form.firstName && form.lastName && form.email && form.phone
  const deliveryOk = form.address && form.city && form.state && form.zip
  const rentalOk = rentItems.length === 0 || !!form.rentStart
  const canPlace = cart.length > 0 && contactOk && deliveryOk && rentalOk && !placing

  const num = (n: number) => `$${n.toLocaleString()}`

  const close = () => { onClose(); setTimeout(() => { setPlaced(false); setPlaceError(''); setForm(EMPTY_CHECKOUT) }, 200) }

  const place = async () => {
    if (!canPlace) return
    setPlacing(true)
    setPlaceError('')
    setPlacedCount(cart.length)
    try { await onPlaceOrder(form); setPlaced(true) }
    catch (e) { setPlaceError(e instanceof Error ? e.message : 'We couldn’t place your order — please try again or call (504) 555-0190.') }
    finally { setPlacing(false) }
  }

  const field = (label: string, key: keyof CheckoutDetails, opts: { type?: string; placeholder?: string; half?: boolean } = {}) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={fieldLabel}>{label}</label>
      <input type={opts.type || 'text'} value={form[key] as string} placeholder={opts.placeholder} onChange={e => set(key, e.target.value)} style={fieldInput} />
    </div>
  )

  // ── Success screen ──
  if (placed) {
    return (
      <Modal open={open} onClose={close} maxWidth={520}>
        <div style={{ textAlign: 'center', padding: '20px 8px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--green-cont)', border: '2px solid var(--green)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Order placed!</h2>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '20px', maxWidth: '360px', margin: '0 auto 20px' }}>
            Thanks, {form.firstName}. We've reserved your container{placedCount > 1 ? 's' : ''} and emailed a confirmation to <strong style={{ color: 'var(--ink)' }}>{form.email}</strong>. Our team will confirm delivery to {form.city}, {form.state} and finalize payment within 2 hours.
          </p>
          <button onClick={close} style={{ padding: '12px 28px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Done</button>
        </div>
      </Modal>
    )
  }

  // ── Empty cart ──
  if (open && cart.length === 0) {
    return (
      <Modal open={open} onClose={close} maxWidth={460}>
        <div style={{ textAlign: 'center', padding: '18px 8px' }}>
          <div style={{ fontSize: '34px', marginBottom: '10px' }}>🛒</div>
          <h2 style={{ fontSize: '19px', fontWeight: 700, marginBottom: '6px' }}>Your cart is empty</h2>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '18px' }}>Browse the marketplace and add a container to buy or rent.</p>
          <button onClick={close} style={{ padding: '11px 24px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Continue Shopping</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={close} maxWidth={860}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '2px' }}>Review your order</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '20px' }}>{cart.length} item{cart.length > 1 ? 's' : ''} · {buyItems.length} to buy · {rentItems.length} to rent</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '24px', alignItems: 'start' }}>
        {/* ── Left: items + forms ── */}
        <div>
          {/* Items */}
          <div style={{ marginBottom: '22px' }}>
            {cart.map(({ container: c, mode, rentTerm }) => {
              const allow = allowedModes(c)
              const bothAllowed = allow.buy && allow.rent
              const rate = c.rentMonthly || 0
              return (
                <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--div)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '54px', height: '40px', borderRadius: 'var(--r8)', background: 'linear-gradient(135deg,#CBD5E8,#A8BFDF)', flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                      {c.photos?.[0] ? <img src={c.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '9px', color: '#fff', fontFamily: 'var(--mono)' }}>{c.size}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{SIZE_LABELS[c.size]} <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink3)', fontWeight: 400 }}>· {c.sku}</span></div>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '1px' }}>Grade {c.grade} · {GRADE_META[c.grade].label}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px' }}>{mode === 'rent' ? `${num(rate)}/mo` : num(c.buyPrice)}</div>
                      {mode === 'rent' && <div style={{ fontSize: '10px', color: 'var(--ink3)' }}>{rentTerm} mo · {num(rate * rentTerm)} total</div>}
                      <button onClick={() => onRemove(c.id)} style={{ fontSize: '11px', color: 'var(--cta)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>Remove</button>
                    </div>
                  </div>

                  {/* Mode + rental term controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '9px', paddingLeft: '66px', flexWrap: 'wrap' }}>
                    {bothAllowed ? (
                      <div style={{ display: 'inline-flex', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--pill)', padding: '2px' }}>
                        {(['buy', 'rent'] as CartMode[]).map(m => {
                          const active = mode === m
                          return (
                            <button key={m} onClick={() => onUpdateItem(c.id, { mode: m })} style={{ padding: '5px 16px', borderRadius: 'var(--pill)', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: active ? 'var(--surf-w)' : 'transparent', color: active ? (m === 'rent' ? 'var(--primary)' : 'var(--green)') : 'var(--ink3)', boxShadow: active ? 'var(--sh1)' : 'none' }}>{m === 'buy' ? 'Buy' : 'Rent'}</button>
                          )
                        })}
                      </div>
                    ) : (
                      <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 'var(--pill)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: mode === 'rent' ? 'var(--pri-c,#D6E4FF)' : 'var(--green-cont)', color: mode === 'rent' ? 'var(--primary)' : 'var(--green)' }}>{mode === 'rent' ? 'Rent only' : 'Buy only'}</span>
                    )}

                    {mode === 'rent' && (
                      <>
                        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Term
                          <select value={String(rentTerm)} onChange={e => onUpdateItem(c.id, { rentTerm: Number(e.target.value) })} style={{ padding: '5px 8px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '12px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)' }}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => <option key={mo} value={mo}>{mo} month{mo > 1 ? 's' : ''}</option>)}
                          </select>
                        </label>
                        <button onClick={onLongTermInquiry} style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', padding: 0 }}>Need 12+ months? Contact us</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Contact */}
          <div style={{ marginBottom: '22px' }}>
            <div style={sectionTitle}>Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('First name', 'firstName', { placeholder: 'Jane' })}
              {field('Last name', 'lastName', { placeholder: 'Smith' })}
              {field('Email', 'email', { type: 'email', placeholder: 'jane@company.com' })}
              {field('Phone', 'phone', { type: 'tel', placeholder: '(504) 555-0000' })}
            </div>
          </div>

          {/* Delivery */}
          <div style={{ marginBottom: '22px' }}>
            <div style={sectionTitle}>Delivery</div>
            {field('Street address', 'address', { placeholder: '5500 Industrial Pkwy' })}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              {field('City', 'city', { placeholder: 'Katy' })}
              {field('State', 'state', { placeholder: 'TX' })}
              {field('ZIP', 'zip', { placeholder: '77493' })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('Preferred delivery date', 'deliveryDate', { type: 'date' })}
              {field('Site access notes', 'accessNotes', { placeholder: 'Gate code, forklift on site…' })}
            </div>
          </div>

          {/* Rental start — only when the cart contains rentals; per-item term is set above */}
          {rentItems.length > 0 && (
            <div style={{ marginBottom: '22px' }}>
              <div style={sectionTitle}>Rental start <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary)', background: 'var(--pri-c,#D6E4FF)', padding: '2px 8px', borderRadius: 'var(--r4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{rentItems.length} rental{rentItems.length > 1 ? 's' : ''}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {field('Rental start date', 'rentStart', { type: 'date' })}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>Set each unit's rental term (1–12 months) in the item list above. Need longer? <button onClick={onLongTermInquiry} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', padding: 0, fontSize: '11px' }}>Contact us</button>.</div>
            </div>
          )}

          {/* Payment — placeholder ahead of live processing */}
          <div>
            <div style={sectionTitle}>Payment</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r8)', padding: '10px 12px', fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '12px' }}>
              <span style={{ flexShrink: 0 }}>🔒</span>
              Secure card processing is activating soon. <strong style={{ color: 'var(--ink)' }}>You won't be charged today</strong> — we confirm availability and collect payment when your order is confirmed.
            </div>
            <div style={{ opacity: 0.6, pointerEvents: 'none' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={fieldLabel}>Card number</label>
                <input disabled placeholder="•••• •••• •••• ••••" style={fieldInput} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div><label style={fieldLabel}>Expiry</label><input disabled placeholder="MM / YY" style={fieldInput} /></div>
                <div><label style={fieldLabel}>CVC</label><input disabled placeholder="123" style={fieldInput} /></div>
                <div><label style={fieldLabel}>Billing ZIP</label><input disabled placeholder="70112" style={fieldInput} /></div>
              </div>
            </div>
          </div>

          {/* Notifications — email required, SMS opt-in */}
          <div>
            <div style={sectionTitle}>Notifications</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}>
              <input type="checkbox" checked={form.notifySms} onChange={e => set('notifySms', e.target.checked)} style={{ width: '17px', height: '17px', accentColor: 'var(--primary)' }} />
              <span style={{ fontSize: '13px' }}>Text me (SMS) when dispatch or my driver sends a message</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" checked disabled style={{ width: '17px', height: '17px', accentColor: 'var(--green)' }} />
              <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>Email me order &amp; message updates <span style={{ color: 'var(--ink3)' }}>· required</span></span>
            </label>
          </div>
        </div>

        {/* ── Right: order summary ── */}
        <div style={{ position: 'sticky', top: '0', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r16)', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Order summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            {buyItems.length > 0 && <Row label={`Purchases (${buyItems.length})`} val={num(buyTotal)} />}
            {rentItems.map(({ container: c, rentTerm }) => (
              <Row key={c.id} label={`Rent · ${rentTerm} mo × $${c.rentMonthly}`} val={num((c.rentMonthly || 0) * rentTerm)} />
            ))}
            {rentItems.length > 0 && <Row label="Refundable deposit" val={num(deposit)} sub />}
            <Row label="Delivery" val="Included" green />
          </div>
          <div style={{ borderTop: '1px solid var(--div)', margin: '12px 0', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Due today</span>
            <span style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)' }}>{num(dueToday)}</span>
          </div>
          {rentItems.length > 0 && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '12px', textAlign: 'right' }}>{num(rentContract)} rental + {num(deposit)} deposit</div>}

          {placeError && (
            <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '10px' }}>
              {placeError}
            </div>
          )}
          <button onClick={place} disabled={!canPlace} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: canPlace ? 'var(--cta)' : 'var(--surf-w)', color: canPlace ? '#fff' : 'var(--ink3)', fontSize: '14px', fontWeight: 700, border: canPlace ? 'none' : '1.5px solid var(--div)', cursor: canPlace ? 'pointer' : 'not-allowed', boxShadow: canPlace ? '0 4px 14px rgba(230,81,0,.3)' : 'none' }}>
            {placing ? 'Placing order…' : `Place order · ${num(dueToday)}`}
          </button>
          {!canPlace && !placing && <div style={{ fontSize: '10px', color: 'var(--ink3)', textAlign: 'center', marginTop: '8px' }}>Complete contact & delivery{rentItems.length > 0 ? ' & rental' : ''} details to continue</div>}
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, val, green, sub }: { label: string; val: string; green?: boolean; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: sub ? 'var(--ink3)' : 'var(--ink2)', fontSize: sub ? '12px' : '13px' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: green ? 'var(--green)' : 'var(--ink)' }}>{val}</span>
    </div>
  )
}

// ── Customer → driver message ──────────────────────────────
function CustomerMessageModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (msg: string) => void }) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [form, setForm] = useState({ name: '', email: '', driverId: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)
  useEffect(() => {
    if (!open) return
    setForm({ name: '', email: '', driverId: '', subject: '', body: '' })
    driversApi.list().then(ds => { const active = ds.filter(d => d.active !== false); setDrivers(active); setForm(f => ({ ...f, driverId: active[0]?.id || '' })) }).catch(() => {})
  }, [open])

  const send = async () => {
    if (sending || !form.driverId || !form.body.trim() || !form.name.trim()) return
    setSending(true)
    try {
      await messagesApi.create({ toDriverId: form.driverId, fromRole: 'customer', fromName: form.name.trim(), fromEmail: form.email.trim(), subject: form.subject.trim() || 'Message from customer', body: form.body.trim() })
      onSent('Message sent to your driver')
      onClose()
    } catch { onSent('Failed to send — please try again') }
    finally { setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={480}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Message your driver</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '18px' }}>Questions about a delivery, pickup, or gate access? Send a note straight to the driver.</p>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}><Input label="Your name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Jane Smith" /></div>
        <div style={{ flex: 1 }}><Input label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="jane@company.com" /></div>
      </div>
      <Select label="Driver" value={form.driverId} onChange={e => setForm(p => ({ ...p, driverId: e.target.value }))}>
        {drivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.vehicle}</option>)}
      </Select>
      <Input label="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="e.g. Delivery access" />
      <div style={{ marginBottom: '13px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Message</label>
        <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={4} placeholder="Write your message…" style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--div)', borderRadius: 'var(--r12)', fontSize: '14px', outline: 'none', fontFamily: 'var(--sans)', resize: 'vertical', background: 'var(--surf-w)' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={send} disabled={sending || !form.driverId || !form.name.trim() || !form.body.trim()}>{sending ? 'Sending…' : 'Send message'}</Button>
      </div>
    </Modal>
  )
}

// ── Bulk / B2B request form ────────────────────────────────
// Submits through the same quotes endpoint as the quote dialog.

function BulkForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ firstName: '', company: '', phone: '', email: '', units: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    if (!form.firstName.trim() || (!form.phone.trim() && !form.email.trim())) {
      setError('Please give us your name and a phone number or email.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await quotes.submit({
        firstName: form.firstName.trim(), lastName: '', phone: form.phone.trim(), email: form.email.trim(),
        deliveryZip: '', need: 'bulk',
        notes: `B2B request${form.company.trim() ? ` — company: ${form.company.trim()}` : ''}${form.units.trim() ? ` — estimated units: ${form.units.trim()}` : ''}`,
      })
      setForm({ firstName: '', company: '', phone: '', email: '', units: '' })
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please call (504) 555-0190.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '28px 30px' }}>
      <Input label="First Name" placeholder="Jane" value={form.firstName} onChange={set('firstName')} />
      <Input label="Company" placeholder="Your Company LLC" value={form.company} onChange={set('company')} />
      <Input label="Phone" type="tel" placeholder="(504) 555-0000" value={form.phone} onChange={set('phone')} />
      <Input label="Email" type="email" placeholder="jane@company.com" value={form.email} onChange={set('email')} />
      <Input label="Estimated Units Needed" type="number" placeholder="10" value={form.units} onChange={set('units')} />
      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
          {error}
        </div>
      )}
      <button onClick={submit} disabled={submitting} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Request B2B Pricing'}
      </button>
      <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '12px', color: 'var(--ink3)' }}>
        Or call us directly: <strong style={{ color: 'var(--ink)' }}>(504) 555-0190</strong> — we respond within 2 hours
      </div>
    </div>
  )
}

// ── Customer Profile ───────────────────────────────────────
// Email-identified profile (no password in the prototype — RBAC will bring
// real customer sign-in). Reads and writes the customer's record in
// customers.csv via the API, and lists their orders from orders.csv.

type ProfileTab = 'account' | 'info' | 'orders'

const PROFILE_TABS: { key: ProfileTab; label: string }[] = [
  { key: 'account', label: 'Account' },
  { key: 'info', label: 'My Info' },
  { key: 'orders', label: 'Orders' },
]

interface ProfileFormState {
  name: string; company: string; email: string; phone: string
  address: string; city: string; state: string; zip: string
  notifySms: boolean
}

const customerToForm = (c: Customer): ProfileFormState => ({
  name: c.name || '', company: c.company || '', email: c.email || '', phone: c.phone || '',
  address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '',
  notifySms: c.notifySms === true,
})

interface CustomerProfileModalProps {
  open: boolean
  initialTab: ProfileTab
  customerEmail: string           // identified email ('' = signed out)
  onClose: () => void
  onIdentify: (email: string) => void
  onSignOut: () => void
  onMessageDriver: () => void
  toast: (msg: string) => void
}

function CustomerProfileModal({ open, initialTab, customerEmail, onClose, onIdentify, onSignOut, onMessageDriver, toast }: CustomerProfileModalProps) {
  const [tab, setTab] = useState<ProfileTab>(initialTab)
  const [emailInput, setEmailInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [myMessages, setMyMessages] = useState<Message[]>([])
  const [form, setForm] = useState<ProfileFormState | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof ProfileFormState, v: string | boolean) => setForm(p => p ? { ...p, [k]: v } : p)

  const lookup = useCallback(async (email: string) => {
    const norm = email.trim().toLowerCase()
    setLoading(true)
    setError('')
    setNotFound(false)
    try {
      const all = await customersApi.list()
      const match = all.find(c => c.active !== false && (c.email || '').trim().toLowerCase() === norm)
      if (!match) {
        setCustomer(null)
        setForm(null)
        setMyOrders([])
        setMyMessages([])
        setNotFound(true)
        return null
      }
      setCustomer(match)
      setForm(customerToForm(match))
      // Order history + driver replies are best-effort — the profile still works without them.
      try {
        const allOrders = await orders.list()
        setMyOrders(allOrders
          .filter(o => o.customerId === match.id || (o.customerEmail || '').trim().toLowerCase() === norm)
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
      } catch { setMyOrders([]) }
      try {
        const allMsgs = await messagesApi.list()
        setMyMessages(allMsgs.filter(m => m.toRole === 'customer' && !m.trashed
          && ((m.toEmail || '').trim().toLowerCase() === norm || (m.toName || '') === match.name)))
      } catch { setMyMessages([]) }
      return match
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile — please try again.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setError('')
    setNotFound(false)
    setEmailInput('')
    setNameInput('')
    if (customerEmail) lookup(customerEmail)
    else { setCustomer(null); setForm(null); setMyOrders([]); setMyMessages([]) }
  }, [open, customerEmail, initialTab, lookup])

  const signIn = async () => {
    const norm = emailInput.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(norm)) { setError('Please enter a valid email address.'); return }
    const match = await lookup(norm)
    if (match) onIdentify(norm)
  }

  const createProfile = async () => {
    const norm = emailInput.trim().toLowerCase()
    if (!nameInput.trim()) { setError('Please enter your name.'); return }
    setLoading(true)
    setError('')
    try {
      await customersApi.create({ name: nameInput.trim(), email: norm, notes: 'Created from marketplace profile' })
      onIdentify(norm)
      await lookup(norm)
      toast('Profile created')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your profile — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    if (!customer || !form) return
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const updated = await customersApi.update(customer.id, {
        name: form.name.trim(), company: form.company.trim(), phone: form.phone.trim(),
        address: form.address.trim(), city: form.city.trim(), state: form.state.trim(), zip: form.zip.trim(),
        notifySms: form.notifySms,
      })
      setCustomer(updated)
      setForm(customerToForm(updated))
      toast('Profile saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your changes — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const unread = myMessages.filter(m => !m.read).length
  // Date-only values (UTC midnight) render in UTC so the calendar day never shifts locally.
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    const dateOnly = /T00:00:00(\.000)?Z$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso)
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : {}) })
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'var(--pri-c,#D6E4FF)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>{customer ? customer.name : 'Your Profile'}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{customer ? customer.email : 'Sign in with the email you order with'}</div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* ── Signed out: email lookup / create ── */}
      {!customer && (
        <div>
          <Input label="Email" type="email" placeholder="jane@company.com" value={emailInput}
            onChange={e => { setEmailInput(e.target.value); setNotFound(false) }}
            onKeyDown={e => e.key === 'Enter' && signIn()} />
          {notFound && (
            <div style={{ background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r12)', padding: '12px 14px', marginBottom: '13px' }}>
              <div style={{ fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.55, marginBottom: '10px' }}>
                We don't have a profile for <strong>{emailInput.trim().toLowerCase()}</strong> yet. Placing an order creates one automatically — or create it now:
              </div>
              <Input label="Your name" placeholder="Jane Smith" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && createProfile()} />
              <Button variant="primary" fullWidth onClick={createProfile} disabled={loading}>{loading ? 'Creating…' : 'Create profile'}</Button>
            </div>
          )}
          {!notFound && (
            <Button variant="primary" fullWidth onClick={signIn} disabled={loading || !emailInput.trim()}>
              {loading ? 'Looking up…' : 'Continue'}
            </Button>
          )}
        </div>
      )}

      {/* ── Signed in ── */}
      {customer && form && (
        <div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--pill)', padding: '3px', marginBottom: '16px' }}>
            {PROFILE_TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--pill)', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: tab === t.key ? 'var(--surf-w)' : 'transparent', color: tab === t.key ? 'var(--primary)' : 'var(--ink3)', boxShadow: tab === t.key ? 'var(--sh1)' : 'none' }}>
                {t.label}{t.key === 'orders' && myOrders.length > 0 ? ` (${myOrders.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'account' && (
            <div>
              <div style={{ background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r12)', padding: '13px 14px', marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink3)', fontWeight: 700, marginBottom: '4px' }}>Signed in as</div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{customer.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{customer.email}</div>
                {customer.company && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{customer.company}</div>}
              </div>

              {/* Notifications */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Notifications</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '6px' }}>
                  <input type="checkbox" checked={form.notifySms} onChange={e => set('notifySms', e.target.checked)} style={{ width: '17px', height: '17px', accentColor: 'var(--primary)' }} />
                  <span style={{ fontSize: '13px' }}>Text me (SMS) about deliveries &amp; driver messages</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" checked disabled style={{ width: '17px', height: '17px', accentColor: 'var(--green)' }} />
                  <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>Email updates <span style={{ color: 'var(--ink3)' }}>· required</span></span>
                </label>
              </div>

              <button onClick={onMessageDriver} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '12px', borderRadius: 'var(--r12)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: '34px', height: '34px', borderRadius: 'var(--r8)', background: 'var(--surf1)', display: 'grid', placeItems: 'center', flexShrink: 0, position: 'relative' }}>
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></svg>
                  {unread > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '15px', height: '15px', padding: '0 3px', borderRadius: '999px', background: 'var(--cta)', color: '#fff', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 700 }}>Message Driver</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--ink3)' }}>{unread > 0 ? `${unread} unread repl${unread > 1 ? 'ies' : 'y'} from your driver` : 'Send a note to your delivery driver'}</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--ink3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 4 14 10 8 16" /></svg>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="primary" onClick={save} disabled={saving} style={{ flex: 1 }}>{saving ? 'Saving…' : 'Save preferences'}</Button>
                <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
              </div>
            </div>
          )}

          {tab === 'info' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                <Input label="Full name" value={form.name} onChange={e => set('name', e.target.value)} />
                <Input label="Company" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Optional" />
              </div>
              <Input label="Phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(504) 555-0000" />
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', margin: '4px 0 8px' }}>Delivery address</div>
              <Input label="Street address" value={form.address} onChange={e => set('address', e.target.value)} placeholder="5500 Industrial Pkwy" />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 10px' }}>
                <Input label="City" value={form.city} onChange={e => set('city', e.target.value)} />
                <Input label="State" value={form.state} onChange={e => set('state', e.target.value)} placeholder="LA" />
                <Input label="ZIP" value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="70112" />
              </div>
              <Button variant="primary" fullWidth onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            </div>
          )}

          {tab === 'orders' && (
            <div>
              {myOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '26px 12px', color: 'var(--ink3)' }}>
                  <div style={{ fontSize: '26px', marginBottom: '8px' }}>📦</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '3px', color: 'var(--ink)' }}>No orders yet</div>
                  <div style={{ fontSize: '12px' }}>Orders placed with {customer.email} will show up here.</div>
                </div>
              ) : (
                <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                  {myOrders.map(o => (
                    <div key={o.id} style={{ padding: '11px 2px', borderBottom: '1px solid var(--div)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700 }}>{o.orderNumber}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink3)' }}>{o.containerSku}</span>
                        <span style={{ marginLeft: 'auto' }}><StatusBadge status={o.status} /></span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--ink3)', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>${(o.amount || 0).toLocaleString()}</span>
                        <span>{o.saleType === 'rent' ? 'Rental' : 'Purchase'}</span>
                        <span>Ordered {fmtDate(o.createdAt)}</span>
                        {o.scheduledDate && <span>{o.status === 'delivered' ? 'Delivered' : 'Delivery'} {fmtDate(o.completedAt || o.scheduledDate)}{o.driverName ? ` · ${o.driverName}` : ''}</span>}
                      </div>
                      {o.deliveryAddress && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '3px' }}>→ {o.deliveryAddress}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Main Marketplace Page ──────────────────────────────────

export default function MarketplacePage() {
  const [activeTab, setActiveTab] = useState<Tab>('buy')
  const ALL_SIZES = SIZE_OPTIONS.map(([v]) => v)
  const [sizeFilters, setSizeFilters] = useState<Set<ContainerSize>>(new Set(ALL_SIZES))
  const [gradeFilters, setGradeFilters] = useState<Set<ContainerGrade>>(new Set(['A', 'B', 'C', 'R', 'X']))
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<SortKey>('price-asc')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quotePurpose, setQuotePurpose] = useState<'quote' | 'contact' | 'rental'>('quote')
  const [zipInput, setZipInput] = useState('')
  const [zipResult, setZipResult] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [msgOpen, setMsgOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountTab, setAccountTab] = useState<ProfileTab>('account')
  // Lightweight identity: the email the customer last ordered/signed in with.
  const [customerEmail, setCustomerEmail] = useState(() => {
    try { return (localStorage.getItem('sbx_customer_email') || '').toLowerCase() } catch { return '' }
  })
  const identify = (email: string) => {
    const norm = email.trim().toLowerCase()
    try { localStorage.setItem('sbx_customer_email', norm) } catch {}
    setCustomerEmail(norm)
  }
  const signOut = () => {
    try { localStorage.removeItem('sbx_customer_email') } catch {}
    setCustomerEmail('')
    setAccountOpen(false)
  }
  // Unread replies addressed to this customer (all customers while signed out).
  const [customerReplies, setCustomerReplies] = useState(0)
  useEffect(() => {
    const load = () => messagesApi.list().then(ms => {
      const unread = ms.filter(m => m.toRole === 'customer' && !m.read && !m.trashed)
      setCustomerReplies((customerEmail
        ? unread.filter(m => (m.toEmail || '').trim().toLowerCase() === customerEmail)
        : unread).length)
    }).catch(() => {})
    load()
    const onFocus = () => { if (document.visibilityState !== 'hidden') load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [customerEmail])
  const browseRef = useRef<HTMLDivElement>(null)
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()

  const { data: allContainers, loading, refetch: refetchContainers } = useContainers()
  const { user } = useAuth()
  // Admin draft-preview is on when signed in as admin, OR forced via ?admin=1
  // in the URL (handy for demos). Use ?admin=0 to force the customer view.
  const adminParam = new URLSearchParams(window.location.search).get('admin')
  const isAdmin = adminParam === '0' ? false : (adminParam !== null || user?.role === 'admin')

  // Only listed inventory is shown publicly. Drafts (awaiting photo
  // documentation), sold, and in-fulfilment units never reach the marketplace —
  // except admins, who additionally see draft units (badged "Draft") for preview.
  const listable = allContainers.filter(
    c => c.status === 'available' || c.status === 'sale_in_progress' || (isAdmin && c.status === 'draft')
  )

  // Respect each container's listingType for the active browse tab:
  // the Buy tab shows buy/both units; the Rent tab shows rent/both units
  // (and only those with a monthly rate).
  const lt = (c: Container) => c.listingType ?? 'both'
  const tabListable = listable.filter(c => {
    if (activeTab === 'rent') return (lt(c) === 'rent' || lt(c) === 'both') && c.rentMonthly != null
    if (activeTab === 'buy') return lt(c) === 'buy' || lt(c) === 'both'
    return true
  })

  // Filter containers. On the Rent tab, "price" means the monthly rate.
  const priceOf = (c: Container) => activeTab === 'rent' ? (c.rentMonthly ?? c.buyPrice) : c.buyPrice
  const filtered = tabListable.filter(c => {
    if (!sizeFilters.has(c.size)) return false
    if (!gradeFilters.has(c.grade)) return false
    if (minPrice && priceOf(c) < Number(minPrice)) return false
    if (maxPrice && priceOf(c) > Number(maxPrice)) return false
    return true
  }).sort((a, b) => {
    if (sort === 'price-asc') return priceOf(a) - priceOf(b)
    if (sort === 'price-desc') return priceOf(b) - priceOf(a)
    if (sort === 'condition') return (b.conditionScore || 0) - (a.conditionScore || 0)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const countBySize = (s: ContainerSize) => tabListable.filter(c => c.size === s).length

  const toggleGrade = (g: ContainerGrade) => {
    setGradeFilters(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  const toggleSize = (s: ContainerSize) => {
    setSizeFilters(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  const checkZip = async () => {
    if (!zipInput || zipInput.length < 5) { setZipResult('Enter a 5-digit ZIP'); return }
    setZipResult('Checking…')
    setZipResult(await estimateDelivery(zipInput))
  }

  const inCart = (id: string) => cart.some(i => i.container.id === id)

  const addToCart = (c: Container, mode: CartMode) => {
    if (inCart(c.id)) { setCartOpen(true); return }
    setCart(prev => [...prev, { container: c, mode, rentTerm: 6 }])
    setSelectedContainer(null)
    toast(`${c.sku} added to cart · ${mode === 'rent' ? 'Rental' : 'Purchase'}`)
  }

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.container.id !== id))
  const updateCartItem = (id: string, patch: Partial<CartItem>) =>
    setCart(prev => prev.map(i => i.container.id === id ? { ...i, ...patch } : i))
  // Rentals longer than 12 months are handled by sales — send them to a rental quote.
  const longTermInquiry = () => { setCartOpen(false); openQuote('rental') }

  // Finalize the order: reserve each container, write a real order row per item, refresh inventory.
  // Items that fail stay in the cart; the checkout modal surfaces the error.
  const placeOrder = async (details: CheckoutDetails) => {
    // Same "street, city, ST zip" shape used by orders.csv and schedule.csv addresses.
    const fullAddress = `${details.address.trim()}, ${details.city.trim()}, ${details.state.trim()} ${details.zip.trim()}`
    const results = await Promise.allSettled(cart.map(async i => {
      // Reserve is best-effort: a failed lock shouldn't lose the sale.
      await containers.reserve(i.container.id).catch(() => {})
      const isRent = i.mode === 'rent'
      const amount = isRent ? (i.container.rentMonthly || 0) * i.rentTerm : i.container.buyPrice
      await orders.create({
        containerId: i.container.id,
        containerSku: i.container.sku,
        customerName: `${details.firstName} ${details.lastName}`.trim(),
        customerEmail: details.email,
        customerPhone: details.phone,
        deliveryAddress: fullAddress,
        deliveryZip: details.zip,
        amount,
        status: 'sale_in_progress',
        saleType: i.mode,
        notifySms: details.notifySms,
        unitCost: i.container.purchaseCost || 0,
        deposit: isRent ? (i.container.rentMonthly || 0) : 0,
        driverHours: 0,           // set when a driver is scheduled
      })
    }))
    const failedIds = new Set(cart.filter((_, idx) => results[idx].status === 'rejected').map(i => i.container.id))
    setCart(prev => prev.filter(i => failedIds.has(i.container.id)))
    // Remember the buyer so the Profile modal recognizes them next visit.
    if (details.email.trim()) {
      try { localStorage.setItem('sbx_customer_email', details.email.trim().toLowerCase()) } catch {}
      setCustomerEmail(details.email.trim().toLowerCase())
    }
    await refetchContainers()
    if (failedIds.size > 0) {
      throw new Error(failedIds.size === cart.length
        ? 'Your order could not be placed — please try again or call (504) 555-0190.'
        : `${cart.length - failedIds.size} of ${cart.length} items were ordered, but ${failedIds.size} failed and stayed in your cart. Please retry those.`)
    }
  }

  const openQuote = (purpose: 'quote' | 'contact' | 'rental') => {
    setQuotePurpose(purpose)
    setSelectedContainer(null)
    setQuoteOpen(true)
  }

  return (
    <div style={{ fontFamily: 'var(--sans)', background: 'var(--pg)', color: 'var(--ink)', minHeight: '100vh' }}>
      {/* ── Nav ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400, height: 'var(--nav-h)', background: 'var(--surf-w)', borderBottom: '1px solid var(--div)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '14px' }}>
        <a href="/" onClick={e => { e.preventDefault(); setActiveTab('buy'); setSelectedContainer(null); window.scrollTo({ top: 0 }) }} title="Back to Buy" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none', flexShrink: 0, cursor: 'pointer' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--r8)', background: 'var(--primary)', display: 'grid', placeItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="6" width="22" height="14" rx="2" /><line x1="6" y1="6" x2="6" y2="20" /><line x1="11" y1="6" x2="11" y2="20" /><line x1="16" y1="6" x2="16" y2="20" /></svg>
          </div>
          <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.4px' }}><span style={{ color: '#2B7FD4' }}>Steel</span><span style={{ color: 'var(--cta)' }}>Box</span></span>
        </a>
        <nav style={{ display: 'flex', gap: '2px', marginLeft: '12px' }}>
          {(['buy', 'rent', 'custom', 'bulk'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{ padding: '6px 13px', borderRadius: 'var(--pill)', fontSize: '13px', fontWeight: 600, color: activeTab === t ? '#fff' : 'var(--ink3)', background: activeTab === t ? 'var(--primary)' : 'transparent', border: 'none', cursor: 'pointer' }}
            >
              {t === 'buy' ? 'Buy' : t === 'rent' ? 'Rent' : t === 'custom' ? 'Custom Builds' : 'Bulk / B2B'}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <button onClick={() => openQuote('contact')} style={{ padding: '7px 16px', borderRadius: 'var(--pill)', background: 'transparent', border: '1.5px solid var(--div)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Contact Us</button>
          <button onClick={() => setCartOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: 'var(--pill)', background: 'var(--cta)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h2.5l2 9h9l2-7H5" /><circle cx="8" cy="17.5" r="1.5" fill="#fff" stroke="none" /><circle cx="13" cy="17.5" r="1.5" fill="#fff" stroke="none" /></svg>
            Cart <span style={{ background: 'rgba(255,255,255,.25)', padding: '0 6px', borderRadius: '99px', fontSize: '10px', marginLeft: '2px' }}>{cart.length}</span>
          </button>
          <button onClick={() => setProfileOpen(true)} title={customerReplies > 0 ? `${customerReplies} new message${customerReplies > 1 ? 's' : ''} from your driver` : 'Profile'} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '50%', background: 'transparent', border: '1.5px solid var(--div)', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
            {customerReplies > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '16px', height: '16px', padding: '0 3px', borderRadius: '999px', background: 'var(--cta)', border: '2px solid var(--surf-w)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="9" height="9" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></svg>
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ marginTop: 'var(--nav-h)', background: '#0B1629', padding: (activeTab === 'custom' || activeTab === 'bulk') ? '14px 48px 16px' : '22px 48px 24px', display: 'flex', alignItems: 'center', gap: '48px', position: 'relative', overflow: 'hidden' }}>
        <img src="https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?w=1600&q=80" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 60%', opacity: 0.28, pointerEvents: 'none' }} />
        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 'var(--pill)', padding: '5px 14px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', marginBottom: '14px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4DFFB4', animation: 'pulse 2s ease infinite', flexShrink: 0 }} />
            Now Serving the Gulf Coast · 200-Mile Radius from New Orleans
          </div>
          <h1 style={{ fontSize: 'clamp(22px,2.6vw,40px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.5px', color: '#fff', marginBottom: (activeTab === 'custom' || activeTab === 'bulk') ? '10px' : '12px', whiteSpace: 'nowrap' }}>
            {activeTab === 'custom' ? <>Custom Container Builds.</> : activeTab === 'bulk' ? <>Bulk &amp; B2B Orders.</> : <>Steel Containers. <em style={{ fontStyle: 'normal', color: '#60A5FA' }}>Delivered in Days.</em></>}
          </h1>
          {activeTab !== 'custom' && activeTab !== 'bulk' && (
            <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'rgba(255,255,255,.9)', marginBottom: '14px', fontWeight: 600 }}>
              Buy or rent field-inspected ISO containers — 20ft and 40ft — with transparent pricing, 12-photo documentation, and fast delivery across LA, TX, MS, AL, AR, and the Florida Panhandle.
            </p>
          )}
          {/* Solid orange accent rule */}
          <div style={{ height: '4px', width: '100%', maxWidth: '520px', background: 'var(--cta)', borderRadius: '2px' }} />
        </div>

        {/* ZIP card — only on Buy/Rent */}
        {activeTab !== 'custom' && activeTab !== 'bulk' && (
        <div style={{ flexShrink: 0, width: '340px', background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 'var(--r24)', padding: '24px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Check delivery to your address</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.5)', marginBottom: '16px' }}>Enter your ZIP — we'll confirm coverage and estimated date.</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <input
              value={zipInput}
              onChange={e => setZipInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && checkZip()}
              placeholder="Enter ZIP code"
              maxLength={5}
              style={{ flex: 1, padding: '11px 14px', background: 'rgba(255,255,255,.1)', border: '1.5px solid rgba(255,255,255,.18)', borderRadius: 'var(--r12)', color: '#fff', fontFamily: 'var(--mono)', fontSize: '15px', fontWeight: 500, letterSpacing: '2px', outline: 'none' }}
            />
            <button onClick={checkZip} style={{ padding: '11px 16px', borderRadius: 'var(--r12)', background: 'var(--cta)', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Check</button>
          </div>
          {zipResult && <div style={{ fontSize: '12px', color: isZipCovered(zipInput) ? '#4DFFB4' : 'rgba(255,255,255,.5)', fontWeight: isZipCovered(zipInput) ? 600 : 400 }}>{zipResult}</div>}
          {!zipResult && <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(77,255,180,.08)', border: '1px solid rgba(77,255,180,.2)', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '11px', color: 'rgba(255,255,255,.65)' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4DFFB4', flexShrink: 0 }} />Serving LA · MS · AL · TX · AR · FL Panhandle</div>}
        </div>
        )}
      </section>

      {/* ── Browse panel ── */}
      {(activeTab === 'buy' || activeTab === 'rent') && (
        <div ref={browseRef} style={{ display: 'flex', width: '100%' }}>
          {/* Sidebar */}
          <aside style={{ width: 'var(--sb-w)', flexShrink: 0, borderRight: '1px solid var(--div)', padding: '14px 10px', position: 'sticky', top: 'var(--nav-h)', height: 'calc(100vh - var(--nav-h))', overflowY: 'auto', background: 'var(--surf-w)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.4px' }}>Filters</span>
              <button onClick={() => { setSizeFilters(new Set(ALL_SIZES)); setGradeFilters(new Set(['A','B','C','R','X'])) }} style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}>Select All</button>
            </div>

            {/* Sort */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Sort By</span>
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', fontSize: '12px', cursor: 'pointer', outline: 'none', fontFamily: 'var(--sans)' }}>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="condition">Best Condition First</option>
                <option value="newest">Newest Listed</option>
              </select>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

            {/* Size filters */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Size</span>
              {SIZE_OPTIONS.map(([val, label]) => (
                <div key={val} onClick={() => toggleSize(val)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                  <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: sizeFilters.has(val) ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${sizeFilters.has(val) ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {sizeFilters.has(val) && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1 }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)' }}>{countBySize(val)}</span>
                </div>
              ))}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

            {/* Grade filters */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Condition Grade</span>
              {(['A','B','C','R','X'] as ContainerGrade[]).map(g => (
                <div key={g} onClick={() => toggleGrade(g)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                  <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: gradeFilters.has(g) ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${gradeFilters.has(g) ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {gradeFilters.has(g) && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1 }}>
                    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, background: GRADE_META[g].color, color: '#fff', marginRight: '5px' }}>{g}</span>
                    {GRADE_META[g].label}
                  </span>
                </div>
              ))}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

            {/* Price range */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Price Range</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Min $" type="number" style={{ padding: '7px 9px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '12px', outline: 'none' }} />
                <input value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Max $" type="number" style={{ padding: '7px 9px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '12px', outline: 'none' }} />
              </div>
            </div>
          </aside>

          {/* Grid area */}
          <div style={{ flex: 1, padding: '18px 18px 60px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{filtered.length} containers</span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>· Gulf Coast region</span>
            </div>

            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', height: '260px', animation: 'pulse 1.5s ease infinite' }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink3)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>No containers match your filters</div>
                <div style={{ fontSize: '13px' }}>Try adjusting grade or price filters, or call us directly.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                {filtered.map(c => (
                  <ContainerCard key={c.id} container={c} onSelect={setSelectedContainer} mode={activeTab === 'rent' ? 'rent' : 'buy'} inCart={inCart(c.id)} onAddToCart={addToCart} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Custom Builds panel ── */}
      {activeTab === 'custom' && (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 20px 80px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '4px' }}>Custom Container Builds</h2>
            <p style={{ fontSize: '13px', color: 'var(--ink3)' }}>Modified to your specs — roll-up doors, personnel doors, windows, electrics, and more. Built at our Houston depot and delivered ready to use.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
            {CUSTOM_BUILDS.map(cb => (
              <div key={cb.name} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh1)' }}
              >
                <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg,#1E293B,#0F2D4A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '28px' }}>🔧</span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,.4)', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase' }}>{cb.tag}</span>
                </div>
                <div style={{ padding: '14px 15px 16px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: 'var(--slate-cont)', color: 'var(--slate)', marginBottom: '8px' }}>{cb.tag}</span>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{cb.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.55, marginBottom: '12px' }}>{cb.desc}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '14px' }}>
                    {cb.features.map(f => <span key={f} style={{ padding: '3px 9px', borderRadius: 'var(--r4)', background: 'var(--surf1)', color: 'var(--ink2)', fontSize: '11px' }}>{f}</span>)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--ink3)' }}>From</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)' }}>${cb.fromPrice.toLocaleString()}</div>
                    </div>
                    <button onClick={() => openQuote('quote')} style={{ padding: '7px 16px', borderRadius: 'var(--pill)', background: 'var(--slate)', color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Get Quote</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── B2B / Bulk panel ── */}
      {activeTab === 'bulk' && (
        <div style={{ maxWidth: '540px', margin: '0 auto', padding: '56px 20px 80px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '8px' }}>Bulk & B2B Pricing</h2>
          <p style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.65, marginBottom: '24px' }}>
            Purchasing 5+ units or need ongoing rental supply? We offer volume discounts, ACH payment terms, dedicated account management, and priority inventory access.
          </p>
          <BulkForm onSuccess={() => toast('Request submitted! We\'ll call you within 2 hours.')} />
        </div>
      )}

      {/* ── Trust bar ── */}
      <div style={{ background: 'var(--ink)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '36px', flexWrap: 'wrap' }}>
        {[
          { icon: '🛡', text: 'Field-inspected every unit' },
          { icon: '🚚', text: '3–5 day delivery' },
          { icon: '📷', text: '12-photo documentation' },
          { icon: '📅', text: 'Flexible rental terms' },
          { icon: '✓', text: 'Lifetime warranty' },
        ].map(item => (
          <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '9px', color: 'rgba(255,255,255,.65)', fontSize: '12px', fontWeight: 500 }}>
            <div style={{ width: '30px', height: '30px', borderRadius: 'var(--r8)', background: 'rgba(255,255,255,.07)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{item.icon}</div>
            {item.text}
          </div>
        ))}
      </div>

      {/* ── Container detail modal ── */}
      <DetailModal
        container={selectedContainer}
        onClose={() => setSelectedContainer(null)}
        onAddToCart={addToCart}
        mode={activeTab === 'rent' ? 'rent' : 'buy'}
        inCart={selectedContainer ? inCart(selectedContainer.id) : false}
        index={selectedContainer ? filtered.findIndex(c => c.id === selectedContainer.id) : -1}
        total={filtered.length}
        onNavigate={dir => {
          const i = filtered.findIndex(c => c.id === selectedContainer?.id)
          const next = filtered[i + dir]
          if (next) setSelectedContainer(next)
        }}
      />

      {/* ── Cart / checkout ── */}
      <CartModal
        open={cartOpen}
        cart={cart}
        onClose={() => setCartOpen(false)}
        onRemove={removeFromCart}
        onUpdateItem={updateCartItem}
        onLongTermInquiry={longTermInquiry}
        onPlaceOrder={placeOrder}
      />

      {/* ── Quote dialog ── */}
      <QuoteDialog
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        title={quotePurpose === 'contact' ? 'Contact Us' : quotePurpose === 'rental' ? 'Get a Rental Quote' : 'Request a Quote'}
        subtitle={`Tell us about your project and we'll follow up within 2 hours — or call (504) 555-0190.`}
        defaultNeed={quotePurpose === 'rental' ? 'rent-short' : ''}
        onSuccess={() => toast('Request submitted! We\'ll be in touch within 2 hours.')}
      />

      {/* ── Profile menu ── */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth={380}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'var(--primary-cont)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700 }}>Your Profile</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Manage your account &amp; orders</div>
          </div>
        </div>
        {([
          { key: 'account', label: 'My Account', desc: 'Sign-in, billing & preferences', icon: <><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></> },
          { key: 'info', label: 'My Info', desc: 'Contact details & delivery addresses', icon: <><rect x="3" y="4" width="14" height="12" rx="2" /><line x1="6" y1="8" x2="14" y2="8" /><line x1="6" y1="11.5" x2="11" y2="11.5" /></> },
          { key: 'message', label: 'Message Driver', desc: 'Send a note to your delivery driver', icon: <><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></> },
        ] as const).map(item => (
          <button
            key={item.key}
            onClick={() => {
              setProfileOpen(false)
              if (item.key === 'message') setMsgOpen(true)
              else { setAccountTab(item.key === 'info' ? 'info' : 'account'); setAccountOpen(true) }
            }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '8px', borderRadius: 'var(--r12)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ width: '34px', height: '34px', borderRadius: 'var(--r8)', background: 'var(--surf1)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 700 }}>{item.label}</span>
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--ink3)' }}>{item.desc}</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--ink3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 4 14 10 8 16" /></svg>
          </button>
        ))}
      </Modal>

      {/* ── Account / My Info / Orders ── */}
      <CustomerProfileModal
        open={accountOpen}
        initialTab={accountTab}
        customerEmail={customerEmail}
        onClose={() => setAccountOpen(false)}
        onIdentify={identify}
        onSignOut={signOut}
        onMessageDriver={() => { setAccountOpen(false); setMsgOpen(true) }}
        toast={toast}
      />

      <CustomerMessageModal open={msgOpen} onClose={() => setMsgOpen(false)} onSent={(m) => toast(m)} />

      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
