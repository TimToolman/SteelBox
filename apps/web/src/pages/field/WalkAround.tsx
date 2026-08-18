// ============================================================
// Field App — the guided walk-around.
//
// One screen per station, in the order you physically walk the unit:
// doors → right → back → left → seams → inside → light test → sticker.
// Each station takes its documentation photo(s) and asks the condition
// question that belongs to that spot, while you're standing there.
//
// Answers branch:
//   clean      → next station
//   cosmetic   → say what and where; a photo is offered
//   structural → say what and where; a photo is REQUIRED
//
// At the end the walk decides for itself. Findings mean the unit is
// queued for an inspector to verify and grade — no grade is proposed
// and no choice is offered. A clean walk goes straight to the model's
// grade, which the driver can apply on the spot.
// ============================================================

import React, { useMemo, useRef, useState } from 'react'
import {
  containers as containersApi, photoUrl, fileToDataUrl, SHOT_LABELS, EXTRA_SLOT_START, DAMAGE_REASONS,
  type Container, type DamageFinding,
} from '../../lib/api'
import { INSPECTOR_QUESTIONS, analyzeContainerPhotos, gradeContainer, gradeLabel, type GradeResult, type PhotoFeatures } from '../../lib/grading'
import { GRADE_META } from '../../lib/specs'

// GO is deliberately brighter than the app's standard blue: on the walk-around
// the Next button is the one thing the driver is looking for, and it has to
// read as live from arm's length in daylight.
const INK = '#1A1C2E', INK2 = '#44475A', DIV = '#E1E2EC', BLUE = '#0057B8', GO = '#0B6BE8', RED = '#B3261E', GREEN = '#1B7A5A', AMBER = '#7B4F00'

const card: React.CSSProperties = { margin: '0 12px 10px', background: '#fff', borderRadius: '16px', border: `1px solid ${DIV}`, padding: '14px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }
const cardTitle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }

// One frame for every walk-around photo: a 4:3 box, the shot contained inside
// it on a neutral ground. Container shots are wide — cropping them to fill a
// short strip hid whether the panel was framed at all.
// Size is controlled by the column width alone — a max-height here would
// fight the ratio and squash the frame back out of shape.
const shotBox: React.CSSProperties = {
  width: '100%', aspectRatio: '4 / 3', objectFit: 'contain',
  borderRadius: '10px', display: 'block', background: '#EEF1F6', boxSizing: 'border-box',
}

// The route around the container. `shots` are documentation slots (0–7);
// `question` is the INSPECTOR_QUESTIONS key asked at that spot.
interface Station { key: string; title: string; cue: string; shots: number[]; question?: string }

export const STATIONS: Station[] = [
  { key: 'doors',  title: 'Front doors',      cue: 'Square to the doors, then open both.',              shots: [0, 1], question: 'doors' },
  { key: 'right',  title: 'Right hand side',  cue: 'Step back far enough for the whole panel.',         shots: [2] },
  { key: 'back',   title: 'Back end',         cue: 'End-on, the full rear panel.',                      shots: [3] },
  { key: 'left',   title: 'Left hand side',   cue: "You've now seen all four sides and the roof line.", shots: [4], question: 'structure' },
  { key: 'rust',   title: 'Seams & rails',    cue: 'Panel seams, door frame, bottom rail.',             shots: [], question: 'rust' },
  { key: 'inside', title: 'Inside',           cue: 'Walk the floor end to end.',                        shots: [5, 6], question: 'floor' },
  { key: 'light',  title: 'Light test',       cue: 'Doors closed, stand inside. Any daylight is a leak.', shots: [], question: 'light' },
  { key: 'sticker', title: 'Stock number',    cue: 'Close-up of the SKU sticker — it must be legible.', shots: [7] },
]

const pickImage = (): Promise<File | null> => new Promise(resolve => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*,.heic,.heif'
  input.setAttribute('capture', 'environment')
  input.onchange = () => resolve(input.files?.[0] ?? null)
  window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 700), { once: true })
  input.click()
})

