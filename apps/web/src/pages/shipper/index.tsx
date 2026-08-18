// ============================================================
// Shipper Claims Review — the shipping line's side of arbitration
// Route: /shipper (roles: shipper, admin)
//
// The line reviews each claim's damage evidence and the supplier's
// repair estimate, then approves or rejects it. Their insurance
// carrier does its own review off-platform — this records the
// line's decision so the supplier's tracker can move to the
// retail-or-wholesale step.
// ============================================================

import React, { useEffect, useState } from 'react'
import { useAuth, useSnackbar } from '../../hooks'
import { claims as claimsApi, prefs as prefsApi, photoUrl, type DamageClaim, type AuthUser } from '../../lib/api'
import { damageLabel, SEVERITY_WORD } from '../../lib/grading'
import { Snackbar } from '../../components/ui'
import { ClaimTimeline, ClaimPacket, ClaimPackageActions, photoCaption } from '../supplier/claimkit'
import { FilterRail, FilterGroup, ChipRow, Chip, useSetFilter, railSelect, PeriodFilter, PERIOD_ALL, periodPasses, type Period } from '../../components/filters'

const INK = '#0D0E12', INK2 = '#44474F', INK3 = '#6B7280', DIV = '#E2E4E9', BLUE = '#0057B8', RED = '#B3261E', GREEN = '#1B7A5A'
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }

