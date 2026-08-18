// ============================================================
// Field App — the 8-shot photo strip for one container.
//
// The driver's job flow has always been able to shoot and retake the
// documentation set. An inspector walking the same unit needs exactly
// the same thing, so the strip lives here and both screens use it:
// capture an empty slot, retake a bad shot, delete one outright.
//
// Every slot means the same photo everywhere (SHOT_LABELS), so the
// marketplace gallery and the 3D wrap keep lining up.
// ============================================================

import React, { useState } from 'react'
import { containers as containersApi, photoUrl, fileToDataUrl, SHOT_LABELS, type Container } from '../../lib/api'

const INK2 = '#44475A', DIV = '#E1E2EC', BLUE = '#0057B8'

// Native camera picker. The focus fallback resolves the promise when the
// picker is dismissed without a shot (iOS fires no change event).
const pickImage = (): Promise<File | null> => new Promise(resolve => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*,.heic,.heif'
  input.setAttribute('capture', 'environment')
  input.onchange = () => resolve(input.files?.[0] ?? null)
  window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 700), { once: true })
  input.click()
})

export function UnitPhotoStrip({ container, inspectorName, onContainer, toast }: {
  container: Container
  inspectorName: string
  onContainer: (c: Container) => void
  toast: (m: string) => void
}) {
  const [busy, setBusy] = useState<number | null>(null)
  const photos = container.photos || []

  const capture = async (slot: number) => {
    if (busy !== null) return
    const file = await pickImage()
    if (!file) return
    setBusy(slot)
    try {
      const dataUrl = await fileToDataUrl(file)
      const updated = await containersApi.uploadPhoto(container.id, { slot, label: SHOT_LABELS[slot], dataUrl, inspectorName })
      onContainer(updated)
      toast(`${SHOT_LABELS[slot]} ✓ uploaded`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed — check connection and retry')
    } finally { setBusy(null) }
  }

  const remove = async (slot: number) => {
    if (busy !== null) return
    setBusy(slot)
    try {
      const updated = await containersApi.deletePhoto(container.id, slot)
      onContainer(updated)
      toast(`${SHOT_LABELS[slot]} removed — retake when ready`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove the photo')
    } finally { setBusy(null) }
  }

  return (
    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
      {SHOT_LABELS.map((label, slot) => {
        const url = photos[slot]
        return (
          <div key={slot} style={{ flexShrink: 0, width: '86px' }}>
            <div style={{ position: 'relative' }}>
              {url
                ? <img src={photoUrl(url)} alt={label} style={{ width: '86px', height: '64px', objectFit: 'cover', borderRadius: '8px', display: 'block', opacity: busy === slot ? 0.4 : 1 }} />
                : <div style={{ width: '86px', height: '64px', borderRadius: '8px', border: `1.5px dashed #C4C6D0`, display: 'grid', placeItems: 'center', color: INK2 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h4l1.5-2h7L17 8h4v11H3V8Z" /><circle cx="12" cy="13" r="3.2" /></svg>
                  </div>}
              {url && busy !== slot && (
                <button onClick={() => remove(slot)} title="Delete photo" aria-label={`Delete ${label}`}
                  style={{ position: 'absolute', top: '3px', right: '3px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 0 }}>✕</button>
              )}
            </div>
            <div style={{ fontSize: '9px', color: INK2, margin: '3px 0 2px', lineHeight: 1.3 }}>{label}</div>
            <button onClick={() => capture(slot)} disabled={busy !== null}
              style={{ width: '100%', padding: '4px 0', borderRadius: '7px', border: `1px solid #C4C6D0`, background: '#fff', color: BLUE, fontSize: '10px', fontWeight: 700, cursor: busy !== null ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {busy === slot ? '…' : url ? 'Retake' : 'Capture'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
