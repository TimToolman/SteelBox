// ============================================================
// Marketplace — Inspections portal tab.
//
// The same damage work the field app does, on a desk. A phone is
// right for walking a unit; reading someone else's walk, pricing a
// repair and sending a claim is desk work — big photos, the estimate
// document open beside them, a real keyboard for the note.
//
// Three queues, same meanings as the field app:
//   Needs inspection  nobody has walked it — the original inspection
//   Damage review     a walk found something; verify, grade, claim
//   Reviewed          already inspected, plus claims in flight
//
// The claim itself opens in the shared ClaimWorkspace — the same
// review → estimate → send the field app and supplier portal use.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import {
  containers as containersApi, claims as claimsApi, photoUrl,
  findingsOf, answersOf, walkedBy, CLAIM_STAGES,
  type Container, type DamageClaim, type AuthUser,
} from '../../lib/api'
import { INSPECTOR_QUESTIONS, gradeLabel, damageLabel } from '../../lib/grading'
import { GRADE_META } from '../../lib/specs'
import { ClaimWorkspace } from '../field/ClaimWorkspace'
import { Lightbox, useLightbox } from '../../components/Lightbox'

const QUEUES = ['initial', 'damage', 'reviewed'] as const
type Queue = typeof QUEUES[number]

const QUEUE_LABEL: Record<Queue, string> = {
  initial: 'Needs inspection', damage: 'Damage review', reviewed: 'Reviewed',
}
const QUEUE_HINT: Record<Queue, string> = {
  initial: 'Nobody has inspected these yet — a driver moved the unit without walking it. They need an original inspection before they can list.',
  damage: 'A walk-around reported damage on these. Read what was found, then open a claim against the shipping line where the line is liable.',
  reviewed: 'Already inspected. Claims in flight are here too — add the repair estimate and send them on.',
}

const queueOf = (c: Container): Queue =>
  c.inspectionRequired ? 'damage' : c.aiGraded ? 'reviewed' : 'initial'

const cardStyle: React.CSSProperties = {
  background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r16)',
  padding: '16px', boxShadow: 'var(--sh1)',
}
const eyebrow: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.9px', textTransform: 'uppercase', color: 'var(--ink3)',
}

