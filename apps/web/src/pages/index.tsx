// ============================================================
// Gatorworx Marketplace — Public storefront
// Route: / (public, no auth required)
// Design source: Marketplace.dc.html
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { GradeBadge, StatusBadge, Button, Modal, Snackbar, Input, Select, BuildClipart } from '../components/ui'
import { useContainers, useSnackbar, useAuth, useIsMobile } from '../hooks'
import { LoginForm } from '../lib/auth'
import { auth as authApi, containers, quotes, orders, isZipCovered, estimateDelivery, drivers as driversApi, messages as messagesApi, customers as customersApi, customBuilds as customBuildsApi, depots as depotsApi, photoUrl, SHOT_LABELS, CUSTOM_STAGES, type Container, type ContainerGrade, type ContainerSize, type Driver, type Customer, type Order, type Message, type AuthUser, type CustomBuild, type ContainerCondition, type Depot, SIZE_LABEL } from '../lib/api'

// ── Types ─────────────────────────────────────────────────

type Tab = 'buy' | 'rent' | 'custom' | 'bulk'
type SortKey = 'price-asc' | 'price-desc' | 'condition' | 'newest' | 'new-first'
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

// Canonical labels live in lib/api (SIZE_LABEL) so admin + storefront stay in sync.
const SIZE_LABELS = SIZE_LABEL

// Canonical ordered size list for filters and forms.
const SIZE_OPTIONS = Object.entries(SIZE_LABELS) as [ContainerSize, string][]

// Every unit is either factory-new or pre-owned; rows missing the field
// (pre-migration data) are treated as used.
const condOf = (c: Container): ContainerCondition => c.condition === 'new' ? 'new' : 'used'

// Custom Builds are data-driven (custombuilds.csv, managed in Admin →
// Settings). Each card shows the uploaded product photo, or clean clipart
// (the default view) until a real shot exists.

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
  const allow = allowedModes(container) // the unit's own listing capability
  const isLocked = status === 'sale_in_progress'
  const isDraft = status === 'draft' // admin-only preview — not purchasable yet
  // Lead with the browse tab's mode when the unit supports it; otherwise
  // whatever it does support (rent-only always leads with the monthly rate).
  const rentLead = allow.rent && (mode === 'rent' || !allow.buy)
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
        {photos?.filter(Boolean)[0] ? (
          <img
            src={photoUrl(photos.filter(Boolean)[0])}
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
          {/* Chip reflects the unit's actual listing capability, not the tab */}
          <span style={{
            flexShrink: 0, padding: '2px 8px', borderRadius: 'var(--r4)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
            background: allow.buy && allow.rent ? '#EDE9FE' : allow.rent ? 'var(--pri-c,#D6E4FF)' : 'var(--green-cont)',
            color: allow.buy && allow.rent ? '#6D28D9' : allow.rent ? 'var(--primary)' : 'var(--green)',
          }}>
            {allow.buy && allow.rent ? 'Buy · Rent' : allow.rent ? 'Rent' : 'Buy'}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink3)', letterSpacing: '0.3px' }}>{sku}</div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          <span style={{ background: condOf(container) === 'new' ? 'var(--green-cont)' : 'var(--surf1)', color: condOf(container) === 'new' ? 'var(--green)' : 'var(--ink2)', borderRadius: 'var(--r4)', padding: '3px 7px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{condOf(container) === 'new' ? 'New' : 'Used'}</span>
          <span style={{ background: 'var(--surf1)', borderRadius: 'var(--r4)', padding: '3px 7px', fontSize: '10px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{gradeMeta.label}</span>
          {container.color && <span style={{ background: 'var(--surf1)', borderRadius: 'var(--r4)', padding: '3px 7px', fontSize: '10px', color: 'var(--ink2)' }}>{container.color}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--div)' }}>
          {rentLead ? (
            <div>
              <div style={{ fontSize: '21px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.3px' }}>${rentMonthly}<span style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>/mo</span></div>
              <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '1px' }}>{allow.buy ? `or $${buyPrice.toLocaleString()} to buy` : 'Rental only'}</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '21px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.3px' }}>${buyPrice.toLocaleString()}</div>
              <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '1px' }}>{allow.rent && rentMonthly ? `or $${rentMonthly}/mo rental` : 'One-time purchase'}</div>
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
// The 12 field photos are the frames of a 360° spin; missing frames fall
// back to a rotatable 3D container model (drag to rotate around it).
// SHOT_LABELS comes from lib/api so slots match the field app + admin exactly.

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
          {photos[frame]
            ? <img src={photoUrl(photos[frame])} alt={SHOT_LABELS[frame]} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <Container3D size={container.size} grade={container.grade} rotY={rotY} rotX={rotX} />}
        </div>
        <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,87,184,.9)', color: '#fff', borderRadius: 'var(--r4)', padding: '4px 10px', fontSize: '10px', fontWeight: 700 }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"><path d="M3 10a7 7 0 0 1 12-5" /><path d="M17 10a7 7 0 0 1-12 5" /><polyline points="15,2 15,5 12,5" /><polyline points="5,18 5,15 8,15" /></svg>
          360° · drag to rotate
        </div>
        <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.55)', borderRadius: 'var(--pill)', padding: '3px 10px', fontFamily: 'var(--mono)', fontSize: '10px', color: '#fff', whiteSpace: 'nowrap' }}>{frame + 1} / 12 · {SHOT_LABELS[frame]}{photos.filter(Boolean).length ? ` · ${photos.slice(0, 12).filter(Boolean).length} field photos` : ''}</div>
      </div>
      {/* 12 photo frames — slot i is always the same labelled shot as the field app */}
      <div style={{ display: 'flex', gap: '3px', padding: '6px', background: '#060F1E', overflowX: 'auto' }}>
        {SHOT_LABELS.map((label, i) => (
          <button key={i} onClick={() => { setRotY(i * 30); setRotX(-12) }} title={label}
            style={{ width: '74px', height: '52px', flexShrink: 0, borderRadius: 'var(--r4)', overflow: 'hidden', cursor: 'pointer', border: `2px solid ${i === frame ? 'var(--cta)' : 'transparent'}`, background: '#162030', color: 'rgba(255,255,255,.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '3px' }}>
            {photos[i]
              ? <img src={photoUrl(photos[i])} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
  const isMobile = useIsMobile()
  const [delivery, setDelivery] = useState('Enter your ZIP above')
  const [zip, setZip] = useState('')
  // The shopper picks Buy vs Rent right in the modal (seeded from the active
  // browse tab, constrained to what this unit's listingType allows).
  const [txn, setTxn] = useState<CartMode>(mode)

  // Reset the gallery (and ZIP result) whenever the viewed container changes.
  useEffect(() => {
    setDelivery('Enter your ZIP above'); setZip('')
    if (container) {
      const allow = allowedModes(container)
      setTxn(mode === 'rent' ? (allow.rent ? 'rent' : 'buy') : (allow.buy ? 'buy' : 'rent'))
    }
  }, [container?.id, mode]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: '22px', padding: isMobile ? '18px 18px 22px' : '22px 26px 26px' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.5px', marginBottom: '3px' }}>{sku}</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '14px' }}>
            {SIZE_LABELS[size]} Container
          </h2>
          {/* Grade card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surf1)', borderRadius: 'var(--r12)', padding: '13px 14px', marginBottom: '16px', border: '1px solid var(--div)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--r12)', background: gradeMeta.color, display: 'grid', placeItems: 'center', fontSize: '24px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{grade}</div>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink3)', fontWeight: 700 }}>Condition Grade</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>{condOf(container) === 'new' ? 'New' : 'Used'} · Grade {grade} — {gradeMeta.label}{container.color ? ` · ${container.color}` : ''}</div>
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
          {/* Buy vs Rent — the shopper's first decision, front and center.
              Only the options this unit actually offers are shown: rent-only
              units show just Rent, buy-only just Buy, both show the toggle. */}
          {(() => {
            const allow = allowedModes(container)
            const seg = (m: CartMode, title: string, price: string) => {
              const active = txn === m
              const color = m === 'rent' ? 'var(--primary)' : 'var(--green)'
              return (
                <button
                  key={m}
                  onClick={() => setTxn(m)}
                  style={{ flex: 1, padding: '10px 6px', borderRadius: 'var(--r12)', border: `2px solid ${active ? color : 'var(--div)'}`, background: active ? (m === 'rent' ? 'var(--pri-c,#D6E4FF)' : 'var(--green-cont)') : 'var(--surf-w)', cursor: 'pointer', textAlign: 'center' }}
                >
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: active ? color : 'var(--ink3)' }}>{title}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: '15px', fontWeight: 700, marginTop: '2px', color: active ? 'var(--ink)' : 'var(--ink2)' }}>{price}</span>
                </button>
              )
            }
            return (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                {allow.buy && seg('buy', 'Buy', `$${buyPrice.toLocaleString()}`)}
                {allow.rent && seg('rent', 'Rent', rentMonthly ? `$${rentMonthly}/mo` : '—')}
              </div>
            )
          })()}
          <div style={{ fontSize: '30px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.4px' }}>
            {txn === 'rent'
              ? (rentMonthly ? <>${rentMonthly}<span style={{ fontSize: '15px', color: 'var(--ink3)', fontWeight: 600 }}>/mo</span></> : 'Call for pricing')
              : `$${buyPrice.toLocaleString()}`}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px', marginBottom: '14px' }}>
            {txn === 'rent' ? 'Monthly rental rate · one-month refundable deposit' : 'One-time purchase price · delivery included'}
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
            onClick={() => { if (!cannotBuy) onAddToCart(container, txn) }}
            disabled={cannotBuy}
            style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: cannotBuy ? 'var(--surf1)' : 'var(--cta)', color: cannotBuy ? 'var(--ink3)' : '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: cannotBuy ? 'not-allowed' : 'pointer', boxShadow: cannotBuy ? 'none' : '0 4px 14px rgba(230,81,0,.3)', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {isDraft ? 'Not Listed (Draft)' : isLocked ? 'Currently Reserved' : inCart ? 'In Cart ✓' : (
              <>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h2.5l2 9h9l2-7H5" /><circle cx="8" cy="17.5" r="1.5" fill="#fff" stroke="none" /><circle cx="13" cy="17.5" r="1.5" fill="#fff" stroke="none" /></svg>
                {txn === 'rent' ? 'Add to Cart — Rent' : 'Add to Cart — Buy'}
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
  user: AuthUser | null          // checkout requires a signed-in account
  onClose: () => void
  onRemove: (id: string) => void
  onUpdateItem: (id: string, patch: Partial<CartItem>) => void
  onLongTermInquiry: () => void
  onPlaceOrder: (d: CheckoutDetails) => Promise<void>
}

const fieldLabel: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }
const fieldInput: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)' }
const sectionTitle: React.CSSProperties = { fontSize: '14px', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }

