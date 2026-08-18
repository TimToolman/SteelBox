// ============================================================
// Damage claim workspace — review → estimate → send.
//
// A claim comes AFTER an inspection, so nothing is collected here.
// Every photo, damage reason and note already exists on the unit and
// the claim; this is where a person reads it, prices it, and sends it.
//
//   1 Review    every unit photo and every recorded finding
//   2 Estimate  a brief note, the repair-shop figure, and the shop's
//               own estimate document uploaded as evidence
//   3 Send      Submit to Shipper · Download ZIP · Email PDF ·
//               Email Link (handed to the user's own mail client)
//
// Shared by the field app (inspector) and the supplier portal — both
// work the same claim through the same three steps.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import {
  claims as claimsApi, photoUrl, fileToDataUrl, findingsOf, claimEvents,
  type DamageClaim, type Container, type DamageFinding,
} from '../../lib/api'
import { pickFile, loadSession, saveSession, clearSession } from '../../lib/capture'
import { damageLabel, SEVERITY_WORD } from '../../lib/grading'
import { Lightbox, useLightbox, type LightboxShot } from '../../components/Lightbox'

const INK = '#1A1C2E', INK2 = '#44475A', INK3 = '#6B7280', DIV = '#E1E2EC'
const BLUE = '#0057B8', RED = '#B3261E', GREEN = '#1B7A5A', AMBER = '#7B4F00'

type Step = 'review' | 'estimate' | 'send'

const card: React.CSSProperties = { background: '#fff', borderRadius: '16px', border: `1px solid ${DIV}`, padding: '15px', boxShadow: '0 1px 4px rgba(26,28,46,.08)', marginBottom: '11px' }
const label: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '9px' }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: `1.5px solid ${DIV}`, borderRadius: '11px', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none' }

// Estimate documents are often a PDF from the shop, not a photo.
const pickDoc = () => pickFile('image/*,application/pdf,.pdf,.heic,.heif')

