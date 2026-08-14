// ============================================================
// Marketplace Insights — the review queue + role-aware analytics
//
// One secondary marketplace area, different for every visitor:
//   guest     market snapshot (stock by grade, price by grade, deals)
//   customer  my purchases: units bought, spend, orders by month
//   supplier  claims YTD, recovery $, by shipping line, damaged sales
//   shipper   claims against the line, approval rate, payouts
//   admin     revenue YTD, MoM, inventory mix, AI-grading coverage
//
// The review queue (supplier/shipper/admin) is the landing target of
// every claim email: the containers waiting on YOU, with stage chips
// and a jump into the right portal.
//
// Charts follow the dataviz method: single-hue bars (identity lives in
// the row labels, not color), status colors only for approve/reject,
// values in ink — never in the series color, recessive structure.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import {
  orders as ordersApi, claims as claimsApi, CLAIM_STAGES,
  type Container, type Order, type DamageClaim, type AuthUser,
} from '../../lib/api'
import { GRADE_META, GRADE_ORDER } from '../../lib/specs'
import { damageLabel } from '../../lib/grading'

const INK = 'var(--ink)', INK2 = 'var(--ink2)', INK3 = 'var(--ink3)'
const BLUE = '#0057B8', GREEN = '#1B7A5A', RED = '#B3261E', PURPLE = '#7C3AED', TEAL = '#0E7490'

const card: React.CSSProperties = { background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r16)', padding: '16px', boxShadow: 'var(--sh1)' }

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

// ── Stat tile — a headline number, not a chart ─────────────
function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ ...card, padding: '14px 16px', flex: '1 1 150px', minWidth: '150px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: INK3 }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: '-0.5px', marginTop: '4px', color: accent || INK }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: INK3, marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

// ── Horizontal bar rows — magnitude across labeled entities ──
// Single hue: identity is the row label, color is not doing identity work.
function BarRows({ title, rows, color = BLUE, fmt = (n: number) => String(n) }: {
  title: string; rows: { label: string; value: number; hint?: string }[]; color?: string; fmt?: (n: number) => string
}) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div style={card}>
      <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {rows.map(r => (
          <div key={r.label} title={r.hint || `${r.label}: ${fmt(r.value)}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: INK2, width: '118px', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            <div style={{ flex: 1, height: '10px', borderRadius: '4px', background: 'var(--surf1)', overflow: 'hidden' }}>
              <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', borderRadius: '4px', background: color, minWidth: r.value > 0 ? '3px' : 0 }} />
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: INK, width: '64px', textAlign: 'right' }}>{fmt(r.value)}</span>
          </div>
        ))}
        {rows.length === 0 && <div style={{ fontSize: '12px', color: INK3 }}>No data yet.</div>}
      </div>
    </div>
  )
}

// ── Month-over-month mini columns (last 6 months, single hue) ──
function MoMBars({ title, points, color = BLUE, fmt = (n: number) => String(n) }: {
  title: string; points: { label: string; value: number }[]; color?: string; fmt?: (n: number) => string
}) {
  const max = Math.max(1, ...points.map(p => p.value))
  return (
    <div style={card}>
      <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '96px' }}>
        {points.map((p, i) => (
          <div key={p.label} title={`${p.label}: ${fmt(p.value)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
            {/* Selective direct labels: latest month + the peak only */}
            {(i === points.length - 1 || p.value === max) && p.value > 0 && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: INK }}>{fmt(p.value)}</span>
            )}
            <div style={{ width: '100%', maxWidth: '34px', height: `${Math.max(p.value > 0 ? 6 : 2, (p.value / max) * 68)}px`, borderRadius: '4px 4px 0 0', background: p.value > 0 ? color : 'var(--div)' }} />
            <span style={{ fontSize: '10px', color: INK3 }}>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Time helpers ───────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function lastMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[m.getMonth()] })
  }
  return out
}
const monthKey = (iso?: string | null) => (iso || '').slice(0, 7)
const isYtd = (iso?: string | null) => (iso || '').startsWith(String(new Date().getFullYear()))
const momOf = (rows: { at?: string | null; value?: number }[], sum = false) =>
  lastMonths(6).map(m => ({ label: m.label, value: rows.filter(r => monthKey(r.at) === m.key).reduce((s, r) => s + (sum ? (r.value || 0) : 1), 0) }))

