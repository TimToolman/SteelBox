// ============================================================
// MVP Container Marketplace — Container detail modal
// ============================================================

import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui'
import { useIsMobile } from '../../hooks'
import { isZipCovered, estimateDelivery, type Container } from '../../lib/api'
import { GRADE_META } from '../../lib/specs'
import { allowedModes, condOf, SIZE_LABELS, type CartMode } from './shared'
import { PhotoGallery } from './PhotoGallery'

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

export function DetailModal({ container, onClose, onAddToCart, mode, inCart, onNavigate, index, total }: DetailModalProps) {
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
  const { sku, grade, size, buyPrice, rentMonthly } = container
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
      {/* Gallery — the 8 field photos + the AI-stitched 3D render (image 9) */}
      <PhotoGallery container={container} />

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