export function ClaimWorkspace({ claim, unit, role = 'supplier', onClaim, onClose, toast }: {
  claim: DamageClaim
  unit?: Container | null          // the unit, for its documentation photos
  // Who is working it. An inspector reviews and prices, then hands it to the
  // supplier — the supplier owns the relationship with the shipping line and
  // is the one who files.
  role?: 'supplier' | 'inspector'
  onClaim: (c: DamageClaim) => void
  onClose: () => void
  toast: (m: string) => void
}) {
  // The step and a half-typed estimate survive a page reload: attaching the
  // shop's document opens the camera/file picker, and on a phone that round
  // trip can reload the tab. Submitting or handing off clears the draft.
  interface WsSave { step: Step; note: string; amount: string; scope: string; shop: string }
  const saveKey = `sbx_claimws_${claim.id}`
  const [restored] = useState(() => loadSession<WsSave>(saveKey))
  const [step, setStep] = useState<Step>(restored?.step ?? 'review')
  const [note, setNote] = useState(restored?.note ?? claim.notes ?? '')
  const [amount, setAmount] = useState(restored?.amount ?? (claim.estimateAmount ? String(claim.estimateAmount) : ''))
  const [scope, setScope] = useState(restored?.scope ?? claim.estimateNotes ?? '')
  const [shop, setShop] = useState(restored?.shop ?? claim.estimateShop ?? '')
  const [busy, setBusy] = useState('')
  const [link, setLink] = useState('')
  useEffect(() => { saveSession(saveKey, { step, note, amount, scope, shop } satisfies WsSave) }, [saveKey, step, note, amount, scope, shop])

  // Everything already gathered: the claim's own evidence shots, plus the
  // findings the walk-around recorded against the unit.
  const photos = (claim.photos || []).filter(Boolean)
  const reasons = claim.photoReasons || []
  const notes = claim.photoNotes || []
  const findings: DamageFinding[] = useMemo(() => findingsOf(unit), [unit])
  const timeline = useMemo(() => claimEvents(claim), [claim])
  const unitPhotos = (unit?.photos || []).filter(Boolean)
  const lb = useLightbox()

  // Each gallery opens as its own set, so next/previous stays within the
  // group the photo came from.
  const findingShots: LightboxShot[] = useMemo(() => findings.filter(f => f.photo).map(f => ({
    url: photoUrl(f.photo), caption: `${f.station} · ${f.reasons.join(', ') || f.question}`, sub: f.note,
  })), [findings])
  const evidenceShots: LightboxShot[] = useMemo(() => photos.map((u, i) => ({
    url: photoUrl(u), caption: reasons[i] || 'Damage', sub: notes[i],
  })), [photos, reasons, notes])
  const unitShots: LightboxShot[] = useMemo(() => unitPhotos.map((u, i) => ({
    url: photoUrl(u), caption: `Unit documentation ${i + 1} of ${unitPhotos.length}`, sub: claim.containerSku,
  })), [unitPhotos, claim.containerSku])

  const money = Number(amount) || 0
  const estimateReady = note.trim().length > 0 && money > 0

  const save = async (): Promise<DamageClaim | null> => {
    setBusy('save')
    try {
      const updated = await claimsApi.update(claim.id, {
        notes: note.trim(), estimateAmount: money, estimateNotes: scope.trim(), estimateShop: shop.trim(),
      } as Partial<DamageClaim>)
      onClaim(updated)
      return updated
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the estimate')
      return null
    } finally { setBusy('') }
  }

  const attachEstimate = async () => {
    const file = await pickDoc()
    if (!file) return
    setBusy('doc')
    try {
      const dataUrl = await fileToDataUrl(file)
      const updated = await claimsApi.uploadEstimate(claim.id, { dataUrl, estimateShop: shop.trim() })
      onClaim(updated)
      toast('Repair-shop estimate attached')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not attach that file')
    } finally { setBusy('') }
  }

  const toEstimate = () => { setStep('estimate'); window.scrollTo({ top: 0 }) }
  const toSend = async () => {
    if (!estimateReady) { toast('A brief note and an estimate value are required'); return }
    const saved = await save()
    if (saved) { setStep('send'); window.scrollTo({ top: 0 }) }
  }

  // ── The four ways a claim leaves the building ──
  const submit = async () => {
    setBusy('submit')
    try {
      const updated = await claimsApi.share(claim.id, 'submit')
      clearSession(saveKey)
      onClaim(updated)
      toast(`Submitted to ${claim.shipperName} — document, .zip and sign-in link all sent`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not submit the claim') } finally { setBusy('') }
  }
  const handToSupplier = async () => {
    setBusy('handoff')
    try {
      const updated = await claimsApi.share(claim.id, 'handoff')
      clearSession(saveKey)
      onClaim(updated)
      toast(`Sent to ${claim.supplierName} — they submit it to ${claim.shipperName}`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not hand it over') } finally { setBusy('') }
  }
  const downloadZip = async () => {
    setBusy('zip')
    try {
      const { url } = await claimsApi.packageLink(claim.id)
      window.open(url, '_blank', 'noopener')
      toast('Downloading the claim package…')
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not build the package') } finally { setBusy('') }
  }
  const emailPdf = async () => {
    setBusy('pdf')
    try {
      const updated = await claimsApi.share(claim.id, 'document')
      onClaim(updated)
      toast(`Claim document emailed to ${claim.shipperName}`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not email the document') } finally { setBusy('') }
  }
  // Email Link hands the message to whatever mail app the user actually uses —
  // Mail, Gmail, Outlook — rather than sending it from the server.
  const emailLink = async () => {
    setBusy('link')
    try {
      const { url, expiresInDays } = await claimsApi.documentLink(claim.id)
      setLink(url)
      const subject = `Damage claim ${claim.claimNumber} — ${claim.containerSku}`
      const body = [
        `${claim.supplierName} has a damage claim against ${claim.shipperName} for container ${claim.containerSku}.`,
        ``,
        `Severity: ${damageLabel(claim.severity)}${claim.severity ? ` — ${SEVERITY_WORD[claim.severity]}` : ''}`,
        `Repair estimate: $${money.toLocaleString()}${shop ? ` (${shop})` : ''}`,
        note ? `Note: ${note}` : '',
        ``,
        `Full claim — photos, damages and notes on one printable page:`,
        url,
        ``,
        `This link works for ${expiresInDays} days and needs no sign-in.`,
      ].filter(l => l !== undefined).join('\n')
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      toast('Opening your email app with the link…')
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not build the link') } finally { setBusy('') }
  }
  const openDocument = async () => {
    setBusy('open')
    try {
      const { url } = await claimsApi.documentLink(claim.id)
      window.open(url, '_blank', 'noopener')
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not open the document') } finally { setBusy('') }
  }

  const stepDot = (k: Step, n: number, title: string) => {
    const order: Step[] = ['review', 'estimate', 'send']
    const done = order.indexOf(step) > order.indexOf(k)
    const on = step === k
    return (
      <button key={k} onClick={() => { if (done) setStep(k) }}
        style={{ flex: 1, background: 'none', border: 'none', padding: 0, cursor: done ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left' }}>
        <div style={{ height: '4px', borderRadius: '2px', background: done ? GREEN : on ? BLUE : '#E1E2EC', marginBottom: '6px' }} />
        <div style={{ fontSize: '10.5px', fontWeight: 700, color: on ? BLUE : done ? GREEN : INK3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{n} · {title}</div>
      </button>
    )
  }

  const primary = (bg: string): React.CSSProperties => ({
    width: '100%', padding: '15px', borderRadius: '999px', border: 'none', background: bg, color: '#fff',
    fontSize: '14.5px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
  })
  const action = (accent: string): React.CSSProperties => ({
    width: '100%', textAlign: 'left', background: '#fff', border: `1.5px solid ${DIV}`, borderLeft: `4px solid ${accent}`,
    borderRadius: '13px', padding: '13px 15px', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', marginBottom: '9px',
  })

  return (
    <div style={{ padding: '14px 12px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
        <button onClick={onClose} style={{ fontSize: '13px', fontWeight: 600, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Claims</button>
        <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: INK }}>{claim.containerSku}</div>
        <div style={{ fontSize: '11px', color: INK2 }}>{claim.claimNumber}</div>
        {claim.severity > 0 && (
          <span style={{ marginLeft: 'auto', background: RED, color: '#fff', borderRadius: '6px', padding: '3px 9px', fontSize: '11px', fontWeight: 700 }}>{damageLabel(claim.severity)}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {stepDot('review', 1, 'Review')}
        {stepDot('estimate', 2, 'Estimate')}
        {stepDot('send', 3, 'Send')}
      </div>

      {/* ── 1 · Review — nothing is collected here, only read ── */}
      {step === 'review' && (
        <>
          <div style={card}>
            <div style={label}>The claim</div>
            <div style={{ display: 'grid', gridTemplateColumns: '128px 1fr', gap: '5px 12px', fontSize: '12.5px' }}>
              <span style={{ color: INK3 }}>Against</span><span style={{ color: INK, fontWeight: 600 }}>{claim.shipperName}</span>
              <span style={{ color: INK3 }}>Voyage</span><span style={{ color: INK }}>{claim.vesselRef || '—'}</span>
              <span style={{ color: INK3 }}>Severity</span><span style={{ color: INK }}>{claim.severity ? `${damageLabel(claim.severity)} — ${SEVERITY_WORD[claim.severity]}` : 'Pending'}</span>
              <span style={{ color: INK3 }}>Inspected by</span><span style={{ color: INK }}>{claim.inspectorName || '—'}</span>
            </div>
          </div>

          {findings.length > 0 && (
            <div style={card}>
              <div style={label}>Recorded on the walk-around · {findings.length}</div>
              {findings.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', padding: '9px 0', borderTop: i ? `1px solid ${DIV}` : 'none' }}>
                  {f.photo
                    ? <img src={photoUrl(f.photo)} alt={f.reasons.join(', ')} title="Click for a closer look"
                        onClick={() => lb.show(findingShots, findings.filter(x => x.photo).findIndex(x => x.photo === f.photo))}
                        style={{ width: '76px', aspectRatio: '4 / 3', objectFit: 'contain', background: '#EEF1F6', borderRadius: '8px', flexShrink: 0, cursor: 'zoom-in' }} />
                    : <span style={{ width: '76px', aspectRatio: '4 / 3', borderRadius: '8px', background: '#F4F6FA', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: '9px', color: INK3 }}>no photo</span>}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: f.level === 'major' ? RED : INK }}>
                      {f.station} · {f.reasons.join(', ') || f.question}
                      {f.level === 'major' && <span style={{ marginLeft: '6px', fontSize: '9.5px', background: '#FDECEA', color: RED, borderRadius: '999px', padding: '1px 7px' }}>STRUCTURAL</span>}
                    </div>
                    {f.note && <div style={{ fontSize: '11.5px', color: INK2, marginTop: '2px', lineHeight: 1.4 }}>{f.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={card}>
            <div style={label}>Damage evidence · {photos.length} photo{photos.length === 1 ? '' : 's'}</div>
            {photos.length === 0
              ? <div style={{ fontSize: '12.5px', color: INK3, padding: '6px 0' }}>No claim evidence photos — the walk-around findings above are the record.</div>
              : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                  {photos.map((u, i) => (
                    <figure key={i} style={{ margin: 0 }}>
                      <img src={photoUrl(u)} alt={reasons[i] || 'Damage'} title="Click for a closer look"
                        onClick={() => lb.show(evidenceShots, i)}
                        style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'contain', background: '#EEF1F6', borderRadius: '9px', display: 'block', cursor: 'zoom-in' }} />
                      <figcaption style={{ fontSize: '10.5px', color: INK2, marginTop: '3px', lineHeight: 1.35 }}>
                        <b>{reasons[i] || 'Damage'}</b>{notes[i] ? ` — ${notes[i]}` : ''}
                      </figcaption>
                    </figure>
                  ))}
                </div>}
          </div>

          {unitPhotos.length > 0 && (
            <div style={card}>
              <div style={label}>Unit documentation · {unitPhotos.length}</div>
              <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '4px' }}>
                {unitPhotos.map((u, i) => (
                  <img key={i} src={photoUrl(u)} alt={`Unit documentation ${i + 1}`} title="Click for a closer look"
                    onClick={() => lb.show(unitShots, i)}
                    style={{ width: '96px', aspectRatio: '4 / 3', objectFit: 'contain', background: '#EEF1F6', borderRadius: '8px', flexShrink: 0, cursor: 'zoom-in' }} />
                ))}
              </div>
            </div>
          )}

          {/* Who did what, when — read here with the evidence rather than
              scattered down a list of claims. */}
          {timeline.length > 0 && (
            <div style={card}>
              <div style={label}>Audit timeline</div>
              {timeline.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', padding: '4px 0', fontSize: '11.5px', borderTop: i ? `1px solid ${DIV}` : 'none' }}>
                  <span style={{ fontFamily: 'monospace', color: INK3, flexShrink: 0, width: '118px' }}>
                    {new Date(e.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span style={{ color: INK, lineHeight: 1.45 }}>{e.text} <span style={{ color: INK3 }}>— {e.actor}</span></span>
                </div>
              ))}
            </div>
          )}

          <button onClick={toEstimate} style={primary(BLUE)}>Reviewed — add the estimate →</button>
        </>
      )}

      {/* ── 2 · Estimate — the two required fields, plus the shop's document ── */}
      {step === 'estimate' && (
        <>
          <div style={card}>
            <div style={label}>Brief note · required</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="What happened, and what the line is being asked to cover."
              style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </div>

          <div style={card}>
            <div style={label}>Repair estimate · required</div>
            <div style={{ display: 'flex', gap: '9px', alignItems: 'center' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, color: INK }}>$</span>
              <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal"
                placeholder="0" style={{ ...input, fontSize: '19px', fontWeight: 700 }} />
            </div>
            <input value={shop} onChange={e => setShop(e.target.value)} placeholder="Repair shop (who wrote it)"
              style={{ ...input, marginTop: '9px' }} />
            <input value={scope} onChange={e => setScope(e.target.value)} placeholder="Scope of work (optional)"
              style={{ ...input, marginTop: '9px' }} />
          </div>

          <div style={card}>
            <div style={label}>The shop's estimate</div>
            {claim.estimateDocUrl && (
              <a href={photoUrl(claim.estimateDocUrl)} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 12px', background: '#F4F6FA', borderRadius: '11px', textDecoration: 'none', color: BLUE, fontSize: '12.5px', fontWeight: 700, marginBottom: '9px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h11l3 3v13H5V4Z" /><path d="M15.5 4v3.5H19" /></svg>
                Attached — open it
              </a>
            )}
            <button onClick={attachEstimate} disabled={!!busy}
              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: `1.5px solid ${BLUE}`, background: '#fff', color: BLUE, fontSize: '13px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {busy === 'doc' ? 'Uploading…' : claim.estimateDocUrl ? 'Replace the estimate document' : 'Upload the estimate (photo or PDF)'}
            </button>
            <div style={{ fontSize: '11px', color: INK3, marginTop: '8px', lineHeight: 1.5 }}>
              Goes into the claim document and the .zip, so the line sees the shop's own paperwork.
            </div>
          </div>

          <button onClick={toSend} disabled={!!busy} style={primary(estimateReady ? BLUE : '#C4C6D0')}>
            {busy === 'save' ? 'Saving…' : 'Save — go to send →'}
          </button>
          {!estimateReady && (
            <div style={{ fontSize: '11.5px', color: INK2, textAlign: 'center', marginTop: '8px' }}>
              A brief note and an estimate value are required.
            </div>
          )}
        </>
      )}

      {/* ── 3 · Send ── */}
      {step === 'send' && (
        <>
          <div style={{ ...card, background: '#F4F8FF', borderColor: '#C7DBFB' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: INK }}>Ready to send</div>
            <div style={{ fontSize: '12.5px', color: INK2, lineHeight: 1.55, marginTop: '3px' }}>
              {photos.length + findings.length} piece{photos.length + findings.length === 1 ? '' : 's'} of evidence,
              severity {claim.severity ? damageLabel(claim.severity) : '—'}, estimate <b>${money.toLocaleString()}</b>
              {shop ? ` from ${shop}` : ''}{claim.estimateDocUrl ? ', with the shop’s document attached' : ''}.
            </div>
            <button onClick={openDocument} disabled={!!busy}
              style={{ marginTop: '10px', padding: '9px 15px', borderRadius: '999px', border: `1.5px solid ${DIV}`, background: '#fff', color: BLUE, fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              Preview the claim document
            </button>
          </div>

          {/* An inspector prices it and hands it over; the supplier files it. */}
          {role === 'inspector' ? (
            <button onClick={handToSupplier} disabled={!!busy} style={action(GREEN)}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: INK }}>
                {busy === 'handoff' ? 'Sending…' : `Send to ${claim.supplierName}`}
              </span>
              <span style={{ display: 'block', fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '2px' }}>
                Hands the reviewed, priced claim to the supplier — they own the relationship with
                {' '}{claim.shipperName} and file it from here.
              </span>
            </button>
          ) : (
            <button onClick={submit} disabled={!!busy} style={action(GREEN)}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: INK }}>
                {busy === 'submit' ? 'Submitting…' : 'Submit to Shipper'}
              </span>
              <span style={{ display: 'block', fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '2px' }}>
                The formal filing. Emails {claim.shipperName} the document, the .zip and a sign-in link, and moves the
                claim to awaiting their decision.
              </span>
            </button>
          )}

          <button onClick={downloadZip} disabled={!!busy} style={action(BLUE)}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: INK }}>
              {busy === 'zip' ? 'Building…' : 'Download ZIP'}
            </span>
            <span style={{ display: 'block', fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '2px' }}>
              Every image plus the printable summary, as one file on this device.
            </span>
          </button>

          <button onClick={emailPdf} disabled={!!busy} style={action(AMBER)}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: INK }}>
              {busy === 'pdf' ? 'Sending…' : 'Email PDF'}
            </span>
            <span style={{ display: 'block', fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '2px' }}>
              Emails {claim.shipperName} the claim document — images, damages and notes on one page they print or
              save as PDF in a click.
            </span>
          </button>

          <button onClick={emailLink} disabled={!!busy} style={action('#5B6B7E')}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: INK }}>
              {busy === 'link' ? 'Opening…' : 'Email Link'}
            </span>
            <span style={{ display: 'block', fontSize: '11.5px', color: INK2, lineHeight: 1.5, marginTop: '2px' }}>
              Opens your own mail app — Mail, Gmail, Outlook — with a signed 30-day link already written in, so it
              sends from your address.
            </span>
          </button>

          {link && (
            <div style={{ marginTop: '4px', padding: '10px 12px', background: '#F4F6FA', borderRadius: '10px', fontSize: '10.5px', fontFamily: 'monospace', wordBreak: 'break-all', color: INK2 }}>{link}</div>
          )}
        </>
      )}

      {lb.open && (
        <Lightbox shots={lb.open.shots} index={lb.open.index} onIndex={lb.setIndex} onClose={lb.close} />
      )}
    </div>
  )
}
