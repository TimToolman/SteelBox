// ============================================================
// MVP Container Auth — shared context, login screens, route guards
// Roles: admin (portal), driver (field app), customer (marketplace
// checkout + profile). Guests may browse the marketplace freely.
// Admin sign-ins take a second step: a 6-digit code emailed to the
// account address. Password resets are email-code based too.
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { auth as authApi, type AuthUser, type Role } from './api'

// Password-correct admin logins pause here until the emailed code is entered.
export interface PendingLogin {
  pendingToken: string
  devCode?: string   // dev only — shown when the server has no SMTP configured
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  // Resolves to the signed-in user, or a PendingLogin when a code is needed.
  login: (email: string, password: string) => Promise<{ user?: AuthUser; pending?: PendingLogin }>
  verifyLogin: (pendingToken: string, code: string) => Promise<AuthUser>
  register: (data: { name: string; email: string; password: string; phone?: string }) => Promise<AuthUser>
  changePassword: (current: string, next: string) => Promise<void>
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
    if ('twoFaRequired' in result && result.twoFaRequired) {
      return { pending: { pendingToken: result.pendingToken, devCode: result.devCode } }
    }
    localStorage.setItem('sbx_token', result.token)
    setUser(result.user)
    return { user: result.user }
  }, [])

  const verifyLogin = useCallback(async (pendingToken: string, code: string) => {
    const result = await authApi.loginVerify(pendingToken, code)
    localStorage.setItem('sbx_token', result.token)
    setUser(result.user)
    return result.user
  }, [])

  const register = useCallback(async (data: { name: string; email: string; password: string; phone?: string }) => {
    const result = await authApi.register(data)
    if ('twoFaRequired' in result && result.twoFaRequired) throw new Error('Unexpected verification step') // registration never 2FAs
    localStorage.setItem('sbx_token', result.token)
    setUser(result.user)
    return result.user
  }, [])

  const changePassword = useCallback(async (current: string, next: string) => {
    await authApi.changePassword(current, next)
    // The seeded-password nag is satisfied the moment a real password is set.
    setUser(u => (u ? { ...u, mustChangePassword: false } : u))
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('sbx_token')
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    try { setUser(await authApi.me()) } catch { /* token expired — keep current state */ }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyLogin, register, changePassword, logout, refresh }}>
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
const primaryBtn = (busy: boolean): React.CSSProperties => ({ width: '100%', padding: '13px', borderRadius: '999px', background: '#0057B8', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 })
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#0057B8', fontWeight: 700, cursor: 'pointer', fontSize: '12px', padding: 0 }
const errorBox: React.CSSProperties = { background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: '8px', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }
const infoBox: React.CSSProperties = { background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', borderRadius: '8px', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }

// Eye / eye-off toggle shown inside password fields. Reused by the admin
// portal's user form too — keep it dependency-free.
export function ShowPasswordButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={shown ? 'Hide password' : 'Show password'} tabIndex={-1}
      style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', width: '36px', height: '36px', display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 0 }}>
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
    </button>
  )
}

type FormMode = 'login' | 'register' | 'code' | 'forgot' | 'reset'

