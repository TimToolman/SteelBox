// ============================================================
// MVP Container Marketplace — Photo gallery + 3D render viewer
// ============================================================

import React, { useState, useEffect, useRef } from 'react'
import { photoUrl, SHOT_LABELS, RENDER_SLOT, RENDER_LABEL, type Container, type ContainerGrade, type ContainerSize } from '../../lib/api'
import { GRADE_META } from '../../lib/specs'


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
  const [imgAspect, setImgAspect] = useState<number | null>(null)
  const drag = useRef<{ x: number; y: number; ry: number; rx: number } | null>(null)
  const goTo = (i: number) => { setIdx(i); setRotY(SHOT_ANGLES[i] ?? -18); setRotX(-12); setImgAspect(null); drag.current = null }
  useEffect(() => { goTo(0) }, [container.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const step = (dir: -1 | 1) => goTo((idx + dir + items.length) % items.length)

  const pt = (e: React.MouseEvent | React.TouchEvent) => 'touches' in e ? e.touches[0] : e as React.MouseEvent
  const onDown = (e: React.MouseEvent | React.TouchEvent) => { const p = pt(e); drag.current = { x: p.clientX, y: p.clientY, ry: rotY, rx: rotX } }
  const onMove = (e: React.MouseEvent | React.TouchEvent) => { if (!drag.current) return; const p = pt(e); setRotY(drag.current.ry + (p.clientX - drag.current.x) * 0.7); setRotX(Math.max(-45, Math.min(15, drag.current.rx - (p.clientY - drag.current.y) * 0.3))) }
  const onUp = () => { drag.current = null }
  const dragHandlers = item.url ? {} : {
    onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: onUp,
    onTouchStart: onDown, onTouchMove: onMove, onTouchEnd: onUp,
  }

  // Hug the arrows to the displayed image's edge (objectFit: contain leaves
  // side gutters on portrait shots) — 8px gap outside the image, clamped to
  // the stage edge for full-width images and the 3D placeholder.
  const halfW = item.url && imgAspect ? Math.round((230 * imgAspect) / 2) : null
  const arrowOffset = halfW != null ? `max(8px, calc(50% - ${halfW + 46}px))` : '10px'
  const arrowStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', [side]: arrowOffset, transform: 'translateY(-50%)', zIndex: 4,
    width: '38px', height: '38px', borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,.92)', boxShadow: '0 2px 10px rgba(0,0,0,.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  })
  return (
    <div style={{ background: '#0B1629' }}>
      <div {...dragHandlers} style={{ position: 'relative', height: '230px', overflow: 'hidden', background: 'radial-gradient(circle at 50% 38%,#1a2b47,#0a1526)', userSelect: 'none', cursor: item.url ? 'default' : 'grab', touchAction: item.url ? 'auto' : 'none' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {item.url
            ? <img src={photoUrl(item.url)} alt={item.label} draggable={false}
                onLoad={e => { const el = e.currentTarget; if (el.naturalHeight) setImgAspect(el.naturalWidth / el.naturalHeight) }}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <Container3D size={container.size} grade={container.grade} rotY={rotY} rotX={rotX} tex={tex} />}
        </div>
        {/* Previous / next — step through the 9 images */}
        <button aria-label="Previous photo" onClick={() => step(-1)} style={arrowStyle('left')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="12.5,4 6.5,10 12.5,16" /></svg>
        </button>
        <button aria-label="Next photo" onClick={() => step(1)} style={arrowStyle('right')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7.5,4 13.5,10 7.5,16" /></svg>
        </button>
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
        <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.55)', borderRadius: 'var(--pill)', padding: '3px 10px', fontFamily: 'var(--mono)', fontSize: '10px', color: '#fff', whiteSpace: 'nowrap' }}>
          {idx + 1} / {items.length} · {item.label}{!item.url && !item.isRender ? ' · photo pending' : ''}
        </div>
      </div>
      {/* 9 thumbnails — slot i is always the same labelled shot as the field app */}
      <div style={{ display: 'flex', gap: '3px', padding: '6px', background: '#060F1E', overflowX: 'auto' }}>
        {items.map((it, i) => (
          <button key={i} onClick={() => goTo(i)} title={it.label}
            style={{ width: '74px', height: '52px', flexShrink: 0, borderRadius: 'var(--r4)', overflow: 'hidden', cursor: 'pointer', border: `2px solid ${i === idx ? 'var(--cta)' : 'transparent'}`, background: '#162030', color: 'rgba(255,255,255,.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '3px', position: 'relative' }}>
            {it.url
              ? <img src={photoUrl(it.url)} alt={it.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : it.isRender && texReady
                ? <>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2 3 6v8l7 4 7-4V6l-7-4Z" /><path d="M3 6l7 4 7-4" /><path d="M10 10v8" /></svg>
                    <span style={{ fontSize: '7px', lineHeight: 1.1, textAlign: 'center', color: '#4ADE80', fontWeight: 700 }}>3D view</span>
                  </>
                : <><span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: '#fff' }}>{i + 1}</span><span style={{ fontSize: '7px', lineHeight: 1.1, textAlign: 'center' }}>{it.isRender ? '3D render' : it.label}</span></>}
            {it.isRender && it.url && <span style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,87,184,.95)', color: '#fff', fontSize: '7px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px' }}>3D</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