// ── The panel ──────────────────────────────────────────────
export function InsightsPanel({ user, containers }: { user: AuthUser | null; containers: Container[] }) {
  const [orderList, setOrderList] = useState<Order[]>([])
  const [claimList, setClaimList] = useState<DamageClaim[]>([])
  const role = user?.role ?? 'guest'

  useEffect(() => {
    if (user) ordersApi.list().then(setOrderList).catch(() => setOrderList([]))
    if (user && ['supplier', 'shipper', 'admin', 'driver', 'adjuster'].includes(user.role)) {
      claimsApi.list().then(setClaimList).catch(() => setClaimList([]))
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Review queue: the containers waiting on YOU ──
  const queue = useMemo(() => {
    if (role === 'supplier') return claimList.filter(c => c.supplierId === user?.supplierId && ['awaiting_estimate', 'awaiting_decision'].includes(c.status))
    if (role === 'shipper') return claimList.filter(c => c.shipperId === user?.shipperId && c.status === 'awaiting_shipper')
    if (role === 'admin') return claimList.filter(c => !['closed', 'sell_as_damaged', 'repair_scheduled'].includes(c.status))
    return []
  }, [claimList, role, user?.supplierId, user?.shipperId])

  const stageLabel = (st: DamageClaim['status']) =>
    CLAIM_STAGES.find(x => x.key === st)?.label ?? st.replace(/_/g, ' ')
  const portalFor = role === 'shipper' ? 'shipper' : 'supplier'

  // ── Market snapshot (everyone) ──
  const listed = containers.filter(c => c.status === 'available')
  const byGrade = GRADE_ORDER.map(g => ({ label: `${g} — ${GRADE_META[g].label}`, value: listed.filter(c => c.grade === g).length })).filter(r => r.value > 0)
  const avgByGrade = GRADE_ORDER.map(g => {
    const rows = listed.filter(c => c.grade === g && c.buyPrice > 0)
    return { label: `${g} — ${GRADE_META[g].label}`, value: rows.length ? rows.reduce((s, c) => s + c.buyPrice, 0) / rows.length : 0 }
  }).filter(r => r.value > 0)

  // ── Role-specific datasets ──
  const myOrders = orderList // API already scopes customers to their own
  const spent = myOrders.filter(o => ['confirmed', 'assigned', 'in_transit', 'delivered'].includes(o.status)).reduce((s, o) => s + (o.amount || 0), 0)
  const myClaims = role === 'supplier' ? claimList.filter(c => c.supplierId === user?.supplierId)
    : role === 'shipper' ? claimList.filter(c => c.shipperId === user?.shipperId)
    : claimList
  const ytdClaims = myClaims.filter(c => isYtd(c.createdAt))
  const approved = myClaims.filter(c => c.shipperDecision === 'approved')
  const rejected = myClaims.filter(c => c.shipperDecision === 'rejected')
  const recovery = approved.reduce((s, c) => s + (c.estimateAmount || 0), 0)
  const fleet = role === 'supplier' ? containers.filter(c => c.supplierId === user?.supplierId) : containers
  const damagedListed = fleet.filter(c => c.grade === 'D')
  const revenue = orderList.filter(o => ['confirmed', 'delivered'].includes(o.status))

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '26px 20px 80px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>Insights</h2>
        <p style={{ fontSize: '13px', color: INK3, marginTop: '3px' }}>
          {role === 'guest' ? 'Live market snapshot — sign in to see your own numbers.'
            : role === 'customer' ? `Your activity, ${user?.name || ''}`
            : role === 'supplier' ? 'Fleet, claims, and recovery — year to date'
            : role === 'shipper' ? 'Claims filed against your line — year to date'
            : 'Business overview — year to date'}
        </p>
      </div>

      {/* ── Review queue — the email deep-link target ── */}
      {queue.length > 0 && (
        <div style={{ ...card, border: '1.5px solid var(--cta)', background: '#FFF8F3' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>
            ⚡ Review queue — {queue.length} container{queue.length > 1 ? 's' : ''} waiting on {role === 'admin' ? 'the pipeline' : 'you'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {queue.map(c => (
              <a key={c.id} href={`${import.meta.env.BASE_URL}${portalFor}${role === 'shipper' ? `?claim=${c.claimNumber}` : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: 'var(--r8)', background: 'var(--surf-w)', border: '1px solid var(--div)', textDecoration: 'none', color: INK, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700 }}>{c.containerSku}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: INK3 }}>{c.claimNumber}</span>
                {c.severity > 0 && <span style={{ background: RED, color: '#fff', borderRadius: '5px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{damageLabel(c.severity)}</span>}
                <span style={{ fontSize: '11px', color: INK2 }}>{stageLabel(c.status)}</span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: 'var(--cta)' }}>Open →</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Customer: my purchases ── */}
      {role === 'customer' && (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Tile label="Containers bought" value={String(myOrders.filter(o => o.saleType !== 'rent').length)} sub="all time" />
            <Tile label="Rentals" value={String(myOrders.filter(o => o.saleType === 'rent').length)} />
            <Tile label="Total spent" value={money(spent)} sub="confirmed orders" accent={GREEN} />
            <Tile label="Delivered" value={String(myOrders.filter(o => o.status === 'delivered').length)} />
          </div>
          <MoMBars title="My orders — last 6 months" points={momOf(myOrders.map(o => ({ at: o.createdAt })))} color={BLUE} />
        </>
      )}

      {/* ── Supplier analytics ── */}
      {role === 'supplier' && (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Tile label="Fleet size" value={String(fleet.length)} sub="units owned" />
            <Tile label="Claims filed YTD" value={String(ytdClaims.length)} />
            <Tile label="Approved / rejected" value={`${approved.length} / ${rejected.length}`} sub="shipper decisions" />
            <Tile label="Recovery approved" value={money(recovery)} sub="repair costs on the line" accent={GREEN} />
            <Tile label="Selling as damaged" value={String(damagedListed.length)} sub={damagedListed.length ? damagedListed.map(c => damageLabel(c.damageSeverity)).join(' · ') : '—'} accent={RED} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
            <BarRows title="Claims by shipping line — who damages your stock" color={PURPLE}
              rows={[...new Set(myClaims.map(c => c.shipperName))].map(n => ({ label: n, value: myClaims.filter(c => c.shipperName === n).length }))} />
            <BarRows title="Estimate $ by shipping line" color={PURPLE} fmt={money}
              rows={[...new Set(myClaims.map(c => c.shipperName))].map(n => ({ label: n, value: myClaims.filter(c => c.shipperName === n).reduce((s, c) => s + (c.estimateAmount || 0), 0) }))} />
            <MoMBars title="Claims filed — last 6 months" points={momOf(myClaims.map(c => ({ at: c.createdAt })))} color={PURPLE} />
          </div>
        </>
      )}

      {/* ── Shipper analytics ── */}
      {role === 'shipper' && (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Tile label="Claims YTD" value={String(ytdClaims.length)} sub="against your line" />
            <Tile label="Awaiting your review" value={String(queue.length)} accent={queue.length ? 'var(--cta)' : undefined} />
            <Tile label="Approved" value={String(approved.length)} accent={GREEN} sub={money(recovery) + ' payout approved'} />
            <Tile label="Rejected" value={String(rejected.length)} accent={RED} />
            <Tile label="Avg estimate" value={myClaims.length ? money(myClaims.reduce((s, c) => s + (c.estimateAmount || 0), 0) / Math.max(1, myClaims.filter(c => c.estimateAmount > 0).length)) : '—'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
            <MoMBars title="Claims received — last 6 months" points={momOf(myClaims.map(c => ({ at: c.createdAt })))} color={TEAL} />
            <BarRows title="Decisions" rows={[
              { label: 'Approved', value: approved.length },
              { label: 'Rejected', value: rejected.length },
              { label: 'Pending', value: myClaims.filter(c => !c.shipperDecision && c.status !== 'closed').length },
            ]} color={TEAL} />
          </div>
        </>
      )}

      {/* ── Admin analytics ── */}
      {role === 'admin' && (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Tile label="Revenue YTD" value={money(revenue.filter(o => isYtd(o.createdAt)).reduce((s, o) => s + (o.amount || 0), 0))} accent={GREEN} sub="confirmed + delivered" />
            <Tile label="Orders YTD" value={String(orderList.filter(o => isYtd(o.createdAt)).length)} />
            <Tile label="Listed inventory" value={String(listed.length)} sub={`${damagedListed.length} damaged deals`} />
            <Tile label="AI-graded" value={`${Math.round((containers.filter(c => c.aiGraded).length / Math.max(1, containers.length)) * 100)}%`} sub="of all units" accent={PURPLE} />
            <Tile label="Open claims" value={String(claimList.filter(c => !['closed', 'sell_as_damaged'].includes(c.status)).length)} />
            <Tile label="Relay fees (SteelBox Co.)" value={money(orderList.filter(o => o.crossTerritory && isYtd(o.createdAt)).reduce((s2, o) => s2 + (o.relayPlatform || 0), 0))} sub={`${orderList.filter(o => o.crossTerritory && isYtd(o.createdAt)).length} cross-territory orders YTD`} accent={TEAL} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
            <MoMBars title="Revenue — last 6 months" points={momOf(revenue.map(o => ({ at: o.createdAt, value: o.amount })), true)} color={GREEN} fmt={money} />
            <MoMBars title="Orders — last 6 months" points={momOf(orderList.map(o => ({ at: o.createdAt })))} color={BLUE} />
          </div>
        </>
      )}

      {/* ── Market snapshot — everyone, and all a guest sees ── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Tile label="Units listed now" value={String(listed.length)} />
        <Tile label="Damaged deals" value={String(listed.filter(c => c.grade === 'D').length)} sub="sold as-is, photos included" accent={RED} />
        <Tile label="Depots stocked" value={String(new Set(listed.map(c => c.depotLocation).filter(Boolean)).size)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
        <BarRows title="Available stock by grade" rows={byGrade} color={BLUE} />
        <BarRows title="Average price by grade" rows={avgByGrade} color={BLUE} fmt={money} />
      </div>
      {!user && (
        <div style={{ fontSize: '12px', color: INK3 }}>
          Sign in to see your own numbers — customers get purchase history, suppliers and shipping lines get their claims dashboard.
        </div>
      )}
    </div>
  )
}