export function LoginForm({ onDone, allowRegister = false, subtitle }: {
  onDone?: (u: AuthUser) => void
  allowRegister?: boolean
  subtitle?: string
}) {
  const { login, verifyLogin, register } = useAuth()
  const [mode, setMode] = useState<FormMode>('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', code: '', newPassword: '' })
  const [pending, setPending] = useState<PendingLogin | null>(null)
  const [notice, setNotice] = useState('')  // blue info banner (code sent, reset done…)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pwFocused, setPwFocused] = useState(false)  // hide the ••• placeholder the moment the field is focused
  const [showPw, setShowPw] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))
  const go = (m: FormMode, msg = '') => { setMode(m); setError(''); setNotice(msg) }

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try { await fn() } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please try again')
    } finally { setBusy(false) }
  }

  const submitLogin = () => run(async () => {
    const result = mode === 'login'
      ? await login(form.email.trim(), form.password)
      : { user: await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone.trim() }) }
    if (result.pending) {
      setPending(result.pending)
      go('code', `We emailed a 6-digit sign-in code to ${form.email.trim()}. Enter it below.`)
      return
    }
    if (result.user) onDone?.(result.user)
  })

  const submitCode = () => run(async () => {
    if (!pending) { go('login'); return }
    const u = await verifyLogin(pending.pendingToken, form.code.trim())
    onDone?.(u)
  })

  const submitForgot = () => run(async () => {
    const r = await authApi.forgot(form.email.trim())
    go('reset', `If ${form.email.trim()} has an account, a reset code is on its way.${r.devCode ? ` (Dev code: ${r.devCode})` : ''}`)
  })

  const submitReset = () => run(async () => {
    await authApi.reset(form.email.trim(), form.code.trim(), form.newPassword)
    setForm(p => ({ ...p, password: '', code: '', newPassword: '' }))
    go('login', 'Password updated — sign in with your new password.')
  })

  const submit = mode === 'code' ? submitCode : mode === 'forgot' ? submitForgot : mode === 'reset' ? submitReset : submitLogin
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit() }

  return (
    <div>
      {subtitle && mode !== 'code' && <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.55, marginBottom: '16px' }}>{subtitle}</p>}
      {notice && <div style={infoBox}>{notice}{mode === 'code' && pending?.devCode ? <> (Dev code: <strong>{pending.devCode}</strong>)</> : null}</div>}

      {mode === 'register' && (
        <div>
          <label style={label}>Your name</label>
          <input style={input} placeholder="Jane Smith" value={form.name} onChange={set('name')} />
        </div>
      )}

      {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
        <>
          <label style={label}>Email</label>
          <input style={input} type="email" placeholder="you@company.com" value={form.email} onChange={set('email')}
            onKeyDown={onEnter} autoFocus />
        </>
      )}

      {(mode === 'login' || mode === 'register') && (
        <>
          <label style={label}>Password</label>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <input style={{ ...input, paddingRight: '44px', marginBottom: 0 }} type={showPw ? 'text' : 'password'}
              placeholder={pwFocused ? '' : mode === 'register' ? 'At least 8 characters' : '••••••••'}
              value={form.password} onChange={set('password')}
              onFocus={() => setPwFocused(true)} onBlur={() => setPwFocused(false)}
              onKeyDown={onEnter} />
            <ShowPasswordButton shown={showPw} onToggle={() => setShowPw(s => !s)} />
          </div>
        </>
      )}

      {(mode === 'code' || mode === 'reset') && (
        <>
          <label style={label}>{mode === 'code' ? 'Sign-in code' : 'Reset code'}</label>
          <input style={{ ...input, letterSpacing: '4px', fontFamily: 'ui-monospace, monospace', fontSize: '17px', textAlign: 'center' }}
            inputMode="numeric" maxLength={6} placeholder="••••••"
            value={form.code} onChange={set('code')} onKeyDown={onEnter} autoFocus />
        </>
      )}

      {mode === 'reset' && (
        <>
          <label style={label}>New password</label>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <input style={{ ...input, paddingRight: '44px', marginBottom: 0 }} type={showPw ? 'text' : 'password'}
              placeholder="At least 8 characters" value={form.newPassword} onChange={set('newPassword')} onKeyDown={onEnter} />
            <ShowPasswordButton shown={showPw} onToggle={() => setShowPw(s => !s)} />
          </div>
        </>
      )}

      {mode === 'register' && (
        <div>
          <label style={label}>Mobile phone <span style={{ fontWeight: 400, textTransform: 'none' }}>(used to coordinate deliveries)</span></label>
          <input style={input} type="tel" placeholder="(504) 555-0000" value={form.phone} onChange={set('phone')} onKeyDown={onEnter} />
        </div>
      )}

      {error && <div style={errorBox}>{error}</div>}

      <button onClick={submit} disabled={busy} style={primaryBtn(busy)}>
        {busy ? 'One moment…'
          : mode === 'login' ? 'Sign In'
          : mode === 'register' ? 'Create Account'
          : mode === 'code' ? 'Verify & Sign In'
          : mode === 'forgot' ? 'Email Me a Reset Code'
          : 'Set New Password'}
      </button>

      <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#6B7280', display: 'grid', gap: '6px' }}>
        {mode === 'login' && (
          <>
            <button onClick={() => go('forgot')} style={linkBtn}>Forgot password?</button>
            {allowRegister && <span>New to MVP Container? <button onClick={() => go('register')} style={linkBtn}>Create an account</button></span>}
          </>
        )}
        {mode === 'register' && <span>Already have an account? <button onClick={() => go('login')} style={linkBtn}>Sign in</button></span>}
        {(mode === 'code' || mode === 'forgot' || mode === 'reset') && (
          <button onClick={() => { setPending(null); go('login') }} style={linkBtn}>← Back to sign in</button>
        )}
      </div>
    </div>
  )
}

