// ============================================================
// Supplier Portal — container owners (companies resellers buy from)
// Route: /supplier (roles: supplier, admin)
//
// Fleet view + the damage-claim pipeline. The tracker follows the
// supplier-facing stages: Awaiting inspection → Awaiting estimate →
// Awaiting shipper approval → Awaiting supplier decision (retail or
// wholesale). Approved claims schedule with an approved repair shop;
// rejected — or whenever the supplier chooses — units are marked
// damaged (grade D) and listed for sale as-is. Per policy, a supplier
// may sell as damaged even when the shipper approved repairs.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks'
import {
  containers as containersApi, claims as claimsApi, suppliersApi, shippersApi, repairShops as repairShopsApi,
  depots as depotsApi, prefs as prefsApi, photoUrl, findingsOf, SIZE_LABEL, CLAIM_STAGES,
  type Container, type DamageClaim, type Supplier, type Shipper, type RepairShop, type ClaimStatus, type AuthUser, type Depot,
} from '../../lib/api'
import { GRADE_META, DAMAGE_DISCOUNT } from '../../lib/specs'
import { FilterRail, FilterGroup, ChipRow, Chip, useSetFilter, railSelect, PeriodFilter, PERIOD_ALL, periodPasses, type Period } from '../../components/filters'
import { ClaimTimeline, ClaimPacket, ClaimPackageActions, photoCaption, claimShots } from './claimkit'
import { Lightbox, useLightbox } from '../../components/Lightbox'
import { gradeLabel, damageLabel, SEVERITY_WORD } from '../../lib/grading'
import { Snackbar } from '../../components/ui'
import { useSnackbar } from '../../hooks'

const INK = '#0D0E12', INK2 = '#44474F', INK3 = '#6B7280', DIV = '#E2E4E9', BLUE = '#0057B8', RED = '#B3261E', GREEN = '#1B7A5A'

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }
const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({ padding: '9px 16px', borderRadius: '999px', border: 'none', background: bg, color: fg, fontSize: '12px', fontWeight: 700, cursor: 'pointer' })
const ghost: React.CSSProperties = { padding: '9px 16px', borderRadius: '999px', border: `1.5px solid ${DIV}`, background: '#fff', color: INK2, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }
const inp: React.CSSProperties = { padding: '9px 12px', border: `1.5px solid ${DIV}`, borderRadius: '10px', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }

