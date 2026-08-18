// ============================================================
// Field App — AI Grade screen (inspectors, and drivers who inspect)
//
// Pick a unit → the vision model reads its uploaded photo set →
// answer the five inspector questions → the combined model
// proposes a condition grade + 1–5 sub-score → apply, which
// writes grade / conditionScore / aiGraded / inspectorName /
// inspectedAt back to the shared container record that the
// admin portal and marketplace read.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { containers as containersApi, claims as claimsApi, photoUrl, SHOT_LABELS, CLAIM_STAGES, type Container, type DamageClaim } from '../../lib/api'
import { DamageCollect } from './DamageCollect'
import { GRADE_META } from '../../lib/specs'
import {
  INSPECTOR_QUESTIONS, analyzeContainerPhotos, analyzePhotoList, gradeContainer, assessDamage,
  gradeLabel, damageLabel, SEVERITY_WORD,
  type GradeResult, type DamageResult, type PhotoFeatures,
} from '../../lib/grading'

const INK = '#1A1C2E', INK2 = '#44475A', DIV = '#E1E2EC', BLUE = '#0057B8'

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
  toast: (msg: string) => void
  onApplied: () => void      // parent refreshes its container list
}

export function GradeScreen({ containers, inspectorName, toast, onApplied }: GradeScreenProps) {
  // Two separate inspection buckets: inspection required (the unit's saleable
  // condition — it can't list until this is done) and damage claims
  // (sea-freight damage evidence for the shipper/insurance pipeline).
  // Photos and results never mix.
  const [bucket, setBucket] = useState<'retail' | 'damage'>('retail')
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState<Container | null>(null)
  // Wizard phases: analyzing photos → questions → result
  const [features, setFeatures] = useState<PhotoFeatures[] | null>(null)
  const [analyzeProg, setAnalyzeProg] = useState<[number, number]>([0, 0])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<GradeResult | null>(null)
  const [applying, setApplying] = useState(false)

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

  const start = async (c: Container) => {
    setUnit(c); setFeatures(null); setAnswers({}); setResult(null); setAnalyzeProg([0, (c.photos || []).filter(Boolean).length])
    const f = await analyzeContainerPhotos(c, (done, total) => setAnalyzeProg([done, total]))
    setFeatures(f)
  }

  const answered = Object.keys(answers).length
  const compute = () => { if (features) setResult(gradeContainer(features, answers)) }

  const apply = async () => {
    if (!unit || !result || applying) return
    setApplying(true)
    const wasHeld = !!unit.inspectionRequired
    try {
      await containersApi.update(unit.id, {
        grade: result.grade,
        conditionScore: result.sub,
        aiGraded: true,
        inspectorName,
        inspectedAt: new Date().toISOString(),
        // The inspection is done — the unit may list again.
        inspectionRequired: false,
      } as Partial<Container>)
      toast(wasHeld
        ? `${unit.sku} graded ${gradeLabel(result.grade, result.sub)} — released to the marketplace`
        : `${unit.sku} graded ${gradeLabel(result.grade, result.sub)} — applied to the listing`)
      onApplied()
      setUnit(null); setResult(null); setFeatures(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the grade — try again')
    } finally {
      setApplying(false)
    }
  }

  const bucketTabs = (
    <div style={{ display: 'flex', gap: '4px', margin: '0 12px 10px', background: '#EEF2FF', border: `1px solid ${DIV}`, borderRadius: '999px', padding: '3px' }}>
      {([['retail', 'Inspection Required'], ['damage', 'Damage claims']] as const).map(([k, label]) => (
        <button key={k} onClick={() => setBucket(k)}
          style={{ flex: 1, padding: '8px 0', borderRadius: '999px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: bucket === k ? '#fff' : 'transparent', color: bucket === k ? (k === 'damage' ? '#B3261E' : BLUE) : INK2, boxShadow: bucket === k ? '0 1px 4px rgba(26,28,46,.1)' : 'none' }}>
          {label}
        </button>
      ))}
    </div>
  )

  if (bucket === 'damage' && !unit) {
    return (
      <div style={{ paddingBottom: '90px' }}>
        <div style={{ padding: '16px 12px 10px' }}>
          <div style={{ fontSize: '19px', fontWeight: 700, color: INK }}>AI Condition Grading</div>
        </div>
        {bucketTabs}
        <DamageInspection inspectorName={inspectorName} toast={toast} containers={containers} />
      </div>
    )
  }

  // ── Unit list ──
  if (!unit) {
    return (
      <div style={{ paddingBottom: '90px' }}>
        <div style={{ padding: '16px 12px 10px' }}>
          <div style={{ fontSize: '19px', fontWeight: 700, color: INK }}>AI Condition Grading</div>
          <div style={{ fontSize: '12px', color: INK2, marginTop: '3px', lineHeight: 1.5 }}>
            Pick a unit you're picking up or reviewing. The model reads its photo
            documentation, asks you five questions, and proposes a grade with a 1–5 quality sub-score.
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

  const meta = result ? GRADE_META[result.grade] : null

  // ── Wizard ──
  return (
    <div style={{ paddingBottom: '90px' }}>
      <div style={{ padding: '16px 12px 10px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <button onClick={() => setUnit(null)} style={{ fontSize: '13px', fontWeight: 600, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Units</button>
        <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: INK }}>{unit.sku}</div>
        <div style={{ fontSize: '11px', color: INK2 }}>{unit.size}</div>
      </div>

      {/* Step 1 — photo analysis */}
      <div style={card}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
          1 · Photo analysis {features ? '· complete' : `· reading ${analyzeProg[0]}/${analyzeProg[1]}`}
        </div>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
          {(unit.photos || []).slice(0, 8).map((u, i) => u ? (
            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
              <img src={photoUrl(u)} alt={SHOT_LABELS[i]} style={{ width: '58px', height: '44px', objectFit: 'cover', borderRadius: '8px', opacity: features || analyzeProg[0] > i ? 1 : 0.35 }} />
              {(features || analyzeProg[0] > i) && (
                <span style={{ position: 'absolute', bottom: '3px', right: '3px', width: '14px', height: '14px', borderRadius: '50%', background: '#1B7A5A', display: 'grid', placeItems: 'center' }}>
                  <svg width="8" height="8" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>
                </span>
              )}
            </div>
          ) : null)}
        </div>
        {features && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '10px' }}>
            {gradeContainer(features, {}).factors.slice(0, 3).map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: INK2, width: '150px', flexShrink: 0 }}>{f.label.replace(' (photos)', '')}</span>
                <ScoreBar score={f.score} />
                <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: INK, width: '28px', textAlign: 'right' }}>{f.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 2 — the five questions */}
      <div style={card}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
          2 · Walk-around — {answered}/{INSPECTOR_QUESTIONS.length} answered
        </div>
        {INSPECTOR_QUESTIONS.map((q, qi) => (
          <div key={q.key} style={{ padding: '10px 0', borderBottom: qi < INSPECTOR_QUESTIONS.length - 1 ? `1px solid ${DIV}` : 'none' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: INK }}>{qi + 1}. {q.title}</div>
            <div style={{ fontSize: '11px', color: INK2, margin: '2px 0 8px', lineHeight: 1.45 }}>{q.detail}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {q.options.map((o, oi) => {
                const on = answers[q.key] === oi
                return (
                  <button key={oi} onClick={() => { setAnswers(p => ({ ...p, [q.key]: oi })); setResult(null) }}
                    style={{ textAlign: 'left', padding: '9px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? BLUE : DIV}`, background: on ? '#D6E4FF' : '#fff', color: on ? BLUE : INK2 }}>
                    {o.label}{o.capGrade ? ' ⚠' : ''}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Step 3 — model result */}
      {!result ? (
        <div style={{ margin: '0 12px' }}>
          <button
            onClick={compute}
            disabled={!features || answered < INSPECTOR_QUESTIONS.length}
            style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', fontSize: '14px', fontWeight: 700, cursor: features && answered === INSPECTOR_QUESTIONS.length ? 'pointer' : 'not-allowed', background: features && answered === INSPECTOR_QUESTIONS.length ? BLUE : '#EEF2FF', color: features && answered === INSPECTOR_QUESTIONS.length ? '#fff' : INK2 }}>
            {!features ? 'Analyzing photos…' : answered < INSPECTOR_QUESTIONS.length ? `Answer ${INSPECTOR_QUESTIONS.length - answered} more question${INSPECTOR_QUESTIONS.length - answered > 1 ? 's' : ''}` : 'Run grading model'}
          </button>
        </div>
      ) : (
        <div style={card}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }}>3 · Model result</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '14px', background: meta!.color, display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
              <span style={{ fontSize: '30px', fontWeight: 700 }}>{result.grade}</span>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: INK }}>
                Grade {gradeLabel(result.grade, result.sub)} — {meta!.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <SubPips sub={result.sub} color={meta!.color} />
                <span style={{ fontSize: '11px', color: INK2 }}>{result.sub}/5 within grade · {result.score}/100 overall</span>
              </div>
              {result.capped && (
                <div style={{ fontSize: '11px', color: '#B3261E', fontWeight: 600, marginTop: '4px' }}>
                  ⚠ Structural finding capped this unit at grade C
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
            {result.factors.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: INK2, width: '150px', flexShrink: 0 }} title={f.note}>{f.label}</span>
                <ScoreBar score={f.score} />
                <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: INK, width: '28px', textAlign: 'right' }}>{f.score}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: INK2, lineHeight: 1.5, marginBottom: '12px' }}>
            Photos {Math.round(result.photoScore)}/100 (40%) + walk-around {result.answerScore}/100 (60%).
            Applying updates the listing that customers and the admin portal see.
          </div>
          <button onClick={apply} disabled={applying}
            style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: '#E65100', color: '#fff', boxShadow: '0 3px 10px rgba(230,81,0,.3)' }}>
            {applying ? 'Applying…' : `Apply grade ${gradeLabel(result.grade, result.sub)} to ${unit.sku}`}
          </button>
        </div>
      )}
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

const RED = '#B3261E'

function DamageInspection({ inspectorName, toast, containers }: { inspectorName: string; toast: (m: string) => void; containers: Container[] }) {
  const [claims, setClaims] = useState<DamageClaim[]>([])
  const [claim, setClaim] = useState<DamageClaim | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<DamageResult | null>(null)
  const [applying, setApplying] = useState(false)
  // Damage photos live in their own screen, not inline with the wizard.
  const [collecting, setCollecting] = useState(false)

  const refresh = () => claimsApi.list().then(setClaims).catch(() => {})
  useEffect(() => { refresh() }, [])

  const stageLabel = (st: DamageClaim['status']) =>
    CLAIM_STAGES.find(x => x.key === st)?.label
    ?? (st === 'repair_scheduled' ? 'Repair scheduled' : st === 'sell_as_damaged' ? 'Listed as damaged' : 'Closed')

  const photosOn = (claim?.photos || []).filter(Boolean).length
  const answered = Object.keys(answers).length
  const canRun = photosOn >= 2 && answered === INSPECTOR_QUESTIONS.length

  const run = async () => {
    if (!claim || !canRun) return
    const feats = await analyzePhotoList(claim.photos || [])
    setResult(assessDamage(feats, answers))
  }

  const apply = async () => {
    if (!claim || !result || applying) return
    setApplying(true)
    try {
      await claimsApi.update(claim.id, {
        severity: result.severity,
        status: 'awaiting_estimate',
        inspectorName,
        inspectedAt: new Date().toISOString(),
      })
      toast(`${claim.containerSku} damage assessed ${damageLabel(result.severity)} — claim moved to Awaiting estimate`)
      setClaim(null); setResult(null); setAnswers({})
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the assessment')
    } finally { setApplying(false) }
  }

  // ── Claim queue ──
  if (!claim) {
    const queue = claims.filter(c => c.status === 'awaiting_inspection')
    const rest = claims.filter(c => c.status !== 'awaiting_inspection')
    const thumbFor = (c: DamageClaim) => {
      const unit = containers.find(x => x.id === c.containerId)
      return c.photos?.filter(Boolean)[0] || unit?.photos?.filter(Boolean)[0]
    }
    return (
      <div>
        <div style={{ margin: '0 12px 10px', fontSize: '12px', color: INK2, lineHeight: 1.5 }}>
          Sea-freight damage claims waiting on a field inspection. Capture the damage
          evidence, answer the five questions, and the model sets severity D·1–D·5.
        </div>
        {queue.length === 0 && (
          <div style={{ ...card, textAlign: 'center', color: INK2, fontSize: '13px' }}>No claims awaiting inspection.</div>
        )}
        {queue.map(c => (
          <button key={c.id} onClick={() => { setClaim(c); setAnswers({}); setResult(null) }}
            style={{ ...card, width: 'calc(100% - 24px)', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ width: '64px', height: '48px', borderRadius: '10px', background: 'linear-gradient(135deg,#E8C5C5,#D49797)', overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
              {thumbFor(c) && <img src={photoUrl(thumbFor(c))} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: INK }}>{c.containerSku} <span style={{ color: INK2, fontWeight: 400 }}>· {c.claimNumber}</span></div>
              <div style={{ fontSize: '11px', color: INK2, marginTop: '2px' }}>{c.supplierName} vs {c.shipperName}{c.vesselRef ? ` · ${c.vesselRef}` : ''}</div>
            </div>
            <span style={{ flexShrink: 0, background: '#FDECEA', color: RED, borderRadius: '999px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px' }}>INSPECT</span>
          </button>
        ))}
        {rest.length > 0 && <div style={{ margin: '14px 12px 6px', fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px' }}>In the pipeline</div>}
        {rest.map(c => (
          <div key={c.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: INK }}>{c.containerSku} <span style={{ color: INK2, fontWeight: 400 }}>· {c.claimNumber}</span></div>
              <div style={{ fontSize: '11px', color: INK2, marginTop: '2px' }}>{stageLabel(c.status)}</div>
            </div>
            {c.severity > 0 && <span style={{ background: RED, color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{damageLabel(c.severity)}</span>}
          </div>
        ))}
      </div>
    )
  }

  // ── Damage collection — its own screen, not a card in the wizard ──
  if (collecting) {
    return (
      <DamageCollect
        claim={claim}
        onClaim={c => { setClaim(c); setResult(null) }}
        onBack={() => setCollecting(false)}
        toast={toast}
      />
    )
  }

  // ── Inspection wizard ──
  return (
    <div>
      <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <button onClick={() => setClaim(null)} style={{ fontSize: '13px', fontWeight: 600, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Claims</button>
        <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: INK }}>{claim.containerSku}</div>
        <div style={{ fontSize: '11px', color: INK2 }}>{claim.claimNumber}</div>
      </div>

      {/* Damage evidence — collected in its own area, tagged by reason */}
      <div style={card}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
          1 · Damage evidence · {photosOn} photo{photosOn === 1 ? '' : 's'} (min 2)
        </div>
        {photosOn > 0 && (
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' }}>
            {(claim.photos || []).filter(Boolean).map((u, i) => (
              <div key={i} style={{ flexShrink: 0, width: '86px' }}>
                <img src={photoUrl(u)} alt={(claim.photoReasons || [])[i] || 'Damage'}
                  style={{ width: '86px', height: '64px', objectFit: 'cover', borderRadius: '8px', display: 'block' }} />
                <div style={{ fontSize: '9.5px', fontWeight: 800, color: RED, marginTop: '3px' }}>{(claim.photoReasons || [])[i] || 'Damage'}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setCollecting(true)}
          style={{ width: '100%', marginTop: photosOn ? '6px' : 0, padding: '13px', borderRadius: '12px', border: 'none', background: RED, color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {photosOn ? 'Open damage collection →' : 'Collect damage photos →'}
        </button>
        <div style={{ fontSize: '11px', color: INK2, marginTop: '8px', lineHeight: 1.5 }}>
          Damage photos are their own collection — tagged by reason and packaged with the claim,
          separate from the retail photo set.
        </div>
      </div>

      {/* The five questions */}
      <div style={card}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
          2 · Walk-around — {answered}/{INSPECTOR_QUESTIONS.length} answered
        </div>
        {INSPECTOR_QUESTIONS.map((q, qi) => (
          <div key={q.key} style={{ padding: '8px 0', borderBottom: qi < INSPECTOR_QUESTIONS.length - 1 ? `1px solid ${DIV}` : 'none' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: INK, marginBottom: '6px' }}>{qi + 1}. {q.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {q.options.map((o, oi) => {
                const on = answers[q.key] === oi
                return (
                  <button key={oi} onClick={() => { setAnswers(p => ({ ...p, [q.key]: oi })); setResult(null) }}
                    style={{ textAlign: 'left', padding: '8px 11px', borderRadius: '9px', fontSize: '12px', fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? RED : DIV}`, background: on ? '#FDECEA' : '#fff', color: on ? RED : INK2 }}>
                    {o.label}{o.capGrade ? ' ⚠' : ''}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Severity verdict + apply */}
      {!result ? (
        <div style={{ margin: '0 12px' }}>
          <button onClick={run} disabled={!canRun}
            style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', fontSize: '14px', fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed', background: canRun ? RED : '#EEF2FF', color: canRun ? '#fff' : INK2 }}>
            {photosOn < 2 ? `Capture ${2 - photosOn} more photo${photosOn === 1 ? '' : 's'}` : answered < INSPECTOR_QUESTIONS.length ? `Answer ${INSPECTOR_QUESTIONS.length - answered} more question${INSPECTOR_QUESTIONS.length - answered === 1 ? '' : 's'}` : 'Determine damage severity'}
          </button>
        </div>
      ) : (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '14px', background: RED, display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
              <span style={{ fontSize: '22px', fontWeight: 700 }}>{damageLabel(result.severity)}</span>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: INK }}>Damage severity {damageLabel(result.severity)} — {SEVERITY_WORD[result.severity]}</div>
              <div style={{ fontSize: '11px', color: INK2, marginTop: '3px' }}>Condition {result.score}/100 · photos {Math.round(result.photoScore)} + walk-around {result.answerScore}</div>
              {result.structural && <div style={{ fontSize: '11px', color: RED, fontWeight: 600, marginTop: '3px' }}>⚠ Structural finding — severity floored at D·3</div>}
            </div>
          </div>
          <button onClick={apply} disabled={applying}
            style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', fontSize: '14px', fontWeight: 700, cursor: 'pointer', background: '#E65100', color: '#fff', boxShadow: '0 3px 10px rgba(230,81,0,.3)' }}>
            {applying ? 'Saving…' : `Save ${damageLabel(result.severity)} — send claim to estimate`}
          </button>
        </div>
      )}
    </div>
  )
}
