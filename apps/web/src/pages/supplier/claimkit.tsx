// ============================================================
// Claim kit — pieces shared by the supplier portal and the
// shipper review page: the audit timeline and the printable
// claim packet (the arbitration file: evidence photos, severity,
// estimate, and the full chain of custody; print → save as PDF).
// ============================================================

import React from 'react'
import { photoUrl, claimEvents, DAMAGE_SHOT_LABELS, type DamageClaim } from '../../lib/api'
import { damageLabel, SEVERITY_WORD } from '../../lib/grading'

const INK = '#0D0E12', INK2 = '#44474F', INK3 = '#6B7280', DIV = '#E2E4E9'

const fmtT = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// ── Audit timeline — who did what, when ────────────────────
export function ClaimTimeline({ claim }: { claim: DamageClaim }) {
  const events = claimEvents(claim)
  if (events.length === 0) return null
  return (
    <div style={{ marginTop: '10px', borderTop: `1px dashed ${DIV}`, paddingTop: '8px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: INK3, marginBottom: '6px' }}>Audit timeline</div>
      {events.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '2px 0', fontSize: '11px' }}>
          <span style={{ fontFamily: 'var(--mono)', color: INK3, flexShrink: 0, width: '108px' }}>{fmtT(e.t)}</span>
          <span style={{ color: INK, lineHeight: 1.4 }}>{e.text} <span style={{ color: INK3 }}>— {e.actor}</span></span>
        </div>
      ))}
    </div>
  )
}

// ── Printable claim packet ─────────────────────────────────
// Rendered as a full-screen overlay; the print stylesheet isolates it so
// the browser's Print → Save as PDF produces a clean arbitration document.

export function ClaimPacket({ claim, onClose }: { claim: DamageClaim; onClose: () => void }) {
  const events = claimEvents(claim)
  return (
    <div className="claim-packet-overlay" style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(13,14,18,.55)', overflowY: 'auto', padding: '24px 12px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .claim-packet, .claim-packet * { visibility: visible !important; }
          .claim-packet { position: absolute !important; inset: 0 !important; margin: 0 !important; max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
          .packet-noprint { display: none !important; }
        }
      `}</style>
      <div className="claim-packet" style={{ maxWidth: '760px', margin: '0 auto', background: '#fff', borderRadius: '14px', boxShadow: '0 18px 60px rgba(0,0,0,.35)', padding: '30px 34px', color: INK, fontFamily: 'var(--sans)' }}>
        <div className="packet-noprint" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginBottom: '14px' }}>
          <button onClick={() => window.print()} style={{ padding: '9px 18px', borderRadius: '999px', border: 'none', background: '#0057B8', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Print / Save as PDF</button>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '999px', border: `1.5px solid ${DIV}`, background: '#fff', color: INK2, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Close</button>
        </div>

        {/* Header */}
        <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: INK3 }}>Sea-freight damage claim packet</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '24px', fontWeight: 800 }}>{claim.claimNumber}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '14px' }}>{claim.containerSku}</span>
            {claim.vesselRef && <span style={{ fontSize: '12px', color: INK2 }}>Voyage {claim.vesselRef}</span>}
          </div>
          <div style={{ fontSize: '12px', color: INK2, marginTop: '4px' }}>
            Claimant: <b>{claim.supplierName}</b> · Against: <b>{claim.shipperName}</b> · Filed {new Date(claim.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Assessment */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {[
            ['Damage severity', claim.severity ? `${damageLabel(claim.severity)} — ${SEVERITY_WORD[claim.severity]}` : 'Pending inspection'],
            ['Repair estimate', claim.estimateAmount ? `$${claim.estimateAmount.toLocaleString()}` : 'Pending'],
            ['Inspected by', claim.inspectorName ? `${claim.inspectorName}${claim.inspectedAt ? ` · ${new Date(claim.inspectedAt).toLocaleDateString()}` : ''}` : 'Pending'],
            ['Shipper decision', claim.shipperDecision ? `${claim.shipperDecision.toUpperCase()}${claim.shipperDecidedAt ? ` · ${new Date(claim.shipperDecidedAt).toLocaleDateString()}` : ''}` : 'Pending'],
          ].map(([k, v]) => (
            <div key={k} style={{ flex: '1 1 160px', border: `1px solid ${DIV}`, borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: INK3 }}>{k}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '3px' }}>{v}</div>
            </div>
          ))}
        </div>
        {claim.estimateNotes && <div style={{ fontSize: '12px', color: INK2, marginBottom: '12px' }}><b>Estimate scope:</b> {claim.estimateNotes}</div>}
        {claim.notes && <div style={{ fontSize: '12px', color: INK2, marginBottom: '16px' }}><b>Incident notes:</b> {claim.notes}</div>}

        {/* Evidence */}
        {(claim.photos || []).filter(Boolean).length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: INK3, marginBottom: '8px' }}>Damage evidence — captured unedited by the field inspection</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {(claim.photos || []).map((u, i) => u ? (
                <figure key={i} style={{ margin: 0 }}>
                  <img src={photoUrl(u)} alt={DAMAGE_SHOT_LABELS[i] ?? `Photo ${i + 1}`} style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
                  <figcaption style={{ fontSize: '10px', color: INK3, marginTop: '3px' }}>{i + 1}. {DAMAGE_SHOT_LABELS[i] ?? 'Additional photo'}</figcaption>
                </figure>
              ) : null)}
            </div>
          </div>
        )}

        {/* Chain of custody */}
        {events.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: INK3, marginBottom: '8px' }}>Chain of custody</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${DIV}` }}>
                    <td style={{ padding: '5px 8px 5px 0', fontFamily: 'var(--mono)', color: INK3, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{fmtT(e.t)}</td>
                    <td style={{ padding: '5px 8px', verticalAlign: 'top' }}>{e.text}</td>
                    <td style={{ padding: '5px 0 5px 8px', color: INK3, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{e.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '18px', fontSize: '10px', color: INK3, borderTop: `1px solid ${DIV}`, paddingTop: '8px' }}>
          Generated {new Date().toLocaleString()} · Nationwide SteelBox damage-claim system · severity scored by the AI grading model from the evidence photos and the adjuster's five-question walk-around.
        </div>
      </div>
    </div>
  )
}
