// ============================================================
// MVP Container Marketplace — Quote request dialog
// ============================================================

import React, { useState, useEffect } from 'react'
import { Button, Modal, Input, Select } from '../../components/ui'
import { quotes } from '../../lib/api'
import { attributionFields } from '../../lib/attribution'

// ── Quote Dialog ───────────────────────────────────────────

interface QuoteDialogProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  defaultNeed?: string
  containerSku?: string
  onSuccess?: () => void
}

export function QuoteDialog({ open, onClose, title, subtitle, defaultNeed = '', containerSku, onSuccess }: QuoteDialogProps) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    deliveryZip: '', need: defaultNeed, notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset stale errors each time the dialog opens.
  useEffect(() => { if (open) setError('') }, [open])

  const handleSubmit = async () => {
    if (!form.firstName.trim() || (!form.phone.trim() && !form.email.trim())) {
      setError('Please give us your first name and a phone number or email so we can reach you.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await quotes.submit({ ...form, containerSku, ...attributionFields('marketplace-quote') })
      onSuccess?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please try again or call (504) 555-0190.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={460}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{title}</h2>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '22px', lineHeight: 1.5 }}>{subtitle}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Input label="First Name" placeholder="Jane" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} />
        <Input label="Last Name" placeholder="Smith" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} />
      </div>
      <Input label="Phone" type="tel" placeholder="(504) 555-0000" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
      <Input label="Email" type="email" placeholder="jane@company.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
      <Input label="Delivery ZIP" placeholder="70112" value={form.deliveryZip} onChange={e => setForm(p => ({ ...p, deliveryZip: e.target.value }))} />
      <Select label="What do you need?" value={form.need} onChange={e => setForm(p => ({ ...p, need: e.target.value }))}>
        <option value="">— Select —</option>
        <option value="buy">Buy a container</option>
        <option value="rent-short">Short-term rental (1–3 months)</option>
        <option value="rent-long">Long-term rental (6–12 months)</option>
        <option value="custom">Custom build quote</option>
        <option value="bulk">Bulk / B2B pricing</option>
      </Select>
      <div style={{ marginBottom: '13px' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }}>Notes</label>
        <textarea
          placeholder="Container size, intended use, access constraints…"
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          rows={3}
          style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--div)', borderRadius: 'var(--r12)', fontSize: '14px', resize: 'vertical', fontFamily: 'var(--sans)', outline: 'none' }}
        />
      </div>
      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '4px' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Sending…' : 'Submit Request'}
        </Button>
      </div>
    </Modal>
  )
}