// The 4-stage tracker the supplier watches. Terminal outcomes render after it.
function StageTracker({ status }: { status: ClaimStatus }) {
  const idx = CLAIM_STAGES.findIndex(s => s.key === status)
  const terminal = idx === -1
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
      {CLAIM_STAGES.map((s, i) => {
        const done = terminal || i < idx
        const active = i === idx
        return (
          <React.Fragment key={s.key}>
            <span title={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: done ? '#E6F4EE' : active ? '#D6E4FF' : '#F3F4F6', color: done ? GREEN : active ? BLUE : INK3 }}>
              {done ? '✓' : i + 1} {s.label.replace(' — retail or wholesale', '')}
            </span>
            {i < CLAIM_STAGES.length - 1 && <span style={{ color: INK3, fontSize: '10px' }}>→</span>}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// embedded: rendered as a tab inside the marketplace (single sign-in) — the
// standalone chrome (header, page background) is skipped, content only.
export default function SupplierPortalPage({ embedded = false }: { embedded?: boolean }) {
  const { user, logout } = useAuth()
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()
  const [fleet, setFleet] = useState<Container[]>([])
  const [claimList, setClaimList] = useState<DamageClaim[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [shipperList, setShipperList] = useState<Shipper[]>([])
  const [shops, setShops] = useState<RepairShop[]>([])
  const [depotList, setDepotList] = useState<Depot[]>([])
  // New-claim form
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState({ containerId: '', shipperId: '', vesselRef: '', notes: '' })
  // Per-claim working inputs (estimate / repair scheduling / as-is pricing)
  const [est, setEst] = useState<Record<string, { amount: string; notes: string }>>({})
  const [rep, setRep] = useState<Record<string, { shopId: string; date: string }>>({})
  const [askPrice, setAskPrice] = useState<Record<string, string>>({})
  const [packet, setPacket] = useState<DamageClaim | null>(null)
  const lb = useLightbox()
  // The workspace is a page of its own, in its own tab — a claim is desk work
  // and the evidence needs the whole window.
  const openWorkspace = (c: DamageClaim) =>
    window.open(`${import.meta.env.BASE_URL}claim?id=${c.id}`, '_blank', 'noopener')
  const [digest, setDigest] = useState<AuthUser['digestFreq']>(user?.digestFreq || 'per_container')

  const supplierId = user?.supplierId || ''
  const me = suppliers.find(s => s.id === supplierId)

  const refresh = () => {
    containersApi.list().then(all => setFleet(all.filter(c => !supplierId || c.supplierId === supplierId))).catch(() => {})
    claimsApi.list().then(setClaimList).catch(() => {})
  }
  useEffect(() => {
    refresh()
    suppliersApi.list().then(setSuppliers).catch(() => {})
    shippersApi.list().then(setShipperList).catch(() => {})
    repairShopsApi.list().then(setShops).catch(() => {})
    depotsApi.list().then(setDepotList).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Shops assigned to the claim unit's site (admin-configured); a shop with
  // no site assignments serves everywhere.
  const shopsForClaim = (c: DamageClaim): RepairShop[] => {
    const unit = fleet.find(x => x.id === c.containerId)
    const depotId = depotList.find(d => d.name === unit?.depotLocation)?.id
    return shops.filter(sh => sh.approved && (!sh.siteIds?.length || !depotId || sh.siteIds.includes(depotId)))
  }

  const myClaims = useMemo(() =>
    claimList.filter(c => !supplierId || c.supplierId === supplierId), [claimList, supplierId])
  const claimedIds = new Set(myClaims.filter(c => c.status !== 'closed').map(c => c.containerId))
  // Claimable = not already claimed, and carrying at least one photographed
  // finding from an inspection. Without evidence the API refuses the claim.
  const claimable = useMemo(() => fleet.filter(c =>
    !claimedIds.has(c.id) && findingsOf(c).some(f => !!f.photo)), [fleet, claimList]) // eslint-disable-line react-hooks/exhaustive-deps

  const createClaim = async () => {
    if (!newForm.containerId || !newForm.shipperId) { toast('Pick the container and the shipping line'); return }
    try {
      await claimsApi.create({ ...newForm, supplierId })
      toast('Claim filed — awaiting field inspection')
      setNewOpen(false); setNewForm({ containerId: '', shipperId: '', vesselRef: '', notes: '' })
      refresh()
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not file the claim') }
  }

  const submitEstimate = async (c: DamageClaim) => {
    const e = est[c.id]
    const amount = Number(e?.amount)
    if (!amount || amount <= 0) { toast('Enter the estimated repair cost'); return }
    try {
      await claimsApi.update(c.id, { estimateAmount: amount, estimateNotes: e?.notes || '', status: 'awaiting_shipper' })
      toast(`Estimate $${amount.toLocaleString()} sent to ${c.shipperName} for approval`)
      refresh()
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not submit the estimate') }
  }

  const scheduleRepair = async (c: DamageClaim) => {
    const r = rep[c.id]
    const shop = shops.find(s => s.id === r?.shopId)
    if (!shop || !r?.date) { toast('Pick an approved repair shop and a date'); return }
    try {
      await claimsApi.update(c.id, { repairShopId: shop.id, repairShopName: shop.name, repairDate: r.date, status: 'repair_scheduled', decision: 'retail' })
      toast(`Repair booked at ${shop.name} for ${r.date}`)
      refresh()
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not schedule the repair') }
  }

  // Sell as damaged: grades the unit D with the inspection's severity and
  // publishes the claim's damage photos on the listing. Allowed at any point
  // after inspection — including after the shipper approved repairs.
  // Suggested as-is price: severity-scaled discount off the current list
  // price. The supplier can override before listing.
  const suggestedPrice = (c: DamageClaim) => {
    const unit = fleet.find(u => u.id === c.containerId)
    if (!unit) return null
    const disc = DAMAGE_DISCOUNT[c.severity || 3] ?? 0.28
    return { was: unit.buyPrice, now: Math.round(unit.buyPrice * (1 - disc) / 25) * 25, disc }
  }

  const sellAsDamaged = async (c: DamageClaim) => {
    const sug = suggestedPrice(c)
    const price = Number(askPrice[c.id]) || sug?.now || 0
    try {
      await containersApi.update(c.containerId, {
        grade: 'D', damageSeverity: c.severity || 3, damagePhotos: c.photos || [],
        condition: 'used', status: 'available', listingType: 'buy',
        ...(price > 0 ? { buyPrice: price, preDamagePrice: sug?.was ?? 0 } : {}),
      } as Partial<Container>)
      await claimsApi.update(c.id, { status: 'sell_as_damaged', decision: 'wholesale' })
      toast(`${c.containerSku} listed as damaged ${damageLabel(c.severity || 3)}${price ? ` at $${price.toLocaleString()}` : ''} — live on the marketplace`)
      refresh()
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not list the unit') }
  }

  const share = async (c: DamageClaim, mode: 'packet' | 'link' | 'package') => {
    try {
      await claimsApi.share(c.id, mode)
      toast(mode === 'packet' ? `Claim packet emailed to ${c.shipperName}`
        : mode === 'package' ? `Full claim package (.zip) emailed to ${c.shipperName}`
        : `Login link emailed to ${c.shipperName} — their sign-in will land on the audit trail`)
      refresh()
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not share') }
  }

  const copyShipperLink = (c: DamageClaim) => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}shipper?claim=${c.claimNumber}`
    navigator.clipboard?.writeText(url).then(() => toast('Shipper login link copied')).catch(() => toast(url))
  }

  const markRepaired = async (c: DamageClaim) => {
    try {
      await claimsApi.update(c.id, { status: 'closed' })
      toast(`${c.containerSku} repair complete — claim closed, unit stays retail`)
      refresh()
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not close the claim') }
  }

  // ── Claim filters (left rail, marketplace-style) ──────────
  const fStage = useSetFilter<ClaimStatus>()
  const fSeverity = useSetFilter<number>()
  const [fLine, setFLine] = useState('')
  const [period, setPeriod] = useState<Period>(PERIOD_ALL)
  const resetClaimFilters = () => { fStage.clear(); fSeverity.clear(); setFLine(''); setPeriod(PERIOD_ALL) }
  const claimYears = [...new Set(myClaims.map(c => new Date(c.createdAt).getFullYear()))].sort()
  const stagesPresent = [...new Set(myClaims.map(c => c.status))]
  const severitiesPresent = [...new Set(myClaims.map(c => c.severity).filter(s => s > 0))].sort()
  const STAGE_WORD: Record<string, string> = {
    awaiting_estimate: 'Review & estimate',
    awaiting_shipper: 'Awaiting shipper', awaiting_decision: 'Awaiting decision',
    repair_scheduled: 'Repair scheduled', sell_as_damaged: 'Sell as damaged', closed: 'Closed',
  }
  const filteredClaims = myClaims.filter(c =>
    fStage.passes(c.status) && (fSeverity.set.size === 0 || fSeverity.set.has(c.severity))
    && (!fLine || c.shipperId === fLine) && periodPasses(c.createdAt, period))
  const filtersOn = fStage.set.size > 0 || fSeverity.set.size > 0 || !!fLine || period.quick !== 'all' || period.year !== 'all' || period.month !== 'all'

  const active = filteredClaims.filter(c => c.status !== 'closed')
  const closed = filteredClaims.filter(c => c.status === 'closed')

  return (
    <div style={{ fontFamily: 'var(--sans)', background: embedded ? 'transparent' : 'var(--pg)', minHeight: embedded ? undefined : '100vh', color: INK }}>
      {/* Header — standalone route only; the marketplace tab brings its own nav */}
      {!embedded && (
      <header style={{ background: '#fff', borderBottom: `1px solid ${DIV}`, padding: '0 20px', height: '60px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#7C3AED', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: '15px' }}>S</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>Supplier Portal</div>
          <div style={{ fontSize: '11px', color: INK3 }}>{me?.name || user?.name || 'Supplier'}{user ? ` · ${user.email}` : ''}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '11px', color: INK3, display: 'flex', alignItems: 'center', gap: '6px' }}>
            Claim emails
            <select value={digest} onChange={e => { const v = e.target.value as AuthUser['digestFreq']; setDigest(v); prefsApi.update({ digestFreq: v! }).then(() => toast(`Emails: ${v === 'per_container' ? 'one per container' : `${v} digest of your review queue`}`)).catch(() => {}) }}
              style={{ ...inp, padding: '6px 8px', fontSize: '12px' }}>
              <option value="per_container">Per container</option>
              <option value="daily">Daily digest</option>
              <option value="weekly">Weekly digest</option>
            </select>
          </label>
          <a href={`${import.meta.env.BASE_URL}shop`} style={{ ...ghost, textDecoration: 'none' }}>Marketplace</a>
          <button onClick={logout} style={ghost}>Sign out</button>
        </div>
      </header>
      )}

      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '22px 16px 80px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Claims pipeline */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Damage Claims</h2>
            <span style={{ fontSize: '12px', color: INK3 }}>{active.length} active</span>
            <button onClick={() => setNewOpen(o => !o)} style={{ ...btn('#7C3AED'), marginLeft: 'auto' }}>{newOpen ? 'Cancel' : '+ File a claim'}</button>
          </div>

          {newOpen && (
            <div style={{ ...card, marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>New damage claim</div>
              {/* A claim is evidence or it is nothing, so only units the field
                  crew photographed damage on can be claimed for. */}
              <div style={{ fontSize: '11.5px', color: INK3, marginBottom: '10px' }}>
                {claimable.length
                  ? 'Only units with photographed damage from an inspection can be claimed — the photos come across with the claim.'
                  : 'No unit has photographed damage on file yet. A claim is raised after an inspection records it.'}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <select value={newForm.containerId} onChange={e => setNewForm(f => ({ ...f, containerId: e.target.value }))} style={{ ...inp, minWidth: '220px' }}>
                  <option value="">— Container —</option>
                  {claimable.map(c => <option key={c.id} value={c.id}>{c.sku} · {SIZE_LABEL[c.size] ?? c.size}</option>)}
                </select>
                <select value={newForm.shipperId} onChange={e => setNewForm(f => ({ ...f, shipperId: e.target.value }))} style={{ ...inp, minWidth: '190px' }}>
                  <option value="">— Shipping line —</option>
                  {/* Directory managed in Admin → Shipping Lines; deactivated carriers stay out of the picker */}
                  {shipperList.filter(sh => sh.active !== false).map(sh => <option key={sh.id} value={sh.id}>{sh.name}{sh.line ? ` · ${sh.line}` : ''}</option>)}
                </select>
                <input value={newForm.vesselRef} onChange={e => setNewForm(f => ({ ...f, vesselRef: e.target.value }))} placeholder="Vessel / BOL ref" style={{ ...inp, width: '160px' }} />
                <input value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} placeholder="What happened?" style={{ ...inp, flex: 1, minWidth: '200px' }} />
                <button onClick={createClaim} style={btn('#E65100')}>File claim</button>
              </div>
            </div>
          )}

          {/* Left filter rail + claims column, marketplace-style */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <FilterRail count={filteredClaims.length} total={myClaims.length} onReset={resetClaimFilters}>
            <FilterGroup label="Stage">
              <ChipRow>{stagesPresent.map(s => <Chip key={s} on={fStage.set.has(s)} onClick={() => fStage.toggle(s)}>{STAGE_WORD[s] ?? s}</Chip>)}</ChipRow>
            </FilterGroup>
            {severitiesPresent.length > 0 && (
              <FilterGroup label="Severity">
                <ChipRow>{severitiesPresent.map(s => <Chip key={s} on={fSeverity.set.has(s)} onClick={() => fSeverity.toggle(s)}>{damageLabel(s)}</Chip>)}</ChipRow>
              </FilterGroup>
            )}
            <FilterGroup label="Shipping line">
              <select value={fLine} onChange={e => setFLine(e.target.value)} style={railSelect}>
                <option value="">All lines</option>
                {shipperList.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
              </select>
            </FilterGroup>
            <PeriodFilter period={period} onChange={setPeriod} years={claimYears} />
          </FilterRail>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minWidth: '440px' }}>
            {active.length === 0 && <div style={{ ...card, color: INK3, fontSize: '13px', textAlign: 'center' }}>{filtersOn ? 'No claims match these filters.' : 'No active claims.'}</div>}
            {active.map(c => (
              <div key={c.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px' }}>{c.containerSku}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: INK3 }}>{c.claimNumber}{c.vesselRef ? ` · ${c.vesselRef}` : ''}</span>
                  <span style={{ fontSize: '11px', color: INK3 }}>vs {c.shipperName}</span>
                  {c.severity > 0 && <span title={SEVERITY_WORD[c.severity]} style={{ background: RED, color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>{damageLabel(c.severity)}</span>}
                  {c.estimateAmount > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700 }}>${c.estimateAmount.toLocaleString()}</span>}
                  {c.shipperDecision && (
                    <span style={{ padding: '2px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: c.shipperDecision === 'approved' ? '#E6F4EE' : '#FDECEA', color: c.shipperDecision === 'approved' ? GREEN : RED }}>
                      SHIPPER {c.shipperDecision.toUpperCase()}
                    </span>
                  )}
                </div>
                <StageTracker status={c.status} />

                {/* Damage evidence strip */}
                {(c.photos || []).filter(Boolean).length > 0 && (
                  <div style={{ display: 'flex', gap: '5px', marginTop: '10px', overflowX: 'auto' }}>
                    {(c.photos || []).filter(Boolean).map((u, i) => (
                      <div key={i} style={{ flexShrink: 0, width: '76px' }}>
                        <img src={photoUrl(u)} alt={photoCaption(c, i)} onClick={() => lb.show(claimShots(c), i)}
                          style={{ width: '76px', height: '56px', objectFit: 'cover', borderRadius: '8px', display: 'block', cursor: 'zoom-in' }} />
                        <div style={{ fontSize: '9px', fontWeight: 800, color: RED, marginTop: '2px' }}>{photoCaption(c, i)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Stage-specific actions */}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* One way in: the workspace. Sending, emailing and
                      downloading all live behind Review → Estimate → Send, so
                      nothing leaves the building without being read first. */}
                  {(c.status === 'awaiting_estimate' || c.status === 'awaiting_shipper') && (
                    <>
                      <button onClick={() => openWorkspace(c)} style={btn(BLUE)}>Open claim workspace →</button>
                      <span style={{ fontSize: '11.5px', color: INK3 }}>
                        {c.status === 'awaiting_shipper'
                          ? <>With {c.shipperName}{c.shipperViewedAt ? ` — viewed ${new Date(c.shipperViewedAt).toLocaleDateString()} ✓` : ' — not yet viewed'}. Re-open to re-send or download.</>
                          : <>Review the evidence, add the estimate and the shop's document, then send.</>}
                      </span>
                    </>
                  )}
                  {c.status === 'awaiting_decision' && (
                    <>
                      {c.shipperNotes && <span style={{ fontSize: '12px', color: INK2, width: '100%' }}>“{c.shipperNotes}” — {c.shipperName}</span>}
                      {c.shipperDecision === 'approved' && (
                        <>
                          <select value={rep[c.id]?.shopId ?? ''} onChange={e => setRep(p => ({ ...p, [c.id]: { shopId: e.target.value, date: p[c.id]?.date ?? '' } }))} style={{ ...inp, minWidth: '210px' }}>
                            <option value="">— Approved repair shop —</option>
                            {shopsForClaim(c).map(sh => <option key={sh.id} value={sh.id}>{sh.name} · {sh.city}, {sh.state}</option>)}
                          </select>
                          <input type="date" value={rep[c.id]?.date ?? ''} onChange={e => setRep(p => ({ ...p, [c.id]: { shopId: p[c.id]?.shopId ?? '', date: e.target.value } }))} style={inp} />
                          <button onClick={() => scheduleRepair(c)} style={btn(GREEN)}>Schedule repair — retail</button>
                        </>
                      )}
                      {(() => {
                        const sug = suggestedPrice(c)
                        return sug ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: INK2 }}>
                            As-is price
                            <input value={askPrice[c.id] ?? String(sug.now)} onChange={e => setAskPrice(p => ({ ...p, [c.id]: e.target.value }))} type="number" style={{ ...inp, width: '110px', padding: '7px 9px' }} />
                            <span style={{ color: INK3 }}>suggested ${sug.now.toLocaleString()} (−{Math.round(sug.disc * 100)}% off ${sug.was.toLocaleString()})</span>
                          </span>
                        ) : null
                      })()}
                      <button onClick={() => sellAsDamaged(c)} style={btn(RED)}>Sell as damaged — wholesale {damageLabel(c.severity || 3)}</button>
                    </>
                  )}
                  {c.status === 'repair_scheduled' && (
                    <>
                      <span style={{ fontSize: '12px', color: INK2 }}>🔧 {c.repairShopName} · {c.repairDate}</span>
                      <button onClick={() => markRepaired(c)} style={btn(GREEN)}>Repair complete — keep retail</button>
                      {/* Policy: the supplier may still pull it and sell as-is. */}
                      <button onClick={() => sellAsDamaged(c)} style={ghost}>Sell as damaged instead</button>
                    </>
                  )}
                  {c.status === 'sell_as_damaged' && (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: RED }}>Listed on the marketplace as damaged {damageLabel(c.severity || 3)} — buyers see the damage photos.</span>
                  )}
                </div>
              </div>
            ))}
            {closed.length > 0 && (
              <div style={{ fontSize: '12px', color: INK3 }}>{closed.length} closed claim{closed.length > 1 ? 's' : ''}: {closed.map(c => `${c.containerSku} (${c.claimNumber})`).join(' · ')}</div>
            )}
          </div>
          </div>{/* rail + claims row */}
        </section>

        {/* Fleet */}
        <section>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>My Fleet <span style={{ fontSize: '12px', color: INK3, fontWeight: 400 }}>· {fleet.length} units</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
            {fleet.length === 0 && <div style={{ ...card, color: INK3, fontSize: '13px' }}>No units assigned to this supplier yet.</div>}
            {fleet.map(c => {
              const meta = GRADE_META[c.grade]
              return (
                <div key={c.id} style={{ ...card, padding: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ width: '58px', height: '44px', borderRadius: '8px', background: 'linear-gradient(135deg,#CBD5E8,#A8BFDF)', overflow: 'hidden', flexShrink: 0 }}>
                    {c.photos?.filter(Boolean)[0] && <img src={photoUrl(c.photos.filter(Boolean)[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700 }}>{c.sku}</div>
                    <div style={{ fontSize: '11px', color: INK3 }}>{SIZE_LABEL[c.size] ?? c.size} · {c.status.replace(/_/g, ' ')}</div>
                  </div>
                  <span style={{ background: meta?.color ?? '#374151', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                    {c.grade === 'D' ? damageLabel(c.damageSeverity) : gradeLabel(c.grade, c.conditionScore)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </main>
      {packet && <ClaimPacket claim={packet} onClose={() => setPacket(null)} />}
      {lb.open && <Lightbox shots={lb.open.shots} index={lb.open.index} onIndex={lb.setIndex} onClose={lb.close} />}
    </div>
  )
}
