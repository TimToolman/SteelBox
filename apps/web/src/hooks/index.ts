// ============================================================
// SteelBox React Hooks
// ============================================================

import { useState, useEffect, useCallback } from 'react'
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

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await containers.list(filters)
      setData(result)
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
