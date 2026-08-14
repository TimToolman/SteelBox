// ============================================================
// Supplier Fleet — "My Containers" tab inside the marketplace
//
// One of the portals behind the single marketplace login: a supplier
// (primary role or portal grant) sees every unit they own, with live
// pricing controls — buy price, monthly rent, and the listing mode —
// saved straight to the unit. The API only lets a supplier PATCH
// containers whose supplierId matches their account, so this panel
// can't touch anyone else's inventory.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { containers as containersApi, photoUrl, type AuthUser, type Container } from '../../lib/api'
import { GRADE_META } from '../../lib/specs'
import { damageLabel, gradeLabel } from '../../lib/grading'
import { SIZE_LABELS } from './shared'

const INK = '#0D0E12', INK2 = '#44474F', INK3 = '#6B7280', DIV = '#E2E4E9', GREEN = '#1B7A5A'
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }
const numIn: React.CSSProperties = { width: '92px', padding: '8px 10px', border: `1.5px solid ${DIV}`, borderRadius: '10px', fontSize: '13px', fontFamily: 'var(--mono)', outline: 'none' }

const STATUS_WORD: Record<string, string> = {
  available: 'Listed', sale_in_progress: 'Sale in progress', draft: 'Draft', sold: 'Sold', rented: 'Rented',
}

export function SupplierFleet({ user, onToast }: { user: AuthUser; onToast: (m: string) => void }) {
  const [fleet, setFleet] = useState<Container[]>([])
  const [drafts, setDrafts] = useState<Record<string, { buy: string; rent: string; listing: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const supplierId = user.supplierId || ''

  const refresh = () => containersApi.list().then(all => setFleet(all.filter(c => !!supplierId && c.supplierId === supplierId))).catch(() => {})
  useEffect(() => { refresh() }, [supplierId]) // eslint-disable-line react-hooks/exhaustive-deps

  const draftOf = (c: Container) => drafts[c.id] ?? {
    buy: String(c.buyPrice ?? ''), rent: c.rentMonthly != null ? String(c.rentMonthly) : '', listing: c.listingType ?? 'both',
  }
  const isDirty = (c: Container) => {
    const d = draftOf(c)
    return Number(d.buy) !== (c.buyPrice ?? 0)
      || (d.rent === '' ? null : Number(d.rent)) !== (c.rentMonthly ?? null)
      || d.listing !== (c.listingType ?? 'both')
  }

  const save = async (c: Container) => {
    const d = draftOf(c)
    const buy = Number(d.buy)
    if (!Number.isFinite(buy) || buy <= 0) { onToast('Buy price must be a positive number'); return }
    setBusy(c.id)
    try {
      await containersApi.update(c.id, {
        buyPrice: buy,
        rentMonthly: d.rent === '' ? null : Number(d.rent),
        listingType: d.listing as Container['listingType'],
      })
      onToast(`${c.sku} updated — $${buy.toLocaleString()}${d.rent ? ` / $${Number(d.rent)}/mo` : ''}`)
      setDrafts(p => { const { [c.id]: _gone, ...rest } = p; return rest })
      refresh()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed')
    } finally { setBusy(null) }
  }

  const totals = useMemo(() => ({
    listed: fleet.filter(c => c.status === 'available').length,
    value: fleet.reduce((s, c) => s + (c.buyPrice || 0), 0),
    damaged: fleet.filter(c => c.grade === 'D').length,
  }), [fleet])

  if (!supplierId) {
    return <div style={{ ...card, padding: '22px', textAlign: 'center', color: INK3, fontSize: '13px' }}>
      This account has the supplier portal but no supplier company linked yet — ask your administrator to connect one under Users &amp; Access.
    </div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: INK }}>My Containers</h2>
        <span style={{ fontSize: '12px', color: INK3 }}>
          {fleet.length} unit{fleet.length === 1 ? '' : 's'} · {totals.listed} listed · {totals.damaged} damaged · ${totals.value.toLocaleString()} asking value
        </span>
      </div>

      {fleet.length === 0 && <div style={{ ...card, padding: '22px', textAlign: 'center', color: INK3, fontSize: '13px' }}>No containers on your account yet.</div>}

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '840px' }}>
            <thead>
              <tr>
                {['Unit', 'Grade', 'Status', 'Buy price', 'Rent / mo', 'Listing', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: INK3, background: '#F7F8FA', borderBottom: `1px solid ${DIV}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fleet.map(c => {
                const d = draftOf(c)
                const gm = GRADE_META[c.grade]
                const locked = c.status === 'sold' || c.status === 'sale_in_progress'
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${DIV}` }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {c.photos?.[0] && <img src={photoUrl(c.photos[0])} alt="" style={{ width: '52px', height: '38px', objectFit: 'cover', borderRadius: '7px', flexShrink: 0 }} />}
                        <div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '13px', color: INK }}>{c.sku}</div>
                          <div style={{ fontSize: '11px', color: INK3 }}>{SIZE_LABELS[c.size] ?? c.size}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: gm?.color || INK2 }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '6px', background: gm?.color || INK3, color: '#fff', display: 'grid', placeItems: 'center', fontSize: '11px' }}>{c.grade}</span>
                        {c.grade === 'D' ? damageLabel(c.damageSeverity) : gradeLabel(c.grade, c.conditionScore)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: c.status === 'available' ? GREEN : INK2, fontWeight: 600 }}>{STATUS_WORD[c.status] ?? c.status}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: INK3, fontSize: '12px', marginRight: '2px' }}>$</span>
                      <input value={d.buy} disabled={locked} onChange={e => setDrafts(p => ({ ...p, [c.id]: { ...d, buy: e.target.value.replace(/[^\d]/g, '') } }))} style={{ ...numIn, opacity: locked ? 0.5 : 1 }} />
                      {c.preDamagePrice != null && c.preDamagePrice > 0 && <div style={{ fontSize: '10px', color: INK3, marginTop: '3px' }}>was ${c.preDamagePrice.toLocaleString()}</div>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: INK3, fontSize: '12px', marginRight: '2px' }}>$</span>
                      <input value={d.rent} disabled={locked} placeholder="—" onChange={e => setDrafts(p => ({ ...p, [c.id]: { ...d, rent: e.target.value.replace(/[^\d]/g, '') } }))} style={{ ...numIn, width: '72px', opacity: locked ? 0.5 : 1 }} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <select value={d.listing} disabled={locked} onChange={e => setDrafts(p => ({ ...p, [c.id]: { ...d, listing: e.target.value } }))}
                        style={{ padding: '8px 9px', border: `1.5px solid ${DIV}`, borderRadius: '10px', fontSize: '12px', outline: 'none', fontFamily: 'inherit', opacity: locked ? 0.5 : 1 }}>
                        <option value="both">Buy or rent</option>
                        <option value="buy">Buy only</option>
                        <option value="rent">Rent only</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {locked
                        ? <span style={{ fontSize: '11px', color: INK3 }}>locked in sale</span>
                        : (
                          <button onClick={() => save(c)} disabled={busy === c.id || !isDirty(c)}
                            style={{ padding: '8px 16px', borderRadius: '999px', border: 'none', background: isDirty(c) ? 'var(--primary, #0057B8)' : '#E9EBF0', color: isDirty(c) ? '#fff' : INK3, fontSize: '12px', fontWeight: 700, cursor: isDirty(c) ? 'pointer' : 'default' }}>
                            {busy === c.id ? 'Saving…' : 'Save'}
                          </button>
                        )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: INK3 }}>
        Price changes go live on the marketplace immediately. Units in an active sale are locked until the order settles.
      </div>
    </div>
  )
}
