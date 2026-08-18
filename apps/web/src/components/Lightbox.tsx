// ============================================================
// Photo viewer — one image experience for the whole platform.
//
// A shopper deciding on a $4,000 box and an inspector deciding whether
// that is rust or a shadow are doing the same thing: looking closely.
// So they get the same controls in the same order everywhere —
//
//     ‹ previous · zoom out · [level] · zoom in · next ›
//
// sitting under the image box, whether that box is the marketplace
// hero gallery or the full-screen viewer a click opens.
//
// Exports:
//   useZoomPan()      zoom + pan state, wheel, pinch, drag, double-tap
//   ViewerControls    the icon cluster, on light or dark ground
//   ThumbStrip        thumbnails with a strong active state
//   Lightbox          the full-screen viewer
//   useLightbox()     open/close state for a gallery
//
// Keyboard while the viewer is up: ← → move, + − zoom, 0 fit, Esc close.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface LightboxShot { url: string; caption?: string; sub?: string }

export const MIN_Z = 1, MAX_Z = 6, STEP = 0.5
const clampZ = (v: number) => +Math.min(MAX_Z, Math.max(MIN_Z, v)).toFixed(2)

// ── Zoom + pan ────────────────────────────────────────────
// Shared so the hero gallery and the full-screen viewer behave
// identically — same limits, same gestures, same feel.

export function useZoomPan() {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  const zoomBy = useCallback((delta: number) => setZoom(z => clampZ(z + delta)), [])
  const reset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])
  // Back to fit is back to centre — as an effect, not a side effect buried
  // in a state updater.
  useEffect(() => { if (zoom === 1) setPan({ x: 0, y: 0 }) }, [zoom])

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
      drag.current = null
      setDragging(false)
    } else if (zoom > 1) {
      drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
      setDragging(true)
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Two fingers → pinch. Scale from where the gesture started so it
    // tracks the fingers instead of drifting.
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current.dist > 0) setZoom(clampZ(pinch.current.zoom * (dist / pinch.current.dist)))
      return
    }
    const d = drag.current
    if (!d) return
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) { drag.current = null; setDragging(false) }
  }

  // Double-tap toggles between fit and a useful working zoom.
  const onDoubleClick = () => (zoom > 1 ? reset() : setZoom(clampZ(2)))

  return {
    zoom, pan, dragging, zoomBy, reset, setZoom,
    // Spread onto the image itself.
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick, draggable: false },
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
  }
}

// Wheel-to-zoom needs a non-passive listener to preventDefault — React's
// synthetic onWheel is passive, so it is attached by hand.
export function useWheelZoom(ref: React.RefObject<HTMLElement | null>, zoomBy: (d: number) => void, on = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !on) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY > 0 ? -STEP / 2 : STEP / 2) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, zoomBy, on])
}

// ── The control cluster ───────────────────────────────────

const Icon = {
  prev: <path d="M14.5 5l-6 7 6 7" />,
  next: <path d="M9.5 5l6 7-6 7" />,
  out: <><circle cx="11" cy="11" r="6.5" /><path d="M8 11h6M19.5 19.5L15.7 15.7" /></>,
  in: <><circle cx="11" cy="11" r="6.5" /><path d="M8 11h6M11 8v6M19.5 19.5L15.7 15.7" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  expand: <path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" />,
}

function Glyph({ d, size = 18 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  )
}

export function ViewerControls({
  tone = 'dark', zoom, onPrev, onNext, onZoomIn, onZoomOut, onFit, canStep = true, compact = false,
}: {
  tone?: 'dark' | 'light'
  zoom: number
  onPrev: () => void
  onNext: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  canStep?: boolean
  compact?: boolean
}) {
  const size = compact ? 32 : 38
  const btn = (on: boolean): React.CSSProperties => ({
    width: `${size}px`, height: `${size}px`, borderRadius: '50%', padding: 0, flexShrink: 0,
    display: 'grid', placeItems: 'center', fontFamily: 'inherit',
    border: tone === 'dark' ? '1px solid rgba(255,255,255,.16)' : '1px solid var(--div)',
    background: tone === 'dark' ? 'rgba(255,255,255,.07)' : 'var(--surf-w)',
    color: tone === 'dark' ? '#fff' : 'var(--ink)',
    opacity: on ? 1 : 0.32, cursor: on ? 'pointer' : 'not-allowed',
  })
  return (
    <div className={`sb-vc sb-vc-${tone}`} role="group" aria-label="Photo controls">
      <button className="sb-vc-btn" style={btn(canStep)} disabled={!canStep} onClick={onPrev} aria-label="Previous photo" title="Previous (←)"><Glyph d={Icon.prev} size={compact ? 16 : 18} /></button>
      <button className="sb-vc-btn" style={btn(zoom > MIN_Z)} disabled={zoom <= MIN_Z} onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)"><Glyph d={Icon.out} size={compact ? 16 : 18} /></button>
      <button className="sb-vc-level" onClick={onFit} aria-label="Fit to screen" title="Fit to screen (0)">{Math.round(zoom * 100)}%</button>
      <button className="sb-vc-btn" style={btn(zoom < MAX_Z)} disabled={zoom >= MAX_Z} onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)"><Glyph d={Icon.in} size={compact ? 16 : 18} /></button>
      <button className="sb-vc-btn" style={btn(canStep)} disabled={!canStep} onClick={onNext} aria-label="Next photo" title="Next (→)"><Glyph d={Icon.next} size={compact ? 16 : 18} /></button>
    </div>
  )
}

