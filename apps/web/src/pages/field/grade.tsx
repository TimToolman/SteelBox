// ============================================================
// Field App — Inspections screen (inspectors, and drivers who inspect)
//
// Pick a unit → the vision model reads its uploaded photo set →
// answer the five inspector questions → the combined model
// proposes a condition grade + 1–5 sub-score → apply, which
// writes grade / conditionScore / aiGraded / inspectorName /
// inspectedAt back to the shared container record that the
// admin portal and marketplace read.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { claims as claimsApi, photoUrl, findingsOf, CLAIM_STAGES, type Container, type DamageClaim } from '../../lib/api'
import { ClaimWorkspace } from './ClaimWorkspace'
import { Lightbox, useLightbox } from '../../components/Lightbox'
import { WalkAround } from './WalkAround'
import { GRADE_META } from '../../lib/specs'
import {
  INSPECTOR_QUESTIONS, analyzeContainerPhotos,
  gradeLabel, damageLabel,
  type GradeResult, type PhotoFeatures,
} from '../../lib/grading'

const INK = '#1A1C2E', INK2 = '#44475A', DIV = '#E1E2EC', BLUE = '#0057B8', RED = '#B3261E', AMBER = '#7B4F00'

const card: React.CSSProperties = { margin: '0 12px 10px', background: '#fff', borderRadius: '16px', border: `1px solid ${DIV}`, padding: '14px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? '#1B7A5A' : score >= 45 ? '#B45309' : '#B3261E'
  return (
    <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#EEF2FF', overflow: 'hidden' }}>
      <div style={{ width: `${score}%`, height: '100%', borderRadius: '3px', background: color }} />
    </div>
  )
}

function SubPips({ sub, color }: { sub: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ width: '9px', height: '9px', borderRadius: '50%', background: i <= sub ? color : '#E1E2EC' }} />
      ))}
    </span>
  )
}

interface GradeScreenProps {
  containers: Container[]
  inspectorName: string
  // Damage claims are a granted privilege: an admin ticks "Damage claims" on
  // the account before a driver or inspector can review or submit one.
  // Inspecting and grading never needed it; filing money claims does.
  canClaim: boolean
  toast: (msg: string) => void
  onApplied: () => void      // parent refreshes its container list
}

