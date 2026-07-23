// ============================================================
// MVP Container Marketplace — Customer profile modal
// ============================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Button, Modal, Input, StatusBadge } from '../../components/ui'
import { LoginForm } from '../../lib/auth'
import { useAuth } from '../../hooks'
import { customers as customersApi, orders, messages as messagesApi, CUSTOM_STAGES, type AuthUser, type Customer, type Message, type Order } from '../../lib/api'

// ── Customer Profile ───────────────────────────────────────
// Email-identified profile (no password in the prototype — RBAC will bring
// real customer sign-in). Reads and writes the customer's record in
// customers.csv via the API, and lists their orders from orders.csv.

export type ProfileTab = 'account' | 'info' | 'orders' | 'messages'

const PROFILE_TABS: { key: ProfileTab; label: string }[] = [
  { key: 'account', label: 'Account' },
  { key: 'info', label: 'My Info' },
  { key: 'orders', label: 'Orders' },
  { key: 'messages', label: 'Messages' },
]

interface ProfileFormState {
  name: string; company: string; email: string; phone: string
  address: string; city: string; state: string; zip: string
  notifySms: boolean
}

const customerToForm = (c: Customer): ProfileFormState => ({
  name: c.name || '', company: c.company || '', email: c.email || '', phone: c.phone || '',
  address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '',
  notifySms: c.notifySms === true,
})

interface CustomerProfileModalProps {
  open: boolean
  initialTab: ProfileTab
  onClose: () => void
  onMessageDriver: () => void
  onSaved: () => void          // after a successful save, return to the profile menu
  toast: (msg: string) => void
}

