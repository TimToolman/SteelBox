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

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { claims as claimsApi, photoUrl, findingsOf, answersOf, walkedBy, CLAIM_STAGES, type Container, type DamageClaim } from '../../lib/api'
import { ClaimWorkspace } from './ClaimWorkspace'
import { loadSession, saveSession } from '../../lib/capture'
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
const cardTitle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }

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
  // Inspector rights — an inspector, or a driver an admin granted claims
  // access. A plain driver grades units but never reviews reported damage.
  canInspectDamage?: boolean
  toast: (msg: string) => void
  onApplied: () => void      // parent refreshes its container list
}

export function GradeScreen({ containers, inspectorName, canClaim, canInspectDamage = false, toast, onApplied }: GradeScreenProps) {
  // Three queues, because three different jobs arrive here:
  //   initial   nobody has inspected this unit — a driver just loaded it, so
  //             the original inspection (and its grade) happens here
  //   damage    a walk found something; verify it, grade it, maybe claim it
  //   reviewed  already inspected, plus the claims in flight and their
  //             estimate uploads
  // Which queue and which unit are open survives a page reload — the walk
  // takes photos, and a phone camera round-trip can reload the whole tab.
  const QUEUES = ['initial', 'damage', 'reviewed'] as const
  type Queue = typeof QUEUES[number]
  const [bucket, setBucket] = useState<Queue>(() => {
    const saved = loadSession<{ bucket: Queue }>('sbx_grade_ui')?.bucket
    return saved && QUEUES.includes(saved) ? saved : 'initial'
  })
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState<Container | null>(null)
  const restoredUnit = useRef(false)
  useEffect(() => {
    if (restoredUnit.current || containers.length === 0) return
    restoredUnit.current = true
    const savedId = loadSession<{ unitId?: string }>('sbx_grade_ui')?.unitId
    if (savedId) setUnit(containers.find(c => c.id === savedId) ?? null)
  }, [containers])
  useEffect(() => {
    if (!restoredUnit.current) return
    saveSession('sbx_grade_ui', { bucket, unitId: unit?.id })
  }, [bucket, unit?.id])  // eslint-disable-line react-hooks/exhaustive-deps
  const [claiming, setClaiming] = useState(false)     // opening a claim off a verified finding
  // A claim just raised here — the damage bucket opens straight into it.
  const [openClaimId, setOpenClaimId] = useState('')
  // Claims already on file, so a unit that has one offers the way back to it
  // rather than quietly opening a second.
  const [claims, setClaims] = useState<DamageClaim[]>([])
  useEffect(() => { if (canClaim) claimsApi.list().then(setClaims).catch(() => {}) }, [canClaim])
  const openClaimFor = (c: Container | null) =>
    c ? claims.find(x => (x.containerId === c.id || x.containerSku === c.sku) && x.status !== 'closed') : undefined

  const goToClaim = (id: string) => { setUnit(null); setBucket('reviewed'); setOpenClaimId(id) }

  // What the walk-around recorded, station by station.
  const findings = useMemo(() => findingsOf(unit), [unit])
  // The answers behind those findings. An inspector reading someone else's
  // walk needs to see what was actually answered at each station — a clean
  // answer next to a photographed finding is itself information.
  const walkAnswers = useMemo(() => answersOf(unit), [unit])
  const walker = useMemo(() => walkedBy(unit), [unit])
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

  // Which queue a unit belongs to. A standing hold wins over everything:
  // reported damage outranks a grade the unit already carries.
  const queueOf = (c: Container): Queue =>
    c.inspectionRequired ? 'damage' : c.aiGraded ? 'reviewed' : 'initial'

  // Units that CAN be worked here: at least one documentation photo on file.
  const withPhotos = useMemo(
    () => containers.filter(c => (c.photos || []).filter(Boolean).length > 0),
    [containers])
  const counts = useMemo(() => {
    const n = { initial: 0, damage: 0, reviewed: 0 } as Record<Queue, number>
    withPhotos.forEach(c => { n[queueOf(c)]++ })
    return n
  }, [withPhotos])
  const gradable = useMemo(() => {
    const q = query.trim().toLowerCase()
    return withPhotos
      .filter(c => queueOf(c) === bucket)
      .filter(c => !q || c.sku.toLowerCase().includes(q) || (c.depotLocation || '').toLowerCase().includes(q))
      .sort((a, b) => a.sku.localeCompare(b.sku))
  }, [withPhotos, query, bucket])
  const heldCount = counts.damage

  // Opening a unit hands it straight to the walk-around, which does its own
  // photo analysis.
  const start = (c: Container) => setUnit(c)

  // The damage queue is inspector work: a plain driver never sees it.
  const visibleQueues = QUEUES.filter(k => k !== 'damage' || canInspectDamage)
  const QUEUE_LABEL: Record<Queue, string> = {
    initial: 'Needs inspection', damage: 'Damage review', reviewed: 'Reviewed',
  }
  const QUEUE_HINT: Record<Queue, string> = {
    initial: 'Nobody has inspected these yet — walk one to grade it and put it on the marketplace.',
    damage: 'A walk found damage on these. Verify what was reported, grade it, and open a claim if the line is liable.',
    reviewed: 'Already inspected. Claims in flight are here too — add the repair estimate and send them on.',
  }
  const bucketTabs = (
    <div style={{ display: 'flex', gap: '4px', margin: '0 12px 10px', background: '#EEF2FF', border: `1px solid ${DIV}`, borderRadius: '999px', padding: '3px' }}>
      {visibleQueues.map(k => (
        <button key={k} onClick={() => { setBucket(k); setUnit(null) }}
          style={{ flex: 1, padding: '8px 4px', borderRadius: '999px', border: 'none', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: bucket === k ? '#fff' : 'transparent', color: bucket === k ? (k === 'damage' ? RED : BLUE) : INK2, boxShadow: bucket === k ? '0 1px 4px rgba(26,28,46,.1)' : 'none' }}>
          {QUEUE_LABEL[k]}
          {counts[k] > 0 && <span style={{ marginLeft: '5px', opacity: bucket === k ? 1 : 0.7 }}>{counts[k]}</span>}
        </button>
      ))}
    </div>
  )

  // ── Unit list ──
  if (!unit) {
    return (
      <div style={{ paddingBottom: '90px' }}>
        <div style={{ padding: '16px 12px 10px' }}>
          <div style={{ fontSize: '19px', fontWeight: 700, color: INK }}>Inspections</div>
          <div style={{ fontSize: '12px', color: INK2, marginTop: '3px', lineHeight: 1.5 }}>
            {QUEUE_HINT[bucket]}
          </div>
        </div>
        {bucketTabs}
        {bucket === 'damage' && heldCount > 0 && (
          <div style={{ margin: '0 12px 10px', background: '#FFF8E1', border: '1.5px solid #F2C94C', borderRadius: '14px', padding: '11px 13px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, color: '#7B4F00', marginTop: '1px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.4v.2" /></svg>
            </span>
            <div style={{ fontSize: '12px', color: INK2, lineHeight: 1.5 }}>
              <b style={{ color: INK }}>{heldCount} unit{heldCount === 1 ? '' : 's'} held off the marketplace</b> — a walk-around
              reported damage. Verifying and grading one here releases it back to the listing.
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
            {bucket === 'initial' ? 'Nothing waiting on a first inspection.'
              : bucket === 'damage' ? 'No reported damage to review right now.'
              : 'Nothing inspected yet.'}
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
        {/* Claims sit with the reviewed work: they only exist after an
            inspection, and what's left on them is the estimate and the send. */}
        {bucket === 'reviewed' && canClaim && (
          <DamageInspection inspectorName={inspectorName} toast={toast} containers={containers} openClaimId={openClaimId} onOpened={() => setOpenClaimId('')} />
        )}
      </div>
    )
  }

  // ── The inspection itself is the same guided walk the driver runs ──
  // Same 8 stops, same questions, same photo rules — an inspector just
  // happens to be the final say, so findings don't queue back to them.
  return (
    <div style={{ paddingBottom: '90px' }}>
      {/* Whoever walked this unit before you, and exactly what they answered.
          No walk on file means this is the original inspection — the driver
          only loaded it, so nothing has been judged yet. */}
      {walker ? (
        <div style={{ ...card, marginTop: '14px' }}>
          <div style={cardTitle}>Walk on file · {walker}</div>
          <div style={{ fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginBottom: '10px' }}>
            {Object.keys(walkAnswers).length > 0
              ? 'What they answered at each station. Walk it yourself below — your answers replace these.'
              : 'They recorded findings without completing every station question.'}
          </div>
          {INSPECTOR_QUESTIONS.filter(q => walkAnswers[q.key] !== undefined).map(q => {
            const pickIdx = walkAnswers[q.key]
            const opt = q.options[pickIdx]
            const bad = pickIdx > 0
            const structural = !!opt?.capGrade
            return (
              <div key={q.key} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', padding: '7px 0', borderTop: `1px solid ${DIV}` }}>
                <span style={{ flexShrink: 0, width: '9px', height: '9px', borderRadius: '50%', marginTop: '5px', background: structural ? RED : bad ? AMBER : '#1B7A5A' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: INK2, fontWeight: 600 }}>{q.title}</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: structural ? RED : INK, lineHeight: 1.4 }}>
                    {opt?.label ?? '—'}
                    {structural && <span style={{ marginLeft: '6px', fontSize: '9px', background: '#FDECEA', color: RED, borderRadius: '999px', padding: '1px 6px' }}>STRUCTURAL</span>}
                  </div>
                </div>
              </div>
            )
          })}
          {/* Every documentation photo the walk produced, at full size on tap. */}
          {(unit.photos || []).filter(Boolean).length > 0 && (
            <>
              <div style={{ ...cardTitle, marginTop: '12px' }}>Photos from that walk · {(unit.photos || []).filter(Boolean).length}</div>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                {(unit.photos || []).filter(Boolean).map((u, i, all) => (
                  <img key={i} src={photoUrl(u)} alt={`Walk photo ${i + 1}`}
                    onClick={() => lb.show(all.map((p2, j) => ({ url: photoUrl(p2), caption: `Walk photo ${j + 1}`, sub: unit.sku })), i)}
                    style={{ width: '72px', height: '54px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, cursor: 'zoom-in' }} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ ...card, marginTop: '14px', background: '#EEF2FF', borderColor: '#C7D7F5' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: INK }}>No inspection on file — this one is yours</div>
          <div style={{ fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '3px' }}>
            A driver moved this unit without inspecting it. Walk it below to grade it and put it on
            the marketplace.
          </div>
        </div>
      )}

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
  // The open claim survives a reload (estimate docs are captured with the
  // same camera round-trip that can reload the tab).
  const restoredClaim = useRef(false)
  useEffect(() => {
    if (restoredClaim.current || claims.length === 0) return
    restoredClaim.current = true
    const savedId = loadSession<{ claimId?: string }>('sbx_claim_ui')?.claimId
    if (savedId && !claim) setClaim(claims.find(c => c.id === savedId) ?? null)
  }, [claims])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!restoredClaim.current) return
    saveSession('sbx_claim_ui', { claimId: claim?.id })
  }, [claim?.id])  // eslint-disable-line react-hooks/exhaustive-deps
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