export function GradeScreen({ containers, inspectorName, canClaim, toast, onApplied }: GradeScreenProps) {
  // Two separate inspection buckets: inspection required (the unit's saleable
  // condition — it can't list until this is done) and damage claims
  // (sea-freight damage evidence for the shipper/insurance pipeline).
  // Photos and results never mix.
  const [bucket, setBucket] = useState<'retail' | 'damage'>('retail')
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState<Container | null>(null)
  const [claiming, setClaiming] = useState(false)     // opening a claim off a verified finding
  // A claim just raised here — the damage bucket opens straight into it.
  const [openClaimId, setOpenClaimId] = useState('')
  // Claims already on file, so a unit that has one offers the way back to it
  // rather than quietly opening a second.
  const [claims, setClaims] = useState<DamageClaim[]>([])
  useEffect(() => { if (canClaim) claimsApi.list().then(setClaims).catch(() => {}) }, [canClaim])
  const openClaimFor = (c: Container | null) =>
    c ? claims.find(x => (x.containerId === c.id || x.containerSku === c.sku) && x.status !== 'closed') : undefined

  const goToClaim = (id: string) => { setUnit(null); setBucket('damage'); setOpenClaimId(id) }

  // What the walk-around recorded, station by station.
  const findings = useMemo(() => findingsOf(unit), [unit])
  // An inspector deciding a grade off someone else's walk needs the photo at
  // full size, not a 62px thumbnail.
  const lb = useLightbox()
  const findingShots = useMemo(() => findings.filter(f => f.photo).map(f => ({
    url: photoUrl(f.photo), caption: `${f.station} · ${f.reasons.join(', ') || f.question}`, sub: f.note || '',
  })), [findings])
  // Held because the driver wanted the call made here, not because anything
  // was found — the screen shouldn't send an inspector hunting for damage.
  const secondOpinion = unit?.inspectionKind === 'opinion'

  // The inspector verifies, then decides whether it's a claim against the
  // shipping line. Evidence photos already exist; the claim collects its own.
  const raiseClaim = async () => {
    if (!unit || claiming) return
    setClaiming(true)
    try {
      const summary = findings.length
        ? findings.map(f => [f.reasons.join(', '), f.note].filter(Boolean).join(' — ') || f.question).join('; ')
        : (unit.inspectionReason || 'Damage verified by the inspector')
      // The inspection already established how bad it is — a claim raised off
      // it starts at the estimate rather than asking the same questions again.
      const majors = findings.filter(f => f.level === 'major').length
      const severity = majors >= 2 ? 5 : majors === 1 ? 4 : findings.length >= 2 ? 3 : 2
      // Every claim opens with its evidence attached — the photos taken at
      // the stops where the damage was found.
      const shot = findings.filter(f => f.photo)
      const created = await claimsApi.create({
        containerId: unit.id, notes: summary, severity, inspectorName, inspectedAt: new Date().toISOString(),
        photos: shot.map(f => f.photo),
        photoReasons: shot.map(f => f.reasons.join(', ') || f.question),
        photoNotes: shot.map(f => f.note),
      })
      // The evidence was captured on the walk — the claim opens straight into
      // its workspace, at the estimate, rather than sending anyone to collect.
      toast(`${created.claimNumber} opened — review it and add the repair estimate`)
      goToClaim(created.id)
      setClaims(list => [created, ...list])
      onApplied()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open the claim')
    } finally { setClaiming(false) }
  }

  // Units that CAN be graded: at least one documentation photo uploaded.
  // Units a driver flagged on the walk-around sort to the top — they are
  // held off the marketplace until someone here grades them.
  const gradable = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rank = (c: Container) => c.inspectionRequired ? 0 : c.aiGraded ? 2 : 1
    return containers
      .filter(c => (c.photos || []).filter(Boolean).length > 0)
      .filter(c => !q || c.sku.toLowerCase().includes(q) || (c.depotLocation || '').toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.sku.localeCompare(b.sku))
  }, [containers, query])
  const heldCount = gradable.filter(c => c.inspectionRequired).length

  // Opening a unit hands it straight to the walk-around, which does its own
  // photo analysis.
  const start = (c: Container) => setUnit(c)

  // Without the grant there is no second bucket to switch to.
  const bucketTabs = !canClaim ? null : (
    <div style={{ display: 'flex', gap: '4px', margin: '0 12px 10px', background: '#EEF2FF', border: `1px solid ${DIV}`, borderRadius: '999px', padding: '3px' }}>
      {([['retail', 'Inspection Required'], ['damage', 'Damage claims']] as const).map(([k, label]) => (
        <button key={k} onClick={() => setBucket(k)}
          style={{ flex: 1, padding: '8px 0', borderRadius: '999px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: bucket === k ? '#fff' : 'transparent', color: bucket === k ? (k === 'damage' ? '#B3261E' : BLUE) : INK2, boxShadow: bucket === k ? '0 1px 4px rgba(26,28,46,.1)' : 'none' }}>
          {label}
        </button>
      ))}
    </div>
  )

  if (bucket === 'damage' && canClaim && !unit) {
    return (
      <div style={{ paddingBottom: '90px' }}>
        <div style={{ padding: '16px 12px 10px' }}>
          <div style={{ fontSize: '19px', fontWeight: 700, color: INK }}>Inspections</div>
        </div>
        {bucketTabs}
        <DamageInspection inspectorName={inspectorName} toast={toast} containers={containers} openClaimId={openClaimId} onOpened={() => setOpenClaimId('')} />
      </div>
    )
  }

  // ── Unit list ──
  if (!unit) {
    return (
      <div style={{ paddingBottom: '90px' }}>
        <div style={{ padding: '16px 12px 10px' }}>
          <div style={{ fontSize: '19px', fontWeight: 700, color: INK }}>Inspections</div>
          <div style={{ fontSize: '12px', color: INK2, marginTop: '3px', lineHeight: 1.5 }}>
            Shoot or retake the unit's photos, report anything you find, then grade it: the
            model reads the photo set, asks you five questions, and proposes a grade with a
            1–5 quality sub-score.
          </div>
        </div>
        {bucketTabs}
        {heldCount > 0 && (
          <div style={{ margin: '0 12px 10px', background: '#FFF8E1', border: '1.5px solid #F2C94C', borderRadius: '14px', padding: '11px 13px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, color: '#7B4F00', marginTop: '1px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.4v.2" /></svg>
            </span>
            <div style={{ fontSize: '12px', color: INK2, lineHeight: 1.5 }}>
              <b style={{ color: INK }}>{heldCount} unit{heldCount === 1 ? '' : 's'} held off the marketplace</b> — damage was
              reported on a walk-around. Grading one here releases it back to the listing.
            </div>
          </div>
        )}
        <div style={{ margin: '0 12px 10px' }}>
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search SKU or depot…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', border: `1.5px solid ${DIV}`, borderRadius: '12px', fontSize: '14px', outline: 'none', background: '#fff' }}
          />
        </div>
        {gradable.length === 0 && (
          <div style={{ ...card, textAlign: 'center', color: INK2, fontSize: '13px' }}>
            No units with photo documentation yet — complete a photo session first.
          </div>
        )}
        {gradable.map(c => {
          const meta = GRADE_META[c.grade]
          return (
            <button key={c.id} onClick={() => start(c)} style={{ ...card, width: 'calc(100% - 24px)', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ width: '64px', height: '48px', borderRadius: '10px', background: 'linear-gradient(135deg,#CBD5E8,#A8BFDF)', overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                {c.photos?.filter(Boolean)[0] && <img src={photoUrl(c.photos.filter(Boolean)[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: INK }}>{c.sku}</div>
                <div style={{ fontSize: '11px', color: INK2, marginTop: '2px' }}>
                  {(c.photos || []).filter(Boolean).length} photos · {c.depotLocation || '—'}
                </div>
                {c.inspectionRequired && (
                  <div style={{ fontSize: '11px', color: '#B3261E', marginTop: '3px', lineHeight: 1.4 }}>
                    {c.inspectionReason || 'Damage reported'}
                    {c.inspectionFlaggedBy ? <span style={{ color: INK2 }}> · {c.inspectionFlaggedBy}</span> : null}
                  </div>
                )}
              </div>
              {c.inspectionRequired
                ? <span style={{ flexShrink: 0, background: '#FDECEA', color: '#B3261E', borderRadius: '999px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px' }}>HELD</span>
                : c.aiGraded
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    <span style={{ background: meta.color, color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700 }}>{gradeLabel(c.grade, c.conditionScore)}</span>
                  </span>
                : <span style={{ flexShrink: 0, background: '#FFF8E1', color: '#7B4F00', borderRadius: '999px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px' }}>NEEDS GRADE</span>}
            </button>
          )
        })}
      </div>
    )
  }

  // ── The inspection itself is the same guided walk the driver runs ──
  // Same 8 stops, same questions, same photo rules — an inspector just
  // happens to be the final say, so findings don't queue back to them.
  return (
    <div style={{ paddingBottom: '90px' }}>
      {/* Shown whenever this unit has damage on file — held by the field crew,
          or found by this inspector on a previous pass. The claim route has to
          exist in both cases, not only while a hold is standing. */}
      {(unit.inspectionRequired || findings.length > 0) && (
        <div style={{ ...card, background: '#FFF8E1', borderColor: '#F2C94C', display: 'flex', gap: '11px', alignItems: 'flex-start', marginTop: '14px' }}>
          <span style={{ flexShrink: 0, color: AMBER, marginTop: '1px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.4v.2" /></svg>
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: INK }}>
              {secondOpinion ? 'Sent for a second opinion'
                : unit.inspectionRequired ? 'Damage reported by the field crew'
                : 'Damage on file for this unit'}
            </div>
            <div style={{ fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '2px' }}>
              {unit.inspectionReason || 'Recorded on a walk-around'}
              {unit.inspectionFlaggedBy ? ` · ${unit.inspectionFlaggedBy}` : ''}.
              {unit.inspectionRequired
                ? ' Walk it yourself below — finishing the walk grades it and releases the hold.'
                : ' Walk it again below to re-grade, or take it to a claim.'}
            </div>
            {findings.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', marginTop: '9px', paddingTop: '9px', borderTop: `1px solid #F2C94C` }}>
                {f.photo
                  ? <img src={photoUrl(f.photo)} alt={f.reasons.join(', ')} onClick={() => lb.show(findingShots, findingShots.findIndex(s => s.url === photoUrl(f.photo)))}
                      style={{ width: '62px', height: '46px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, cursor: 'zoom-in' }} />
                  : <span style={{ width: '62px', height: '46px', borderRadius: '8px', background: '#fff', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: '9px', color: INK2 }}>no photo</span>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: f.level === 'major' ? RED : INK }}>
                    {f.station} · {f.reasons.join(', ') || f.question}
                    {f.level === 'major' && <span style={{ marginLeft: '5px', fontSize: '9px', background: '#FDECEA', color: RED, borderRadius: '999px', padding: '1px 6px' }}>STRUCTURAL</span>}
                  </div>
                  {f.note && <div style={{ fontSize: '11px', color: INK2, marginTop: '1px', lineHeight: 1.4 }}>{f.note}</div>}
                </div>
              </div>
            ))}
            {/* Verified damage becomes a claim from here — never from the
                driver's job screen, and never on a second-opinion hold. */}
            {!secondOpinion && canClaim && (() => {
              const existing = openClaimFor(unit)
              // No photo, no claim — the API refuses one without evidence, so
              // the button says what is missing rather than failing on tap.
              if (!existing && !findings.some(f => f.photo)) return (
                <div style={{ marginTop: '11px', fontSize: '11px', color: INK2, lineHeight: 1.5 }}>
                  A damage claim needs at least one photo of the damage. Walk the unit below and
                  photograph what you find.
                </div>
              )
              return (
                <button onClick={() => existing ? goToClaim(existing.id) : raiseClaim()} disabled={claiming}
                  style={{ marginTop: '11px', padding: '9px 14px', borderRadius: '999px', border: `1.5px solid ${RED}`, background: '#fff', color: RED, fontSize: '12px', fontWeight: 700, cursor: claiming ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  {claiming ? 'Opening…' : existing ? `Return to claim ${existing.claimNumber} →` : 'Verified — open a damage claim'}
                </button>
              )
            })()}
          </div>
        </div>
      )}

      <WalkAround
        container={unit}
        inspectorName={inspectorName}
        finalGrader
        toast={toast}
        onExit={() => setUnit(null)}
        onHome={() => setUnit(null)}
        onDone={() => onApplied()}
      />

      {lb.open && <Lightbox shots={lb.open.shots} index={lb.open.index} onIndex={lb.setIndex} onClose={lb.close} />}
    </div>
  )

}

// ── Inline grading card for the pickup/return job flow ─────
// Controlled version: the parent owns features/answers (so the verdict can
// live on its own review screen), the card runs the photo analysis, renders
// the five questions, and ends with a Finished button right under the last
// question — no scrolling back to the top of the flow.

export function FlowGradeCard({ container, features, setFeatures, answers, setAnswers, result, onFinished }: {
  container: Container | null
  features: PhotoFeatures[] | null
  setFeatures: (f: PhotoFeatures[] | null) => void
  answers: Record<string, number>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, number>>>
  result: GradeResult | null
  onFinished: () => void
}) {
  const [prog, setProg] = useState<[number, number]>([0, 0])

  useEffect(() => {
    if (!container || features) return
    let alive = true
    setProg([0, (container.photos || []).filter(Boolean).length])
    analyzeContainerPhotos(container, (d, t) => { if (alive) setProg([d, t]) })
      .then(f => { if (alive) setFeatures(f) })
    return () => { alive = false }
  }, [container?.id, features]) // eslint-disable-line react-hooks/exhaustive-deps

  const answered = Object.keys(answers).length
  const ready = !!result
  return (
    <div style={{ margin: '0 12px 10px', background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', padding: '14px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
        AI condition rating · photos {features ? '✓ analyzed' : prog[1] ? `${prog[0]}/${prog[1]}…` : '— none on file'}
      </div>
      {INSPECTOR_QUESTIONS.map((q, qi) => (
        <div key={q.key} style={{ padding: '8px 0', borderBottom: `1px solid ${DIV}` }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: INK, marginBottom: '6px' }}>{qi + 1}. {q.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {q.options.map((o, oi) => {
              const on = answers[q.key] === oi
              return (
                <button key={oi} onClick={() => setAnswers(p => ({ ...p, [q.key]: oi }))}
                  style={{ textAlign: 'left', padding: '8px 11px', borderRadius: '9px', fontSize: '12px', fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? BLUE : DIV}`, background: on ? '#D6E4FF' : '#fff', color: on ? BLUE : INK2 }}>
                  {o.label}{o.capGrade ? ' ⚠' : ''}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {/* Finished lives at the BOTTOM of the questions — answer the last one
          and the next tap is right here, not back at the top of the screen. */}
      <button onClick={() => ready && onFinished()} disabled={!ready}
        style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '999px', border: 'none', fontSize: '14px', fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed', background: ready ? BLUE : '#EEF2FF', color: ready ? '#fff' : INK2, boxShadow: ready ? '0 3px 10px rgba(0,87,184,.25)' : 'none' }}>
        {ready ? 'Finished — review the grade' : !features ? 'Analyzing photos…' : `Answer ${INSPECTOR_QUESTIONS.length - answered} more question${INSPECTOR_QUESTIONS.length - answered === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}

// ── Grading & approval screen (separate step after Finished) ──
// Shows the verdict big, the factor breakdown, and two actions: approve
// (applies the grade and returns to the job's task list) or go back and
// review the questions.

export function GradeReviewScreen({ sku, result, applying, onApprove, onBack }: {
  sku: string
  result: GradeResult | null
  applying: boolean
  onApprove: () => void
  onBack: () => void
}) {
  if (!result) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: INK2, fontSize: '13px' }}>
        No grading in progress. <button onClick={onBack} style={{ color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Back to the job</button>
      </div>
    )
  }
  const meta = GRADE_META[result.grade]
  return (
    <div style={{ paddingBottom: '90px' }}>
      <div style={{ background: '#fff', borderBottom: `1px solid ${DIV}`, padding: '44px 16px 14px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: BLUE, cursor: 'pointer', background: 'none', border: 'none', marginBottom: '10px' }}>← Review questions</button>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '18px', fontWeight: 700, color: INK }}>AI Grading Result</div>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: INK2 }}>{sku}</div>
      </div>

      <div style={{ margin: '12px', background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', padding: '20px 16px', boxShadow: '0 1px 4px rgba(26,28,46,.08)', textAlign: 'center' }}>
        <div style={{ width: '84px', height: '84px', borderRadius: '20px', background: meta.color, display: 'grid', placeItems: 'center', color: '#fff', margin: '0 auto 12px', fontSize: '44px', fontWeight: 700 }}>{result.grade}</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: INK }}>This container is a {gradeLabel(result.grade, result.sub)}</div>
        <div style={{ fontSize: '13px', color: INK2, marginTop: '2px' }}>{meta.label} · {result.sub}/5 within grade · {result.score}/100 overall</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}><SubPips sub={result.sub} color={meta.color} /></div>
        {result.capped && (
          <div style={{ fontSize: '12px', color: '#B3261E', fontWeight: 600, marginTop: '10px' }}>⚠ A structural finding capped this unit at grade C</div>
        )}
      </div>

      <div style={{ margin: '0 12px 10px', background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', padding: '14px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>How the model got there</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {result.factors.map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: INK2, width: '150px', flexShrink: 0 }} title={f.note}>{f.label}</span>
              <ScoreBar score={f.score} />
              <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: INK, width: '28px', textAlign: 'right' }}>{f.score}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: INK2, marginTop: '10px', lineHeight: 1.5 }}>
          Photos {Math.round(result.photoScore)}/100 (40%) + walk-around {result.answerScore}/100 (60%).
          Approving applies this grade to the listing customers see.
        </div>
      </div>

      <div style={{ margin: '0 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button onClick={onApprove} disabled={applying}
          style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', fontSize: '15px', fontWeight: 700, cursor: 'pointer', background: '#E65100', color: '#fff', boxShadow: '0 4px 14px rgba(230,81,0,.3)', fontFamily: "'Google Sans', sans-serif" }}>
          {applying ? 'Applying…' : `Approve — apply grade ${gradeLabel(result.grade, result.sub)}`}
        </button>
        <button onClick={onBack}
          style={{ width: '100%', padding: '13px', borderRadius: '999px', border: `1.5px solid ${DIV}`, fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: '#fff', color: INK2 }}>
          ← Back / review questions
        </button>
      </div>
    </div>
  )
}

// ── Damage-claim inspections (separate bucket from retail) ──
// Works the claims queue: capture the damage evidence photos (their own
// slots — never the retail gallery), answer the same five questions, and
// the model determines severity D·1 (minor) to D·5 (severe). Applying
// moves the claim from "Awaiting inspection" to "Awaiting estimate".

function DamageInspection({ inspectorName, toast, containers, openClaimId, onOpened }: {
  inspectorName: string; toast: (m: string) => void; containers: Container[]
  openClaimId?: string          // a claim just raised — open it on arrival
  onOpened?: () => void
}) {
  const [claims, setClaims] = useState<DamageClaim[]>([])
  const [claim, setClaim] = useState<DamageClaim | null>(null)

  const refresh = () => claimsApi.list().then(setClaims).catch(() => {})
  useEffect(() => { refresh() }, [])
  // A claim raised from an inspection lands the inspector inside it.
  useEffect(() => {
    if (!openClaimId) return
    const found = claims.find(c => c.id === openClaimId)
    if (found) { setClaim(found); onOpened?.() }
  }, [openClaimId, claims]) // eslint-disable-line react-hooks/exhaustive-deps

  const stageLabel = (st: DamageClaim['status']) =>
    CLAIM_STAGES.find(x => x.key === st)?.label
    ?? (st === 'repair_scheduled' ? 'Repair scheduled' : st === 'sell_as_damaged' ? 'Listed as damaged' : 'Closed')

  if (!claim) {
    // Every open claim is workable now — a claim is raised after an
    // inspection, so what's left is reading it, pricing it and sending it.
    const open = claims.filter(c => c.status !== 'closed')
    const done = claims.filter(c => c.status === 'closed')
    const thumbFor = (c: DamageClaim) => {
      const unit = containers.find(x => x.id === c.containerId)
      return c.photos?.filter(Boolean)[0] || unit?.photos?.filter(Boolean)[0]
    }
    const row = (c: DamageClaim, dim = false) => (
      <button key={c.id} onClick={() => setClaim(c)}
        style={{ ...card, width: 'calc(100% - 24px)', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: dim ? 0.65 : 1 }}>
        <div style={{ width: '64px', height: '48px', borderRadius: '10px', background: 'linear-gradient(135deg,#E8C5C5,#D49797)', overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
          {thumbFor(c) && <img src={photoUrl(thumbFor(c))} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: INK }}>{c.containerSku} <span style={{ color: INK2, fontWeight: 400 }}>· {c.claimNumber}</span></div>
          <div style={{ fontSize: '11px', color: INK2, marginTop: '2px' }}>{stageLabel(c.status)}{c.estimateAmount ? ` · $${c.estimateAmount.toLocaleString()}` : ''}</div>
        </div>
        {c.severity > 0
          ? <span style={{ flexShrink: 0, background: RED, color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700 }}>{damageLabel(c.severity)}</span>
          : <span style={{ flexShrink: 0, background: '#FDECEA', color: RED, borderRadius: '999px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px' }}>REVIEW</span>}
      </button>
    )
    return (
      <div>
        <div style={{ margin: '0 12px 10px', fontSize: '12px', color: INK2, lineHeight: 1.5 }}>
          Claims are raised after an inspection, so the photos, damages and notes are already
          on file. Open one to review the evidence, add the repair estimate, and send it to the line.
        </div>
        {open.length === 0 && (
          <div style={{ ...card, textAlign: 'center', color: INK2, fontSize: '13px' }}>No open claims.</div>
        )}
        {open.map(c => row(c))}
        {done.length > 0 && <div style={{ margin: '14px 12px 6px', fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Closed</div>}
        {done.map(c => row(c, true))}
      </div>
    )
  }

  // ── The claim workspace ──
  // A claim is opened after an inspection, so the photos, reasons and notes
  // already exist. From here it is read, priced and sent — never collected.
  return (
    <ClaimWorkspace
      claim={claim}
      role="inspector"
      unit={containers.find(c => c.id === claim.containerId || c.sku === claim.containerSku) ?? null}
      onClaim={c => { setClaim(c); refresh() }}
      onClose={() => { setClaim(null); refresh() }}
      toast={toast}
    />
  )
}