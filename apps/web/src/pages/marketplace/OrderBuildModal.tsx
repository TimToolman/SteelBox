// ============================================================
// MVP Container Marketplace — Order a Custom Build
// ============================================================

import React, { useState, useEffect } from 'react'
import { Button, Modal } from '../../components/ui'
import { customBuilds as customBuildsApi, type AuthUser, type ContainerSize, type CustomBuild, type Order } from '../../lib/api'

// ── Order a Custom Build ───────────────────────────────────
// Open to everyone — no account needed. Estimates are confirmed over the
// phone, so we just collect name, phone, email, and the delivery address.

export function OrderBuildModal({ build, user, onClose, onPlaced, toast }: {
  build: CustomBuild | null
  user: AuthUser | null
  onClose: () => void
  onPlaced: () => void
  toast: (m: string) => void
}) {
  const [form, setForm] = useState({ size: '20ft-std' as ContainerSize, name: '', company: '', phone: '', email: '', address: '', city: '', state: '', zip: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [placed, setPlaced] = useState<Order | null>(null)

  useEffect(() => {
    if (!build) return
    setPlaced(null)
    setError('')
    if (user) setForm(p => ({ ...p, name: p.name || user.name || '', phone: p.phone || user.phone || '', email: p.email || user.email }))
  }, [build?.id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!build) return null
  const set = (k: keyof typeof form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))
  const ready = form.name.trim() && form.phone.trim() && /^\S+@\S+\.\S+$/.test(form.email.trim())
    && form.address.trim() && form.city.trim() && form.state.trim() && form.zip.trim()

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const fullAddress = `${form.address.trim()}, ${form.city.trim()}, ${form.state.trim()} ${form.zip.trim()}`
      const r = await customBuildsApi.order(build.id, {
        size: form.size, customerName: form.name.trim(), customerPhone: form.phone.trim(),
        customerEmail: form.email.trim(), company: form.company.trim(),
        deliveryAddress: fullAddress, deliveryZip: form.zip.trim(),
      })
      setPlaced(r.order)
      onPlaced()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed — please try again or call (504) 555-0190.')
    } finally {
      setBusy(false)
    }
  }

  const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px', boxSizing: 'border-box' }

  if (placed) {
    return (
      <Modal open onClose={onClose} maxWidth={480} closeLabel="Close">
        <div style={{ textAlign: 'center', padding: '18px 8px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#EDE9FE', border: '2px solid #6D28D9', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>🔧</div>
          <h2 style={{ fontSize: '21px', fontWeight: 700, marginBottom: '8px' }}>Estimate requested!</h2>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto 16px' }}>
            {build.name} · <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{placed.orderNumber}</span>.
            Our team will <strong style={{ color: 'var(--ink)' }}>call {form.phone}</strong> to walk through the specs and send your estimate — pricing is confirmed on the call.
            {user ? ' Track every stage under Profile → Orders.' : ' Create an account with this email any time to track progress online.'}
          </p>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} maxWidth={520} closeLabel="Close">
      <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: '#6D28D9', letterSpacing: '0.5px', marginBottom: '3px' }}>CUSTOM BUILD</div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '2px' }}>{build.name}</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '16px' }}>{build.description} · pricing set by your estimate · built at our Houston depot</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>Full name</label><input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" /></div>
        <div><label style={lbl}>Company <span style={{ fontWeight: 400, textTransform: 'none' }}>(n/a if none)</span></label><input style={inp} value={form.company} onChange={e => set('company', e.target.value)} placeholder="Your Company LLC" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>Phone (we'll call you)</label><input style={inp} type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(504) 555-0000" /></div>
        <div><label style={lbl}>Email (estimate sent here)</label><input style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" /></div>
      </div>
      <label style={lbl}>Base container size</label>
      <select value={form.size} onChange={e => set('size', e.target.value)} style={inp}>
        <option value="20ft-std">20ft Standard</option>
        <option value="20ft-hc">20ft High Cube</option>
        <option value="40ft-std">40ft Standard</option>
        <option value="40ft-hc">40ft High Cube</option>
      </select>
      <label style={lbl}>Delivery street address</label>
      <input style={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="5500 Industrial Pkwy" />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => set('city', e.target.value)} /></div>
        <div><label style={lbl}>State</label><input style={inp} value={form.state} onChange={e => set('state', e.target.value)} placeholder="TX" /></div>
        <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="77029" /></div>
      </div>
      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '10px' }}>{error}</div>
      )}
      <Button variant="cta" fullWidth disabled={!ready || busy} onClick={submit}>
        {busy ? 'Sending…' : 'Request estimate'}
      </Button>
      <div style={{ fontSize: '10px', color: 'var(--ink3)', textAlign: 'center', marginTop: '8px' }}>No account needed — our team calls to finalize specs and pricing.</div>
    </Modal>
  )
}