// ── Forced password change (seeded dev passwords) ──────────
// Shown by RequireRole when the account signed in with the shared seeded
// password — staff must set a real one before reaching the portal.

function ChangePasswordGate() {
  const { user, changePassword, logout } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const submit = async () => {
    if (busy) return
    if (form.next !== form.confirm) { setError('New passwords don’t match'); return }
    setBusy(true)
    setError('')
    try {
      await changePassword(form.current, form.next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the password — try again')
    } finally { setBusy(false) }
  }

  const pwInput = (key: 'current' | 'next' | 'confirm', lbl: string, placeholder: string) => (
    <>
      <label style={label}>{lbl}</label>
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <input style={{ ...input, paddingRight: '44px', marginBottom: 0 }} type={showPw ? 'text' : 'password'} placeholder={placeholder}
          value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <ShowPasswordButton shown={showPw} onToggle={() => setShowPw(s => !s)} />
      </div>
    </>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F4F6FB', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px', boxSizing: 'border-box', background: '#fff', borderRadius: '18px', border: '1px solid #E3E5EE', boxShadow: '0 8px 30px rgba(26,28,46,.08)', padding: '30px 28px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px' }}>Set a new password</h1>
        <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.6, margin: '0 0 16px' }}>
          <strong>{user?.email}</strong> is still using the shared setup password. Choose your own before continuing — this is required now that the site is live.
        </p>
        {pwInput('current', 'Current password', 'The setup password')}
        {pwInput('next', 'New password', 'At least 8 characters')}
        {pwInput('confirm', 'Confirm new password', 'Repeat it')}
        {error && <div style={errorBox}>{error}</div>}
        <button onClick={submit} disabled={busy} style={primaryBtn(busy)}>{busy ? 'Saving…' : 'Save & Continue'}</button>
        <button onClick={logout} style={{ ...linkBtn, display: 'block', margin: '14px auto 0' }}>Sign out instead</button>
      </div>
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

  if (user && roles.includes(user.role)) {
    // Seeded/shared passwords don't get past the door.
    if (user.mustChangePassword) return <ChangePasswordGate />
    return <>{children}</>
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F4F6FB', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px', boxSizing: 'border-box', background: '#fff', borderRadius: '18px', border: '1px solid #E3E5EE', boxShadow: '0 8px 30px rgba(26,28,46,.08)', padding: '30px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#0057B8', display: 'grid', placeItems: 'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="1" y="6" width="22" height="14" rx="2" /><line x1="6" y1="6" x2="6" y2="20" /><line x1="11" y1="6" x2="11" y2="20" /><line x1="16" y1="6" x2="16" y2="20" /></svg>
          </div>
          <span style={{ fontSize: '19px', fontWeight: 700 }}><span style={{ color: '#2B7FD4' }}>MVP&nbsp;</span><span style={{ color: '#E65100' }}>Container</span></span>
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
            <a href={import.meta.env.BASE_URL} style={{ display: 'block', textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#0057B8', fontWeight: 600, textDecoration: 'none' }}>← Back to marketplace</a>
          </div>
        ) : (
          <div style={{ marginTop: '6px' }}>
            <LoginForm subtitle={`Sign in with your ${roles.includes('admin') && roles.length === 1 ? 'administrator' : 'staff'} account to continue.`} />
            <a href={import.meta.env.BASE_URL} style={{ display: 'block', textAlign: 'center', marginTop: '14px', fontSize: '12px', color: '#0057B8', fontWeight: 600, textDecoration: 'none' }}>← Back to marketplace</a>
          </div>
        )}
      </div>
    </div>
  )
}
