// ============================================================
// SteelBox React Hooks
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  auth,
  containers,
  orders,
  drivers,
  type Container,
  type ContainerFilters,
  type Order,
  type Driver,
} from '../lib/api'

// ── useAuth ───────────────────────────────────────────────

export interface User {
  id: string
  email: string
  role: 'customer' | 'employee' | 'driver' | 'admin'
  name: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('sbx_token')
    if (!token) { setLoading(false); return }
    auth.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem('sbx_token') })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await auth.login(email, password)
    localStorage.setItem('sbx_token', result.token)
    setUser(result.user)
    return result.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('sbx_token')
    setUser(null)
  }, [])

  return { user, loading, login, logout }
}

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
