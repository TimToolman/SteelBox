// ============================================================
// Analytics — the Reporting & Analytics view of the admin portal
//
// Scope-aware like everything else: SteelBox Co. HQ sees the whole
// platform with a per-reseller breakdown; a reseller admin (or a
// spoofed tenant) sees exactly their own numbers. Rendered from the
// already-scoped lists the portal holds — no extra queries.
// ============================================================

import React, { useMemo } from 'react'
import type { Order, Container, Seller } from '../../lib/api'

const card: React.CSSProperties = { background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '16px 18px' }

// Sold revenue = money actually moving: everything past the review call.
const REVENUE_STATUSES = new Set(['confirmed', 'assigned', 'in_transit', 'delivered'])

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)', marginTop: '4px' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

// One horizontal bar — thin mark, rounded data end, value in ink (never on
// the bar color). `color` carries identity only (seller rows); magnitude
// rows all share the primary hue.
function BarRow({ label, value, max, color, fmt }: { label: string; value: number; max: number; color: string; fmt: (n: number) => string }) {
  // Zero draws nothing — a minimum-width stub would misreport an empty month.
  const w = value > 0 && max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
      <span style={{ width: '112px', fontSize: '12px', color: 'var(--ink2)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '10px', background: 'var(--surf1)', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: '5px' }} />
      </div>
      <span style={{ width: '84px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{fmt(value)}</span>
    </div>
  )
}

export function AnalyticsView({ orders, containers, sellers, scope, openClaims }: {
  orders: Order[]         // already tenant-scoped by the portal
  containers: Container[] // already tenant-scoped
  sellers: Seller[]
  scope: string           // 'global' (HQ) or a seller id
  openClaims: number
}) {
  const now = new Date()
  const year = now.getFullYear()
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`

  const stats = useMemo(() => {
    const sold = orders.filter(o => REVENUE_STATUSES.has(o.status))
    const inYear = sold.filter(o => new Date(o.createdAt).getFullYear() === year)
    const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`
    const thisMonth = sold.filter(o => monthKey(new Date(o.createdAt)) === monthKey(now))
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth = sold.filter(o => monthKey(new Date(o.createdAt)) === monthKey(lastMonthDate))
    const sum = (list: Order[]) => list.reduce((s, o) => s + (o.amount || 0), 0)
    const mom = sum(lastMonth) > 0 ? ((sum(thisMonth) - sum(lastMonth)) / sum(lastMonth)) * 100 : null

    // Last 6 calendar months of revenue, oldest first.
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return {
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        value: sum(sold.filter(o => monthKey(new Date(o.createdAt)) === monthKey(d))),
      }
    })

    // Per-reseller rollup (HQ view only).
    const bySeller = sellers.map(sl => ({
      seller: sl,
      revenue: sum(sold.filter(o => (o.sellerId || 'sel_mvp') === sl.id)),
      orders: sold.filter(o => (o.sellerId || 'sel_mvp') === sl.id).length,
    })).sort((a, b) => b.revenue - a.revenue)

    const relay = orders.reduce((s, o) => s + (o.relayPlatform || 0), 0)
    return { sold, inYear, sumYTD: sum(inYear), sumMonth: sum(thisMonth), mom, months, bySeller, relay }
  }, [orders, sellers, year]) // eslint-disable-line react-hooks/exhaustive-deps

  const available = containers.filter(c => c.status === 'available').length
  const maxMonth = Math.max(...stats.months.map(m => m.value), 1)
  const maxSeller = Math.max(...stats.bySeller.map(s => s.revenue), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '12px' }}>
        <Tile label={`Revenue YTD ${year}`} value={money(stats.sumYTD)} sub={`${stats.inYear.length} orders`} />
        <Tile label="Revenue this month" value={money(stats.sumMonth)}
          sub={stats.mom == null ? 'no prior month' : `${stats.mom >= 0 ? '+' : ''}${stats.mom.toFixed(0)}% vs last month`} />
        <Tile label="Units listed" value={String(available)} sub={`${containers.length} in fleet`} />
        <Tile label="Open damage claims" value={String(openClaims)} />
        {scope === 'global' && <Tile label="Relay fees (SteelBox Co.)" value={money(stats.relay)} sub="platform share, all time" />}
      </div>

      {/* Revenue trend — magnitude: one hue */}
      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Revenue by month <span style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 400 }}>· last 6 months</span></div>
        {stats.months.map(m => (
          <BarRow key={m.label} label={m.label} value={m.value} max={maxMonth} color="var(--primary)" fmt={money} />
        ))}
      </div>

      {/* Per-reseller — identity: each row wears its reseller's brand color */}
      {scope === 'global' && (
        <div style={card}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>Revenue by reseller</div>
          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '8px' }}>Spoof a reseller from the Managing menu to drill into their full portal view.</div>
          {stats.bySeller.map(({ seller, revenue, orders: n }) => (
            <BarRow key={seller.id} label={`${seller.name} (${n})`} value={revenue} max={maxSeller}
              color={seller.brandPrimary || 'var(--primary)'} fmt={money} />
          ))}
        </div>
      )}
    </div>
  )
}
