// ============================================================
// Repair Shops — the platform's approved repair network
//
// SteelBox Co. HQ maintains the directory: each shop carries its key
// contact and which depots / transfer stations it serves (empty = all
// sites) — the supplier's repair picker honors those assignments per
// claim. Below the directory, the work-order board tracks every repair
// booked through a claim: requested → in progress → completed.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '../../components/ui'
import {
  repairShops as repairShopsApi, claims as claimsApi,
  type RepairShop, type Depot, type MeetPoint, type DamageClaim,
} from '../../lib/api'

const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ink3)', background: 'var(--surf1)', borderBottom: '1px solid var(--div)' }}>{children}</th>
)
const Td = ({ children }: { children: React.ReactNode }) => (
  <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink2)', borderBottom: '1px solid var(--div)', verticalAlign: 'top' }}>{children}</td>
)
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 'var(--pill)', background: 'var(--surf1)', border: '1px solid var(--div)', fontSize: '10px', fontWeight: 700, color: 'var(--ink2)', whiteSpace: 'nowrap' }
const smallBtn = (variant: 'plain' | 'primary' | 'danger' | 'success' = 'plain'): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 'var(--pill)', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
  border: variant === 'plain' ? '1.5px solid var(--div)' : 'none',
  background: variant === 'primary' ? 'var(--primary)' : variant === 'danger' ? 'var(--cta-cont)' : variant === 'success' ? 'var(--green-cont)' : 'var(--surf-w)',
  color: variant === 'primary' ? '#fff' : variant === 'danger' ? 'var(--cta)' : variant === 'success' ? 'var(--green)' : 'var(--ink2)',
})

// A repair's board column, from its claim: booked date in the future (or
// unset) = requested; date reached = in progress; claim closed = completed.
function workStage(c: DamageClaim): 'requested' | 'in_progress' | 'completed' {
  if (c.status === 'closed') return 'completed'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return c.repairDate && new Date(c.repairDate) <= today ? 'in_progress' : 'requested'
}

