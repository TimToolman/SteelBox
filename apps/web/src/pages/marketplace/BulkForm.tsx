// ============================================================
// MVP Container Marketplace — Bulk / B2B request form
// ============================================================

import React, { useState } from 'react'
import { quotes, type ContainerSize } from '../../lib/api'

// ── Bulk / B2B request form ────────────────────────────────
// Same shape as the custom-build estimate form (name, company, phone, email,
// base size, delivery address) plus estimated units. No account needed —
// submits through the quotes endpoint and sales follows up by phone.

export function BulkForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', size: '20ft-std' as ContainerSize, units: '', address: '', city: '', state: '', zip: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim() || (!form.phone.trim() && !form.email.trim())) {
      setError('Please give us your full name and a phone number or email.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const address = [form.address.trim(), form.city.trim(), [form.state.trim(), form.zip.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      await quotes.submit({
        firstName: form.name.trim(), lastName: '', phone: form.phone.trim(), email: form.email.trim(),
        deliveryZip: form.zip.trim(), need: 'bulk',
        notes: [
          'B2B request',
          form.company.trim() ? `company: ${form.company.trim()}` : 'company: n/a',
          `base size: ${form.size}`,
          form.units.trim() ? `estimated units: ${form.units.trim()}` : '',
          address ? `delivery: ${address}` : '',
        ].filter(Boolean).join(' — '),
      })
      setForm({ name: '', company: '', phone: '', email: '', size: '20ft-std', units: '', address: '', city: '', state: '', zip: '' })
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please call (504) 555-0190.')
    } finally {
      setSubmitting(false)
    }
  }

  const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '12px', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', padding: '28px 30px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>Full name</label><input style={inp} value={form.name} onChange={set('name')} placeholder="Jane Smith" /></div>
        <div><label style={lbl}>Company <span style={{ fontWeight: 400, textTransform: 'none' }}>(n/a if none)</span></label><input style={inp} value={form.company} onChange={set('company')} placeholder="Your Company LLC" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>Phone (we'll call you)</label><input style={inp} type="tel" value={form.phone} onChange={set('phone')} placeholder="(504) 555-0000" /></div>
        <div><label style={lbl}>Email</label><input style={inp} type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <div>
          <label style={lbl}>Base container size</label>
          <select value={form.size} onChange={set('size')} style={inp}>
            <option value="20ft-std">20ft Standard</option>
            <option value="20ft-hc">20ft High Cube</option>
            <option value="40ft-std">40ft Standard</option>
            <option value="40ft-hc">40ft High Cube</option>
          </select>
        </div>
        <div><label style={lbl}>Estimated units</label><input style={inp} type="number" value={form.units} onChange={set('units')} placeholder="10" /></div>
      </div>
      <label style={lbl}>Delivery street address</label>
      <input style={inp} value={form.address} onChange={set('address')} placeholder="5500 Industrial Pkwy" />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 10px' }}>
        <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={set('city')} /></div>
        <div><label style={lbl}>State</label><input style={inp} value={form.state} onChange={set('state')} placeholder="TX" /></div>
        <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={set('zip')} placeholder="77029" /></div>
      </div>
      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
          {error}
        </div>
      )}
      <button onClick={submit} disabled={submitting} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Request B2B Pricing'}
      </button>
      <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '12px', color: 'var(--ink3)' }}>
        No account needed · or call us directly: <strong style={{ color: 'var(--ink)' }}>(504) 555-0190</strong> — we respond within 2 hours
      </div>
    </div>
  )
}
