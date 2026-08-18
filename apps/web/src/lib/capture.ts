// ============================================================
// Surviving the camera round-trip on a phone.
//
// Opening the camera backgrounds the browser, and two things go wrong:
//
//  1. iOS garbage-collects a file input that isn't in the DOM while the
//     camera is up — onchange never fires and the photo vanishes.
//     pickFile() keeps the input attached until it settles.
//
//  2. The browser may RELOAD the whole page to reclaim memory, so the
//     app boots back at its home screen with every dialog gone. That
//     can't be prevented — only survived. The session helpers below are
//     the tiny persistence layer the field app uses to put the driver
//     back exactly where they were.
// ============================================================

// One picker for every capture point, so the mobile quirks are handled
// in exactly one place.
export function pickFile(accept: string, capture?: 'environment' | 'user'): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    if (capture) input.setAttribute('capture', capture)
    // In the DOM but invisible — detached inputs get collected on iOS.
    input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0'
    document.body.appendChild(input)

    let settled = false
    const done = (f: File | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus, true)
      input.remove()
      resolve(f)
    }
    input.onchange = () => done(input.files?.[0] ?? null)
    // Cancel detection: focus returns with no change event. On phones focus
    // can beat the change event by seconds, so poll with grace instead of
    // resolving on the first look.
    const onFocus = () => {
      let tries = 0
      const poll = () => {
        if (settled) return
        if (input.files?.length) return done(input.files[0])
        if (++tries >= 8) return done(null)   // ~4s — a real photo has landed by now
        setTimeout(poll, 500)
      }
      setTimeout(poll, 500)
    }
    window.addEventListener('focus', onFocus, true)
    input.click()
  })
}

// ── Session-scoped UI state ───────────────────────────────
// sessionStorage survives the reload but dies with the tab — exactly the
// lifetime an "in the middle of something" record should have.

export function loadSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

export function saveSession(key: string, value: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* full or private mode */ }
}

export function clearSession(...keys: string[]): void {
  try { keys.forEach(k => sessionStorage.removeItem(k)) } catch { /* private mode */ }
}
