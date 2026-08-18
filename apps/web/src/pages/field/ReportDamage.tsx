// ============================================================
// Field App — "Report damage" from the walk-around.
//
// The saleable photo set is shot before loading, and that walk-around
// is when damage actually gets noticed. This sheet is the way to say so
// without leaving the job: tap what you saw, add a note, and send the
// unit down one of two tracks.
//
//   Inspection required — the unit is held off the marketplace until an
//     inspector grades it. The depot driver doesn't have to inspect;
//     the receiving sub-depot does it before the unit can list.
//   Damage claim — sea-freight damage worth money from the shipping
//     line. Opens the claim (and holds the unit back the same way).
//
// Either way the unit stops being listable the moment it's reported.
// ============================================================

import React, { useState } from 'react'
import {
  containers as containersApi, claims as claimsApi,
  DAMAGE_REASONS, type Container,
} from '../../lib/api'

const INK = '#1A1C2E', INK2 = '#44475A', DIV = '#E1E2EC', RED = '#B3261E', AMBER = '#7B4F00'

export type DamageTrack = 'inspection' | 'claim'

export function ReportDamageSheet({ container, sku, reportedBy, onClose, onReported, toast }: {
  container: Container | null
  sku: string
  reportedBy: string
  onClose: () => void
  onReported: (track: DamageTrack) => void
  toast: (m: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<DamageTrack | null>(null)

  const toggle = (r: string) => setPicked(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])
  // The reason line that travels with the unit: "Bent, Rust — rear rail".
  const summary = [picked.join(', '), note.trim()].filter(Boolean).join(' — ')

  const send = async (track: DamageTrack) => {
    if (busy) return
    if (!container) { toast('This unit is not in the container list yet — finish the photo session first'); return }
    if (picked.length === 0 && !note.trim()) { toast('Pick what you saw, or add a note'); return }
    setBusy(track)
    try {
      if (track === 'claim') {
        // The claim carries the evidence; the field app's damage collection
        // screen is where the photos get taken, reason by reason.
        await claimsApi.create({ containerId: container.id, notes: summary })
      }
      await containersApi.update(container.id, {
        inspectionRequired: true,
        inspectionReason: summary,
        inspectionFlaggedBy: reportedBy,
      } as Partial<Container>)
      toast(track === 'claim'
        ? `${sku} — claim opened and held off the marketplace`
        : `${sku} queued for inspection — held off the marketplace`)
      onReported(track)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not report the damage — try again')
    } finally { setBusy(null) }
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '9px 13px', borderRadius: '999px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
    fontFamily: 'inherit', border: `1.5px solid ${on ? RED : DIV}`, background: on ? '#FDECEA' : '#fff',
    color: on ? RED : INK, whiteSpace: 'nowrap',
  })

  return (
    <div role="dialog" aria-label="Report damage" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(13,14,18,.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '92vh', overflowY: 'auto', background: '#F6F7FB', borderRadius: '20px 20px 0 0', padding: '16px 14px 26px', boxShadow: '0 -8px 30px rgba(0,0,0,.25)' }}>
        <div style={{ width: '38px', height: '4px', borderRadius: '2px', background: '#C4C6D0', margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '4px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: INK }}>Report damage</div>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', color: INK2 }}>{sku}</div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: INK2, fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
        </div>
        <div style={{ fontSize: '12px', color: INK2, lineHeight: 1.5, marginBottom: '12px' }}>
          Found something on the walk-around? Say what you saw — the unit comes off the
          marketplace until it's inspected.
        </div>

        {/* What you saw */}
        <div style={{ background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', padding: '13px', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '9px' }}>What did you see?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {DAMAGE_REASONS.map(r => (
              <button key={r} style={chip(picked.includes(r))} onClick={() => toggle(r)}>{r}</button>
            ))}
          </div>
          <input
            value={note} onChange={e => setNote(e.target.value)} placeholder="Where on the unit? (optional)"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: '10px', padding: '10px 12px', border: `1.5px solid ${DIV}`, borderRadius: '11px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
          />
        </div>

        {/* Where it goes */}
        <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 2px 8px' }}>Send it to</div>

        <button onClick={() => send('inspection')} disabled={!!busy}
          style={{ width: '100%', textAlign: 'left', background: '#fff', border: `1.5px solid ${DIV}`, borderRadius: '16px', padding: '14px', marginBottom: '9px', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '11px', background: '#FFF8E1', display: 'grid', placeItems: 'center', color: AMBER }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.4v.2" />
            </svg>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: INK }}>
              {busy === 'inspection' ? 'Sending…' : 'Inspection Required'}
            </span>
            <span style={{ display: 'block', fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '2px' }}>
              Queues the unit for an inspector to grade. It stays off the marketplace until
              that's done — you don't have to inspect it yourself.
            </span>
          </span>
        </button>

        <button onClick={() => send('claim')} disabled={!!busy}
          style={{ width: '100%', textAlign: 'left', background: '#fff', border: `1.5px solid ${DIV}`, borderRadius: '16px', padding: '14px', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '11px', background: '#FDECEA', display: 'grid', placeItems: 'center', color: RED }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4h11l3 3v13H5V4Z" /><path d="M15.5 4v3.5H19" /><path d="M8.5 12.5h7" /><path d="M8.5 16h4.5" />
            </svg>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: INK }}>
              {busy === 'claim' ? 'Opening…' : 'Damage Claim'}
            </span>
            <span style={{ display: 'block', fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '2px' }}>
              Sea-freight damage worth money back from the line. Opens the claim and holds the
              unit — collect the evidence photos under AI Grade → Damage claims.
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}