function CartModal({ open, cart, user, onClose, onRemove, onUpdateItem, onLongTermInquiry, onPlaceOrder }: CartModalProps) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState<CheckoutDetails>(EMPTY_CHECKOUT)
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [placedCount, setPlacedCount] = useState(0)
  // SMS two-factor — required on EVERY order (initial and subsequent).
  const [twoFa, setTwoFa] = useState<{ stage: 'idle' | 'code'; sending: boolean; code: string; devCode: string; error: string }>(
    { stage: 'idle', sending: false, code: '', devCode: '', error: '' })

  const set = (k: keyof CheckoutDetails, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  // Prefill contact details from the signed-in account.
  useEffect(() => {
    if (!open || !user) return
    setForm(p => ({
      ...p,
      email: p.email || user.email,
      firstName: p.firstName || (user.name || '').split(/\s+/)[0] || '',
      lastName: p.lastName || (user.name || '').split(/\s+/).slice(1).join(' '),
      phone: p.phone || user.phone || '',
    }))
  }, [open, user])

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

  const close = () => { onClose(); setTimeout(() => { setPlaced(false); setPlaceError(''); setForm(EMPTY_CHECKOUT); setTwoFa({ stage: 'idle', sending: false, code: '', devCode: '', error: '' }) }, 200) }

  const place = async () => {
    setPlacing(true)
    setPlaceError('')
    setPlacedCount(cart.length)
    try { await onPlaceOrder(form); setPlaced(true) }
    catch (e) { setPlaceError(e instanceof Error ? e.message : 'We couldn’t place your order — please try again or call (504) 555-0190.') }
    finally { setPlacing(false) }
  }

  // Step 1: text a 6-digit code to the mobile number on the order.
  const sendCode = async () => {
    if (!canPlace || twoFa.sending) return
    setTwoFa(t => ({ ...t, sending: true, error: '' }))
    try {
      const r = await authApi.twoFaSend(form.phone)
      setTwoFa({ stage: 'code', sending: false, code: '', devCode: r.devCode || '', error: '' })
    } catch (e) {
      setTwoFa(t => ({ ...t, sending: false, error: e instanceof Error ? e.message : 'Could not send the code — check the phone number' }))
    }
  }
  // Step 2: verify the code, then place the order.
  const verifyAndPlace = async () => {
    if (twoFa.sending || placing) return
    setTwoFa(t => ({ ...t, sending: true, error: '' }))
    try {
      await authApi.twoFaVerify(twoFa.code)
      setTwoFa(t => ({ ...t, sending: false }))
      await place()
    } catch (e) {
      setTwoFa(t => ({ ...t, sending: false, error: e instanceof Error ? e.message : 'Verification failed — try again' }))
    }
  }
  // Admin/driver test orders skip customer SMS verification (server allows it).
  const needsTwoFa = !!user && user.role === 'customer'

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

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 300px', gap: '24px', alignItems: 'start' }}>
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
                      {c.photos?.filter(Boolean)[0] ? <img src={photoUrl(c.photos.filter(Boolean)[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '9px', color: '#fff', fontFamily: 'var(--mono)' }}>{c.size}</span>}
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

          {!user ? (
            /* ── Step 0: checkout requires an account ── */
            <div style={{ borderTop: '1px solid var(--div)', paddingTop: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Sign in to complete your order</div>
              <LoginForm allowRegister subtitle="Orders are tied to your Gatorworx account so you can track delivery and message your driver." />
            </div>
          ) : !needsTwoFa ? (
            <button onClick={place} disabled={!canPlace || placing} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: canPlace ? 'var(--cta)' : 'var(--surf-w)', color: canPlace ? '#fff' : 'var(--ink3)', fontSize: '14px', fontWeight: 700, border: canPlace ? 'none' : '1.5px solid var(--div)', cursor: canPlace ? 'pointer' : 'not-allowed', boxShadow: canPlace ? '0 4px 14px rgba(230,81,0,.3)' : 'none' }}>
              {placing ? 'Placing order…' : `Place order · ${num(dueToday)}`}
            </button>
          ) : twoFa.stage === 'idle' ? (
            /* ── Step 1: text a verification code (required on every order) ── */
            <div>
              <button onClick={sendCode} disabled={!canPlace || twoFa.sending} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: canPlace ? 'var(--primary)' : 'var(--surf-w)', color: canPlace ? '#fff' : 'var(--ink3)', fontSize: '14px', fontWeight: 700, border: canPlace ? 'none' : '1.5px solid var(--div)', cursor: canPlace ? 'pointer' : 'not-allowed' }}>
                {twoFa.sending ? 'Sending code…' : '📱 Text me a verification code'}
              </button>
              <div style={{ fontSize: '10px', color: 'var(--ink3)', textAlign: 'center', marginTop: '8px', lineHeight: 1.5 }}>
                Every order is confirmed with a code texted to your mobile{form.phone ? ` (${form.phone})` : ''}.
              </div>
            </div>
          ) : (
            /* ── Step 2: enter the code, then the order places ── */
            <div style={{ background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r12)', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Enter the 6-digit code we texted to {form.phone}</div>
              {twoFa.devCode && (
                <div style={{ fontSize: '11px', color: 'var(--ink3)', background: 'var(--amb-c,#FEF3C7)', borderRadius: 'var(--r8)', padding: '6px 9px', marginBottom: '8px' }}>
                  Dev mode — no SMS gateway connected. Your code: <strong style={{ fontFamily: 'var(--mono)' }}>{twoFa.devCode}</strong>
                </div>
              )}
              <input
                value={twoFa.code}
                onChange={e => setTwoFa(t => ({ ...t, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                onKeyDown={e => e.key === 'Enter' && twoFa.code.length === 6 && verifyAndPlace()}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
                style={{ width: '100%', padding: '11px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '20px', letterSpacing: '8px', textAlign: 'center', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
              />
              {twoFa.error && <div style={{ color: '#B3261E', fontSize: '11px', marginBottom: '8px' }}>{twoFa.error}</div>}
              <button onClick={verifyAndPlace} disabled={twoFa.code.length !== 6 || twoFa.sending || placing}
                style={{ width: '100%', padding: '13px', borderRadius: 'var(--pill)', background: twoFa.code.length === 6 ? 'var(--cta)' : 'var(--surf-w)', color: twoFa.code.length === 6 ? '#fff' : 'var(--ink3)', fontSize: '14px', fontWeight: 700, border: twoFa.code.length === 6 ? 'none' : '1.5px solid var(--div)', cursor: twoFa.code.length === 6 ? 'pointer' : 'not-allowed' }}>
                {placing ? 'Placing order…' : twoFa.sending ? 'Verifying…' : `Verify & place order · ${num(dueToday)}`}
              </button>
              <button onClick={sendCode} disabled={twoFa.sending} style={{ width: '100%', marginTop: '6px', padding: '8px', borderRadius: 'var(--pill)', background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                Resend code
              </button>
            </div>
          )}
          {user && !canPlace && !placing && <div style={{ fontSize: '10px', color: 'var(--ink3)', textAlign: 'center', marginTop: '8px' }}>Complete contact & delivery{rentItems.length > 0 ? ' & rental' : ''} details to continue</div>}
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

// ── Order a Custom Build ───────────────────────────────────
// Open to everyone — no account needed. Estimates are confirmed over the
// phone, so we just collect name, phone, email, and the delivery address.

function OrderBuildModal({ build, user, onClose, onPlaced, toast }: {
  build: CustomBuild | null
  user: AuthUser | null
  onClose: () => void
  onPlaced: () => void
  toast: (m: string) => void
}) {
  const [form, setForm] = useState({ size: '20ft-std' as ContainerSize, name: '', company: '', phone: '', email: '', address: '', city: '', state: '', zip: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [placed, setPlaced] = useState<Order | null>(null)

  useEffect(() => {
    if (!build) return
    setPlaced(null)
    setError('')
    if (user) setForm(p => ({ ...p, name: p.name || user.name || '', phone: p.phone || user.phone || '', email: p.email || user.email }))
  }, [build?.id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!build) return null
  const set = (k: keyof typeof form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))
  const ready = form.name.trim() && form.phone.trim() && /^\S+@\S+\.\S+$/.test(form.email.trim())
    && form.address.trim() && form.city.trim() && form.state.trim() && form.zip.trim()

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const fullAddress = `${form.address.trim()}, ${form.city.trim()}, ${form.state.trim()} ${form.zip.trim()}`
      const r = await customBuildsApi.order(build.id, {
        size: form.size, customerName: form.name.trim(), customerPhone: form.phone.trim(),
        customerEmail: form.email.trim(), company: form.company.trim(),
        deliveryAddress: fullAddress, deliveryZip: form.zip.trim(),
      })
      setPlaced(r.order)
      onPlaced()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed — please try again or call (504) 555-0190.')
    } finally {
      setBusy(false)
    }
  }

  const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px', boxSizing: 'border-box' }

  if (placed) {
    return (
      <Modal open onClose={onClose} maxWidth={480} closeLabel="Close">
        <div style={{ textAlign: 'center', padding: '18px 8px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#EDE9FE', border: '2px solid #6D28D9', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>🔧</div>
          <h2 style={{ fontSize: '21px', fontWeight: 700, marginBottom: '8px' }}>Estimate requested!</h2>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto 16px' }}>
            {build.name} · <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{placed.orderNumber}</span>.
            Our team will <strong style={{ color: 'var(--ink)' }}>call {form.phone}</strong> to walk through the specs and send your estimate — pricing is confirmed on the call.
            {user ? ' Track every stage under Profile → Orders.' : ' Create an account with this email any time to track progress online.'}
          </p>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} maxWidth={520} closeLabel="Close">
      <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: '#6D28D9', letterSpacing: '0.5px', marginBottom: '3px' }}>CUSTOM BUILD</div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '2px' }}>{build.name}</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '16px' }}>{build.description} · pricing set by your estimate · built at our Houston depot</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>Full name</label><input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" /></div>
        <div><label style={lbl}>Company <span style={{ fontWeight: 400, textTransform: 'none' }}>(n/a if none)</span></label><input style={inp} value={form.company} onChange={e => set('company', e.target.value)} placeholder="Your Company LLC" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>Phone (we'll call you)</label><input style={inp} type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(504) 555-0000" /></div>
        <div><label style={lbl}>Email (estimate sent here)</label><input style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" /></div>
      </div>
      <label style={lbl}>Base container size</label>
      <select value={form.size} onChange={e => set('size', e.target.value)} style={inp}>
        <option value="20ft-std">20ft Standard</option>
        <option value="20ft-hc">20ft High Cube</option>
        <option value="40ft-std">40ft Standard</option>
        <option value="40ft-hc">40ft High Cube</option>
      </select>
      <label style={lbl}>Delivery street address</label>
      <input style={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="5500 Industrial Pkwy" />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => set('city', e.target.value)} /></div>
        <div><label style={lbl}>State</label><input style={inp} value={form.state} onChange={e => set('state', e.target.value)} placeholder="TX" /></div>
        <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="77029" /></div>
      </div>
      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '10px' }}>{error}</div>
      )}
      <Button variant="cta" fullWidth disabled={!ready || busy} onClick={submit}>
        {busy ? 'Sending…' : 'Request estimate'}
      </Button>
      <div style={{ fontSize: '10px', color: 'var(--ink3)', textAlign: 'center', marginTop: '8px' }}>No account needed — our team calls to finalize specs and pricing.</div>
    </Modal>
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
// Same shape as the custom-build estimate form (name, company, phone, email,
// base size, delivery address) plus estimated units. No account needed —
// submits through the quotes endpoint and sales follows up by phone.

function BulkForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', size: '20ft-std' as ContainerSize, units: '', address: '', city: '', state: '', zip: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim() || (!form.phone.trim() && !form.email.trim())) {
      setError('Please give us your full name and a phone number or email.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const address = [form.address.trim(), form.city.trim(), [form.state.trim(), form.zip.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      await quotes.submit({
        firstName: form.name.trim(), lastName: '', phone: form.phone.trim(), email: form.email.trim(),
        deliveryZip: form.zip.trim(), need: 'bulk',
        notes: [
          'B2B request',
          form.company.trim() ? `company: ${form.company.trim()}` : 'company: n/a',
          `base size: ${form.size}`,
          form.units.trim() ? `estimated units: ${form.units.trim()}` : '',
          address ? `delivery: ${address}` : '',
        ].filter(Boolean).join(' — '),
      })
      setForm({ name: '', company: '', phone: '', email: '', size: '20ft-std', units: '', address: '', city: '', state: '', zip: '' })
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please call (504) 555-0190.')
    } finally {
      setSubmitting(false)
    }
  }

  const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '28px 30px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>Full name</label><input style={inp} value={form.name} onChange={set('name')} placeholder="Jane Smith" /></div>
        <div><label style={lbl}>Company <span style={{ fontWeight: 400, textTransform: 'none' }}>(n/a if none)</span></label><input style={inp} value={form.company} onChange={set('company')} placeholder="Your Company LLC" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>Phone (we'll call you)</label><input style={inp} type="tel" value={form.phone} onChange={set('phone')} placeholder="(504) 555-0000" /></div>
        <div><label style={lbl}>Email</label><input style={inp} type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div>
          <label style={lbl}>Base container size</label>
          <select value={form.size} onChange={set('size')} style={inp}>
            <option value="20ft-std">20ft Standard</option>
            <option value="20ft-hc">20ft High Cube</option>
            <option value="40ft-std">40ft Standard</option>
            <option value="40ft-hc">40ft High Cube</option>
          </select>
        </div>
        <div><label style={lbl}>Estimated units</label><input style={inp} type="number" value={form.units} onChange={set('units')} placeholder="10" /></div>
      </div>
      <label style={lbl}>Delivery street address</label>
      <input style={inp} value={form.address} onChange={set('address')} placeholder="5500 Industrial Pkwy" />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={set('city')} /></div>
        <div><label style={lbl}>State</label><input style={inp} value={form.state} onChange={set('state')} placeholder="TX" /></div>
        <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={set('zip')} placeholder="77029" /></div>
      </div>
      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
          {error}
        </div>
      )}
      <button onClick={submit} disabled={submitting} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Request B2B Pricing'}
      </button>
      <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '12px', color: 'var(--ink3)' }}>
        No account needed · or call us directly: <strong style={{ color: 'var(--ink)' }}>(504) 555-0190</strong> — we respond within 2 hours
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
  onClose: () => void
  onMessageDriver: () => void
  onSaved: () => void          // after a successful save, return to the profile menu
  toast: (msg: string) => void
}

