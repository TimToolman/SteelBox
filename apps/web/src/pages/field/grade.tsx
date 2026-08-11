// ============================================================
// Field App — AI Grade screen (drivers & container adjusters)
//
// Pick a unit → the vision model reads its uploaded photo set →
// answer the five adjuster questions → the combined model
// proposes a condition grade + 1–5 sub-score → apply, which
// writes grade / conditionScore / aiGraded / inspectorName /
// inspectedAt back to the shared container record that the
// admin portal and marketplace read.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import { containers as containersApi, photoUrl, SHOT_LABELS, type Container } from '../../lib/api'
import { GRADE_META } from '../../lib/specs'
import {
  ADJUSTER_QUESTIONS, analyzeContainerPhotos, gradeContainer, gradeLabel,
  type GradeResult, type PhotoFeatures,
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
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState<Container | null>(null)
  // Wizard phases: analyzing photos → questions → result
  const [features, setFeatures] = useState<PhotoFeatures[] | null>(null)
  const [analyzeProg, setAnalyzeProg] = useState<[number, number]>([0, 0])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<GradeResult | null>(null)
  const [applying, setApplying] = useState(false)

  // Units that CAN be graded: at least one documentation photo uploaded.
  const gradable = useMemo(() => {
    const q = query.trim().toLowerCase()
    return containers
      .filter(c => (c.photos || []).filter(Boolean).length > 0)
      .filter(c => !q || c.sku.toLowerCase().includes(q) || (c.depotLocation || '').toLowerCase().includes(q))
      .sort((a, b) => (a.aiGraded === b.aiGraded ? a.sku.localeCompare(b.sku) : a.aiGraded ? 1 : -1))
  }, [containers, query])

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
    try {
      await containersApi.update(unit.id, {
        grade: result.grade,
        conditionScore: result.sub,
        aiGraded: true,
        inspectorName,
        inspectedAt: new Date().toISOString(),
      } as Partial<Container>)
      toast(`${unit.sku} graded ${gradeLabel(result.grade, result.sub)} — applied to the listing`)
      onApplied()
      setUnit(null); setResult(null); setFeatures(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the grade — try again')
    } finally {
      setApplying(false)
    }
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
              </div>
              {c.aiGraded
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
          2 · Walk-around — {answered}/{ADJUSTER_QUESTIONS.length} answered
        </div>
        {ADJUSTER_QUESTIONS.map((q, qi) => (
          <div key={q.key} style={{ padding: '10px 0', borderBottom: qi < ADJUSTER_QUESTIONS.length - 1 ? `1px solid ${DIV}` : 'none' }}>
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
            disabled={!features || answered < ADJUSTER_QUESTIONS.length}
            style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', fontSize: '14px', fontWeight: 700, cursor: features && answered === ADJUSTER_QUESTIONS.length ? 'pointer' : 'not-allowed', background: features && answered === ADJUSTER_QUESTIONS.length ? BLUE : '#EEF2FF', color: features && answered === ADJUSTER_QUESTIONS.length ? '#fff' : INK2 }}>
            {!features ? 'Analyzing photos…' : answered < ADJUSTER_QUESTIONS.length ? `Answer ${ADJUSTER_QUESTIONS.length - answered} more question${ADJUSTER_QUESTIONS.length - answered > 1 ? 's' : ''}` : 'Run grading model'}
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
// Same model as the AI Grade tab, compacted into the "Score condition"
// step: photo analysis starts automatically, the adjuster answers the five
// questions, and the verdict reads out as "This container is a B·4". The
// parent gates its step CTA on onResult receiving a non-null result.

export function FlowGradeCard({ container, onResult }: { container: Container | null; onResult: (r: GradeResult | null) => void }) {
  const [features, setFeatures] = useState<PhotoFeatures[] | null>(null)
  const [prog, setProg] = useState<[number, number]>([0, 0])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<GradeResult | null>(null)

  useEffect(() => {
    setFeatures(null); setAnswers({}); setResult(null); onResult(null)
    if (!container) return
    let alive = true
    setProg([0, (container.photos || []).filter(Boolean).length])
    analyzeContainerPhotos(container, (d, t) => { if (alive) setProg([d, t]) })
      .then(f => { if (alive) setFeatures(f) })
    return () => { alive = false }
  }, [container?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The verdict appears the moment photos are read AND all five are answered.
  useEffect(() => {
    if (features && Object.keys(answers).length === ADJUSTER_QUESTIONS.length) {
      const r = gradeContainer(features, answers)
      setResult(r); onResult(r)
    } else {
      setResult(null); onResult(null)
    }
  }, [features, answers]) // eslint-disable-line react-hooks/exhaustive-deps

  const meta = result ? GRADE_META[result.grade] : null
  return (
    <div style={{ margin: '0 12px 10px', background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', padding: '14px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
        AI condition rating · photos {features ? '✓ analyzed' : prog[1] ? `${prog[0]}/${prog[1]}…` : '— none on file'}
      </div>
      {ADJUSTER_QUESTIONS.map((q, qi) => (
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
      {result ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '12px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: meta!.color, display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0, fontSize: '24px', fontWeight: 700 }}>{result.grade}</div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: INK }}>This container is a {gradeLabel(result.grade, result.sub)} — {meta!.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
              <SubPips sub={result.sub} color={meta!.color} />
              <span style={{ fontSize: '11px', color: INK2 }}>{result.sub}/5 within grade · {result.score}/100</span>
            </div>
            {result.capped && <div style={{ fontSize: '11px', color: '#B3261E', fontWeight: 600, marginTop: '2px' }}>⚠ Structural finding capped this unit at grade C</div>}
          </div>
        </div>
      ) : (
        <div style={{ paddingTop: '10px', fontSize: '11px', color: INK2, textAlign: 'center' }}>
          {features ? 'Answer all five questions — the model rates the unit automatically.' : 'Reading the photo documentation…'}
        </div>
      )}
    </div>
  )
}
