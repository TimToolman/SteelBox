// ============================================================
// Seller identity mark — the multi-tenant "sold by" chip.
// Renders the seller's two-tone logo square + name anywhere a
// listing, cart line, or order needs to attribute its seller.
// ============================================================

import React from 'react'
import type { Seller } from '../../lib/api'

export function SellerLogo({ seller, size = 16 }: { seller?: Seller; size?: number }) {
  const primary = seller?.brandPrimary || 'var(--primary)'
  const accent = seller?.brandAccent || 'var(--cta)'
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: Math.round(size / 4), flexShrink: 0,
      background: `linear-gradient(135deg, ${primary} 50%, ${accent} 50%)`,
      display: 'inline-block',
    }} />
  )
}

export function SellerMark({ seller, name, size = 'sm' }: { seller?: Seller; name?: string; size?: 'sm' | 'md' }) {
  const label = seller?.name || name
  if (!label) return null
  const sm = size === 'sm'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: sm ? 5 : 7, minWidth: 0 }}>
      <SellerLogo seller={seller} size={sm ? 12 : 18} />
      <span style={{
        fontSize: sm ? 10 : 13, fontWeight: 700, color: sm ? 'var(--ink3)' : 'var(--ink)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
    </span>
  )
}