export function WalkAround({ container, inspectorName, onDone, onExit, onHome, toast }: {
  container: Container
  inspectorName: string
  onDone: (updated: Container, queued: boolean) => void
  onExit: () => void
  onHome: () => void          // the unit is settled — the driver's day moves on
  toast: (m: string) => void
}) {
  const [unit, setUnit] = useState<Container>(container)
  const [at, setAt] = useState(0)                       // station index; === STATIONS.length → summary
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [findings, setFindings] = useState<DamageFinding[]>([])
  const [busy, setBusy] = useState(false)

  // Drill-down state for the station on screen
  const [reasons, setReasons] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [shot, setShot] = useState('')                  // damage photo URL for this finding
  // Damage can be found at a stop that asks nothing (the back panel, the
  // sticker) or at one whose question came back clean — the doors latch fine
  // but there's a hole in one. Either opens the same editor by hand.
  const [manual, setManual] = useState(false)
  const [manualLevel, setManualLevel] = useState<'minor' | 'major'>('minor')
  // Extra photos taken at stops that own no documentation slot, keyed by stop.
  const [extras, setExtras] = useState<Record<string, number[]>>({})

  // Clean-walk grading (only ever runs when nothing was found)
  const [features, setFeatures] = useState<PhotoFeatures[] | null>(null)
  const [result, setResult] = useState<GradeResult | null>(null)
  const [queued, setQueued] = useState(false)
  const [handoff, setHandoff] = useState(false)   // clean walk, sent for a second opinion
  const topRef = useRef<HTMLDivElement | null>(null)

  const station = STATIONS[at]
  const question = station?.question ? INSPECTOR_QUESTIONS.find(q => q.key === station.question) : undefined
  const answer = question ? answers[question.key] : undefined
  const level: 'clean' | 'minor' | 'major' | null =
    answer === undefined ? null : answer === 0 ? 'clean' : question?.options[answer]?.capGrade ? 'major' : 'minor'
  const photos = unit.photos || []
  const shotsMissing = (station?.shots || []).filter(sl => !photos[sl])
  // One finding per stop: the question drives it when the answer isn't clean,
  // otherwise the driver opens it by hand.
  const fromQuestion = !!level && level !== 'clean'
  const drilling = fromQuestion || manual
  const findingLevel: 'minor' | 'major' = fromQuestion ? (level as 'minor' | 'major') : manualLevel
  // A hand-raised finding always needs the photo — there's no answer standing
  // behind it, so the picture is the evidence.
  const photoRequired = drilling && (findingLevel === 'major' || manual)

  const jumpTop = () => topRef.current?.scrollIntoView({ block: 'start' })

  const extraSlots = extras[station?.key ?? ''] ?? []
  const shotLabel = (slot: number) => SHOT_LABELS[slot] ?? `${station?.title ?? 'Extra'} photo`
  // Extras live in the spare slots above the 8-shot standard, so they never
  // displace a documentation photo.
  const addExtra = async () => {
    // An empty placeholder from a cancelled camera is reused rather than
    // stacking up another one.
    const waiting = extraSlots.find(sl => !photos[sl])
    if (waiting !== undefined) { await captureShot(waiting); return }
    let slot = EXTRA_SLOT_START
    while (photos[slot]) slot++
    setExtras(p => ({ ...p, [station.key]: [...(p[station.key] ?? []), slot] }))
    await captureShot(slot)
  }

  // ── Capture ──
  const captureShot = async (slot: number) => {
    if (busy) return
    const file = await pickImage()
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      const updated = await containersApi.uploadPhoto(unit.id, { slot, label: SHOT_LABELS[slot] ?? `${station.title} — walk-around`, dataUrl, inspectorName })
      setUnit(updated)
      toast(`${SHOT_LABELS[slot] ?? station.title} ✓`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Upload failed — try again') } finally { setBusy(false) }
  }

  const captureDamage = async () => {
    if (busy) return
    const file = await pickImage()
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      const { url } = await containersApi.damagePhoto(unit.id, dataUrl)
      setShot(url)
      toast('Damage photo attached')
    } catch (e) { toast(e instanceof Error ? e.message : 'Upload failed — try again') } finally { setBusy(false) }
  }

  // ── Moving on ──
  // A structural answer cannot leave the station without a photo: that is the
  // whole point of asking here rather than from memory in the truck.
  const blocked = useMemo(() => {
    if (!station) return ''
    if (shotsMissing.length) return `Take the ${shotsMissing.map(s => SHOT_LABELS[s]).join(' and ')} shot${shotsMissing.length > 1 ? 's' : ''} first`
    if (question && answer === undefined) return 'Answer the question for this station'
    if (photoRequired && !shot) return 'A photo of the damage is required to continue'
    // A photo IS saying what you found — the reason chips sharpen it, they
    // don't gate it. Only an empty finding (no photo, no reason, no note) has
    // nothing to record.
    if (drilling && !shot && reasons.length === 0 && !note.trim()) return 'Say what you found — or add a photo'
    return ''
  }, [station, shotsMissing, question, answer, drilling, photoRequired, shot, reasons, note])

  const next = async () => {
    if (blocked) { toast(blocked); return }
    // Build the new list here so the last station's finding is included when
    // the walk closes out on this same tap.
    const all = drilling
      ? [...findings, {
          station: station.title,
          question: fromQuestion ? question!.title : 'Spotted on the walk',
          level: findingLevel,
          reasons: [...reasons], note: note.trim(), photo: shot,
          at: new Date().toISOString(), by: inspectorName,
        } as DamageFinding]
      : findings
    setFindings(all)
    setReasons([]); setNote(''); setShot(''); setManual(false); setManualLevel('minor')
    const nextAt = at + 1
    setAt(nextAt)
    jumpTop()
    if (nextAt === STATIONS.length) await queueOrGrade(all)
  }

  // Going back has to be safe: the finding recorded at that stop comes back
  // into the editor rather than being left behind (which would re-block the
  // photo gate with the photo gone, and double-record on the way forward).
  const back = () => {
    if (at === 0) { onExit(); return }
    const prev = STATIONS[at - 1]
    const i = findings.findIndex(f => f.station === prev.title)
    if (i !== -1) {
      const f = findings[i]
      setReasons(f.reasons); setNote(f.note); setShot(f.photo)
      setManualLevel(f.level)
      setManual(f.question === 'Spotted on the walk')
      setFindings(list => list.filter((_, k) => k !== i))
    } else {
      setReasons([]); setNote(''); setShot(''); setManual(false); setManualLevel('minor')
    }
    setAt(a => a - 1)
    jumpTop()
  }

  // ── The end of the walk decides: findings queue it, a clean walk grades it ──
  const queueOrGrade = async (all: DamageFinding[]) => {
    setBusy(true)
    try {
      if (all.length > 0) {
        const summary = all.map(f => [f.reasons.join(', '), f.note].filter(Boolean).join(' — ') || f.question).join('; ')
        const updated = await containersApi.update(unit.id, {
          inspectionRequired: true,
          inspectionReason: summary,
          inspectionFlaggedBy: inspectorName,
          inspectionFindings: JSON.stringify(all),
          inspectionKind: 'damage',
        } as Partial<Container>)
        setUnit(updated); setQueued(true)
        onDone(updated, true)
      } else {
        const f = await analyzeContainerPhotos(unit)
        setFeatures(f)
        setResult(gradeContainer(f, answers))
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not close out the walk-around')
    } finally { setBusy(false) }
  }

  // A clean walk still ends in a judgement call, and the driver doesn't have
  // to be the one who makes it. Handing off holds the unit exactly like a
  // damage report does — it just says so for a different reason.
  const sendToInspector = async () => {
    if (busy) return
    setBusy(true)
    try {
      const proposed = result ? ` — model proposed ${gradeLabel(result.grade, result.sub)}` : ''
      const updated = await containersApi.update(unit.id, {
        inspectionRequired: true,
        inspectionReason: `Second opinion requested by ${inspectorName}${proposed}`,
        inspectionFlaggedBy: inspectorName,
        inspectionKind: 'opinion',
      } as Partial<Container>)
      setUnit(updated); setQueued(true); setHandoff(true)
      toast(`${unit.sku} sent to an inspector for the final grade`)
      onDone(updated, true)
      onHome()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not hand this off — try again')
    } finally { setBusy(false) }
  }

  const applyGrade = async () => {
    if (!result || busy) return
    setBusy(true)
    try {
      const updated = await containersApi.update(unit.id, {
        grade: result.grade, conditionScore: result.sub, aiGraded: true,
        inspectorName, inspectedAt: new Date().toISOString(),
      } as Partial<Container>)
      setUnit(updated)
      toast(`${unit.sku} graded ${gradeLabel(result.grade, result.sub)} — applied to the listing`)
      onDone(updated, false)
      onHome()
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save the grade') } finally { setBusy(false) }
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '9px 13px', borderRadius: '999px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
    fontFamily: 'inherit', border: `1.5px solid ${on ? RED : DIV}`, background: on ? '#FDECEA' : '#fff',
    color: on ? RED : INK, whiteSpace: 'nowrap',
  })

  const header = (
    <div ref={topRef} style={{ padding: '14px 12px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <button onClick={back} style={{ fontSize: '13px', fontWeight: 600, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {at === 0 ? '← Back' : '← Previous'}
        </button>
        <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: INK }}>{unit.sku}</div>
        {findings.length > 0 && (
          <span style={{ marginLeft: 'auto', background: '#FDECEA', color: RED, borderRadius: '999px', padding: '3px 10px', fontSize: '11px', fontWeight: 800 }}>
            {findings.length} finding{findings.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {/* Progress along the route */}
      <div style={{ display: 'flex', gap: '3px', marginTop: '10px' }}>
        {STATIONS.map((s, i) => (
          <span key={s.key} title={s.title} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i < at ? GREEN : i === at ? BLUE : '#E1E2EC' }} />
        ))}
      </div>
    </div>
  )

  // ── Summary: queued for an inspector, or the clean-walk grade ──
  if (at >= STATIONS.length) {
    const meta = result ? GRADE_META[result.grade] : null
    return (
      <div style={{ paddingBottom: '90px' }}>
        {header}
        {queued ? (
          <>
            <div style={{ ...card, background: '#FFF8E1', borderColor: '#F2C94C' }}>
              <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, color: AMBER, marginTop: '1px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.4v.2" /></svg>
                </span>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: INK }}>
                    {handoff ? 'Sent to an inspector' : 'Queued for inspection'}
                  </div>
                  <div style={{ fontSize: '12.5px', color: INK2, lineHeight: 1.55, marginTop: '3px' }}>
                    {handoff
                      ? <>The walk-around came back clean — an inspector makes the final call on the grade.
                          Your photos and answers go with it. The unit waits off the marketplace until they've graded it.</>
                      : <>You reported {findings.length} finding{findings.length === 1 ? '' : 's'}, so this unit isn't graded here —
                          an inspector verifies the damage and grades it. It stays off the marketplace until then.</>}
                  </div>
                </div>
              </div>
            </div>
            {findings.length > 0 && <div style={card}>
              <div style={cardTitle}>What you reported</div>
              {findings.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '9px 0', borderTop: i ? `1px solid ${DIV}` : 'none' }}>
                  {f.photo
                    ? <img src={photoUrl(f.photo)} alt={f.reasons.join(', ')} style={{ width: '64px', height: '48px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                    : <span style={{ width: '64px', height: '48px', borderRadius: '8px', background: '#F4F6FA', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: f.level === 'major' ? RED : INK }}>
                      {f.station} · {f.reasons.join(', ') || f.question}
                      {f.level === 'major' && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#FDECEA', color: RED, borderRadius: '999px', padding: '2px 7px' }}>STRUCTURAL</span>}
                    </div>
                    {f.note && <div style={{ fontSize: '11.5px', color: INK2, marginTop: '2px', lineHeight: 1.4 }}>{f.note}</div>}
                  </div>
                </div>
              ))}
            </div>}
            <div style={{ margin: '0 12px' }}>
              <button onClick={onExit} style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', background: GREEN, color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Done — back to the job
              </button>
            </div>
          </>
        ) : !result ? (
          <div style={{ ...card, textAlign: 'center', color: INK2, fontSize: '13px', padding: '28px 14px' }}>
            {busy ? 'Reading the photo set…' : 'Closing out the walk-around…'}
          </div>
        ) : (
          <>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Clean walk-around — no damage reported</div>
              <div style={{ width: '68px', height: '68px', borderRadius: '16px', background: meta!.color, display: 'grid', placeItems: 'center', color: '#fff', margin: '12px auto 8px' }}>
                <span style={{ fontSize: '32px', fontWeight: 700 }}>{result.grade}</span>
              </div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: INK }}>This container is a {gradeLabel(result.grade, result.sub)}</div>
              <div style={{ fontSize: '12px', color: INK2, marginTop: '3px' }}>{meta!.label} · {result.score}/100 overall</div>
            </div>
            <div style={{ margin: '0 12px' }}>
              <button onClick={applyGrade} disabled={busy}
                style={{ width: '100%', padding: '15px', borderRadius: '999px', border: 'none', background: '#E65100', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {busy ? 'Applying…' : `Approve — apply grade ${gradeLabel(result.grade, result.sub)}`}
              </button>
              {/* The driver never has to be the one who calls it. */}
              <button onClick={sendToInspector} disabled={busy}
                style={{ width: '100%', marginTop: '9px', padding: '14px', borderRadius: '999px', border: `1.5px solid ${DIV}`, background: '#fff', color: BLUE, fontSize: '13.5px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                Not sure — send to an inspector
              </button>
              <div style={{ fontSize: '11px', color: INK2, textAlign: 'center', marginTop: '8px', lineHeight: 1.5 }}>
                An inspector grades it instead. The unit waits off the marketplace until they do.
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── A station ──
  return (
    <div style={{ paddingBottom: '20px', minHeight: 'calc(100vh - 88px)', display: 'flex', flexDirection: 'column' }}>
      {header}

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: BLUE }}>STOP {at + 1} OF {STATIONS.length}</div>
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: INK, marginTop: '3px' }}>{station.title}</div>
        <div style={{ fontSize: '12.5px', color: INK2, lineHeight: 1.5, marginTop: '3px' }}>{station.cue}</div>

        {/* Documentation shots for this stop. The frame is a fixed 4:3 box and
            the photo is contained inside it — a container shot is wide, and
            cropping it to a letterbox hid whether the panel was even framed. */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', maxWidth: station.shots.length > 1 ? '100%' : '300px' }}>
          {(station.shots.length > 0 ? station.shots : extraSlots).map(slot => (
            <div key={slot} style={{ flex: 1, minWidth: 0 }}>
              {photos[slot]
                ? <img src={photoUrl(photos[slot])} alt={shotLabel(slot)} style={shotBox} />
                : <div style={{ ...shotBox, border: `1.5px dashed #C4C6D0`, display: 'grid', placeItems: 'center', color: INK2 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h4l1.5-2h7L17 8h4v11H3V8Z" /><circle cx="12" cy="13" r="3.2" /></svg>
                  </div>}
              <div style={{ fontSize: '10px', color: INK2, margin: '5px 0 4px' }}>{shotLabel(slot)}</div>
              <button onClick={() => captureShot(slot)} disabled={busy}
                style={{ width: '100%', padding: '8px 0', borderRadius: '9px', border: `1.5px solid ${photos[slot] ? '#C4C6D0' : BLUE}`, background: photos[slot] ? '#fff' : BLUE, color: photos[slot] ? BLUE : '#fff', fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {photos[slot] ? 'Retake' : 'Take photo'}
              </button>
            </div>
          ))}
          {/* Stops with no assigned shot (seams & rails, the light test) can
              still photograph what they're looking at — extras land in the
              spare slots, labelled by the stop. */}
          {station.shots.length === 0 && (
            <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <button onClick={addExtra} disabled={busy}
                style={{ padding: '10px 14px', borderRadius: '9px', border: `1.5px solid ${BLUE}`, background: '#fff', color: BLUE, fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h4l1.5-2h7L17 8h4v11H3V8Z" /><circle cx="12" cy="13" r="3.2" /></svg>
                {extraSlots.length ? 'Another photo' : 'Add a photo'}
              </button>
            </div>
          )}
        </div>
      </div>

      {question && (
        <div style={card}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: INK }}>{question.title}</div>
          <div style={{ fontSize: '11.5px', color: INK2, margin: '2px 0 9px', lineHeight: 1.45 }}>{question.detail}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {question.options.map((o, oi) => {
              const on = answer === oi
              const worst = !!o.capGrade
              return (
                <button key={oi} onClick={() => { setAnswers(p => ({ ...p, [question.key]: oi })); if (oi === 0 && !manual) { setReasons([]); setNote(''); setShot('') } }}
                  style={{ textAlign: 'left', padding: '11px 13px', borderRadius: '11px', fontSize: '12.5px', fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? (worst ? RED : oi === 0 ? GREEN : '#B45309') : DIV}`, background: on ? (worst ? '#FDECEA' : oi === 0 ? '#E6F4EE' : '#FFF8E1') : '#fff', color: on ? (worst ? RED : oi === 0 ? GREEN : AMBER) : INK2 }}>
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Found something here? Available at EVERY stop — the back panel and
          the sticker ask no question, and a stop that answered clean can still
          have a hole in it. */}
      {!drilling && (
        <div style={{ margin: '0 12px 10px' }}>
          <button onClick={() => { setManual(true); setManualLevel('minor') }}
            style={{ width: '100%', padding: '12px', borderRadius: '14px', border: `1.5px solid #F0B8B2`, background: '#fff', color: RED, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.4v.2" /></svg>
            Found damage at this stop
          </button>
        </div>
      )}

      {/* The finding editor — opened by a non-clean answer or by hand */}
      {drilling && (
        <div style={{ ...card, borderColor: findingLevel === 'major' ? RED : '#F2C94C', borderWidth: '1.5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ ...cardTitle, color: findingLevel === 'major' ? RED : AMBER, marginBottom: 0 }}>
              {findingLevel === 'major' ? 'Structural finding · photo required'
                : photoRequired ? 'Finding · photo required'
                : 'What did you see?'}
            </div>
            {manual && (
              <button onClick={() => { setManual(false); setReasons([]); setNote(''); setShot('') }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: INK2, fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
            )}
          </div>

          {/* A hand-raised finding has no answer behind it, so it says how bad */}
          {manual && (
            <div style={{ display: 'flex', gap: '7px', marginBottom: '10px' }}>
              {(['minor', 'major'] as const).map(lv => (
                <button key={lv} onClick={() => setManualLevel(lv)}
                  style={{ flex: 1, padding: '10px', borderRadius: '11px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1.5px solid ${manualLevel === lv ? (lv === 'major' ? RED : '#B45309') : DIV}`,
                    background: manualLevel === lv ? (lv === 'major' ? '#FDECEA' : '#FFF8E1') : '#fff',
                    color: manualLevel === lv ? (lv === 'major' ? RED : AMBER) : INK2 }}>
                  {lv === 'minor' ? 'Cosmetic' : 'Structural'}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {DAMAGE_REASONS.map(r => (
              <button key={r} style={chip(reasons.includes(r))}
                onClick={() => setReasons(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])}>{r}</button>
            ))}
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Where on the unit?"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: '10px', padding: '10px 12px', border: `1.5px solid ${DIV}`, borderRadius: '11px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '11px' }}>
            {shot && <img src={photoUrl(shot)} alt="Damage" style={{ width: '76px', height: '58px', objectFit: 'cover', borderRadius: '9px', flexShrink: 0 }} />}
            <button onClick={captureDamage} disabled={busy}
              style={{ flex: 1, padding: '11px', borderRadius: '11px', border: `1.5px solid ${photoRequired && !shot ? RED : '#C4C6D0'}`, background: photoRequired && !shot ? RED : '#fff', color: photoRequired && !shot ? '#fff' : BLUE, fontSize: '12.5px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {shot ? 'Retake damage photo' : photoRequired ? 'Photograph the damage — required' : 'Add a photo (optional)'}
            </button>
          </div>
        </div>
      )}

      {/* Next — sticky INSIDE the app frame, so it tracks the phone-width
          column instead of spanning the whole desktop window. */}
      <div style={{ position: 'sticky', bottom: '78px', zIndex: 5, padding: '12px 12px 4px', margin: '4px 0 0', background: 'linear-gradient(180deg, rgba(248,249,255,0) 0%, #F8F9FF 34%)' }}>
        <button onClick={next} disabled={busy}
          style={{
            width: '100%', padding: '16px', borderRadius: '999px', border: 'none',
            background: blocked ? '#DCDFE8' : GO, color: blocked ? '#8A8FA0' : '#fff',
            fontSize: '15px', fontWeight: 700, cursor: busy ? 'wait' : blocked ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.2px',
            boxShadow: blocked ? 'none' : '0 6px 18px rgba(11,107,232,.38)',
            transition: 'background .15s, box-shadow .15s',
          }}>
          {at === STATIONS.length - 1 ? 'Finish walk-around' : 'Next stop →'}
        </button>
        {blocked
          ? <div style={{ fontSize: '11.5px', fontWeight: 600, color: level === 'major' && !shot ? RED : INK2, textAlign: 'center', marginTop: '7px' }}>{blocked}</div>
          : <div style={{ fontSize: '11.5px', fontWeight: 600, color: GO, textAlign: 'center', marginTop: '7px' }}>Ready — tap to continue</div>}
      </div>
    </div>
  )
}
