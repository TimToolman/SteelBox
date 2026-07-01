// ============================================================
// SteelBox Marketplace — Public storefront
// Route: / (public, no auth required)
// Design source: Marketplace.dc.html
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { GradeBadge, StatusBadge, Button, Modal, Snackbar, Input, Select } from '../components/ui'
import { useContainers, useSnackbar } from '../hooks'
import { containers, quotes, isZipCovered, estimateDelivery, type Container, type ContainerGrade, type ContainerSize } from '../lib/api'

// ── Types ─────────────────────────────────────────────────

type Tab = 'buy' | 'rent' | 'custom' | 'bulk'
type SortKey = 'price-asc' | 'price-desc' | 'grade' | 'photos' | 'newest'

// ── Constants ─────────────────────────────────────────────

const GRADE_META: Record<ContainerGrade, { label: string; desc: string; color: string }> = {
  A: { label: 'One-Trip', desc: 'Direct import, single use. Like new inside and out.', color: '#1B7A5A' },
  B: { label: 'Cargo-Worthy', desc: 'Used, structurally sound, wind and watertight.', color: '#2563EB' },
  C: { label: 'Wind & Watertight', desc: 'Older unit with visible rust. Structurally solid.', color: '#D97706' },
  R: { label: 'Refurbished', desc: 'Repainted, resealed, and reconditioned.', color: '#6D28D9' },
  X: { label: 'Custom Build', desc: 'Modified to specification.', color: '#374151' },
}

const SIZE_LABELS: Record<ContainerSize, string> = {
  '20ft-std': '20ft Standard',
  '20ft-hc':  '20ft High Cube',
  '40ft-std': '40ft Standard',
  '40ft-hc':  '40ft High Cube',
}

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

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await quotes.submit({ ...form, containerSku })
      onSuccess?.()
      onClose()
    } catch {
      // silent fail in prototype — real error handling goes here
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
}

function ContainerCard({ container, onSelect }: ContainerCardProps) {
  const { sku, grade, status, size, buyPrice, rentMonthly, photos, photoCount } = container
  const gradeMeta = GRADE_META[grade]
  const isLocked = status === 'sale_in_progress'

  return (
    <div
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
        {/* SKU chip */}
        <span style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: 'var(--r4)', padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: '10px' }}>{sku}</span>
        {/* Grade badge */}
        <span style={{ position: 'absolute', top: '8px', right: '8px', background: gradeMeta.color, color: '#fff', borderRadius: 'var(--r4)', padding: '3px 8px', fontSize: '10px', fontWeight: 700 }}>{grade}</span>
        {/* Photo count */}
        <span style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: 'var(--r4)', padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: '10px' }}>
          📷 {photoCount}
        </span>
        {/* Sale in progress veil */}
        {isLocked && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
            <span style={{ background: 'var(--cta)', color: '#fff', padding: '6px 16px', borderRadius: 'var(--r4)', fontSize: '12px', fontWeight: 700 }}>Sale in Progress</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '9px 11px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>{SIZE_LABELS[size]}</span>
          <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 'var(--r4)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: 'var(--green-cont)', color: 'var(--green)' }}>
            {rentMonthly ? 'SALE / RENT' : 'SALE'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          <span style={{ background: 'var(--surf1)', borderRadius: 'var(--r4)', padding: '3px 7px', fontSize: '10px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{gradeMeta.label}</span>
          {container.has360 && <span style={{ background: 'var(--pri-c, #D6E4FF)', borderRadius: 'var(--r4)', padding: '3px 7px', fontSize: '10px', color: 'var(--primary)', fontFamily: 'var(--mono)' }}>360°</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--div)' }}>
          <div>
            <div style={{ fontSize: '21px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.3px' }}>${buyPrice.toLocaleString()}</div>
            {rentMonthly && <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '1px' }}>or ${rentMonthly}/mo rental</div>}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onSelect(container) }}
            disabled={isLocked}
            style={{
              padding: '8px 16px', borderRadius: 'var(--pill)', background: isLocked ? 'var(--surf1)' : 'var(--cta)',
              color: isLocked ? 'var(--ink3)' : '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: isLocked ? 'not-allowed' : 'pointer',
              boxShadow: isLocked ? 'none' : '0 2px 8px rgba(230,81,0,.25)',
            }}
          >
            {isLocked ? 'Reserved' : 'View'}
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

// ── Container Detail Modal ─────────────────────────────────

interface DetailModalProps {
  container: Container | null
  onClose: () => void
  onQuote: () => void
  onReserve: (c: Container) => void
}