// embedded: rendered as a tab inside the marketplace (single sign-in) — the
// standalone chrome (header, page background) is skipped, content only.
export default function ShipperReviewPage({ embedded = false }: { embedded?: boolean }) {
  const { user, logout } = useAuth()
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()
  const [claimList, setClaimList] = useState<DamageClaim[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [packet, setPacket] = useState<DamageClaim | null>(null)
  // Claims this session has actually opened and read.
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())

  // Opens the whole claim — every photo, damage, note and the estimate — in
  // its own tab, and marks it read so the decision buttons appear.
  const openReview = async (c: DamageClaim) => {
    setBusy(c.id)
    try {
      const { url } = await claimsApi.documentLink(c.id)
      window.open(url, '_blank', 'noopener')
      setReviewed(prev => new Set(prev).add(c.id))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open the claim')
    } finally { setBusy(null) }
  }
  const [digest, setDigest] = useState<AuthUser['digestFreq']>(user?.digestFreq || 'per_container')
  // Deep link from a share email: /shipper?claim=CLM-0003 pins that claim first
  const wanted = new URLSearchParams(window.location.search).get('claim')

  const refresh = () => claimsApi.list().then(setClaimList).catch(() => {})
  useEffect(() => { refresh() }, [])

  const decide = async (c: DamageClaim, decision: 'approved' | 'rejected') => {
    if (busy) return
    setBusy(c.id)
    try {
      await claimsApi.update(c.id, {
        shipperDecision: decision,
        shipperNotes: notes[c.id] || '',
        shipperDecidedAt: new Date().toISOString(),
        status: 'awaiting_decision',
      })
      toast(`${c.claimNumber} ${decision} — the supplier decides retail vs wholesale next`)
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not record the decision')
    } finally { setBusy(null) }
  }

  // ── Filters (left rail, marketplace-style) ────────────────
  const fSeverity = useSetFilter<number>()
  const [fSupplier, setFSupplier] = useState('')
  const [period, setPeriod] = useState<Period>(PERIOD_ALL)
  const resetFilters = () => { fSeverity.clear(); setFSupplier(''); setPeriod(PERIOD_ALL) }
  const severitiesPresent = [...new Set(claimList.map(c => c.severity).filter(s => s > 0))].sort()
  const suppliersPresent = [...new Map(claimList.map(c => [c.supplierId, c.supplierName])).entries()]
  const claimYears = [...new Set(claimList.map(c => new Date(c.createdAt).getFullYear()))].sort()
  const passes = (c: DamageClaim) =>
    (fSeverity.set.size === 0 || fSeverity.set.has(c.severity))
    && (!fSupplier || c.supplierId === fSupplier)
    && periodPasses(c.createdAt, period)
  const filtered = claimList.filter(passes)

  const queue = [...filtered.filter(c => c.status === 'awaiting_shipper')]
    .sort((a, b) => (a.claimNumber === wanted ? -1 : b.claimNumber === wanted ? 1 : 0))
  const decided = filtered.filter(c => !!c.shipperDecision)

  return (
    <div style={{ fontFamily: 'var(--sans)', background: embedded ? 'transparent' : 'var(--pg)', minHeight: embedded ? undefined : '100vh', color: INK }}>
      {!embedded && (
      <header style={{ background: '#fff', borderBottom: `1px solid ${DIV}`, padding: '0 20px', height: '60px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#0E7490', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: '15px' }}>⚓</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>Shipper Claims Review</div>
          <div style={{ fontSize: '11px', color: INK3 }}>{user?.name}{user ? ` · ${user.email}` : ''}</div>
        </div>
        <label style={{ marginLeft: 'auto', fontSize: '11px', color: INK3, display: 'flex', alignItems: 'center', gap: '6px' }}>
          Claim emails
          <select value={digest} onChange={e => { const v = e.target.value as AuthUser['digestFreq']; setDigest(v); prefsApi.update({ digestFreq: v! }).then(() => toast(`Emails: ${v === 'per_container' ? 'one per container' : `${v} digest of your review queue`}`)).catch(() => {}) }}
            style={{ padding: '7px 9px', border: `1.5px solid ${DIV}`, borderRadius: '10px', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }}>
            <option value="per_container">Per container</option>
            <option value="daily">Daily digest</option>
            <option value="weekly">Weekly digest</option>
          </select>
        </label>
        <button onClick={logout} style={{ padding: '9px 16px', borderRadius: '999px', border: `1.5px solid ${DIV}`, background: '#fff', color: INK2, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Sign out</button>
      </header>
      )}

      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '22px 16px 80px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Estimates awaiting your decision <span style={{ fontSize: '12px', color: INK3, fontWeight: 400 }}>· {queue.length}</span></h2>
          <p style={{ fontSize: '12px', color: INK3, marginTop: '3px' }}>Approve or reject each repair estimate. Your insurance carrier's own review happens off-platform.</p>
        </div>

        {/* Left filter rail + review column, marketplace-style */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <FilterRail count={filtered.length} total={claimList.length} onReset={resetFilters}>
          {severitiesPresent.length > 0 && (
            <FilterGroup label="Severity">
              <ChipRow>{severitiesPresent.map(s => <Chip key={s} on={fSeverity.set.has(s)} onClick={() => fSeverity.toggle(s)}>{damageLabel(s)}</Chip>)}</ChipRow>
            </FilterGroup>
          )}
          <FilterGroup label="Supplier">
            <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} style={railSelect}>
              <option value="">All suppliers</option>
              {suppliersPresent.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </FilterGroup>
          <PeriodFilter period={period} onChange={setPeriod} years={claimYears} />
        </FilterRail>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minWidth: '440px' }}>
        {queue.length === 0 && <div style={{ ...card, textAlign: 'center', color: INK3, fontSize: '13px' }}>Nothing waiting on you{filtered.length < claimList.length ? ' that matches these filters' : ''}.</div>}
        {queue.map(c => (
          <div key={c.id} style={{ ...card, ...(c.claimNumber === wanted ? { border: '2px solid #0E7490', boxShadow: '0 0 0 4px rgba(14,116,144,.12)' } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px' }}>{c.containerSku}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: INK3 }}>{c.claimNumber}{c.vesselRef ? ` · ${c.vesselRef}` : ''}</span>
              <span style={{ fontSize: '11px', color: INK3 }}>filed by {c.supplierName}</span>
              {c.severity > 0 && <span title={SEVERITY_WORD[c.severity]} style={{ background: RED, color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>{damageLabel(c.severity)} · {SEVERITY_WORD[c.severity]}</span>}
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '18px', fontWeight: 700 }}>${(c.estimateAmount || 0).toLocaleString()}</span>
            </div>
            {c.estimateNotes && <div style={{ fontSize: '12px', color: INK2, marginTop: '6px' }}>Estimate: {c.estimateNotes}</div>}
            {c.notes && <div style={{ fontSize: '12px', color: INK3, marginTop: '2px' }}>Claim notes: {c.notes}</div>}

            {/* Evidence gallery — captured unedited by the field inspection */}
            {(c.photos || []).filter(Boolean).length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', overflowX: 'auto' }}>
                {(c.photos || []).map((u, i) => u ? (
                  <div key={i} style={{ flexShrink: 0 }}>
                    <img src={photoUrl(u)} alt={photoCaption(c, i)} style={{ width: '108px', height: '80px', objectFit: 'cover', borderRadius: '8px', display: 'block' }} />
                    <div style={{ fontSize: '9px', fontWeight: 700, color: INK2, marginTop: '2px', maxWidth: '108px' }}>{photoCaption(c, i)}</div>
                    {c.photoNotes?.[i] && <div style={{ fontSize: '9px', color: INK3, maxWidth: '108px', lineHeight: 1.3 }}>{c.photoNotes[i]}</div>}
                  </div>
                ) : null)}
              </div>
            )}
            <div style={{ fontSize: '11px', color: INK3, marginTop: '6px' }}>Inspected {c.inspectedAt ? new Date(c.inspectedAt).toLocaleDateString() : '—'} by {c.inspectorName || '—'}</div>

            {/* Approving is money out the door, so it follows an actual read:
                the whole claim has to be opened before the buttons unlock. */}
            {!reviewed.has(c.id) ? (
              <div style={{ marginTop: '12px', padding: '13px 15px', background: '#FFF8E1', border: '1.5px solid #F2C94C', borderRadius: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: INK }}>Review the claim before deciding</div>
                <div style={{ fontSize: '12px', color: INK2, lineHeight: 1.5, margin: '3px 0 10px' }}>
                  Photos, damages, notes and the repair estimate — one page. Approving or rejecting
                  unlocks once you've opened it.
                </div>
                <button onClick={() => openReview(c)} disabled={busy === c.id}
                  style={{ padding: '10px 18px', borderRadius: '999px', border: 'none', background: BLUE, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {busy === c.id ? 'Opening…' : 'Open the full claim →'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: GREEN }}>✓ Reviewed</span>
                <button onClick={() => openReview(c)} style={{ padding: '9px 16px', borderRadius: '999px', border: `1.5px solid ${DIV}`, background: '#fff', color: INK2, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Read it again</button>
                <input value={notes[c.id] ?? ''} onChange={e => setNotes(p => ({ ...p, [c.id]: e.target.value }))} placeholder="Decision notes (optional)"
                  style={{ flex: 1, minWidth: '200px', padding: '9px 12px', border: `1.5px solid ${DIV}`, borderRadius: '10px', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }} />
                <button onClick={() => decide(c, 'approved')} disabled={busy === c.id}
                  style={{ padding: '9px 18px', borderRadius: '999px', border: 'none', background: GREEN, color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Approve estimate</button>
                <button onClick={() => decide(c, 'rejected')} disabled={busy === c.id}
                  style={{ padding: '9px 18px', borderRadius: '999px', border: 'none', background: RED, color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Reject</button>
              </div>
            )}
            <ClaimTimeline claim={c} />
          </div>
        ))}

        {decided.length > 0 && (
          <div style={{ ...card }}>
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Decision history</div>
            {decided.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', padding: '6px 0', borderBottom: `1px solid ${DIV}`, fontSize: '12px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{c.containerSku}</span>
                <span style={{ color: INK3 }}>{c.claimNumber}</span>
                <span style={{ fontFamily: 'var(--mono)' }}>${(c.estimateAmount || 0).toLocaleString()}</span>
                <span style={{ fontWeight: 700, color: c.shipperDecision === 'approved' ? GREEN : RED }}>{c.shipperDecision.toUpperCase()}</span>
                <span style={{ color: INK3, marginLeft: 'auto' }}>{c.shipperDecidedAt ? new Date(c.shipperDecidedAt).toLocaleDateString() : ''}</span>
              </div>
            ))}
          </div>
        )}
        </div>{/* review column */}
        </div>{/* rail + column row */}
      </main>
      {packet && <ClaimPacket claim={packet} onClose={() => setPacket(null)} />}
      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