// Every profile feature requires a signed-in account (RBAC): signed-out
// visitors get the login/register form; signed-in customers see their
// customers.csv record (auto-created on first visit), orders, and messages.
function CustomerProfileModal({ open, initialTab, onClose, onMessageDriver, onSaved, toast }: CustomerProfileModalProps) {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<ProfileTab>(initialTab)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [myMessages, setMyMessages] = useState<Message[]>([])
  const [form, setForm] = useState<ProfileFormState | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof ProfileFormState, v: string | boolean) => setForm(p => p ? { ...p, [k]: v } : p)

  const lookup = useCallback(async (u: AuthUser) => {
    const norm = u.email.trim().toLowerCase()
    setError('')
    try {
      const all = await customersApi.list() // customers get only their own record back
      let match = all.find(c => c.active !== false && (c.email || '').trim().toLowerCase() === norm)
      if (!match) {
        // First visit — create the customer record from the account.
        match = await customersApi.create({ name: u.name || u.email, phone: u.phone || '', notes: 'Created from marketplace profile' })
      }
      setCustomer(match)
      setForm(customerToForm(match))
      // Order history + driver replies are best-effort — the profile still works without them.
      try {
        const allOrders = await orders.list()
        setMyOrders(allOrders
          .filter(o => o.customerId === match!.id || (o.customerEmail || '').trim().toLowerCase() === norm)
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
      } catch { setMyOrders([]) }
      try {
        const allMsgs = await messagesApi.list()
        setMyMessages(allMsgs.filter(m => m.toRole === 'customer' && !m.trashed
          && ((m.toEmail || '').trim().toLowerCase() === norm || (m.toName || '') === match!.name)))
      } catch { setMyMessages([]) }
      return match
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile — please try again.')
      return null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setError('')
    if (user) lookup(user)
    else { setCustomer(null); setForm(null); setMyOrders([]); setMyMessages([]) }
  }, [open, user, initialTab, lookup])

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
      onSaved() // back to the main profile menu
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
    <Modal open={open} onClose={onClose} maxWidth={560} closeLabel="Close">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'var(--pri-c,#D6E4FF)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>{customer ? customer.name : 'Your Profile'}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{customer ? customer.email : 'Sign in to manage your account, info & orders'}</div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* ── Signed out: account sign-in / registration required ── */}
      {!user && (
        <LoginForm allowRegister subtitle="Your profile, saved info, and order history are tied to your Gatorworx account." />
      )}
      {user && !customer && !error && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--ink3)', fontSize: '13px' }}>Loading your profile…</div>
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
                <Button variant="ghost" onClick={() => { logout(); onClose() }}>Sign out</Button>
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
                      {(() => {
                        const isCustom = (CUSTOM_STAGES as string[]).includes(o.status)
                        return (
                          <>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--ink3)', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{(o.amount || 0) > 0 ? `$${o.amount.toLocaleString()}` : 'Estimate pending'}</span>
                              <span>{isCustom ? 'Custom build' : o.saleType === 'rent' ? 'Rental' : 'Purchase'}</span>
                              <span>Ordered {fmtDate(o.createdAt)}</span>
                              {!isCustom && o.scheduledDate && <span>{o.status === 'delivered' ? 'Delivered' : 'Delivery'} {fmtDate(o.completedAt || o.scheduledDate)}{o.driverName ? ` · ${o.driverName}` : ''}</span>}
                            </div>
                            {isCustom && (
                              <div style={{ marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#6D28D9', background: '#EDE9FE', borderRadius: 'var(--r8)', padding: '4px 9px' }}>
                                {o.status === 'estimate_requested' && '📞 Estimate requested — our team will call you shortly'}
                                {o.status === 'estimate_in_progress' && '📞 Estimate in progress — expect our call'}
                                {o.status === 'estimate_sent' && `📄 Estimate sent — $${(o.amount || 0).toLocaleString()} · approve on our call`}
                                {o.status === 'estimate_approved' && '✅ Estimate approved — scheduling your build'}
                                {o.status === 'custom_in_progress' && <>🔧 In fabrication{o.scheduledDate ? ` — estimated complete ${fmtDate(o.scheduledDate)}` : ' — completion date coming soon'}</>}
                              </div>
                            )}
                          </>
                        )
                      })()}
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
  // Top-level gate: shoppers first pick New or Used ('all' = grouped view);
  // the remaining filters only appear once a condition is chosen.
  const [condFilter, setCondFilter] = useState<'all' | ContainerCondition>('all')
  const [sizeFilters, setSizeFilters] = useState<Set<ContainerSize>>(new Set(ALL_SIZES))
  const [gradeFilters, setGradeFilters] = useState<Set<ContainerGrade>>(new Set(['A', 'B', 'C', 'R', 'X']))
  // null = no color restriction (all colors checked)
  const [colorSel, setColorSel] = useState<Set<string> | null>(null)
  // Depot filter — shoppers may only want stock at nearby yards. null = all depots.
  const [depotSel, setDepotSel] = useState<Set<string> | null>(null)
  const [depotList, setDepotList] = useState<Depot[]>([])
  useEffect(() => { depotsApi.list().then(setDepotList).catch(() => {}) }, [])
  // Compact combo-box: the depot list lives in a dropdown; closed state shows a summary.
  const [depotDdOpen, setDepotDdOpen] = useState(false)
  const depotDdRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (depotDdRef.current && !depotDdRef.current.contains(e.target as Node)) setDepotDdOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
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
  const browseRef = useRef<HTMLDivElement>(null)
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()
  const isMobile = useIsMobile()
  // Phones: the filter sidebar collapses behind a toggle so inventory shows first.
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { data: allContainers, loading, refetch: refetchContainers } = useContainers()
  const { user, logout } = useAuth()
  const customerEmail = user?.email.toLowerCase() ?? ''

  // Custom Builds catalog (admin-managed) + the order-a-build dialog.
  const [builds, setBuilds] = useState<CustomBuild[]>([])
  const [orderBuild, setOrderBuild] = useState<CustomBuild | null>(null)
  const loadBuilds = useCallback(() => customBuildsApi.list().then(setBuilds).catch(() => {}), [])
  useEffect(() => { loadBuilds() }, [loadBuilds])

  // Keep inventory fresh: re-pull whenever the shopper switches tabs
  // (Buy ⇄ Rent ⇄ …), opens the cart or detail views won't need it, and
  // whenever the window regains focus (e.g. after editing in the admin tab).
  useEffect(() => { refetchContainers(); if (activeTab === 'custom') loadBuilds() }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') refetchContainers() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [refetchContainers])

  // Unread replies addressed to this customer (requires a signed-in account).
  const [customerReplies, setCustomerReplies] = useState(0)
  useEffect(() => {
    if (!user) { setCustomerReplies(0); return }
    const load = () => messagesApi.list().then(ms => {
      setCustomerReplies(ms.filter(m => m.toRole === 'customer' && !m.read && !m.trashed
        && (m.toEmail || '').trim().toLowerCase() === customerEmail).length)
    }).catch(() => {})
    load()
    const onFocus = () => { if (document.visibilityState !== 'hidden') load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [user, customerEmail])
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

  // Colors present in the currently browsable new stock — drives the Color filter.
  const colorOptions = [...new Set(tabListable.filter(c => condOf(c) === 'new').map(c => c.color || 'Unspecified'))].sort()

  // Filter containers. On the Rent tab, "price" means the monthly rate.
  // Sub-filters are condition-scoped: grade applies when browsing Used,
  // color when browsing New (they're hidden otherwise, so they can't strand results).
  const priceOf = (c: Container) => activeTab === 'rent' ? (c.rentMonthly ?? c.buyPrice) : c.buyPrice
  const filtered = tabListable.filter(c => {
    if (condFilter !== 'all' && condOf(c) !== condFilter) return false
    if (depotSel && !depotSel.has(c.depotLocation)) return false
    if (!sizeFilters.has(c.size)) return false
    if (condFilter === 'used' && !gradeFilters.has(c.grade)) return false
    if (condFilter === 'new' && colorSel && !colorSel.has(c.color || 'Unspecified')) return false
    if (minPrice && priceOf(c) < Number(minPrice)) return false
    if (maxPrice && priceOf(c) > Number(maxPrice)) return false
    return true
  }).sort((a, b) => {
    if (sort === 'new-first') return (condOf(a) === condOf(b)) ? priceOf(a) - priceOf(b) : (condOf(a) === 'new' ? -1 : 1)
    if (sort === 'price-asc') return priceOf(a) - priceOf(b)
    if (sort === 'price-desc') return priceOf(b) - priceOf(a)
    if (sort === 'condition') return (b.conditionScore || 0) - (a.conditionScore || 0)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const countBySize = (s: ContainerSize) => tabListable.filter(c => c.size === s && (condFilter === 'all' || condOf(c) === condFilter)).length
  const countByCond = (k: ContainerCondition) => tabListable.filter(c => condOf(c) === k).length

  const toggleColor = (col: string) => {
    setColorSel(prev => {
      const next = new Set(prev ?? colorOptions)
      next.has(col) ? next.delete(col) : next.add(col)
      return next
    })
  }

  // Depots with browsable stock in the current tab/condition scope, grouped by
  // the market they serve ("Atlanta, GA" → its two yards). Unknown/legacy
  // depotLocation strings fall under "Other locations".
  const countByDepot = (name: string) => tabListable.filter(c => c.depotLocation === name && (condFilter === 'all' || condOf(c) === condFilter)).length
  const stockedDepotNames = [...new Set(tabListable.map(c => c.depotLocation).filter(Boolean))].filter(n => countByDepot(n) > 0)
  const depotGroups = [...new Set(stockedDepotNames.map(n => depotList.find(d => d.name === n)?.destination || 'Other locations'))]
    .sort()
    .map(dest => ({ dest, names: stockedDepotNames.filter(n => (depotList.find(d => d.name === n)?.destination || 'Other locations') === dest).sort() }))

  const toggleDepot = (name: string) => {
    setDepotSel(prev => {
      const next = new Set(prev ?? stockedDepotNames)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

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
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400, height: 'var(--nav-h)', background: 'var(--surf-w)', borderBottom: '1px solid var(--div)', display: 'flex', alignItems: 'center', padding: isMobile ? '0 10px' : '0 20px', gap: isMobile ? '8px' : '14px' }}>
        <a href="/" onClick={e => { e.preventDefault(); setActiveTab('buy'); setSelectedContainer(null); window.scrollTo({ top: 0 }) }} title="Back to Buy" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none', flexShrink: 0, cursor: 'pointer' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--r8)', background: 'var(--primary)', display: 'grid', placeItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="6" width="22" height="14" rx="2" /><line x1="6" y1="6" x2="6" y2="20" /><line x1="11" y1="6" x2="11" y2="20" /><line x1="16" y1="6" x2="16" y2="20" /></svg>
          </div>
          {!isMobile && <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.4px' }}><span style={{ color: '#2B7FD4' }}>Gator</span><span style={{ color: 'var(--cta)' }}>worx</span></span>}
        </a>
        <nav style={{ display: 'flex', gap: '2px', marginLeft: isMobile ? 0 : '12px', overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0 }}>
          {(['buy', 'rent', 'custom', 'bulk'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{ padding: '6px 13px', borderRadius: 'var(--pill)', fontSize: '13px', fontWeight: 600, color: activeTab === t ? '#fff' : 'var(--ink3)', background: activeTab === t ? 'var(--primary)' : 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {t === 'buy' ? 'Buy' : t === 'rent' ? 'Rent' : t === 'custom' ? 'Custom Builds' : 'Bulk / B2B'}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
          {!isMobile && <button onClick={() => openQuote('contact')} style={{ padding: '7px 16px', borderRadius: 'var(--pill)', background: 'transparent', border: '1.5px solid var(--div)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Contact Us</button>}
          <button onClick={() => setCartOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: isMobile ? '7px 12px' : '7px 16px', borderRadius: 'var(--pill)', background: 'var(--cta)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h2.5l2 9h9l2-7H5" /><circle cx="8" cy="17.5" r="1.5" fill="#fff" stroke="none" /><circle cx="13" cy="17.5" r="1.5" fill="#fff" stroke="none" /></svg>
            {!isMobile && 'Cart '}<span style={{ background: 'rgba(255,255,255,.25)', padding: '0 6px', borderRadius: '99px', fontSize: '10px', marginLeft: '2px' }}>{cart.length}</span>
          </button>
          <button onClick={() => setProfileOpen(true)} title={customerReplies > 0 ? `${customerReplies} new message${customerReplies > 1 ? 's' : ''} from your driver` : user ? `${user.name} · Profile` : 'Sign in / Profile'} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '50%', background: user ? 'var(--primary)' : 'transparent', border: user ? 'none' : '1.5px solid var(--div)', cursor: 'pointer', flexShrink: 0 }}>
            {user
              ? <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.3px' }}>{(user.name || user.email).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>
              : <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>}
            {customerReplies > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '16px', height: '16px', padding: '0 3px', borderRadius: '999px', background: 'var(--cta)', border: '2px solid var(--surf-w)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="9" height="9" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></svg>
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ marginTop: 'var(--nav-h)', background: '#0B1629', padding: isMobile ? '20px 20px 22px' : (activeTab === 'custom' || activeTab === 'bulk') ? '14px 48px 16px' : '22px 48px 24px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '20px' : '48px', position: 'relative', overflow: 'hidden' }}>
        <img src="https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?w=1600&q=80" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 60%', opacity: 0.28, pointerEvents: 'none' }} />
        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 'var(--pill)', padding: '5px 14px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', marginBottom: '14px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4DFFB4', animation: 'pulse 2s ease infinite', flexShrink: 0 }} />
            Now Serving the Gulf Coast · 200-Mile Radius from New Orleans
          </div>
          <h1 style={{ fontSize: 'clamp(22px,2.6vw,40px)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.5px', color: '#fff', marginBottom: (activeTab === 'custom' || activeTab === 'bulk') ? '10px' : '12px', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>
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
        <div style={{ flexShrink: 0, width: isMobile ? '100%' : '340px', boxSizing: 'border-box', background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 'var(--r24)', padding: isMobile ? '18px' : '24px', position: 'relative', zIndex: 1 }}>
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
        <div ref={browseRef} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', width: '100%' }}>
          {/* Mobile: filters live behind a toggle bar so inventory shows first */}
          {isMobile && (
            <button onClick={() => setFiltersOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', background: 'var(--surf-w)', border: 'none', borderBottom: '1px solid var(--div)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                Filters &amp; Sort
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          )}
          {/* Sidebar */}
          <aside style={isMobile
            ? { display: filtersOpen ? 'block' : 'none', width: '100%', boxSizing: 'border-box', borderBottom: '1px solid var(--div)', padding: '14px 16px', background: 'var(--surf-w)' }
            : { width: 'var(--sb-w)', flexShrink: 0, borderRight: '1px solid var(--div)', padding: '14px 10px', position: 'sticky', top: 'var(--nav-h)', height: 'calc(100vh - var(--nav-h))', overflowY: 'auto', background: 'var(--surf-w)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.4px' }}>Filters</span>
              <button onClick={() => { setCondFilter('all'); setSizeFilters(new Set(ALL_SIZES)); setGradeFilters(new Set(['A','B','C','R','X'])); setColorSel(null); setDepotSel(null) }} style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}>Reset</button>
            </div>

            {/* Condition gate — pick New or Used first; sub-filters follow */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Condition</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                {([['all', 'All'], ['new', 'New'], ['used', 'Used']] as ['all' | ContainerCondition, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setCondFilter(val)} style={{
                    flex: 1, padding: '7px 4px', borderRadius: 'var(--r8)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--sans)',
                    border: `1.5px solid ${condFilter === val ? 'var(--primary)' : 'var(--div)'}`,
                    background: condFilter === val ? 'var(--primary)' : 'var(--surf-w)',
                    color: condFilter === val ? '#fff' : 'var(--ink2)',
                  }}>
                    {label}{val !== 'all' && <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75 }}> {countByCond(val)}</span>}
                  </button>
                ))}
              </div>
              {condFilter === 'all' && (
                <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.45 }}>Choose New or Used to unlock size, {`condition & color`} filters.</div>
              )}
            </div>

            {/* Depot — location matters no matter New or Used, so it's not behind the gate.
                Rendered as a combo-box: closed shows a summary, open shows the grouped list. */}
            {depotGroups.length > 0 && (() => {
              const selCount = depotSel ? [...depotSel].filter(n => stockedDepotNames.includes(n)).length : stockedDepotNames.length
              const allOn = !depotSel || selCount === stockedDepotNames.length
              return (
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Depot</span>
                  <div ref={depotDdRef} style={{ position: 'relative' }}>
                    <button onClick={() => setDepotDdOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', width: '100%', padding: '8px 10px', borderRadius: 'var(--r8)', border: `1.5px solid ${allOn ? 'var(--div)' : 'var(--primary)'}`, background: 'var(--surf-w)', fontSize: '12px', fontWeight: allOn ? 400 : 600, color: allOn ? 'var(--ink2)' : 'var(--primary)', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                      <span>{allOn ? 'All depots' : `${selCount} of ${stockedDepotNames.length} depots`}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, transform: depotDdOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {depotDdOpen && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60, background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r8)', boxShadow: 'var(--sh2)', maxHeight: '280px', overflowY: 'auto', padding: '6px 10px 8px' }}>
                        <button onClick={() => setDepotSel(null)} style={{ background: 'none', border: 'none', padding: '4px 0', fontSize: '11px', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', fontFamily: 'var(--sans)' }}>Select all</button>
                        {depotGroups.map(({ dest, names }) => (
                          <div key={dest}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', padding: '5px 0 2px' }}>{dest}</div>
                            {names.map(name => {
                              const on = !depotSel || depotSel.has(name)
                              return (
                                <div key={name} onClick={() => toggleDepot(name)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                                  <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: on ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                    {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                                  </div>
                                  <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1, lineHeight: 1.3 }}>{name}</span>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)' }}>{countByDepot(name)}</span>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

            {/* Sort */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Sort By</span>
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', fontSize: '12px', cursor: 'pointer', outline: 'none', fontFamily: 'var(--sans)' }}>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="new-first">New → Used</option>
                <option value="condition">Best Condition First</option>
                <option value="newest">Newest Listed</option>
              </select>
            </div>

            {/* Sub-filters appear once the shopper has decided New vs Used */}
            {condFilter !== 'all' && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

                {/* Size filters */}
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Size</span>
                  {SIZE_OPTIONS.filter(([val]) => countBySize(val) > 0).map(([val, label]) => (
                    <div key={val} onClick={() => toggleSize(val)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                      <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: sizeFilters.has(val) ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${sizeFilters.has(val) ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {sizeFilters.has(val) && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1 }}>{label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)' }}>{countBySize(val)}</span>
                    </div>
                  ))}
                </div>

                {/* Used stock varies by inspected grade; new stock is all one-trip */}
                {condFilter === 'used' && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />
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
                  </>
                )}

                {/* New stock comes in factory colors */}
                {condFilter === 'new' && colorOptions.length > 0 && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Color</span>
                      {colorOptions.map(col => {
                        const on = !colorSel || colorSel.has(col)
                        return (
                          <div key={col} onClick={() => toggleColor(col)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                            <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: on ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1 }}>{col}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)' }}>{tabListable.filter(c => condOf(c) === 'new' && (c.color || 'Unspecified') === col).length}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

                {/* Price range */}
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Price Range</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Min $" type="number" style={{ padding: '7px 9px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '12px', outline: 'none' }} />
                    <input value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Max $" type="number" style={{ padding: '7px 9px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '12px', outline: 'none' }} />
                  </div>
                </div>
              </>
            )}
          </aside>

          {/* Grid area */}
          <div style={{ flex: 1, padding: '18px 18px 60px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{filtered.length} containers</span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>· Gulf Coast region</span>
            </div>

            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(4,1fr)', gap: '10px' }}>
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
            ) : condFilter === 'all' ? (
              // No condition picked yet — group the results into New and Used sections.
              (['new', 'used'] as ContainerCondition[]).map(k => {
                const group = filtered.filter(c => condOf(c) === k)
                if (!group.length) return null
                return (
                  <div key={k} style={{ marginBottom: '26px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700 }}>{k === 'new' ? 'New Containers' : 'Used Containers'}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--pill)', padding: '1px 9px' }}>{group.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                      {group.map(c => (
                        <ContainerCard key={c.id} container={c} onSelect={setSelectedContainer} mode={activeTab === 'rent' ? 'rent' : 'buy'} inCart={inCart(c.id)} onAddToCart={addToCart} />
                      ))}
                    </div>
                  </div>
                )
              })
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
            {builds.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '30px 0' }}>No custom builds published yet — check back soon.</div>}
            {builds.map(cb => (
              <div key={cb.id} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh1)' }}
              >
                {/* Product photo, or clean clipart until one is uploaded */}
                <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg,#1E293B,#0F2D4A)', overflow: 'hidden' }}>
                  {cb.photo
                    ? <img src={photoUrl(cb.photo)} alt={cb.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <BuildClipart name={cb.name} />}
                </div>
                <div style={{ padding: '14px 15px 16px' }}>
                  {cb.tag && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: 'var(--slate-cont)', color: 'var(--slate)', marginBottom: '8px' }}>{cb.tag}</span>}
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{cb.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.55, marginBottom: '12px' }}>{cb.description}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '14px' }}>
                    {cb.features.map(f => <span key={f} style={{ padding: '3px 9px', borderRadius: 'var(--r4)', background: 'var(--surf1)', color: 'var(--ink2)', fontSize: '11px' }}>{f}</span>)}
                  </div>
                  {/* Pricing is settled by the estimate — no list price shown */}
                  <button onClick={() => setOrderBuild(cb)} style={{ width: '100%', padding: '11px', borderRadius: 'var(--pill)', background: 'var(--cta)', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(230,81,0,.25)' }}>Request Estimate</button>
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
        user={user}
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

      {/* ── Profile menu — options only appear once signed in ── */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth={380} closeLabel="Close">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'var(--primary-cont)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700 }}>{user ? user.name || 'Your Profile' : 'Your Profile'}</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{user ? `Signed in · ${user.email}` : 'Sign in to manage your account & orders'}</div>
          </div>
        </div>
        {!user && (
          <LoginForm allowRegister subtitle="Sign in or create an account to see your profile, saved info, orders, and driver messages." />
        )}
        {user && ([
          { key: 'account', label: 'My Account', desc: 'Sign-in, billing & preferences', icon: <><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></> },
          { key: 'info', label: 'My Info', desc: 'Contact details & delivery addresses', icon: <><rect x="3" y="4" width="14" height="12" rx="2" /><line x1="6" y1="8" x2="14" y2="8" /><line x1="6" y1="11.5" x2="11" y2="11.5" /></> },
          { key: 'message', label: 'Message Driver', desc: 'Send a note to your delivery driver', icon: <><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></> },
        ] as const).map(item => (
          <button
            key={item.key}
            onClick={() => {
              setProfileOpen(false)
              // Messaging a driver also requires a signed-in account — route
              // signed-out visitors to the sign-in screen first.
              if (item.key === 'message' && user) setMsgOpen(true)
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
        {user && (
          <button
            onClick={() => { logout(); setProfileOpen(false); toast('Signed out') }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginTop: '4px', borderRadius: 'var(--r12)', border: '1.5px solid var(--cta-cont)', background: 'var(--surf-w)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ width: '34px', height: '34px', borderRadius: 'var(--r8)', background: 'var(--cta-cont)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--cta)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 17H4a1 1 0 01-1-1V4a1 1 0 011-1h4" /><polyline points="13,6 17,10 13,14" /><line x1="17" y1="10" x2="7" y2="10" /></svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: 'var(--cta)' }}>Sign Out</span>
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--ink3)' }}>{user.email}</span>
            </span>
          </button>
        )}
      </Modal>

      {/* ── Account / My Info / Orders (requires a signed-in account) ── */}
      <CustomerProfileModal
        open={accountOpen}
        initialTab={accountTab}
        onClose={() => setAccountOpen(false)}
        onMessageDriver={() => { setAccountOpen(false); setMsgOpen(true) }}
        onSaved={() => { setAccountOpen(false); setProfileOpen(true) }}
        toast={toast}
      />

      <CustomerMessageModal open={msgOpen} onClose={() => setMsgOpen(false)} onSent={(m) => toast(m)} />

      {/* ── Order a custom build ── */}
      <OrderBuildModal
        build={orderBuild}
        user={user}
        onClose={() => setOrderBuild(null)}
        onPlaced={() => { refetchContainers() }}
        toast={toast}
      />

      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