// Every profile feature requires a signed-in account (RBAC): signed-out
// visitors get the login/register form; signed-in customers see their
// customers.csv record (auto-created on first visit), orders, and messages.
export function CustomerProfileModal({ open, initialTab, onClose, onMessageDriver, onSaved, toast }: CustomerProfileModalProps) {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<ProfileTab>(initialTab)
  const [error, setError] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [myMessages, setMyMessages] = useState<Message[]>([])
  const [form, setForm] = useState<ProfileFormState | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof ProfileFormState, v: string | boolean) => setForm(p => p ? { ...p, [k]: v } : p)

  const lookup = useCallback(async (u: AuthUser) => {
    const norm = u.email.trim().toLowerCase()
    setError('')
    try {
      const all = await customersApi.list() // customers get only their own record back
      let match = all.find(c => c.active !== false && (c.email || '').trim().toLowerCase() === norm)
      if (!match) {
        // First visit — create the customer record from the account.
        match = await customersApi.create({ name: u.name || u.email, phone: u.phone || '', notes: 'Created from marketplace profile' })
      }
      setCustomer(match)
      setForm(customerToForm(match))
      // Order history + driver replies are best-effort — the profile still works without them.
      try {
        const allOrders = await orders.list()
        setMyOrders(allOrders
          .filter(o => o.customerId === match!.id || (o.customerEmail || '').trim().toLowerCase() === norm)
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
      } catch { setMyOrders([]) }
      try {
        const allMsgs = await messagesApi.list()
        // Whole conversation: replies addressed to them AND messages they sent.
        setMyMessages(allMsgs.filter(m => !m.trashed && (
          (m.toRole === 'customer' && ((m.toEmail || '').trim().toLowerCase() === norm || (m.toName || '') === match!.name))
          || (m.fromEmail || '').trim().toLowerCase() === norm
        )).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
      } catch { setMyMessages([]) }
      return match
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile — please try again.')
      return null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setError('')
    if (user) lookup(user)
    else { setCustomer(null); setForm(null); setMyOrders([]); setMyMessages([]) }
  }, [open, user, initialTab, lookup])

  const save = async () => {
    if (!customer || !form) return
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const updated = await customersApi.update(customer.id, {
        name: form.name.trim(), company: form.company.trim(), phone: form.phone.trim(),
        address: form.address.trim(), city: form.city.trim(), state: form.state.trim(), zip: form.zip.trim(),
        notifySms: form.notifySms,
      })
      setCustomer(updated)
      setForm(customerToForm(updated))
      toast('Profile saved')
      onSaved() // back to the main profile menu
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your changes — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const unread = myMessages.filter(m => !m.read && (m.fromEmail || '').trim().toLowerCase() !== (customer?.email || '').trim().toLowerCase()).length

  // Compose → dispatch (lands in the admin portal Inbox + staff email).
  const [dmSubject, setDmSubject] = useState('')
  const [dmBody, setDmBody] = useState('')
  const [dmSending, setDmSending] = useState(false)
  const sendToDispatch = async () => {
    if (!customer || !dmBody.trim() || dmSending) return
    setDmSending(true)
    try {
      await messagesApi.create({
        fromRole: 'customer', fromName: customer.name, fromEmail: customer.email,
        toRole: 'admin', toName: 'MVP Container', subject: dmSubject.trim() || 'Message from customer', body: dmBody.trim(),
      })
      setDmSubject('')
      setDmBody('')
      toast('Message sent — we’ll reply here and by email')
      if (user) lookup(user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the message — try again')
    } finally { setDmSending(false) }
  }

  // Opening the Messages tab marks received messages read (in-app and server).
  useEffect(() => {
    if (tab !== 'messages' || !customer) return
    const mine = customer.email.trim().toLowerCase()
    myMessages.filter(m => !m.read && (m.fromEmail || '').trim().toLowerCase() !== mine)
      .forEach(m => messagesApi.update(m.id, { read: true }).catch(() => {}))
    setMyMessages(ms => ms.map(m => (m.fromEmail || '').trim().toLowerCase() !== mine ? { ...m, read: true } : m))
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps
  // Date-only values (UTC midnight) render in UTC so the calendar day never shifts locally.
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    const dateOnly = /T00:00:00(\.000)?Z$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso)
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : {}) })
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={560} closeLabel="Close">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'var(--pri-c,#D6E4FF)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>{customer ? customer.name : 'Your Profile'}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{customer ? customer.email : 'Sign in to manage your account, info & orders'}</div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* ── Signed out: account sign-in / registration required ── */}
      {!user && (
        <LoginForm allowRegister subtitle="Your profile, saved info, and order history are tied to your MVP Container account." />
      )}
      {user && !customer && !error && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--ink3)', fontSize: '13px' }}>Loading your profile…</div>
      )}

      {/* ── Signed in ── */}
      {customer && form && (
        <div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--pill)', padding: '3px', marginBottom: '16px' }}>
            {PROFILE_TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--pill)', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: tab === t.key ? 'var(--surf-w)' : 'transparent', color: tab === t.key ? 'var(--primary)' : 'var(--ink3)', boxShadow: tab === t.key ? 'var(--sh1)' : 'none' }}>
                {t.label}{t.key === 'orders' && myOrders.length > 0 ? ` (${myOrders.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'account' && (
            <div>
              <div style={{ background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r12)', padding: '13px 14px', marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink3)', fontWeight: 700, marginBottom: '4px' }}>Signed in as</div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{customer.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{customer.email}</div>
                {customer.company && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{customer.company}</div>}
              </div>

              {/* Notifications */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Notifications</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '6px' }}>
                  <input type="checkbox" checked={form.notifySms} onChange={e => set('notifySms', e.target.checked)} style={{ width: '17px', height: '17px', accentColor: 'var(--primary)' }} />
                  <span style={{ fontSize: '13px' }}>Text me (SMS) about deliveries &amp; driver messages</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" checked disabled style={{ width: '17px', height: '17px', accentColor: 'var(--green)' }} />
                  <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>Email updates <span style={{ color: 'var(--ink3)' }}>· required</span></span>
                </label>
              </div>

              <button onClick={onMessageDriver} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '12px', borderRadius: 'var(--r12)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: '34px', height: '34px', borderRadius: 'var(--r8)', background: 'var(--surf1)', display: 'grid', placeItems: 'center', flexShrink: 0, position: 'relative' }}>
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></svg>
                  {unread > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '15px', height: '15px', padding: '0 3px', borderRadius: '999px', background: 'var(--cta)', color: '#fff', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 700 }}>Message Driver</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--ink3)' }}>{unread > 0 ? `${unread} unread repl${unread > 1 ? 'ies' : 'y'} from your driver` : 'Send a note to your delivery driver'}</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--ink3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 4 14 10 8 16" /></svg>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="primary" onClick={save} disabled={saving} style={{ flex: 1 }}>{saving ? 'Saving…' : 'Save preferences'}</Button>
                <Button variant="ghost" onClick={() => { logout(); onClose() }}>Sign out</Button>
              </div>
            </div>
          )}

          {tab === 'info' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                <Input label="Full name" value={form.name} onChange={e => set('name', e.target.value)} />
                <Input label="Company" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Optional" />
              </div>
              <Input label="Phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(504) 555-0000" />
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', margin: '4px 0 8px' }}>Delivery address</div>
              <Input label="Street address" value={form.address} onChange={e => set('address', e.target.value)} placeholder="5500 Industrial Pkwy" />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 10px' }}>
                <Input label="City" value={form.city} onChange={e => set('city', e.target.value)} />
                <Input label="State" value={form.state} onChange={e => set('state', e.target.value)} placeholder="LA" />
                <Input label="ZIP" value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="70112" />
              </div>
              <Button variant="primary" fullWidth onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            </div>
          )}

          {tab === 'orders' && (
            <div>
              {myOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '26px 12px', color: 'var(--ink3)' }}>
                  <div style={{ fontSize: '26px', marginBottom: '8px' }}>📦</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '3px', color: 'var(--ink)' }}>No orders yet</div>
                  <div style={{ fontSize: '12px' }}>Orders placed with {customer.email} will show up here.</div>
                </div>
              ) : (
                <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                  {myOrders.map(o => (
                    <div key={o.id} style={{ padding: '11px 2px', borderBottom: '1px solid var(--div)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700 }}>{o.orderNumber}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink3)' }}>{o.containerSku}</span>
                        <span style={{ marginLeft: 'auto' }}><StatusBadge status={o.status} /></span>
                      </div>
                      {(() => {
                        const isCustom = (CUSTOM_STAGES as string[]).includes(o.status)
                        return (
                          <>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--ink3)', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{(o.amount || 0) > 0 ? `$${o.amount.toLocaleString()}` : 'Estimate pending'}</span>
                              <span>{isCustom ? 'Custom build' : o.saleType === 'rent' ? 'Rental' : 'Purchase'}</span>
                              <span>Ordered {fmtDate(o.createdAt)}</span>
                              {!isCustom && o.scheduledDate && <span>{o.status === 'delivered' ? 'Delivered' : 'Delivery'} {fmtDate(o.completedAt || o.scheduledDate)}{o.driverName ? ` · ${o.driverName}` : ''}</span>}
                            </div>
                            {isCustom && (
                              <div style={{ marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#6D28D9', background: '#EDE9FE', borderRadius: 'var(--r8)', padding: '4px 9px' }}>
                                {o.status === 'estimate_requested' && '📞 Estimate requested — our team will call you shortly'}
                                {o.status === 'estimate_in_progress' && '📞 Estimate in progress — expect our call'}
                                {o.status === 'estimate_sent' && `📄 Estimate sent — $${(o.amount || 0).toLocaleString()} · approve on our call`}
                                {o.status === 'estimate_approved' && '✅ Estimate approved — scheduling your build'}
                                {o.status === 'custom_in_progress' && <>🔧 In fabrication{o.scheduledDate ? ` — estimated complete ${fmtDate(o.scheduledDate)}` : ' — completion date coming soon'}</>}
                              </div>
                            )}
                          </>
                        )
                      })()}
                      {o.deliveryAddress && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '3px' }}>→ {o.deliveryAddress}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'messages' && (
            <div>
              {/* Compose → dispatch (admin inbox). Driver messaging lives on the Account tab. */}
              <div style={{ background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r12)', padding: '12px', marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Message our team</div>
                <input value={dmSubject} onChange={e => setDmSubject(e.target.value)} placeholder="Subject (optional)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', marginBottom: '8px', background: 'var(--surf-w)' }} />
                <textarea value={dmBody} onChange={e => setDmBody(e.target.value)} placeholder="Question about an order, delivery, or anything else…" rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', resize: 'vertical', marginBottom: '8px', background: 'var(--surf-w)' }} />
                <Button variant="primary" onClick={sendToDispatch} disabled={dmSending || !dmBody.trim()} style={{ width: '100%' }}>
                  {dmSending ? 'Sending…' : 'Send to MVP Container'}
                </Button>
              </div>

              {myMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 12px', color: 'var(--ink3)' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>💬</div>
                  <div style={{ fontSize: '13px' }}>No messages yet — replies from our team and your driver show up here (and by email).</div>
                </div>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {myMessages.map(m => {
                    const sentByMe = (m.fromEmail || '').trim().toLowerCase() === customer.email.trim().toLowerCase()
                    return (
                      <div key={m.id} style={{ padding: '10px 2px', borderBottom: '1px solid var(--div)' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: sentByMe ? 'var(--ink3)' : 'var(--primary)' }}>
                            {sentByMe ? `You → ${m.toName || (m.toRole === 'admin' ? 'MVP Container' : 'Driver')}` : `${m.fromName} → You`}
                          </span>
                          {!sentByMe && !m.read && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--cta)', flexShrink: 0 }} />}
                          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--ink3)', flexShrink: 0 }}>{new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, margin: '2px 0' }}>{m.subject}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
