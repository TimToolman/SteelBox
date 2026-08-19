// ============================================================
// Beta bug reporter — the floating "Report an issue" tab.
//
// We're in demo/beta: when something looks wrong, the person who saw
// it is the best recorder of it. The tab sits on the right edge of
// every portal; one click opens a small panel that captures what the
// developer will need — URL, route, browser, viewport, the page's
// recent console errors — plus the reporter's own words and an
// optional screenshot of the tab. Reports land in Admin → Beta
// Issues, each one ready to copy out as a fix-it prompt.
// ============================================================

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { issuesApi, fileToDataUrl } from '../lib/api'
import { pickFile } from '../lib/capture'

// ── Console-error ring buffer ─────────────────────────────
// Installed once at app start (this module is imported by main.tsx).
// A report is far more useful when it carries the errors the page
// actually threw in the minutes before someone hit "send".

const errBuf: string[] = []
const remember = (line: string) => {
  const clean = String(line).slice(0, 500)
  if (!clean) return
  errBuf.push(`${new Date().toISOString().slice(11, 19)} ${clean}`)
  if (errBuf.length > 20) errBuf.shift()
}

if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).__sbxErrBuf) {
  ;(window as unknown as Record<string, unknown>).__sbxErrBuf = errBuf
  window.addEventListener('error', e => remember(`${e.message} @ ${e.filename?.split('/').pop() || '?'}:${e.lineno}`))
  window.addEventListener('unhandledrejection', e => remember(`unhandled rejection: ${String(e.reason).slice(0, 300)}`))
  const orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    remember(args.map(a => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })())).join(' '))
    orig(...args)
  }
}

// ── Screenshot ────────────────────────────────────────────
// Two routes, because phones have neither of the desktop one.
// Desktop: getDisplayMedia is the only capture a page is allowed —
// the user gets the standard share prompt (pick this tab).
// Mobile: no getDisplayMedia at all, so the button opens the photo
// picker and the reporter attaches the screenshot they already took.
// Before this, mobile silently did nothing at all.

const canCaptureTab = () =>
  typeof navigator !== 'undefined' &&
  !!(navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown } | undefined)?.getDisplayMedia
