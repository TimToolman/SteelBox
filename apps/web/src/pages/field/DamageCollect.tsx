// ============================================================
// Field app — Damage photo collection.
//
// Damage evidence is its OWN collection type, deliberately apart from
// the 8-shot retail documentation set: you tap the reason first (Bent,
// Hole, Rust…) and the camera opens, so every shot lands tagged and
// nothing is filed without a cause. The collection appends — a claim
// has as many shots as the damage needs.
//
// From here the whole claim can travel: download the .zip, email it to
// the shipping line, or copy a signed link.
// ============================================================

import React, { useState } from 'react'
import { claims as claimsApi, fileToDataUrl, photoUrl, DAMAGE_REASONS, type DamageClaim } from '../../lib/api'

const INK = '#1A1C2E', INK2 = '#44475A', DIV = '#E1E2EC', RED = '#B3261E', BLUE = '#0057B8', GREEN = '#1B7A5A'
const card: React.CSSProperties = { margin: '0 12px 12px', background: '#fff', borderRadius: '16px', border: `1px solid ${DIV}`, padding: '16px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }
const cardTitle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }

// Native camera picker — same approach the retail flow uses.
const pickFile = (): Promise<File | null> => new Promise(resolve => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*,.heic,.heif'
  input.setAttribute('capture', 'environment')
  input.onchange = () => resolve(input.files?.[0] ?? null)
  window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 700), { once: true })
  input.click()
})