export function InspectionsPortal({ user, canClaim, toast }: {
  user: AuthUser | null
  canClaim: boolean            // the 'claims' grant — required to touch claims at all
  toast: (m: string) => void
}) {
  const [queue, setQueue] = useState<Queue>('damage')
  const [units, setUnits] = useState<Container[]>([])
  const [claims, setClaims] = useState<DamageClaim[]>([])
  const [open, setOpen] = useState<Container | null>(null)     // unit being read
  const [claim, setClaim] = useState<DamageClaim | null>(null) // claim being worked
  const [busy, setBusy] = useState(false)
  const lb = useLightbox()

  const refreshUnits = () => containersApi.list().then(setUnits).catch(() => {})
  const refreshClaims = () => { if (canClaim) claimsApi.list().then(setClaims).catch(() => {}) }
  useEffect(() => { refreshUnits(); refreshClaims() }, [canClaim]) // eslint-disable-line react-hooks/exhaustive-deps

  const withPhotos = useMemo(() => units.filter(c => (c.photos || []).filter(Boolean).length > 0), [units])
  const counts = useMemo(() => {
    const n = { initial: 0, damage: 0, reviewed: 0 } as Record<Queue, number>
    withPhotos.forEach(c => { n[queueOf(c)]++ })
    return n
  }, [withPhotos])
  const listed = useMemo(
    () => withPhotos.filter(c => queueOf(c) === queue).sort((a, b) => a.sku.localeCompare(b.sku)),
    [withPhotos, queue])
  const openClaims = useMemo(() => claims.filter(c => c.status !== 'closed'), [claims])
  const claimFor = (c: Container | null) =>
    c ? openClaims.find(x => x.containerId === c.id || x.containerSku === c.sku) : undefined

  // ── A claim, full width: review → estimate → send ──
  if (claim) {
    const unit = units.find(u => u.id === claim.containerId || u.sku === claim.containerSku) || null
    return (
      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '20px 16px 80px' }}>
        <ClaimWorkspace
          claim={claim} unit={unit} role="inspector" toast={toast}
          onClaim={updated => { setClaim(updated); setClaims(list => list.map(c => c.id === updated.id ? updated : c)) }}
          onClose={() => { setClaim(null); refreshClaims(); refreshUnits() }}
        />
      </main>
    )
  }

  // ── One unit: the walk someone else recorded ──
  if (open) {
    const findings = findingsOf(open)
    const answers = answersOf(open)
    const walker = walkedBy(open)
    const photos = (open.photos || []).filter(Boolean)
    const existing = claimFor(open)
    const shots = findings.filter(f => f.photo)

    const raiseClaim = async () => {
      if (busy) return
      setBusy(true)
      try {
        const summary = findings.length
          ? findings.map(f => [f.reasons.join(', '), f.note].filter(Boolean).join(' — ') || f.question).join('; ')
          : (open.inspectionReason || 'Damage verified by the inspector')
        const majors = findings.filter(f => f.level === 'major').length
        const severity = majors >= 2 ? 5 : majors === 1 ? 4 : findings.length >= 2 ? 3 : 2
        const created = await claimsApi.create({
          containerId: open.id, notes: summary, severity,
          inspectorName: user?.name || 'Inspector', inspectedAt: new Date().toISOString(),
          photos: shots.map(f => f.photo),
          photoReasons: shots.map(f => f.reasons.join(', ') || f.question),
          photoNotes: shots.map(f => f.note),
        })
        setClaims(list => [created, ...list])
        setOpen(null)
        setClaim(created)
        toast(`${created.claimNumber} opened — add the repair estimate and send it on`)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not open the claim')
      } finally { setBusy(false) }
    }

    return (
      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '20px 16px 80px' }}>
        <button onClick={() => setOpen(null)}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '12px' }}>
          ← Back to {QUEUE_LABEL[queue].toLowerCase()}
        </button>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <h1 style={{ fontFamily: 'var(--mono)', fontSize: '24px', fontWeight: 700 }}>{open.sku}</h1>
          {open.inspectionRequired && (
            <span style={{ background: '#FDECEA', color: '#B3261E', borderRadius: 'var(--pill)', padding: '3px 11px', fontSize: '11px', fontWeight: 700 }}>
              HELD OFF THE MARKETPLACE
            </span>
          )}
          {open.aiGraded && (
            <span style={{ background: GRADE_META[open.grade].color, color: '#fff', borderRadius: 'var(--r4)', padding: '3px 9px', fontSize: '12px', fontWeight: 700 }}>
              {open.grade === 'D' ? damageLabel(open.damageSeverity) : gradeLabel(open.grade, open.conditionScore)}
            </span>
          )}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '18px' }}>
          {open.depotLocation || '—'} · {photos.length} photo{photos.length === 1 ? '' : 's'} on file
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          {/* What the walk found */}
          <div style={cardStyle}>
            <div style={eyebrow}>Reported damage · {findings.length}</div>
            {findings.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '10px' }}>
                {open.inspectionReason || 'No findings recorded on the walk.'}
              </div>
            )}
            {findings.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', padding: '11px 0', borderTop: i ? '1px solid var(--div)' : 'none', marginTop: i ? 0 : '10px' }}>
                {f.photo
                  ? <img src={photoUrl(f.photo)} alt={f.reasons.join(', ')}
                      onClick={() => lb.show(shots.map(x => ({ url: photoUrl(x.photo), caption: `${x.station} · ${x.reasons.join(', ') || x.question}`, sub: x.note })), shots.indexOf(f))}
                      style={{ width: '104px', height: '78px', objectFit: 'cover', borderRadius: 'var(--r8)', flexShrink: 0, cursor: 'zoom-in' }} />
                  : <span style={{ width: '104px', height: '78px', borderRadius: 'var(--r8)', background: 'var(--surf1)', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: '10px', color: 'var(--ink3)' }}>no photo</span>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: f.level === 'major' ? '#B3261E' : 'var(--ink)' }}>
                    {f.station} · {f.reasons.join(', ') || f.question}
                    {f.level === 'major' && <span style={{ marginLeft: '7px', fontSize: '10px', background: '#FDECEA', color: '#B3261E', borderRadius: 'var(--pill)', padding: '2px 7px' }}>STRUCTURAL</span>}
                  </div>
                  {f.note && <div style={{ fontSize: '12px', color: 'var(--ink2)', marginTop: '3px', lineHeight: 1.5 }}>{f.note}</div>}
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '3px' }}>{f.by}{f.at ? ` · ${new Date(f.at).toLocaleDateString()}` : ''}</div>
                </div>
              </div>
            ))}
          </div>

          {/* What they answered, station by station */}
          <div style={cardStyle}>
            <div style={eyebrow}>{walker ? `Walk on file · ${walker}` : 'No walk on file'}</div>
            {!walker && (
              <div style={{ fontSize: '13px', color: 'var(--ink2)', marginTop: '10px', lineHeight: 1.6 }}>
                A driver moved this unit without inspecting it. It needs an original inspection in the
                field app before it can be graded and listed.
              </div>
            )}
            {INSPECTOR_QUESTIONS.filter(q => answers[q.key] !== undefined).map((q, i) => {
              const opt = q.options[answers[q.key]]
              const structural = !!opt?.capGrade
              const bad = answers[q.key] > 0
              return (
                <div key={q.key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '9px 0', borderTop: i ? '1px solid var(--div)' : 'none', marginTop: i ? 0 : '10px' }}>
                  <span style={{ flexShrink: 0, width: '10px', height: '10px', borderRadius: '50%', marginTop: '5px', background: structural ? '#B3261E' : bad ? '#B45309' : 'var(--green)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink3)', fontWeight: 600 }}>{q.title}</div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: structural ? '#B3261E' : 'var(--ink)', lineHeight: 1.4 }}>{opt?.label ?? '—'}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Every documentation photo, big */}
        {photos.length > 0 && (
          <div style={{ ...cardStyle, marginTop: '14px' }}>
            <div style={eyebrow}>Unit documentation · {photos.length}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginTop: '10px' }}>
              {photos.map((u, i) => (
                <img key={i} src={photoUrl(u)} alt={`Unit photo ${i + 1}`}
                  onClick={() => lb.show(photos.map((p, j) => ({ url: photoUrl(p), caption: `Unit documentation ${j + 1} of ${photos.length}`, sub: open.sku })), i)}
                  style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 'var(--r8)', cursor: 'zoom-in', display: 'block' }} />
              ))}
            </div>
          </div>
        )}

        {/* The way on: an existing claim, or a new one off this evidence */}
        {canClaim && (
          <div style={{ ...cardStyle, marginTop: '14px' }}>
            {existing ? (
              <>
                <div style={eyebrow}>Claim on file</div>
                <div style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 10px' }}>
                  {existing.claimNumber} · {CLAIM_STAGES.find(x => x.key === existing.status)?.label ?? existing.status}
                </div>
                <button onClick={() => setClaim(existing)}
                  style={{ padding: '12px 22px', borderRadius: 'var(--pill)', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Open claim workspace →
                </button>
              </>
            ) : shots.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.6 }}>
                A damage claim needs at least one photo of the damage. This walk recorded none —
                re-walk the unit in the field app and photograph what you find.
              </div>
            ) : (
              <>
                <div style={eyebrow}>Liable shipping line?</div>
                <div style={{ fontSize: '13px', color: 'var(--ink2)', margin: '8px 0 12px', lineHeight: 1.6 }}>
                  Opening a claim carries this walk's {shots.length} damage photo{shots.length === 1 ? '' : 's'} in as its evidence,
                  then takes you to the estimate.
                </div>
                <button onClick={raiseClaim} disabled={busy}
                  style={{ padding: '12px 22px', borderRadius: 'var(--pill)', border: 'none', background: 'var(--cta)', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  {busy ? 'Opening…' : 'Open a damage claim'}
                </button>
              </>
            )}
          </div>
        )}
        {lb.open && <Lightbox shots={lb.open.shots} index={lb.open.index} onIndex={lb.setIndex} onClose={lb.close} />}
      </main>
    )
  }

  // ── The queues ──
  return (
    <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '20px 16px 80px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>Inspections</h1>
      <div style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 14px', maxWidth: '760px', lineHeight: 1.6 }}>
        {QUEUE_HINT[queue]}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {QUEUES.map(k => (
          <button key={k} onClick={() => setQueue(k)}
            style={{
              padding: '9px 18px', borderRadius: 'var(--pill)', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '13px', fontWeight: 700,
              border: `1.5px solid ${queue === k ? (k === 'damage' ? '#B3261E' : 'var(--primary)') : 'var(--div)'}`,
              background: queue === k ? (k === 'damage' ? '#FDECEA' : 'var(--primary-cont, #E3F0FF)') : 'var(--surf-w)',
              color: queue === k ? (k === 'damage' ? '#B3261E' : 'var(--primary)') : 'var(--ink2)',
            }}>
            {QUEUE_LABEL[k]}{counts[k] > 0 ? ` · ${counts[k]}` : ''}
          </button>
        ))}
      </div>

      {listed.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--ink3)', fontSize: '13.5px', padding: '30px' }}>
          {queue === 'initial' ? 'Nothing waiting on a first inspection.'
            : queue === 'damage' ? 'No reported damage to review right now.'
            : 'Nothing inspected yet.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
        {listed.map(c => {
          const findings = findingsOf(c)
          const walker = walkedBy(c)
          const claimOn = claimFor(c)
          return (
            <button key={c.id} onClick={() => setOpen(c)}
              style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: '13px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ width: '84px', height: '63px', borderRadius: 'var(--r8)', background: 'var(--surf1)', overflow: 'hidden', flexShrink: 0 }}>
                {c.photos?.filter(Boolean)[0] && <img src={photoUrl(c.photos.filter(Boolean)[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '13.5px', fontWeight: 700 }}>{c.sku}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
                  {c.depotLocation || '—'} · {walker ? `walked by ${walker}` : 'never inspected'}
                </div>
                {findings.length > 0 && (
                  <div style={{ fontSize: '11.5px', color: '#B3261E', marginTop: '4px', fontWeight: 600, lineHeight: 1.4 }}>
                    {findings.length} finding{findings.length === 1 ? '' : 's'} · {findings.filter(f => f.photo).length} photographed
                  </div>
                )}
                {claimOn && (
                  <div style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '3px', fontWeight: 700 }}>{claimOn.claimNumber} open</div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Claims in flight — the estimate and the send live in here */}
      {queue === 'reviewed' && canClaim && openClaims.length > 0 && (
        <div style={{ marginTop: '26px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '3px' }}>Claims in flight · {openClaims.length}</h2>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '12px' }}>
            Review the evidence, attach the repair shop's estimate, then send it on.
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {openClaims.map(c => (
              <button key={c.id} onClick={() => setClaim(c)}
                style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: '13px 15px', display: 'flex', alignItems: 'center', gap: '13px' }}>
                <div style={{ width: '72px', height: '54px', borderRadius: 'var(--r8)', background: 'var(--surf1)', overflow: 'hidden', flexShrink: 0 }}>
                  {c.photos?.filter(Boolean)[0] && <img src={photoUrl(c.photos.filter(Boolean)[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 700 }}>{c.containerSku} · {c.claimNumber}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '2px' }}>
                    vs {c.shipperName || '—'} · {CLAIM_STAGES.find(x => x.key === c.status)?.label ?? c.status}
                  </div>
                </div>
                {c.severity > 0 && (
                  <span style={{ background: '#B3261E', color: '#fff', borderRadius: 'var(--r4)', padding: '2px 8px', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{damageLabel(c.severity)}</span>
                )}
                {c.estimateAmount > 0 && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>${c.estimateAmount.toLocaleString()}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {lb.open && <Lightbox shots={lb.open.shots} index={lb.open.index} onIndex={lb.setIndex} onClose={lb.close} />}
    </main>
  )
}
