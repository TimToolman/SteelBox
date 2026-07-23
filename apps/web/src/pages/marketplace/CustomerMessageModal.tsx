// ============================================================
// MVP Container Marketplace — Customer → driver message modal
// ============================================================

import React, { useState, useEffect } from 'react'
import { Button, Modal, Input, Select } from '../../components/ui'
import { drivers as driversApi, messages as messagesApi, type Driver } from '../../lib/api'

// ── Customer → driver message ──────────────────────────────
export function CustomerMessageModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (msg: string) => void }) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [form, setForm] = useState({ name: '', email: '', driverId: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)
  useEffect(() => {
    if (!open) return
    setForm({ name: '', email: '', driverId: '', subject: '', body: '' })
    driversApi.list().then(ds => { const active = ds.filter(d => d.active !== false); setDrivers(active); setForm(f => ({ ...f, driverId: active[0]?.id || '' })) }).catch(() => {})
  }, [open])

  const send = async () => {
    if (sending || !form.driverId || !form.body.trim() || !form.name.trim()) return
    setSending(true)
    try {
      await messagesApi.create({ toDriverId: form.driverId, fromRole: 'customer', fromName: form.name.trim(), fromEmail: form.email.trim(), subject: form.subject.trim() || 'Message from customer', body: form.body.trim() })
      onSent('Message sent to your driver')
      onClose()
    } catch { onSent('Failed to send — please try again') }
    finally { setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={480}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Message your driver</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '18px' }}>Questions about a delivery, pickup, or gate access? Send a note straight to the driver.</p>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}><Input label="Your name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Jane Smith" /></div>
        <div style={{ flex: 1 }}><Input label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="jane@company.com" /></div>
      </div>
      <Select label="Driver" value={form.driverId} onChange={e => setForm(p => ({ ...p, driverId: e.target.value }))}>
        {drivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.vehicle}</option>)}
      </Select>
      <Input label="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="e.g. Delivery access" />
      <div style={{ marginBottom: '13px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Message</label>
        <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={4} placeholder="Write your message…" style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--div)', borderRadius: 'var(--r12)', fontSize: '14px', outline: 'none', fontFamily: 'var(--sans)', resize: 'vertical', background: 'var(--surf-w)' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={send} disabled={sending || !form.driverId || !form.name.trim() || !form.body.trim()}>{sending ? 'Sending…' : 'Send message'}</Button>
      </div>
    </Modal>
  )
}