function DetailModal({ container, onClose, onQuote, onReserve }: DetailModalProps) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const [priceTab, setPriceTab] = useState<'buy' | 'rent'>('buy')
  const [delivery, setDelivery] = useState('Enter your ZIP above')
  const [zip, setZip] = useState('')

  if (!container) return null
  const { sku, grade, size, buyPrice, rentMonthly, photos, photoCount, has360 } = container
  const gradeMeta = GRADE_META[grade]
  const isLocked = container.status === 'sale_in_progress'

  const checkDelivery = async () => {
    if (!zip || zip.length < 5) return
    setDelivery('Checking…')
    setDelivery(await estimateDelivery(zip))
  }

  return (
    <Modal open={!!container} onClose={onClose} maxWidth={940} noPadding>
      {/* Gallery */}
      <div style={{ background: '#0B1629', position: 'relative' }}>
        <div style={{ position: 'relative', paddingBottom: '37.5%', overflow: 'hidden', background: '#0F1E35', cursor: 'grab' }}>
          {photos?.[photoIdx] ? (
            <img src={photos[photoIdx]} alt={sku} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#162030,#0A1525)' }}>
              <ContainerSVGIcon size={size} />
            </div>
          )}
          {/* Arrows */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', pointerEvents: 'none' }}>
            <button onClick={() => setPhotoIdx(i => Math.max(0, i - 1))} style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', color: '#fff', fontSize: '20px', cursor: 'pointer', pointerEvents: 'all' }}>‹</button>
            <button onClick={() => setPhotoIdx(i => Math.min(photoCount - 1, i + 1))} style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', color: '#fff', fontSize: '20px', cursor: 'pointer', pointerEvents: 'all' }}>›</button>
          </div>
          <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: 'var(--pill)', padding: '3px 10px', fontFamily: 'var(--mono)', fontSize: '10px', color: '#fff' }}>
            {photoIdx + 1} / {photoCount || 1}
          </div>
          {has360 && (
            <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,87,184,.85)', color: '#fff', borderRadius: 'var(--r4)', padding: '3px 9px', fontSize: '10px', fontWeight: 700 }}>
              360° · Drag to rotate
            </div>
          )}
        </div>
        {/* Film strip */}
        {photos && photos.length > 1 && (
          <div style={{ display: 'flex', gap: '3px', padding: '6px', background: '#060F1E', overflowX: 'auto' }}>
            {photos.map((url, i) => (
              <button
                key={i}
                onClick={() => setPhotoIdx(i)}
                style={{ width: '68px', height: '46px', borderRadius: 'var(--r4)', flexShrink: 0, overflow: 'hidden', border: `2px solid ${i === photoIdx ? 'var(--cta)' : 'transparent'}`, cursor: 'pointer', background: '#162030' }}
              >
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '22px', padding: '22px 26px 26px' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink3)', marginBottom: '5px' }}>
            {sku} · {photoCount} photos{has360 ? ' · 360° available' : ''}
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
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '3px', background: 'var(--surf1)', borderRadius: 'var(--pill)', padding: '3px', marginBottom: '14px' }}>
            {(['buy', 'rent'] as const).map(t => (
              <button
                key={t}
                onClick={() => setPriceTab(t)}
                style={{ flex: 1, padding: '7px', borderRadius: 'var(--pill)', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', background: priceTab === t ? 'var(--surf-w)' : 'transparent', color: priceTab === t ? 'var(--ink)' : 'var(--ink3)', boxShadow: priceTab === t ? 'var(--sh1)' : 'none' }}
              >
                {t === 'buy' ? 'Buy' : 'Rent'}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '30px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.4px' }}>
            {priceTab === 'buy' ? `$${buyPrice.toLocaleString()}` : rentMonthly ? `$${rentMonthly}/mo` : 'Call for pricing'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px', marginBottom: '14px' }}>
            {priceTab === 'buy' ? 'One-time purchase price' : 'Monthly rental rate'}
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

          <button
            onClick={() => onReserve(container)}
            disabled={isLocked}
            style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: isLocked ? 'var(--surf1)' : 'var(--cta)', color: isLocked ? 'var(--ink3)' : '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: isLocked ? 'not-allowed' : 'pointer', boxShadow: isLocked ? 'none' : '0 4px 14px rgba(230,81,0,.3)', marginBottom: '8px' }}
          >
            {isLocked ? 'Currently Reserved' : priceTab === 'buy' ? 'Reserve This Container' : 'Get Rental Quote'}
          </button>
          <button
            onClick={onQuote}
            style={{ width: '100%', padding: '11px', borderRadius: 'var(--pill)', background: 'transparent', color: 'var(--primary)', border: '1.5px solid var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '14px' }}
          >
            Get Rental Quote / Call Me
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.5, paddingTop: '12px', borderTop: '1px solid var(--div)' }}>
            <span style={{ color: 'var(--green)', flexShrink: 0, marginTop: '1px' }}>✓</span>
            Lifetime warranty · 3–5 business day delivery · Site drop-off included
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Marketplace Page ──────────────────────────────────

export default function MarketplacePage() {
  const [activeTab, setActiveTab] = useState<Tab>('buy')
  const [sizeFilter, setSizeFilter] = useState<ContainerSize | 'all'>('all')
  const [gradeFilters, setGradeFilters] = useState<Set<ContainerGrade>>(new Set(['A', 'B', 'C', 'R', 'X']))
  const [showAvailable, setShowAvailable] = useState(true)
  const [showInProgress, setShowInProgress] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<SortKey>('price-asc')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quotePurpose, setQuotePurpose] = useState<'quote' | 'contact' | 'rental'>('quote')
  const [zipInput, setZipInput] = useState('')
  const [zipResult, setZipResult] = useState('')
  const [cartCount, setCartCount] = useState(0)
  const browseRef = useRef<HTMLDivElement>(null)
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()

  const { data: allContainers, loading } = useContainers()

  // Filter containers
  const filtered = allContainers.filter(c => {
    if (sizeFilter !== 'all' && c.size !== sizeFilter) return false
    if (!gradeFilters.has(c.grade)) return false
    if (minPrice && c.buyPrice < Number(minPrice)) return false
    if (maxPrice && c.buyPrice > Number(maxPrice)) return false
    const statusOk =
      (showAvailable && c.status === 'available') ||
      (showInProgress && c.status === 'sale_in_progress')
    if (!statusOk && (showAvailable || showInProgress)) return false
    if (activeTab === 'rent' && !c.rentMonthly) return false
    return true
  }).sort((a, b) => {
    if (sort === 'price-asc') return a.buyPrice - b.buyPrice
    if (sort === 'price-desc') return b.buyPrice - a.buyPrice
    if (sort === 'grade') return a.grade.localeCompare(b.grade)
    if (sort === 'photos') return b.photoCount - a.photoCount
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const countBySize = (s: ContainerSize) => allContainers.filter(c => c.size === s).length

  const toggleGrade = (g: ContainerGrade) => {
    setGradeFilters(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  const checkZip = async () => {
    if (!zipInput || zipInput.length < 5) { setZipResult('Enter a 5-digit ZIP'); return }
    setZipResult('Checking…')
    setZipResult(await estimateDelivery(zipInput))
  }

  const handleReserve = async (c: Container) => {
    try {
      await containers.reserve(c.id)
      setCartCount(n => n + 1)
      setSelectedContainer(null)
      toast(`${c.sku} reserved! Check your email for next steps.`)
    } catch {
      toast('Could not reserve — please try again or call us.')
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
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none', flexShrink: 0 }}>
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
          <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink3)' }}>(504) 555-0190</span>
          <button onClick={() => openQuote('contact')} style={{ padding: '7px 16px', borderRadius: 'var(--pill)', background: 'transparent', border: '1.5px solid var(--div)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Contact</button>
          <button onClick={() => openQuote('quote')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: 'var(--pill)', background: 'var(--cta)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            🛒 Cart <span style={{ background: 'rgba(255,255,255,.25)', padding: '0 6px', borderRadius: '99px', fontSize: '10px', marginLeft: '2px' }}>{cartCount}</span>
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ marginTop: 'var(--nav-h)', background: '#0B1629', padding: '36px 48px 40px', display: 'flex', alignItems: 'center', gap: '48px', position: 'relative', overflow: 'hidden' }}>
        <img src="https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?w=1600&q=80" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 60%', opacity: 0.28, pointerEvents: 'none' }} />
        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 'var(--pill)', padding: '5px 14px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', marginBottom: '14px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4DFFB4', animation: 'pulse 2s ease infinite', flexShrink: 0 }} />
            Now Serving the Gulf Coast · 200-Mile Radius from New Orleans
          </div>
          <h1 style={{ fontSize: 'clamp(22px,2.6vw,40px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.5px', color: '#fff', marginBottom: '12px', whiteSpace: 'nowrap' }}>
            Steel Containers. <em style={{ fontStyle: 'normal', color: '#60A5FA' }}>Delivered in Days.</em>
          </h1>
          <p style={{ fontSize: '15px', lineHeight: 1.65, color: 'rgba(255,255,255,.9)', marginBottom: '24px', fontWeight: 600 }}>
            Buy or rent field-inspected ISO containers — 20ft and 40ft — with transparent pricing, 16-photo documentation, and fast delivery across LA, TX, MS, AL, AR, and the Florida Panhandle.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => browseRef.current?.scrollIntoView({ behavior: 'smooth' })} style={{ padding: '12px 24px', borderRadius: 'var(--pill)', background: 'var(--cta)', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(230,81,0,.38)' }}>Browse Inventory</button>
            <button onClick={() => openQuote('rental')} style={{ padding: '12px 24px', borderRadius: 'var(--pill)', background: 'rgba(255,255,255,.1)', color: '#fff', border: '1.5px solid rgba(255,255,255,.25)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Get a Rental Quote</button>
          </div>
        </div>

        {/* ZIP card */}
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
      </section>

      {/* ── Size strip ── */}
      <div ref={browseRef} style={{ background: 'var(--surf-w)', borderBottom: '1px solid var(--div)', display: 'flex', alignItems: 'center', overflowX: 'auto', padding: '0 20px', position: 'sticky', top: 'var(--nav-h)', zIndex: 200 }}>
        {([['all', 'All Sizes', allContainers.length], ['20ft-std', '20ft Standard', countBySize('20ft-std')], ['20ft-hc', '20ft High Cube', countBySize('20ft-hc')], ['40ft-std', '40ft Standard', countBySize('40ft-std')], ['40ft-hc', '40ft High Cube', countBySize('40ft-hc')]] as [string, string, number][]).map(([val, label, count]) => (
          <button
            key={val}
            onClick={() => setSizeFilter(val as ContainerSize | 'all')}
            style={{ padding: '13px 16px', border: 'none', background: 'transparent', borderBottom: `2.5px solid ${sizeFilter === val ? 'var(--primary)' : 'transparent'}`, color: sizeFilter === val ? 'var(--primary)' : 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
          >
            {label}
            <span style={{ background: sizeFilter === val ? 'var(--primary-cont)' : 'var(--surf1)', color: sizeFilter === val ? 'var(--primary)' : 'var(--ink3)', fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--pill)' }}>{count}</span>
          </button>
        ))}
      </div>

      {/* ── Browse panel ── */}
      {(activeTab === 'buy' || activeTab === 'rent') && (
        <div style={{ display: 'flex', width: '100%' }}>
          {/* Sidebar */}
          <aside style={{ width: 'var(--sb-w)', flexShrink: 0, borderRight: '1px solid var(--div)', padding: '14px 10px', position: 'sticky', top: `calc(var(--nav-h) + 45px)`, height: `calc(100vh - var(--nav-h) - 45px)`, overflowY: 'auto', background: 'var(--surf-w)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.4px' }}>Filters</span>
              <button onClick={() => { setGradeFilters(new Set(['A','B','C','R','X'])); setMinPrice(''); setMaxPrice(''); setShowAvailable(true); setShowInProgress(false) }} style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}>Clear all</button>
            </div>

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

            <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

            {/* Availability */}
            <div>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Availability</span>
              {[['avail', 'Available Now', showAvailable, setShowAvailable], ['sale', 'Sale in Progress', showInProgress, setShowInProgress]].map(([key, label, checked, setter]) => (
                <div key={key as string} onClick={() => (setter as (b: boolean) => void)(!checked)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', cursor: 'pointer' }}>
                  <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: checked ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {checked && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--ink2)' }}>{label as string}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* Grid area */}
          <div style={{ flex: 1, padding: '18px 18px 60px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{filtered.length} containers</span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>· Gulf Coast region</span>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                style={{ marginLeft: 'auto', padding: '7px 10px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', fontSize: '12px', cursor: 'pointer', outline: 'none' }}
              >
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="grade">Best Condition First</option>
                <option value="photos">Most Photos</option>
                <option value="newest">Newest Listed</option>
              </select>
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
                  <ContainerCard key={c.id} container={c} onSelect={setSelectedContainer} />
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
          <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '28px 30px' }}>
            <Input label="First Name" placeholder="Jane" />
            <Input label="Company" placeholder="Your Company LLC" />
            <Input label="Phone" type="tel" placeholder="(504) 555-0000" />
            <Input label="Email" type="email" placeholder="jane@company.com" />
            <Input label="Estimated Units Needed" type="number" placeholder="10" />
            <button onClick={() => toast('Request submitted! We\'ll call you within 2 hours.')} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              Request B2B Pricing
            </button>
            <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '12px', color: 'var(--ink3)' }}>
              Or call us directly: <strong style={{ color: 'var(--ink)' }}>(504) 555-0190</strong> — we respond within 2 hours
            </div>
          </div>
        </div>
      )}

      {/* ── Trust bar ── */}
      <div style={{ background: 'var(--ink)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '36px', flexWrap: 'wrap' }}>
        {[
          { icon: '🛡', text: 'Field-inspected every unit' },
          { icon: '🚚', text: '3–5 day delivery' },
          { icon: '📷', text: '16-photo documentation' },
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
        onQuote={() => { setSelectedContainer(null); openQuote('rental') }}
        onReserve={handleReserve}
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

      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