async function grabTabScreenshot(): Promise<string | null> {
  try {
    const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (o?: object) => Promise<MediaStream> }
    if (!md?.getDisplayMedia) return null
    const stream = await md.getDisplayMedia({ video: { frameRate: 1 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' })
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    await video.play()
    await new Promise(r => setTimeout(r, 350)) // let the first real frame land
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    stream.getTracks().forEach(t => t.stop())
    const url = canvas.toDataURL('image/jpeg', 0.72)
    return url.length > 40 ? url : null
  } catch {
    return null // declined or unsupported — never block the report on it
  }
}

const BLUE = '#0057B8'

export function BugReportTab() {
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState('')
  const [shot, setShot] = useState<string | null>(null)
  const [busy, setBusy] = useState<'shot' | 'send' | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  if (typeof document === 'undefined') return null // SSG prerender

  const send = async () => {
    if (!details.trim()) { setError('Say what happened — that text is the whole point of the report.') ; return }
    setBusy('send'); setError('')
    try {
      await issuesApi.create({
        details: details.trim(),
        url: window.location.href,
        route: window.location.pathname + window.location.search,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        consoleErrors: [...errBuf],
        ...(shot ? { screenshot: shot } : {}),
      })
      setDone(true)
      setTimeout(() => { setOpen(false); setDone(false); setDetails(''); setShot(null) }, 2200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the report — try again')
    } finally { setBusy(null) }
  }

  const ui = (
    <>
      {/* The tab — right edge, out of the way until it's needed */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Report an issue"
          style={{
            position: 'fixed', right: 0, top: '58%', zIndex: 940,
            writingMode: 'vertical-rl', padding: '13px 8px', borderRadius: '10px 0 0 10px',
            border: 'none', background: BLUE, color: '#fff', fontSize: '11.5px', fontWeight: 700,
            letterSpacing: '0.6px', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 3px 14px rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', gap: '7px',
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(90deg)' }}>
            <circle cx="12" cy="13" r="5" /><path d="M12 8V5M8.5 9.5 6 7M15.5 9.5 18 7M7 13H4M20 13h-3M8.5 16.5 6 19M15.5 16.5 18 19" />
          </svg>
          Report an issue
        </button>
      )}

      {/* The panel */}
      {open && (
        <div role="dialog" aria-label="Report an issue"
          style={{
            position: 'fixed', right: '14px', bottom: '14px', zIndex: 941, width: 'min(360px, calc(100vw - 28px))',
            background: '#fff', color: '#0D0E12', borderRadius: '14px', border: '1px solid #E2E4E9',
            boxShadow: '0 18px 50px rgba(13,14,18,.3)', padding: '16px 16px 14px', fontFamily: 'var(--sans, inherit)',
            maxHeight: 'calc(100vh - 28px)', overflowY: 'auto', boxSizing: 'border-box',
          }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '18px 6px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#1F7A4D' }}>Logged — thank you.</div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>The team reviews reports under Admin → Beta Issues.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Report an issue</div>
                <button onClick={() => setOpen(false)} aria-label="Close report panel"
                  style={{ marginLeft: 'auto', width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #E2E4E9', background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#44474F', padding: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <div style={{ fontSize: '11.5px', color: '#6B7280', lineHeight: 1.5, marginBottom: '10px' }}>
                Beta feedback — what you write here goes straight onto the fix list, with this page's technical context attached automatically.
              </div>
              <textarea
                autoFocus value={details} onChange={e => setDetails(e.target.value)}
                placeholder="What happened? What did you expect instead?"
                rows={4}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #E2E4E9', borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: '9px' }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                {shot ? (
                  <>
                    <img src={shot} alt="Captured screenshot" style={{ width: '86px', height: '54px', objectFit: 'cover', borderRadius: '7px', border: '1px solid #E2E4E9' }} />
                    <button onClick={() => setShot(null)} style={{ background: 'none', border: 'none', color: '#B3261E', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Remove</button>
                  </>
                ) : (
                  <button disabled={busy === 'shot'} onClick={async () => {
                    setBusy('shot'); setError('')
                    // Tab capture where it exists, photo picker everywhere else.
                    let img = canCaptureTab() ? await grabTabScreenshot() : null
                    if (!img) {
                      const f = await pickFile('image/*')
                      if (f) img = await fileToDataUrl(f, 1600, 0.72)
                    }
                    if (img) setShot(img)
                    else setError('No image attached — send the report without one, or try again.')
                    setBusy(null)
                  }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 13px', borderRadius: '999px', border: '1.5px solid #E2E4E9', background: '#fff', color: '#0D0E12', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4V8Z" /><circle cx="12" cy="13" r="3.2" /></svg>
                    {busy === 'shot' ? 'Capturing…' : canCaptureTab() ? 'Attach a screenshot of this tab' : 'Attach a screenshot'}
                  </button>
                )}
              </div>
              {/* What rides along, so nobody is surprised */}
              <div style={{ background: '#F4F6FA', borderRadius: '9px', padding: '9px 11px', fontSize: '10.5px', color: '#6B7280', lineHeight: 1.6, marginBottom: '10px' }}>
                Sent with the report: this page's address, your browser and window size,
                and the page's last {errBuf.length} console error{errBuf.length === 1 ? '' : 's'}.
              </div>
              {error && <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: '9px', padding: '8px 11px', fontSize: '12px', marginBottom: '9px' }}>{error}</div>}
              <button disabled={busy === 'send'} onClick={send}
                style={{ width: '100%', padding: '11px', borderRadius: '999px', border: 'none', background: BLUE, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {busy === 'send' ? 'Sending…' : 'Send report'}
              </button>
            </>
          )}
        </div>
      )}
    </>
  )

  // Portal into <body> — the field app centres its column with a transform,
  // which would trap a position:fixed tab inside it (same as the Lightbox).
  return createPortal(ui, document.body)
}