// ── Thumbnail strip ───────────────────────────────────────
// The active shot is unmistakable: full brightness, a CTA ring and a bar
// under it, while the rest sit back until hovered.

export function ThumbStrip({ shots, index, onPick, tone = 'dark' }: {
  shots: LightboxShot[]
  index: number
  onPick: (i: number) => void
  tone?: 'dark' | 'light'
}) {
  return (
    <div className={`sb-thumbs sb-thumbs-${tone}`}>
      {shots.map((s, i) => (
        <button key={i} type="button" onClick={() => onPick(i)} title={s.caption || `Photo ${i + 1}`}
          aria-label={s.caption || `Photo ${i + 1}`} aria-current={i === index}
          className={`sb-thumb${i === index ? ' is-active' : ''}`}>
          <img src={s.url} alt="" />
        </button>
      ))}
    </div>
  )
}

// ── Full-screen viewer ────────────────────────────────────

export function Lightbox({ shots, index, onIndex, onClose }: {
  shots: LightboxShot[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const { zoom, zoomBy, reset, handlers, transform, cursor } = useZoomPan()
  const frameRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  const shot = shots[index]
  const many = shots.length > 1

  // Moving to another photo starts fresh — a zoom set on one shot is
  // meaningless on the next.
  const go = useCallback((delta: number) => {
    if (!many) return
    onIndex((index + delta + shots.length) % shots.length)
  }, [index, many, onIndex, shots.length])
  useEffect(() => { reset() }, [index, reset])

  useWheelZoom(frameRef, zoomBy)

  // Keyboard is the fast path once the viewer is up — and while it is up it
  // owns these keys. Hosts bind the same ones (the marketplace detail modal
  // steps containers on ← →, modals close on Esc), so this listens in the
  // capture phase and stops the event before their window handlers see it:
  // otherwise one arrow press moves the photo AND the container behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mine =
        e.key === 'Escape' ? onClose
        : e.key === 'ArrowRight' ? () => go(1)
        : e.key === 'ArrowLeft' ? () => go(-1)
        : e.key === '+' || e.key === '=' ? () => zoomBy(STEP)
        : e.key === '-' || e.key === '_' ? () => zoomBy(-STEP)
        : e.key === '0' ? reset
        : null
      if (!mine) return
      e.preventDefault()
      e.stopPropagation()
      mine()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, zoomBy, reset, onClose])

  // The page behind must not scroll while this is up.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!shot) return null
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  // Rendered into <body>, never in place. `position: fixed` resolves against
  // the nearest transformed ancestor rather than the viewport, and the field
  // app centres its phone column with a transform — in place, the viewer
  // would be boxed inside that column with the tab bar punching through it.
  const view = (
    <div role="dialog" aria-modal="true" aria-label={shot.caption || 'Photo'} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,9,13,.95)', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar — where you are in the set, and the way out */}
      <div onClick={stop} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', color: '#fff', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, letterSpacing: '.6px', color: 'rgba(255,255,255,.92)' }}>
          {many ? `${index + 1} / ${shots.length}` : 'PHOTO'}
        </span>
        {shot.caption && (
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,.62)', letterSpacing: '-.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.caption}</span>
        )}
        <button ref={closeRef} className="sb-vc-btn" onClick={onClose} aria-label="Close" title="Close (Esc)"
          style={{ marginLeft: 'auto', width: '38px', height: '38px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.07)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0, flexShrink: 0 }}>
          <Glyph d={Icon.close} />
        </button>
      </div>

      {/* The photo */}
      <div ref={frameRef} onClick={stop}
        style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 14px' }}>
        <img
          src={shot.url} alt={shot.caption || ''} {...handlers}
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block',
            transform, transition: 'transform .12s ease-out', cursor,
            userSelect: 'none', touchAction: 'none',
          }}
        />
      </div>

      {/* Controls sit under the image box — previous, zoom out, zoom in, next */}
      <div onClick={stop} style={{ flexShrink: 0, padding: '14px 16px 18px', display: 'grid', justifyItems: 'center', gap: '11px' }}>
        <ViewerControls tone="dark" zoom={zoom} canStep={many}
          onPrev={() => go(-1)} onNext={() => go(1)}
          onZoomIn={() => zoomBy(STEP)} onZoomOut={() => zoomBy(-STEP)} onFit={reset} />
        {many && <ThumbStrip shots={shots} index={index} onPick={onIndex} tone="dark" />}
        {shot.sub && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.7)', textAlign: 'center' }}>{shot.sub}</div>}
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.4)', textAlign: 'center', letterSpacing: '.2px' }}>
          Scroll, pinch or double-tap to zoom · drag to pan{many ? ' · ← → to move' : ''} · Esc to close
        </div>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? view : createPortal(view, document.body)
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

export const ExpandIcon = () => <Glyph d={Icon.expand} size={16} />
