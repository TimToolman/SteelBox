// ============================================================
// Field App — "Report damage" outside the guided walk-around.
//
// The walk-around captures damage station by station, in position.
// This sheet covers the rest: something spotted while loading, or an
// inspector adding to a report after the walk is closed out. Findings
// append to the same report, and the unit stays off the marketplace
// until an inspector verifies and grades it.
//
// Sea-freight claims are NOT raised here — the inspector opens those
// once the damage is verified, with the evidence in front of them.
// ============================================================

import React, { useState } from 'react'
import { containers as containersApi, photoUrl, fileToDataUrl, DAMAGE_REASONS, type Container, type DamageFinding } from '../../lib/api'

const INK = '#1A1C2E', INK2 = '#44475A', DIV = '#E1E2EC', RED = '#B3261E', AMBER = '#7B4F00'

export function ReportDamageSheet({ container, sku, reportedBy, onClose, onReported, toast }: {
  container: Container | null
  sku: string
  reportedBy: string
  onClose: () => void
  onReported: () => void
  toast: (m: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [shot, setShot] = useState('')      // optional photo of what was found
  const [busy, setBusy] = useState(false)

  const capture = async () => {
    if (busy) return
    const file = await new Promise<File | null>(resolve => {
      const el = document.createElement('input')
      el.type = 'file'
      el.accept = 'image/*,.heic,.heif'
      el.setAttribute('capture', 'environment')
      el.onchange = () => resolve(el.files?.[0] ?? null)
      window.addEventListener('focus', () => setTimeout(() => resolve(el.files?.[0] ?? null), 700), { once: true })
      el.click()
    })
    if (!file || !container) return
    setBusy(true)
    try {
      const { url } = await containersApi.damagePhoto(container.id, await fileToDataUrl(file))
      setShot(url)
      toast('Photo attached')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not attach that photo')
    } finally { setBusy(false) }
  }

  // A walk-around finds damage in passes, not all at once — so a unit that's
  // already reported can be reported again and the findings stack up.
  const already = (container?.inspectionReason || '').trim()

  const toggle = (r: string) => setPicked(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])
  // The reason line that travels with the unit: "Bent, Rust — rear rail".
  const entry = [picked.join(', '), note.trim()].filter(Boolean).join(' — ')
  const summary = already && entry ? `${already}; ${entry}` : entry || already

  const send = async () => {
    if (busy) return
    if (!container) { toast('This unit is not in the container list yet — start the walk-around first'); return }
    if (picked.length === 0 && !note.trim()) { toast('Pick what you saw, or add a note'); return }
    setBusy(true)
    try {
      // Recorded as a finding so it reaches the inspector and the claim
      // document with its photo, exactly like one raised at a stop.
      let findings: DamageFinding[] = []
      try { findings = JSON.parse(container.inspectionFindings || '[]') } catch { findings = [] }
      findings.push({
        station: 'Spotted on the job', question: 'Reported outside the walk-around',
        level: 'minor', reasons: [...picked], note: note.trim(), photo: shot,
        at: new Date().toISOString(), by: reportedBy,
      })
      await containersApi.update(container.id, {
        inspectionRequired: true,
        inspectionReason: summary,
        inspectionFlaggedBy: reportedBy,
        inspectionFindings: JSON.stringify(findings),
      } as Partial<Container>)
      toast(already ? `${sku} — added to the damage report` : `${sku} queued for inspection — held off the marketplace`)
      setPicked([]); setNote(''); setShot('')
      onReported()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not report the damage — try again')
    } finally { setBusy(false) }
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '9px 13px', borderRadius: '999px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
    fontFamily: 'inherit', border: `1.5px solid ${on ? RED : DIV}`, background: on ? '#FDECEA' : '#fff',
    color: on ? RED : INK, whiteSpace: 'nowrap',
  })

  return (
    // A phone gets a bottom sheet; anything wider gets a centred card instead
    // of a full-bleed bar across the screen.
    <div role="dialog" aria-label="Report damage" onClick={onClose} className="rd-overlay">
      <style>{`
        .rd-overlay { position: fixed; inset: 0; z-index: 800; background: rgba(13,14,18,.5);
          display: flex; align-items: flex-end; justify-content: center; }
        .rd-panel { width: 100%; max-height: 92vh; overflow-y: auto; background: #F6F7FB;
          border-radius: 20px 20px 0 0; padding: 16px 14px 26px; box-shadow: 0 -8px 30px rgba(0,0,0,.25); }
        .rd-grab { width: 38px; height: 4px; border-radius: 2px; background: #C4C6D0; margin: 0 auto 14px; }
        @media (min-width: 560px) {
          .rd-overlay { align-items: center; padding: 24px; }
          .rd-panel { max-width: 520px; border-radius: 20px; padding: 20px 20px 24px;
            max-height: min(86vh, 780px); box-shadow: 0 20px 60px rgba(0,0,0,.35); }
          .rd-grab { display: none; }
        }
      `}</style>
      <div className="rd-panel" onClick={e => e.stopPropagation()}>
        <div className="rd-grab" />

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '4px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: INK }}>{already ? 'Report more damage' : 'Report damage'}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', color: INK2 }}>{sku}</div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: INK2, fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
        </div>
        <div style={{ fontSize: '12px', color: INK2, lineHeight: 1.5, marginBottom: '12px' }}>
          {already
            ? 'Keep walking the unit — each finding is added to the report.'
            : "Found something on the walk-around? Say what you saw — the unit comes off the marketplace until it's inspected."}
        </div>

        {/* What's already on the report, so a second pass doesn't repeat it */}
        {already && (
          <div style={{ background: '#FFF8E1', border: '1px solid #F2C94C', borderRadius: '12px', padding: '9px 12px', marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Already reported</div>
            <div style={{ fontSize: '12px', color: INK, lineHeight: 1.5, marginTop: '2px' }}>{already}</div>
          </div>
        )}

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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
            {shot && <img src={photoUrl(shot)} alt="Damage" style={{ width: '76px', aspectRatio: '4 / 3', objectFit: 'contain', background: '#EEF1F6', borderRadius: '9px', flexShrink: 0 }} />}
            <button onClick={capture} disabled={busy}
              style={{ flex: 1, padding: '11px', borderRadius: '11px', border: `1.5px solid #C4C6D0`, background: '#fff', color: '#0057B8', fontSize: '12.5px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {shot ? 'Retake the photo' : 'Add a photo (optional)'}
            </button>
          </div>
        </div>

        <button onClick={send} disabled={busy}
          style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', background: busy ? '#C4C6D0' : RED, color: '#fff', fontSize: '14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {busy ? 'Sending…' : already ? 'Add to the inspection report' : 'Report it — queue for inspection'}
        </button>
        <div style={{ fontSize: '11px', color: INK2, textAlign: 'center', marginTop: '9px', lineHeight: 1.5 }}>
          {already
            ? 'The unit is already held; this adds to what the inspector will see.'
            : "The unit comes off the marketplace until an inspector verifies it — you don't have to inspect it yourself."}
        </div>
      </div>
    </div>
  )
}
