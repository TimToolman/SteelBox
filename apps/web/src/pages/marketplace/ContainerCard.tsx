// ============================================================
// MVP Container Marketplace — Inventory card (Buy/Rent grid)
// ============================================================

import React from 'react'
import { photoUrl, type Container, type ContainerSize } from '../../lib/api'
import { GRADE_META } from '../../lib/specs'
import { allowedModes, condOf, SIZE_LABELS } from './shared'

// ── Container Card ─────────────────────────────────────────

interface ContainerCardProps {
  container: Container
  onSelect: (c: Container) => void
  mode?: 'buy' | 'rent'
  inCart?: boolean
  onAddToCart?: (c: Container, mode: 'buy' | 'rent') => void
}

export function ContainerCard({ container, onSelect, mode = 'buy', inCart = false, onAddToCart }: ContainerCardProps) {
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