export function RepairShopsView({ depots, meetPoints, canEdit, toast }: {
  depots: Depot[]
  meetPoints: MeetPoint[]
  canEdit: boolean       // SteelBox Co. HQ only — resellers see the network read-only
  toast: (m: string) => void
}) {
  const [shops, setShops] = useState<RepairShop[]>([])
  const [claimList, setClaimList] = useState<DamageClaim[]>([])
  const [edit, setEdit] = useState<RepairShop | 'new' | null>(null)
  const refresh = () => {
    repairShopsApi.list().then(setShops).catch(() => {})
    claimsApi.list().then(setClaimList).catch(() => {})
  }
  useEffect(() => { refresh() }, [])

  // Every site a shop can be assigned to: seller depots + transfer stations.
  const sites = useMemo(() => ([
    ...depots.map(d => ({ id: d.id, label: d.code || d.name, kind: 'depot' as const })),
    ...meetPoints.map(m => ({ id: m.id, label: m.name.replace(/ Relay Yard$/i, ''), kind: 'station' as const })),
  ]), [depots, meetPoints])
  const siteLabel = (id: string) => sites.find(s => s.id === id)?.label || id

  const work = claimList.filter(c => c.repairShopId)
  const buckets = {
    requested: work.filter(c => c.status === 'repair_scheduled' && workStage(c) === 'requested'),
    in_progress: work.filter(c => c.status === 'repair_scheduled' && workStage(c) === 'in_progress'),
    completed: work.filter(c => workStage(c) === 'completed'),
  }
  const shopName = (id: string) => shops.find(s => s.id === id)?.name || id

  const markComplete = async (c: DamageClaim) => {
    try {
      await claimsApi.update(c.id, { status: 'closed' })
      toast(`${c.containerSku} repair completed — claim ${c.claimNumber} closed`)
      refresh()
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not update') }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Repair Shops</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
            {shops.filter(s => s.approved).length} approved shop{shops.filter(s => s.approved).length === 1 ? '' : 's'} · assigned per depot / transfer station · suppliers book repairs here from approved claims
          </div>
        </div>
        {canEdit && <Button variant="primary" size="md" onClick={() => setEdit('new')} icon={<span>+</span>}>Add Repair Shop</Button>}
      </div>

      <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
            <thead><tr><Th>Shop</Th><Th>Key contact</Th><Th>Specialty</Th><Th>Serves</Th><Th>Status</Th>{canEdit && <Th>Actions</Th>}</tr></thead>
            <tbody>
              {shops.map(sh => (
                <tr key={sh.id} style={{ opacity: sh.approved ? 1 : 0.5 }}>
                  <Td>
                    <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{sh.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{[sh.city, sh.state].filter(Boolean).join(', ')}</div>
                  </Td>
                  <Td>
                    <div>{sh.contactName || '—'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{sh.email || ''}{sh.email && sh.phone ? ' · ' : ''}<span style={{ fontFamily: 'var(--mono)' }}>{sh.phone || ''}</span></div>
                  </Td>
                  <Td>{sh.specialty || '—'}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(sh.siteIds?.length ? sh.siteIds : []).map(id => <span key={id} style={chip}>{siteLabel(id)}</span>)}
                      {!sh.siteIds?.length && <span style={{ ...chip, background: 'var(--green-cont)', border: 'none', color: 'var(--green)' }}>All sites</span>}
                    </div>
                  </Td>
                  <Td>{sh.approved
                    ? <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '11px' }}>Approved</span>
                    : <span style={{ color: 'var(--cta)', fontWeight: 700, fontSize: '11px' }}>Not approved</span>}</Td>
                  {canEdit && (
                    <Td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={smallBtn()} onClick={() => setEdit(sh)}>Edit</button>
                        <button style={smallBtn(sh.approved ? 'danger' : 'success')} onClick={() =>
                          repairShopsApi.update(sh.id, { approved: !sh.approved })
                            .then(() => { toast(`${sh.name} ${sh.approved ? 'removed from' : 'restored to'} the approved network`); refresh() })
                            .catch(e => toast(e instanceof Error ? e.message : 'Failed'))
                        }>{sh.approved ? 'Un-approve' : 'Approve'}</button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
              {shops.length === 0 && <tr><td colSpan={canEdit ? 6 : 5} style={{ textAlign: 'center', padding: '20px', color: 'var(--ink3)', fontSize: '13px' }}>No repair shops yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Work orders — every repair booked through a claim ── */}
      <div style={{ marginTop: '22px', background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '16px 18px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>Work Orders</div>
        <div style={{ fontSize: '12px', color: 'var(--ink3)', margin: '2px 0 14px' }}>
          Repairs booked from approved damage claims — requested until the booked date arrives, in progress after it, completed when the claim closes.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '12px' }}>
          {([
            ['requested', 'Requested', 'var(--primary)'],
            ['in_progress', 'In progress', '#B45309'],
            ['completed', 'Completed', 'var(--green)'],
          ] as const).map(([key, label, color]) => (
            <div key={key} style={{ background: 'var(--surf1)', borderRadius: 'var(--r12)', border: '1px solid var(--div)', padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color, marginBottom: '8px' }}>
                {label} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· {buckets[key].length}</span>
              </div>
              {buckets[key].length === 0 && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Nothing here.</div>}
              {buckets[key].map(c => (
                <div key={c.id} style={{ background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r8)', padding: '9px 11px', marginBottom: '7px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '12px', color: 'var(--ink)' }}>{c.containerSku}</span>
                    <span style={{ fontSize: '10px', color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{c.claimNumber}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '12px', color: 'var(--ink)' }}>${(c.estimateAmount || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>
                    {shopName(c.repairShopId)}{c.repairDate ? ` · booked ${new Date(c.repairDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''} · {c.supplierName}
                  </div>
                  {canEdit && key !== 'completed' && (
                    <button style={{ ...smallBtn('success'), marginTop: '7px' }} onClick={() => markComplete(c)}>Mark completed</button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {edit && <ShopModal target={edit} sites={sites} onClose={() => setEdit(null)} onSaved={m => { toast(m); refresh() }} />}
    </div>
  )
}

// ── Add / Edit modal ────────────────────────────────────────

function ShopModal({ target, sites, onClose, onSaved }: {
  target: RepairShop | 'new'
  sites: { id: string; label: string; kind: 'depot' | 'station' }[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isNew = target === 'new'
  const [form, setForm] = useState(() => isNew
    ? { name: '', city: '', state: '', specialty: '', contactName: '', email: '', phone: '', siteIds: [] as string[] }
    : { name: target.name, city: target.city, state: target.state, specialty: target.specialty, contactName: target.contactName || '', email: target.email || '', phone: target.phone, siteIds: [...(target.siteIds || [])] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleSite = (id: string) => setForm(p => ({ ...p, siteIds: p.siteIds.includes(id) ? p.siteIds.filter(x => x !== id) : [...p.siteIds, id] }))

  const save = async () => {
    if (saving) return
    if (!form.name.trim()) { setError('The shop needs a name'); return }
    setSaving(true)
    try {
      if (isNew) { await repairShopsApi.create(form); onSaved(`${form.name} added to the repair network`) }
      else { await repairShopsApi.update((target as RepairShop).id, form); onSaved(`${form.name} updated`) }
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') } finally { setSaving(false) }
  }

  const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px', boxSizing: 'border-box' }

  return (
    <Modal open onClose={onClose} maxWidth={520}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{isNew ? 'Add Repair Shop' : 'Edit Repair Shop'}</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '18px' }}>Suppliers book claim repairs at approved shops serving their unit's site.</p>
      <label style={lbl}>Shop name</label>
      <input style={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Bayou Container Repair" />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
        <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="New Orleans" /></div>
        <div><label style={lbl}>State</label><input style={inp} value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="LA" /></div>
      </div>
      <label style={lbl}>Specialty</label>
      <input style={inp} value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))} placeholder="Structural & welding" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div><label style={lbl}>Key contact</label><input style={inp} value={form.contactName} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} placeholder="Ray Thibodeaux" /></div>
        <div><label style={lbl}>Phone</label><input style={inp} type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(504) 555-0000" /></div>
      </div>
      <label style={lbl}>Email</label>
      <input style={inp} type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="shop@repair.com" />
      <label style={lbl}>Serves — depots &amp; transfer stations <span style={{ fontWeight: 400, textTransform: 'none' }}>(none checked = all sites)</span></label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
        {sites.map(s => {
          const on = form.siteIds.includes(s.id)
          return (
            <button key={s.id} onClick={() => toggleSite(s.id)} style={{
              padding: '6px 12px', borderRadius: 'var(--pill)', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${on ? 'var(--primary)' : 'var(--div)'}`,
              background: on ? 'var(--primary-cont)' : 'var(--surf-w)',
              color: on ? 'var(--primary)' : 'var(--ink2)',
            }}>{s.label}{s.kind === 'station' ? ' (station)' : ''}</button>
          )
        })}
      </div>
      {error && <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', marginBottom: '10px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add Shop' : 'Save Changes'}</Button>
      </div>
    </Modal>
  )
}
