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
  prefs as prefsApi, photoUrl, SIZE_LABEL, CLAIM_STAGES,
  type Container, type DamageClaim, type Supplier, type Shipper, type RepairShop, type ClaimStatus, type AuthUser,
} from '../../lib/api'
import { GRADE_META, DAMAGE_DISCOUNT } from '../../lib/specs'
import { ClaimTimeline, ClaimPacket } from './claimkit'
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

export default function SupplierPortalPage() {
  const { user, logout } = useAuth()
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()
  const [fleet, setFleet] = useState<Container[]>([])
  const [claimList, setClaimList] = useState<DamageClaim[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [shipperList, setShipperList] = useState<Shipper[]>([])
  const [shops, setShops] = useState<RepairShop[]>([])
  // New-claim form
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState({ containerId: '', shipperId: '', vesselRef: '', notes: '' })
  // Per-claim working inputs (estimate / repair scheduling / as-is pricing)
  const [est, setEst] = useState<Record<string, { amount: string; notes: string }>>({})
  const [rep, setRep] = useState<Record<string, { shopId: string; date: string }>>({})
  const [askPrice, setAskPrice] = useState<Record<string, string>>({})
  const [packet, setPacket] = useState<DamageClaim | null>(null)
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const myClaims = useMemo(() =>
    claimList.filter(c => !supplierId || c.supplierId === supplierId), [claimList, supplierId])
  const claimedIds = new Set(myClaims.filter(c => c.status !== 'closed').map(c => c.containerId))

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

  const share = async (c: DamageClaim, mode: 'packet' | 'link') => {
    try {
      await claimsApi.share(c.id, mode)
      toast(mode === 'packet' ? `Claim packet emailed to ${c.shipperName}` : `Login link emailed to ${c.shipperName} — their sign-in will land on the audit trail`)
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

  const active = myClaims.filter(c => c.status !== 'closed')
  const closed = myClaims.filter(c => c.status === 'closed')

  return (
    <div style={{ fontFamily: 'var(--sans)', background: 'var(--pg)', minHeight: '100vh', color: INK }}>
      {/* Header */}
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
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>New damage claim — the field team inspects next</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <select value={newForm.containerId} onChange={e => setNewForm(f => ({ ...f, containerId: e.target.value }))} style={{ ...inp, minWidth: '220px' }}>
                  <option value="">— Container —</option>
                  {fleet.filter(c => !claimedIds.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.sku} · {SIZE_LABEL[c.size] ?? c.size}</option>)}
                </select>
                <select value={newForm.shipperId} onChange={e => setNewForm(f => ({ ...f, shipperId: e.target.value }))} style={{ ...inp, minWidth: '190px' }}>
                  <option value="">— Shipping line —</option>
                  {shipperList.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                </select>
                <input value={newForm.vesselRef} onChange={e => setNewForm(f => ({ ...f, vesselRef: e.target.value }))} placeholder="Vessel / BOL ref" style={{ ...inp, width: '160px' }} />
                <input value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} placeholder="What happened?" style={{ ...inp, flex: 1, minWidth: '200px' }} />
                <button onClick={createClaim} style={btn('#E65100')}>File claim</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {active.length === 0 && <div style={{ ...card, color: INK3, fontSize: '13px', textAlign: 'center' }}>No active claims.</div>}
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
                      <img key={i} src={photoUrl(u)} alt={`Damage ${i + 1}`} style={{ width: '76px', height: '56px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                    ))}
                  </div>
                )}

                {/* Stage-specific actions */}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {c.status === 'awaiting_inspection' && (
                    <span style={{ fontSize: '12px', color: INK3 }}>Waiting on the field team's damage inspection (Field App → AI Grade → Damage claims).</span>
                  )}
                  {c.status === 'awaiting_estimate' && (
                    <>
                      <input value={est[c.id]?.amount ?? ''} onChange={e => setEst(p => ({ ...p, [c.id]: { amount: e.target.value, notes: p[c.id]?.notes ?? '' } }))} placeholder="Repair estimate $" type="number" style={{ ...inp, width: '150px' }} />
                      <input value={est[c.id]?.notes ?? ''} onChange={e => setEst(p => ({ ...p, [c.id]: { amount: p[c.id]?.amount ?? '', notes: e.target.value } }))} placeholder="Estimate notes (shop, scope)" style={{ ...inp, flex: 1, minWidth: '180px' }} />
                      <button onClick={() => submitEstimate(c)} style={btn(BLUE)}>Submit to {c.shipperName}</button>
                    </>
                  )}
                  {c.status === 'awaiting_shipper' && (
                    <>
                      <span style={{ fontSize: '12px', color: INK3, width: '100%' }}>
                        Estimate with {c.shipperName} — their insurance carrier reviews off-platform.
                        {c.shipperViewedAt ? ` Viewed ${new Date(c.shipperViewedAt).toLocaleDateString()} ✓` : ' Not yet viewed.'}
                      </span>
                      <button onClick={() => setPacket(c)} style={ghost}>📄 Claim packet (PDF)</button>
                      <button onClick={() => share(c, 'packet')} style={btn(BLUE)}>✉️ Email packet</button>
                      <button onClick={() => share(c, 'link')} style={btn('#0E7490')}>✉️ Email login link</button>
                      <button onClick={() => copyShipperLink(c)} style={ghost}>🔗 Copy login link</button>
                    </>
                  )}
                  {c.status === 'awaiting_decision' && (
                    <>
                      {c.shipperNotes && <span style={{ fontSize: '12px', color: INK2, width: '100%' }}>“{c.shipperNotes}” — {c.shipperName}</span>}
                      {c.shipperDecision === 'approved' && (
                        <>
                          <select value={rep[c.id]?.shopId ?? ''} onChange={e => setRep(p => ({ ...p, [c.id]: { shopId: e.target.value, date: p[c.id]?.date ?? '' } }))} style={{ ...inp, minWidth: '210px' }}>
                            <option value="">— Approved repair shop —</option>
                            {shops.filter(sh => sh.approved).map(sh => <option key={sh.id} value={sh.id}>{sh.name} · {sh.city}, {sh.state}</option>)}
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
                <ClaimTimeline claim={c} />
              </div>
            ))}
          </div>
          {closed.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: INK3 }}>{closed.length} closed claim{closed.length > 1 ? 's' : ''}: {closed.map(c => `${c.containerSku} (${c.claimNumber})`).join(' · ')}</div>
          )}
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
      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
