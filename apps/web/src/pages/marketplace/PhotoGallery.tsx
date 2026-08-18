// ============================================================
// MVP Container Marketplace — Photo gallery + 3D render viewer
// ============================================================

import React, { useState, useEffect, useRef } from 'react'
import { photoUrl, SHOT_LABELS, RENDER_SLOT, RENDER_LABEL, type Container, type ContainerGrade, type ContainerSize } from '../../lib/api'
import { GRADE_META } from '../../lib/specs'
import { Lightbox, ThumbStrip, ViewerControls, useLightbox, useWheelZoom, useZoomPan, STEP, ExpandIcon } from '../../components/Lightbox'


// ── Photo gallery + 3D render viewer ───────────────────────
// The 8 field photos plus the AI-stitched 3D render ("image 9") make up the
// gallery; missing slots fall back to a 3D container model placeholder.
// SHOT_LABELS comes from lib/api so slots match the field app + admin exactly.

// End-face photo textures — only the real front-doors and back shots are used
// in the spinner; the long sides carry a size callout instead (keep it simple).
interface FaceTextures { doors?: string; back?: string }

function Container3D({ size, grade, rotY, rotX, tex }: { size: ContainerSize; grade: ContainerGrade; rotY: number; rotX: number; tex?: FaceTextures }) {
  const is40 = size.startsWith('40'), is10 = size.startsWith('10')
  const W = is40 ? 300 : is10 ? 110 : 180, H = 118, D = 118
  const accent = GRADE_META[grade].color
  const steel = 'repeating-linear-gradient(90deg,#4a6ea5 0,#4a6ea5 5px,#3d5c8c 5px,#3d5c8c 11px)'
  const sizeLabel = `${is40 ? '40' : is10 ? '10' : '20'} foot`
  const faceBase: React.CSSProperties = { position: 'absolute', left: '50%', top: '50%', boxSizing: 'border-box', border: '1px solid rgba(0,0,0,.3)' }
  const skin = (fallback: string, photo?: string): React.CSSProperties =>
    // Cutout photos have transparent backgrounds — back them with a steel tone.
    photo ? { backgroundColor: '#31517e', backgroundImage: `url(${photo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: fallback }
  // Long sides: flat blue with the container length superimposed (double arrow
  // + "20 foot"), matching the marketing mock.
  const arrowW = W - 44
  const sideFace: React.CSSProperties = { background: '#33538A', display: 'grid', placeItems: 'center' }
  const sizeCallout = (
    <div style={{ display: 'grid', justifyItems: 'center', gap: '3px' }}>
      <span style={{ color: '#F5A623', fontWeight: 700, fontSize: is10 ? '13px' : '16px', fontFamily: 'var(--sans)', letterSpacing: '0.2px', textShadow: '0 1px 3px rgba(0,0,0,.4)' }}>{sizeLabel}</span>
      <svg width={arrowW} height="16" viewBox={`0 0 ${arrowW} 16`} fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M3 8 H${arrowW - 3}`} />
        <path d="M12 2 L3 8 L12 14" />
        <path d={`M${arrowW - 12} 2 L${arrowW - 3} 8 L${arrowW - 12} 14`} />
      </svg>
    </div>
  )
  return (
    <div style={{ perspective: '1200px', width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'relative', width: `${W}px`, height: `${H}px`, transformStyle: 'preserve-3d', transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)` }}>
        {/* long sides — solid blue + size callout (no photos here) */}
        <div style={{ ...faceBase, width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2, transform: `translateZ(${D / 2}px)`, ...sideFace }}>{sizeCallout}</div>
        <div style={{ ...faceBase, width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2, transform: `rotateY(180deg) translateZ(${D / 2}px)`, ...sideFace }}>{sizeCallout}</div>
        {/* door end — the real front-doors photo (painted doors as fallback) */}
        <div style={{ ...faceBase, width: D, height: H, marginLeft: -D / 2, marginTop: -H / 2, transform: `rotateY(90deg) translateZ(${W / 2}px)`, ...skin(steel, tex?.doors), display: 'flex' }}>
          {!tex?.doors && [0, 1].map(k => (
            <div key={k} style={{ flex: 1, borderRight: k === 0 ? '2px solid rgba(0,0,0,.35)' : 'none', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '12%', bottom: '12%', left: k === 0 ? 'auto' : '10%', right: k === 0 ? '10%' : 'auto', width: '4px', background: 'rgba(0,0,0,.35)', borderRadius: '2px' }} />
            </div>
          ))}
          <div style={{ position: 'absolute', top: '8px', left: '8px', background: '#fff', color: accent, fontFamily: 'var(--mono)', fontSize: is10 ? '7px' : '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '2px' }}>{grade}</div>
        </div>
        {/* back end — the real back photo */}
        <div style={{ ...faceBase, width: D, height: H, marginLeft: -D / 2, marginTop: -H / 2, transform: `rotateY(-90deg) translateZ(${W / 2}px)`, ...skin(steel, tex?.back) }} />
        {/* top */}
        <div style={{ ...faceBase, width: W, height: D, marginLeft: -W / 2, marginTop: -D / 2, transform: `rotateX(90deg) translateZ(${H / 2}px)`, background: '#2f466a', borderTop: `3px solid ${accent}` }} />
        {/* bottom */}
        <div style={{ ...faceBase, width: W, height: D, marginLeft: -W / 2, marginTop: -D / 2, transform: `rotateX(-90deg) translateZ(${H / 2}px)`, background: '#16233c' }} />
      </div>
    </div>
  )
}

export function PhotoGallery({ container }: { container: Container }) {
  const photos = container.photos || []
  // Gallery = the 8 labelled shots (slots 0–7) + the AI render (slot 8) as image 9.
  const items = [
    ...SHOT_LABELS.map((label, i) => ({ label, url: photos[i], isRender: false })),
    { label: RENDER_LABEL, url: photos[RENDER_SLOT], isRender: true },
  ]
  const [idx, setIdx] = useState(0)
  const item = items[idx]

  // Only the real front-doors and back shots go on the box (the end faces);
  // the long sides show a size callout instead — simpler and always clean.
  const tex: FaceTextures = {
    doors: photos[0] ? photoUrl(photos[0]) : undefined, // front doors closed → door end
    back: photos[3] ? photoUrl(photos[3]) : undefined,  // back → other end
  }
  const texReady = !!(tex.doors && tex.back)

  // While a slot's photo is pending (and for the 3D view), the box stands in —
  // each square snaps it to that shot's viewing angle, and it stays drag-rotatable.
  const SHOT_ANGLES = [-70, -50, -12, 70, 192, 110, -110, -85, -30]
  const [rotY, setRotY] = useState(SHOT_ANGLES[0])
  const [rotX, setRotX] = useState(-12)
  const drag = useRef<{ x: number; y: number; ry: number; rx: number } | null>(null)
  const goTo = (i: number) => { setIdx(i); setRotY(SHOT_ANGLES[i] ?? -18); setRotX(-12); drag.current = null }
  useEffect(() => { goTo(0) }, [container.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const step = (dir: -1 | 1) => goTo((idx + dir + items.length) % items.length)

  // The hero zooms in place — the same gestures and limits as the
  // full-screen viewer, so the controls under it mean one thing everywhere.
  const view = useZoomPan()
  const stageRef = useRef<HTMLDivElement | null>(null)
  useWheelZoom(stageRef, view.zoomBy, !!item.url)
  useEffect(() => { view.reset() }, [idx, container.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Full-screen: only the shots that actually exist, captioned by slot.
  const lb = useLightbox()
  const shotsWithPhotos = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => !!it.url)
    .map(({ it, i }) => ({ url: photoUrl(it.url!), caption: it.label, sub: `${it.isRender ? 'AI 3D render' : `Photo ${i + 1}`} · ${container.sku}` }))
  const openFull = () => {
    if (!item.url) return
    const at = shotsWithPhotos.findIndex(s => s.url === photoUrl(item.url!))
    lb.show(shotsWithPhotos, at < 0 ? 0 : at)
  }

  const pt = (e: React.MouseEvent | React.TouchEvent) => 'touches' in e ? e.touches[0] : e as React.MouseEvent
  const onDown = (e: React.MouseEvent | React.TouchEvent) => { const p = pt(e); drag.current = { x: p.clientX, y: p.clientY, ry: rotY, rx: rotX } }
  const onMove = (e: React.MouseEvent | React.TouchEvent) => { if (!drag.current) return; const p = pt(e); setRotY(drag.current.ry + (p.clientX - drag.current.x) * 0.7); setRotX(Math.max(-45, Math.min(15, drag.current.rx - (p.clientY - drag.current.y) * 0.3))) }
  const onUp = () => { drag.current = null }
  const dragHandlers = item.url ? {} : {
    onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: onUp,
    onTouchStart: onDown, onTouchMove: onMove, onTouchEnd: onUp,
  }

  return (
    <div style={{ background: '#0B1629' }}>
      {/* Hero — tall enough to actually judge a container by */}
      <div ref={stageRef} className="sb-hero" {...dragHandlers}
        style={{ position: 'relative', height: 'clamp(280px, 40vw, 440px)', overflow: 'hidden', background: 'radial-gradient(circle at 50% 38%,#1a2b47,#0a1526)', userSelect: 'none', cursor: item.url ? 'default' : 'grab', touchAction: item.url ? 'auto' : 'none' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.url
            ? <img src={photoUrl(item.url)} alt={item.label} {...view.handlers} onClick={openFull}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', transform: view.transform, transition: 'transform .12s ease-out', cursor: view.cursor, touchAction: 'none' }} />
            : <Container3D size={container.size} grade={container.grade} rotY={rotY} rotX={rotX} tex={tex} />}
        </div>
        {/* Open full screen — appears on hover, always reachable by keyboard */}
        {item.url && (
          <button className="sb-hero-expand" onClick={openFull} aria-label="View full screen" title="View full screen"
            style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 4, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: 'var(--pill)', border: '1px solid rgba(255,255,255,.2)', background: 'rgba(8,14,26,.72)', color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '.3px', cursor: 'pointer', fontFamily: 'inherit' }}>
            <ExpandIcon />
            Full screen
          </button>
        )}
        {item.isRender && (
          <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,87,184,.9)', color: '#fff', borderRadius: 'var(--r4)', padding: '4px 10px', fontSize: '10px', fontWeight: 700 }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2 3 6v8l7 4 7-4V6l-7-4Z" /><path d="M3 6l7 4 7-4" /><path d="M10 10v8" /></svg>
            {item.url ? 'AI 3D render · stitched from the 8 shots' : '3D view · your photos · drag to rotate'}
          </div>
        )}
        {!item.url && !item.isRender && (
          <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,.5)', color: '#fff', borderRadius: 'var(--r4)', padding: '4px 10px', fontSize: '10px', fontWeight: 700 }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"><path d="M3 10a7 7 0 0 1 12-5" /><path d="M17 10a7 7 0 0 1-12 5" /><polyline points="15,2 15,5 12,5" /><polyline points="5,18 5,15 8,15" /></svg>
            Drag to rotate
          </div>
        )}
      </div>

      {/* Control bar under the image box — the where-am-I label and the
          previous · zoom out · zoom in · next cluster, both centred (the
          same geometry as the full-screen viewer, so nothing jumps around
          when a click switches between the two). */}
      <div style={{ display: 'grid', justifyItems: 'center', gap: '7px', padding: '10px 12px 4px', background: '#060F1E' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', maxWidth: '96%', overflow: 'hidden' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, letterSpacing: '.7px', color: 'rgba(255,255,255,.5)', whiteSpace: 'nowrap' }}>
            {idx + 1} / {items.length}
          </span>
          <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#fff', letterSpacing: '-.15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.label}
            {!item.url && !item.isRender && <span style={{ fontWeight: 600, color: 'rgba(255,255,255,.45)' }}> · photo pending</span>}
          </span>
        </div>
        <ViewerControls tone="dark" compact zoom={view.zoom}
          onPrev={() => step(-1)} onNext={() => step(1)}
          onZoomIn={() => view.zoomBy(STEP)} onZoomOut={() => view.zoomBy(-STEP)} onFit={view.reset} />
      </div>

      {/* 9 thumbnails — slot i is always the same labelled shot as the field app */}
      <div className="sb-thumbs" style={{ padding: '6px 12px 10px', background: '#060F1E' }}>
        {items.map((it, i) => (
          <button key={i} onClick={() => goTo(i)} title={it.label} aria-current={i === idx}
            className={`sb-thumb${i === idx ? ' is-active' : ''}`}
            style={{ color: 'rgba(255,255,255,.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
            {it.url
              ? <img src={photoUrl(it.url)} alt={it.label} />
              : it.isRender && texReady
                ? <>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2 3 6v8l7 4 7-4V6l-7-4Z" /><path d="M3 6l7 4 7-4" /><path d="M10 10v8" /></svg>
                    <span style={{ fontSize: '7px', lineHeight: 1.1, textAlign: 'center', color: '#4ADE80', fontWeight: 700 }}>3D view</span>
                  </>
                : <><span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: '#fff' }}>{i + 1}</span><span style={{ fontSize: '7px', lineHeight: 1.1, textAlign: 'center', padding: '0 3px' }}>{it.isRender ? '3D render' : it.label}</span></>}
            {it.isRender && it.url && <span style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,87,184,.95)', color: '#fff', fontSize: '7px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px' }}>3D</span>}
          </button>
        ))}
      </div>

      {lb.open && (
        <Lightbox shots={lb.open.shots} index={lb.open.index} onIndex={lb.setIndex} onClose={lb.close}
          // "Show 3D View" — out of the viewer, back onto the gallery with
          // the 3D slot selected (drag-to-rotate when no render exists yet).
          onShow3D={() => { lb.close(); goTo(items.length - 1) }} />
      )}
    </div>
  )
}
