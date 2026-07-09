// ============================================================
// MVP Container React Hooks
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  containers,
  orders,
  drivers,
  type Container,
  type ContainerFilters,
  type Order,
  type Driver,
} from '../lib/api'

// ── useAuth ───────────────────────────────────────────────
// Re-exported from the shared auth context so every page sees the same
// session (login/logout in one tab section updates the whole app).

export { useAuth } from '../lib/auth'
export type { AuthUser as User } from '../lib/api'

// ── useContainers ─────────────────────────────────────────

export function useContainers(filters?: ContainerFilters) {
  const [data, setData] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  const fetch = useCallback(async () => {
    // Skeletons only on the first load — background refreshes (tab switches,
    // window focus) swap the data in place without flashing the grid.
    if (!loaded.current) setLoading(true)
    setError(null)
    try {
      const result = await containers.list(filters)
      setData(result)
      loaded.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load containers')
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(filters)])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

// ── useOrders ─────────────────────────────────────────────

export function useOrders() {
  const [data, setData] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await orders.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

// ── useDrivers ────────────────────────────────────────────

export function useDrivers() {
  const [data, setData] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await drivers.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load drivers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

// ── useFavicon ────────────────────────────────────────────
// Per-portal favicon + tab title so admin / field / marketplace tabs are
// distinguishable at a glance. Restores the defaults on unmount.

export function useFavicon(file: string, title?: string) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const prevHref = link?.getAttribute('href') ?? null
    const prevTitle = document.title
    if (link) link.href = `${import.meta.env.BASE_URL}${file}`
    if (title) document.title = title
    return () => {
      if (link && prevHref) link.setAttribute('href', prevHref)
      if (title) document.title = prevTitle
    }
  }, [file, title])
}

// ── useSnackbar ───────────────────────────────────────────

export function useSnackbar() {
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)

  const toast = useCallback((msg: string) => {
    setMessage(msg)
    setOpen(true)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  return { message, open, toast, close }
}

// ── useIsMobile ───────────────────────────────────────────
// The app is styled inline (no CSS breakpoints), so responsive layouts
// branch on this flag instead of media queries.

export function useIsMobile(maxWidth = 760) {
  const [mobile, setMobile] = useState(() => window.matchMedia(`(max-width: ${maxWidth}px)`).matches)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidth])
  return mobile
}