export function DamageCollect({ claim, onClaim, onBack, toast }: {
  claim: DamageClaim
  onClaim: (c: DamageClaim) => void
  onBack: () => void
  toast: (m: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')
  const [pkgUrl, setPkgUrl] = useState('')
  const [sharing, setSharing] = useState(false)

  const photos = (claim.photos || []).filter(Boolean)
  const reasons = claim.photoReasons || []
  const notes = claim.photoNotes || []

  // Tap a reason → camera opens → the shot files itself under that reason.
  const collect = async (reason: string) => {
    if (busy) return
    const file = await pickFile()
    if (!file) return
    setBusy(reason)
    try {
      // Evidence uploads EXACTLY as shot — no crop, no background removal.
      const dataUrl = await fileToDataUrl(file)
      const updated = await claimsApi.uploadPhoto(claim.id, { reason, dataUrl })
      onClaim(updated)
      toast(`${reason} photo added (${(updated.photos || []).filter(Boolean).length} on file)`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed — try again')
    } finally { setBusy(null) }
  }

  const remove = async (i: number) => {
    try {
      const updated = await claimsApi.deletePhoto(claim.id, i)
      onClaim(updated)
      toast('Photo removed')
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not remove that photo') }
  }

  // Notes ride on the claim record — no re-upload of the photo just to
  // annotate it.
  const saveNote = async (i: number) => {
    setBusy('note')
    try {
      const nextNotes = [...notes]
      while (nextNotes.length < photos.length) nextNotes.push('')
      nextNotes[i] = noteText
      const updated = await claimsApi.update(claim.id, { photoNotes: nextNotes })
      onClaim(updated)
      setNoteFor(null); setNoteText('')
      toast('Note saved')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the note')
    } finally { setBusy(null) }
  }

  // ── Packaging: the whole claim as one file ──
  const download = async () => {
    setSharing(true)
    try {
      const { url } = await claimsApi.packageLink(claim.id)
      window.open(url, '_blank', 'noopener')
      toast('Downloading the claim package…')
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not build the package') } finally { setSharing(false) }
  }
  const copyLink = async () => {
    setSharing(true)
    try {
      const { url, expiresInDays } = await claimsApi.packageLink(claim.id)
      setPkgUrl(url)
      try { await navigator.clipboard.writeText(url) ; toast(`Link copied — good for ${expiresInDays} days`) }
      catch { toast('Link ready below — press and hold to copy') }
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not build the link') } finally { setSharing(false) }
  }
  const emailIt = async () => {
    setSharing(true)
    try {
      const updated = await claimsApi.share(claim.id, 'package')
      onClaim(updated)
      toast(`Package emailed to ${claim.shipperName}`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not send the package') } finally { setSharing(false) }
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '10px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
    fontFamily: 'inherit', border: `1.5px solid ${on ? RED : DIV}`, background: on ? '#FDECEA' : '#fff',
    color: on ? RED : INK, whiteSpace: 'nowrap',
  })
  const actionBtn = (bg: string): React.CSSProperties => ({
    flex: '1 1 30%', minWidth: '96px', padding: '11px 8px', borderRadius: '12px', border: 'none',
    background: bg, color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  })

  return (
    <div style={{ paddingBottom: '90px' }}>
      <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ fontSize: '13px', fontWeight: 600, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Claim</button>
        <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: INK }}>{claim.containerSku}</div>
        <div style={{ fontSize: '11px', color: INK2 }}>{claim.claimNumber}</div>
      </div>

      {/* Capture — reason first, so nothing is filed untagged */}
      <div style={card}>
        <div style={cardTitle}>Add damage photo · tap the reason</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {DAMAGE_REASONS.map(r => (
            <button key={r} style={chip(busy === r)} disabled={!!busy} onClick={() => collect(r)}>
              {busy === r ? 'Opening…' : r}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: INK2, marginTop: '10px', lineHeight: 1.5 }}>
          The camera opens and the shot files itself under that reason. Evidence uploads exactly as
          shot — no cropping or edits — and stays out of the retail photo set.
        </div>
      </div>

      {/* The collection */}
      <div style={card}>
        <div style={cardTitle}>Collected · {photos.length} photo{photos.length === 1 ? '' : 's'}</div>
        {photos.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: INK2, fontSize: '13px' }}>
            Nothing collected yet — tap a reason above to take the first shot.
          </div>
        )}
        {photos.map((u, i) => (
          <div key={i} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', padding: '9px 0', borderTop: i ? `1px solid ${DIV}` : 'none' }}>
            <img src={photoUrl(u)} alt={reasons[i] || 'Damage'} style={{ width: '76px', height: '58px', objectFit: 'cover', borderRadius: '9px', flexShrink: 0, background: '#EEF1F6' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', background: '#FDECEA', color: RED, fontSize: '11.5px', fontWeight: 800 }}>
                {reasons[i] || 'Damage'}
              </span>
              {notes[i] && <div style={{ fontSize: '12px', color: INK2, marginTop: '4px', lineHeight: 1.4 }}>{notes[i]}</div>}
              {noteFor === i ? (
                <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                  <input autoFocus value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Where on the unit?"
                    style={{ flex: 1, minWidth: 0, padding: '7px 10px', border: `1.5px solid ${DIV}`, borderRadius: '9px', fontSize: '12.5px', fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={() => saveNote(i)} disabled={busy === 'note'}
                    style={{ padding: '7px 13px', borderRadius: '9px', border: 'none', background: BLUE, color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </div>
              ) : (
                <button onClick={() => { setNoteFor(i); setNoteText(notes[i] || '') }}
                  style={{ marginTop: '4px', background: 'none', border: 'none', padding: 0, color: BLUE, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {notes[i] ? 'Edit note' : '+ Add note'}
                </button>
              )}
            </div>
            <button onClick={() => remove(i)} aria-label={`Remove ${reasons[i] || 'photo'}`} title="Remove"
              style={{ flexShrink: 0, width: '30px', height: '30px', borderRadius: '50%', border: `1px solid ${DIV}`, background: '#fff', color: INK2, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" /></svg>
            </button>
          </div>
        ))}
      </div>

      {/* Package the whole claim */}
      <div style={card}>
        <div style={cardTitle}>Send the claim file</div>
        <div style={{ fontSize: '12.5px', color: INK2, lineHeight: 1.5, marginBottom: '11px' }}>
          Bundles every damage photo (named by reason) with a printable summary — claim details,
          severity, estimate and the full audit timeline.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={actionBtn(GREEN)} disabled={sharing || photos.length === 0} onClick={download}>Download .zip</button>
          <button style={actionBtn(BLUE)} disabled={sharing || photos.length === 0} onClick={emailIt}>Email to line</button>
          <button style={actionBtn('#5B6B7E')} disabled={sharing || photos.length === 0} onClick={copyLink}>Copy link</button>
        </div>
        {photos.length === 0 && <div style={{ fontSize: '11px', color: RED, marginTop: '8px' }}>Collect at least one photo first.</div>}
        {pkgUrl && (
          <div style={{ marginTop: '10px', padding: '9px 11px', background: '#F4F6FA', borderRadius: '9px', fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all', color: INK2 }}>{pkgUrl}</div>
        )}
      </div>
    </div>
  )
}
