// ============================================================
// SteelBox Auth — shared context, login screens, route guards
// Roles: admin (portal), driver (field app), customer (marketplace
// checkout + profile). Guests may browse the marketplace freely.
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { auth as authApi, type AuthUser, type Role } from './api'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  register: (data: { name: string; email: string; password: string; phone?: string }) => Promise<AuthUser>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('sbx_token')
    if (!token) { setLoading(false); return }
    authApi.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('sbx_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    localStorage.setItem('sbx_token', result.token)
    setUser(result.user)
    return result.user
  }, [])

  const register = useCallback(async (data: { name: string; email: string; password: string; phone?: string }) => {
    const result = await authApi.register(data)
    localStorage.setItem('sbx_token', result.token)
    setUser(result.user)
    return result.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('sbx_token')
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    try { setUser(await authApi.me()) } catch { /* token expired — keep current state */ }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// ── Sign-in form (shared by the portal gates + marketplace) ──

const label: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#6B7280', marginBottom: '5px' }
const input: React.CSSProperties = { width: '100%', padding: '11px 13px', border: '1.5px solid #D9DBE4', borderRadius: '10px', fontSize: '14px', outline: 'none', marginBottom: '12px', fontFamily: 'inherit', boxSizing: 'border-box' }

export function LoginForm({ onDone, allowRegister = false, subtitle }: {
  onDone?: (u: AuthUser) => void
  allowRegister?: boolean
  subtitle?: string
}) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const u = mode === 'login'
        ? await login(form.email.trim(), form.password)
        : await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone.trim() })
      onDone?.(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {subtitle && <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.55, marginBottom: '16px' }}>{subtitle}</p>}
      {mode === 'register' && (
        <div>
          <label style={label}>Your name</label>
          <input style={input} placeholder="Jane Smith" value={form.name} onChange={set('name')} />
        </div>
      )}
      <label style={label}>Email</label>
      <input style={input} type="email" placeholder="you@company.com" value={form.email} onChange={set('email')}
        onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
      <label style={label}>Password</label>
      <input style={input} type="password" placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'} value={form.password} onChange={set('password')}
        onKeyDown={e => e.key === 'Enter' && submit()} />
      {mode === 'register' && (
        <div>
          <label style={label}>Mobile phone <span style={{ fontWeight: 400, textTransform: 'none' }}>(used to verify orders by text)</span></label>
          <input style={input} type="tel" placeholder="(504) 555-0000" value={form.phone} onChange={set('phone')} onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
      )}
      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: '8px', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
          {error}
        </div>
      )}
      <button onClick={submit} disabled={busy}
        style={{ width: '100%', padding: '13px', borderRadius: '999px', background: '#0057B8', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
        {busy ? 'One moment…' : mode === 'login' ? 'Sign In' : 'Create Account'}
      </button>
      {allowRegister && (
        <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#6B7280' }}>
          {mode === 'login' ? (
            <>New to SteelBox? <button onClick={() => { setMode('register'); setError('') }} style={{ background: 'none', border: 'none', color: '#0057B8', fontWeight: 700, cursor: 'pointer', fontSize: '12px', padding: 0 }}>Create an account</button></>
          ) : (
            <>Already have an account? <button onClick={() => { setMode('login'); setError('') }} style={{ background: 'none', border: 'none', color: '#0057B8', fontWeight: 700, cursor: 'pointer', fontSize: '12px', padding: 0 }}>Sign in</button></>
          )}
        </div>
      )}
    </div>
  )
}

// ── Route guard: full-page gate for /admin and /field ──────

export function RequireRole({ roles, title, children }: {
  roles: Role[]
  title: string
  children: React.ReactNode
}) {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', color: '#6B7280', fontSize: '14px' }}>Loading…</div>
  }

  if (user && roles.includes(user.role)) return <>{children}</>

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F4F6FB', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px', boxSizing: 'border-box', background: '#fff', borderRadius: '18px', border: '1px solid #E3E5EE', boxShadow: '0 8px 30px rgba(26,28,46,.08)', padding: '30px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#0057B8', display: 'grid', placeItems: 'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="6" width="22" height="14" rx="2" /><line x1="6" y1="6" x2="6" y2="20" /><line x1="11" y1="6" x2="11" y2="20" /><line x1="16" y1="6" x2="16" y2="20" /></svg>
          </div>
          <span style={{ fontSize: '19px', fontWeight: 700 }}><span style={{ color: '#2B7FD4' }}>Steel</span><span style={{ color: '#E65100' }}>Box</span></span>
        </div>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '10px 0 2px' }}>{title}</h1>
        {user ? (
          <div>
            <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.6, margin: '8px 0 16px' }}>
              You're signed in as <strong>{user.email}</strong> ({user.role}), which doesn't have access to this area.
            </p>
            <button onClick={logout} style={{ width: '100%', padding: '12px', borderRadius: '999px', background: '#0057B8', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              Sign in with a different account
            </button>
            <a href="/" style={{ display: 'block', textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#0057B8', fontWeight: 600, textDecoration: 'none' }}>← Back to marketplace</a>
          </div>
        ) : (
          <div style={{ marginTop: '6px' }}>
            <LoginForm subtitle={`Sign in with your ${roles.includes('admin') && roles.length === 1 ? 'administrator' : 'staff'} account to continue.`} />
            <a href="/" style={{ display: 'block', textAlign: 'center', marginTop: '14px', fontSize: '12px', color: '#0057B8', fontWeight: 600, textDecoration: 'none' }}>← Back to marketplace</a>
          </div>
        )}
      </div>
    </div>
  )
}
