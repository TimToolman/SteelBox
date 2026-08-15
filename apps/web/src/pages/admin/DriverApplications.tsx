// ============================================================
// Admin — Driver Applications (independent-contractor recruiting)
// The public "drive for us" form feeds this queue. Review flow:
// new → interviewing → approved (one-click invite mints the driver
// record + login and emails the invite) or rejected.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react'
import { driverApps, type DriverApplication, type Seller } from '../../lib/api'
import { Button, Modal } from '../../components/ui'

const STATUS_META: Record<string, { bg: string; fg: string; label: string }> = {
  new:          { bg: '#FFF8E1', fg: '#B45309', label: 'New' },
  interviewing: { bg: 'var(--primary-cont, #E3F0FF)', fg: 'var(--primary)', label: 'Interviewing' },
  invited:      { bg: 'var(--green-cont)', fg: 'var(--green)', label: 'Invited' },
  rejected:     { bg: '#FDECEA', fg: '#B3261E', label: 'Rejected' },
}
const ORDER: Record<string, number> = { new: 0, interviewing: 1, invited: 2, rejected: 3 }

export function DriverApplicationsView({ sellers, scope, onToast }: {
  sellers: Seller[]
  scope: 'global' | 'tenant'
  onToast: (m: string) => void
}) {
  const [apps, setApps] = useState<DriverApplication[]>([])
  const load = useCallback(() => { driverApps.list().then(setApps).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  // Which reseller's fleet an approved contractor joins (HQ picks; a
  // reseller admin always hires into their own — the server enforces it).
  const [hireInto, setHireInto] = useState('sel_mvp')
  const [invited, setInvited] = useState<{ name: string; email: string; tempPassword: string } | null>(null)
  const [busyId, setBusyId] = useState('')

  const setStatus = (a: DriverApplication, status: 'interviewing' | 'rejected' | 'new') =>
    driverApps.update(a.id, { status }).then(() => { load(); onToast(`${a.name} → ${STATUS_META[status].label}`) }).catch(e => onToast(e.message))
  const approve = async (a: DriverApplication) => {
    setBusyId(a.id)
    try {
      const res = await driverApps.approve(a.id, scope === 'global' ? hireInto : undefined)
      setInvited({ name: a.name, email: a.email, tempPassword: res.tempPassword })
      load()
    } catch (e) { onToast((e as Error).message) } finally { setBusyId('') }
  }

  const ordered = [...apps].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || (b.createdAt || '').localeCompare(a.createdAt || ''))
  const pending = apps.filter(a => a.status === 'new' || a.status === 'interviewing').length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>
          Contractor Applications <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--ink3)' }}>· {pending} awaiting review</span>
        </div>
        {scope === 'global' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>
            Approved drivers join
            <select value={hireInto} onChange={e => setHireInto(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', fontSize: '12px', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', outline: 'none', background: 'var(--surf-w)' }}>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {ordered.length === 0 && (
        <div style={{ padding: '34px', textAlign: 'center', color: 'var(--ink3)', border: '1.5px dashed var(--div)', borderRadius: 'var(--r12)' }}>
          No applications yet — the "Drive for us" form at the bottom of the main website feeds this queue.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {ordered.map(a => {
          const meta = STATUS_META[a.status] || STATUS_META.new
          return (
            <div key={a.id} style={{ background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r12)', padding: '13px 15px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', opacity: a.status === 'rejected' ? 0.65 : 1 }}>
              <div style={{ flex: '1 1 230px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 700 }}>{a.name}</span>
                  <span style={{ padding: '2px 9px', borderRadius: 'var(--pill)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: meta.bg, color: meta.fg }}>{meta.label}</span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
                  {[a.city && `${a.city}, ${a.state}`, a.zip, `applied ${new Date(a.createdAt).toLocaleDateString()}`].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: '11.5px', fontFamily: 'var(--mono)', color: 'var(--ink2)', marginTop: '2px' }}>{a.email} · {a.phone}</div>
              </div>
              <div style={{ flex: '1 1 240px', fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.55 }}>
                <div>
                  <b>CDL:</b> {a.cdl ? `Yes — Class ${a.cdlClass || '?'}` : 'No'} · <b>{a.experienceYears}</b> yrs hauling
                </div>
                <div><b>Truck:</b> {a.truckType || '—'}</div>
                {a.haulCaps.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                    {a.haulCaps.map(c => <span key={c} style={{ padding: '1px 8px', borderRadius: 'var(--pill)', border: '1px solid var(--div)', fontSize: '10px', fontWeight: 600 }}>{c}</span>)}
                  </div>
                )}
                {a.notes && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '3px', fontStyle: 'italic' }}>“{a.notes}”</div>}
              </div>
              <div style={{ display: 'flex', gap: '7px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                {a.status === 'new' && <Button size="sm" onClick={() => setStatus(a, 'interviewing')}>Start Interview</Button>}
                {(a.status === 'new' || a.status === 'interviewing') && (
                  <>
                    <Button size="sm" variant="primary" disabled={busyId === a.id} onClick={() => approve(a)}>
                      {busyId === a.id ? 'Inviting…' : 'Approve & Invite'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setStatus(a, 'rejected')}>Reject</Button>
                  </>
                )}
                {a.status === 'rejected' && <Button size="sm" onClick={() => setStatus(a, 'new')}>Reopen</Button>}
                {a.status === 'invited' && <span style={{ fontSize: '11.5px', color: 'var(--green)', fontWeight: 700, alignSelf: 'center' }}>✓ Driver account live</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Invite confirmation — surface the temp credentials once */}
      <Modal open={!!invited} onClose={() => setInvited(null)} maxWidth={440}>
        {invited && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px' }}>✓ {invited.name} is invited</h2>
            <p style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.6, margin: '0 0 12px' }}>
              Their contractor driver account is live and the invite email (with sign-in instructions) is queued.
              They finish onboarding in the Driver Portal — license &amp; insurance uploads, service area, and available days.
            </p>
            <div style={{ background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r8)', padding: '11px 13px', fontFamily: 'var(--mono)', fontSize: '12.5px', lineHeight: 1.7 }}>
              <div>Sign-in: <b>{invited.email}</b></div>
              <div>Temp password: <b>{invited.tempPassword}</b></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '8px' }}>Shown once — the invite email carries the same credentials.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <Button variant="primary" onClick={() => setInvited(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
