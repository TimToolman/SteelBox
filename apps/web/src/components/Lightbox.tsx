// ============================================================
// Lightbox — a photo at the size you actually need it.
//
// Claim evidence is looked at closely: is that rust or shadow, is the
// rail bowed or is it the lens. Thumbnails can't answer that, so any
// photo opens full-screen with zoom, pan, and next/previous through
// the set it came from.
//
// Keyboard: ← → to move, + − to zoom, 0 to reset, Esc to close.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react'

export interface LightboxShot { url: string; caption?: string; sub?: string }

const MIN_Z = 1, MAX_Z = 6, STEP = 0.5

export function Lightbox({ shots, index, onIndex, onClose }: {
  shots: LightboxShot[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  const shot = shots[index]
  const many = shots.length > 1
  // Moving to another photo starts fresh — a zoom set on one shot is
  // meaningless on the next.
  const go = useCallback((delta: number) => {
    if (!many) return
    onIndex((index + delta + shots.length) % shots.length)
    setZoom(1); setPan({ x: 0, y: 0 })
  }, [index, many, onIndex, shots.length])

  const zoomBy = useCallback((delta: number) => {
    setZoom(z => {
      const next = Math.min(MAX_Z, Math.max(MIN_Z, +(z + delta).toFixed(2)))
      if (next === 1) setPan({ x: 0, y: 0 })   // back to fit = back to centre
      return next
    })
  }, [])

  // Keyboard is the fast path once the modal is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(STEP) }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(-STEP) }
      else if (e.key === '0') { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, zoomBy, onClose])

  // Wheel-to-zoom needs a non-passive listener to preventDefault — React's
  // synthetic onWheel is passive, so it's attached by hand.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY > 0 ? -STEP / 2 : STEP / 2) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  // The page behind must not scroll while this is up.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!shot) return null

  const onDown = (e: React.PointerEvent) => {
    if (zoom === 1) return
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) })
  }
  const endDrag = () => { drag.current = null }

  const ctl: React.CSSProperties = {
    width: '40px', height: '40px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.25)',
    background: 'rgba(20,22,30,.72)', color: '#fff', cursor: 'pointer', display: 'grid',
    placeItems: 'center', fontFamily: 'inherit', padding: 0, flexShrink: 0,
  }
  const dim = (on: boolean): React.CSSProperties => ({ ...ctl, opacity: on ? 1 : 0.35, cursor: on ? 'pointer' : 'not-allowed' })

  return (
    <div role="dialog" aria-modal="true" aria-label={shot.caption || 'Photo'}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,9,13,.94)', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar — counter, zoom, close */}
      <div onClick={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 14px', color: '#fff', flexShrink: 0 }}>
        <span style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '.3px' }}>
          {many ? `${index + 1} / ${shots.length}` : 'Photo'}
        </span>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,.6)' }}>{Math.round(zoom * 100)}%</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => zoomBy(-STEP)} disabled={zoom <= MIN_Z} aria-label="Zoom out" title="Zoom out (−)" style={dim(zoom > MIN_Z)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-4.3-4.3" /></svg>
          </button>
          <button onClick={() => zoomBy(STEP)} disabled={zoom >= MAX_Z} aria-label="Zoom in" title="Zoom in (+)" style={dim(zoom < MAX_Z)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M11 8v6M20 20l-4.3-4.3" /></svg>
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} aria-label="Fit to screen" title="Fit to screen (0)" style={ctl}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" /></svg>
          </button>
          <button ref={closeRef} onClick={onClose} aria-label="Close" title="Close (Esc)" style={ctl}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>

      {/* The photo */}
      <div ref={frameRef} onClick={e => e.stopPropagation()}
        style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {many && (
          <button onClick={() => go(-1)} aria-label="Previous photo" title="Previous (←)"
            style={{ ...ctl, position: 'absolute', left: '14px', zIndex: 2, width: '44px', height: '44px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        )}
        <img
          src={shot.url} alt={shot.caption || ''}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}
          onDoubleClick={() => (zoom > 1 ? (setZoom(1), setPan({ x: 0, y: 0 })) : zoomBy(1))}
          draggable={false}
          style={{
            maxWidth: '94%', maxHeight: '100%', objectFit: 'contain', display: 'block',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: drag.current ? 'none' : 'transform .12s ease-out',
            cursor: zoom > 1 ? (drag.current ? 'grabbing' : 'grab') : 'zoom-in',
            userSelect: 'none', touchAction: 'none',
          }}
        />
        {many && (
          <button onClick={() => go(1)} aria-label="Next photo" title="Next (→)"
            style={{ ...ctl, position: 'absolute', right: '14px', zIndex: 2, width: '44px', height: '44px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        )}
      </div>

      {/* Caption */}
      <div onClick={e => e.stopPropagation()}
        style={{ flexShrink: 0, padding: '12px 18px 18px', textAlign: 'center', color: '#fff' }}>
        {shot.caption && <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{shot.caption}</div>}
        {shot.sub && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.7)', marginTop: '2px' }}>{shot.sub}</div>}
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.45)', marginTop: '7px' }}>
          Scroll or double-tap to zoom · drag to pan{many ? ' · ← → to move' : ''} · Esc to close
        </div>
      </div>
    </div>
  )
}

// Convenience: the open/close state every gallery needs, in one place.
export function useLightbox() {
  const [open, setOpen] = useState<{ shots: LightboxShot[]; index: number } | null>(null)
  return {
    open,
    show: (shots: LightboxShot[], index = 0) => setOpen({ shots, index }),
    setIndex: (index: number) => setOpen(o => (o ? { ...o, index } : o)),
    close: () => setOpen(null),
  }
}
