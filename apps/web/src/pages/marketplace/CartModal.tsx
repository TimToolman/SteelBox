// ============================================================
// MVP Container Marketplace — Cart / checkout modal
// ============================================================

import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui'
import { LoginForm } from '../../lib/auth'
import { useIsMobile } from '../../hooks'
import { auth as authApi, photoUrl, type AuthUser } from '../../lib/api'
import { GRADE_META } from '../../lib/specs'
import { allowedModes, SIZE_LABELS, type CartItem, type CartMode, type CheckoutDetails } from './shared'

// ── Cart / Checkout ────────────────────────────────────────

const EMPTY_CHECKOUT: CheckoutDetails = {
  firstName: '', lastName: '', email: '', phone: '',
  address: '', city: '', state: '', zip: '',
  deliveryDate: '', accessNotes: '',
  rentStart: '',
  notifySms: false,
}

interface CartModalProps {
  open: boolean
  cart: CartItem[]
  user: AuthUser | null          // checkout requires a signed-in account
  onClose: () => void
  onRemove: (id: string) => void
  onUpdateItem: (id: string, patch: Partial<CartItem>) => void
  onLongTermInquiry: () => void
  onPlaceOrder: (d: CheckoutDetails) => Promise<void>
}

const fieldLabel: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '5px' }
const fieldInput: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)' }
const sectionTitle: React.CSSProperties = { fontSize: '14px', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }

export function CartModal({ open, cart, user, onClose, onRemove, onUpdateItem, onLongTermInquiry, onPlaceOrder }: CartModalProps) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState<CheckoutDetails>(EMPTY_CHECKOUT)
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [placedCount, setPlacedCount] = useState(0)
  // SMS two-factor — required on EVERY order (initial and subsequent).
  const [twoFa, setTwoFa] = useState<{ stage: 'idle' | 'code'; sending: boolean; code: string; devCode: string; error: string }>(
    { stage: 'idle', sending: false, code: '', devCode: '', error: '' })

  const set = (k: keyof CheckoutDetails, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  // Prefill contact details from the signed-in account.
  useEffect(() => {
    if (!open || !user) return
    setForm(p => ({
      ...p,
      email: p.email || user.email,
      firstName: p.firstName || (user.name || '').split(/\s+/)[0] || '',
      lastName: p.lastName || (user.name || '').split(/\s+/).slice(1).join(' '),
      phone: p.phone || user.phone || '',
    }))
  }, [open, user])

  const buyItems = cart.filter(i => i.mode === 'buy')
  const rentItems = cart.filter(i => i.mode === 'rent')
  const buyTotal = buyItems.reduce((s, i) => s + i.container.buyPrice, 0)
  const rentMonthly = rentItems.reduce((s, i) => s + (i.container.rentMonthly || 0), 0) // combined /mo rate
  const rentContract = rentItems.reduce((s, i) => s + (i.container.rentMonthly || 0) * i.rentTerm, 0) // months × rate
  const deposit = rentMonthly // one-month refundable deposit per unit
  const dueToday = buyTotal + rentContract + deposit

  const contactOk = form.firstName && form.lastName && form.email && form.phone
  const deliveryOk = form.address && form.city && form.state && form.zip
  const rentalOk = rentItems.length === 0 || !!form.rentStart
  const canPlace = cart.length > 0 && contactOk && deliveryOk && rentalOk && !placing

  const num = (n: number) => `$${n.toLocaleString()}`

  const close = () => { onClose(); setTimeout(() => { setPlaced(false); setPlaceError(''); setForm(EMPTY_CHECKOUT); setTwoFa({ stage: 'idle', sending: false, code: '', devCode: '', error: '' }) }, 200) }

  const place = async () => {
    setPlacing(true)
    setPlaceError('')
    setPlacedCount(cart.length)
    try { await onPlaceOrder(form); setPlaced(true) }
    catch (e) { setPlaceError(e instanceof Error ? e.message : 'We couldn’t place your order — please try again or call (504) 555-0190.') }
    finally { setPlacing(false) }
  }

  // Step 1: text a 6-digit code to the mobile number on the order.
  const sendCode = async () => {
    if (!canPlace || twoFa.sending) return
    setTwoFa(t => ({ ...t, sending: true, error: '' }))
    try {
      const r = await authApi.twoFaSend(form.phone)
      setTwoFa({ stage: 'code', sending: false, code: '', devCode: r.devCode || '', error: '' })
    } catch (e) {
      setTwoFa(t => ({ ...t, sending: false, error: e instanceof Error ? e.message : 'Could not send the code — check the phone number' }))
    }
  }
  // Step 2: verify the code, then place the order.
  const verifyAndPlace = async () => {
    if (twoFa.sending || placing) return
    setTwoFa(t => ({ ...t, sending: true, error: '' }))
    try {
      await authApi.twoFaVerify(twoFa.code)
      setTwoFa(t => ({ ...t, sending: false }))
      await place()
    } catch (e) {
      setTwoFa(t => ({ ...t, sending: false, error: e instanceof Error ? e.message : 'Verification failed — try again' }))
    }
  }
  // Admin/driver test orders skip customer SMS verification (server allows it).
  const needsTwoFa = !!user && user.role === 'customer'

  const field = (label: string, key: keyof CheckoutDetails, opts: { type?: string; placeholder?: string; half?: boolean } = {}) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={fieldLabel}>{label}</label>
      <input type={opts.type || 'text'} value={form[key] as string} placeholder={opts.placeholder} onChange={e => set(key, e.target.value)} style={fieldInput} />
    </div>
  )

  // ── Success screen ──
  if (placed) {
    return (
      <Modal open={open} onClose={close} maxWidth={520}>
        <div style={{ textAlign: 'center', padding: '20px 8px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--green-cont)', border: '2px solid var(--green)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Order placed!</h2>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '20px', maxWidth: '360px', margin: '0 auto 20px' }}>
            Thanks, {form.firstName}. We've reserved your container{placedCount > 1 ? 's' : ''} and emailed a confirmation to <strong style={{ color: 'var(--ink)' }}>{form.email}</strong>. No payment has been taken — our team will call you{form.phone ? ` at ${form.phone}` : ''} to confirm availability, collect payment, and schedule delivery to {form.city}, {form.state}.
          </p>
          <button onClick={close} style={{ padding: '12px 28px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Done</button>
        </div>
      </Modal>
    )
  }

  // ── Empty cart ──
  if (open && cart.length === 0) {
    return (
      <Modal open={open} onClose={close} maxWidth={460}>
        <div style={{ textAlign: 'center', padding: '18px 8px' }}>
          <div style={{ fontSize: '34px', marginBottom: '10px' }}>🛒</div>
          <h2 style={{ fontSize: '19px', fontWeight: 700, marginBottom: '6px' }}>Your cart is empty</h2>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '18px' }}>Browse the marketplace and add a container to buy or rent.</p>
          <button onClick={close} style={{ padding: '11px 24px', borderRadius: 'var(--pill)', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Continue Shopping</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={close} maxWidth={860}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '2px' }}>Review your order</h2>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '20px' }}>{cart.length} item{cart.length > 1 ? 's' : ''} · {buyItems.length} to buy · {rentItems.length} to rent</p>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 300px', gap: '24px', alignItems: 'start' }}>
        {/* ── Left: items + forms ── */}
        <div>
          {/* Items */}
          <div style={{ marginBottom: '22px' }}>
            {cart.map(({ container: c, mode, rentTerm }) => {
              const allow = allowedModes(c)
              const bothAllowed = allow.buy && allow.rent
              const rate = c.rentMonthly || 0
              return (
                <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--div)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '54px', height: '40px', borderRadius: 'var(--r8)', background: 'linear-gradient(135deg,#CBD5E8,#A8BFDF)', flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                      {c.photos?.filter(Boolean)[0] ? <img src={photoUrl(c.photos.filter(Boolean)[0])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '9px', color: '#fff', fontFamily: 'var(--mono)' }}>{c.size}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{SIZE_LABELS[c.size]} <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink3)', fontWeight: 400 }}>· {c.sku}</span></div>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '1px' }}>Grade {c.grade} · {GRADE_META[c.grade].label}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px' }}>{mode === 'rent' ? `${num(rate)}/mo` : num(c.buyPrice)}</div>
                      {mode === 'rent' && <div style={{ fontSize: '10px', color: 'var(--ink3)' }}>{rentTerm} mo · {num(rate * rentTerm)} total</div>}
                      <button onClick={() => onRemove(c.id)} style={{ fontSize: '11px', color: 'var(--cta)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>Remove</button>
                    </div>
                  </div>

                  {/* Mode + rental term controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '9px', paddingLeft: '66px', flexWrap: 'wrap' }}>
                    {bothAllowed ? (
                      <div style={{ display: 'inline-flex', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--pill)', padding: '2px' }}>
                        {(['buy', 'rent'] as CartMode[]).map(m => {
                          const active = mode === m
                          return (
                            <button key={m} onClick={() => onUpdateItem(c.id, { mode: m })} style={{ padding: '5px 16px', borderRadius: 'var(--pill)', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: active ? 'var(--surf-w)' : 'transparent', color: active ? (m === 'rent' ? 'var(--primary)' : 'var(--green)') : 'var(--ink3)', boxShadow: active ? 'var(--sh1)' : 'none' }}>{m === 'buy' ? 'Buy' : 'Rent'}</button>
                          )
                        })}
                      </div>
                    ) : (
                      <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 'var(--pill)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: mode === 'rent' ? 'var(--pri-c,#D6E4FF)' : 'var(--green-cont)', color: mode === 'rent' ? 'var(--primary)' : 'var(--green)' }}>{mode === 'rent' ? 'Rent only' : 'Buy only'}</span>
                    )}

                    {mode === 'rent' && (
                      <>
                        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Term
                          <select value={String(rentTerm)} onChange={e => onUpdateItem(c.id, { rentTerm: Number(e.target.value) })} style={{ padding: '5px 8px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '12px', outline: 'none', fontFamily: 'var(--sans)', background: 'var(--surf-w)' }}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => <option key={mo} value={mo}>{mo} month{mo > 1 ? 's' : ''}</option>)}
                          </select>
                        </label>
                        <button onClick={onLongTermInquiry} style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', padding: 0 }}>Need 12+ months? Contact us</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Contact */}
          <div style={{ marginBottom: '22px' }}>
            <div style={sectionTitle}>Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('First name', 'firstName', { placeholder: 'Jane' })}
              {field('Last name', 'lastName', { placeholder: 'Smith' })}
              {field('Email', 'email', { type: 'email', placeholder: 'jane@company.com' })}
              {field('Phone', 'phone', { type: 'tel', placeholder: '(504) 555-0000' })}
            </div>
          </div>

          {/* Delivery */}
          <div style={{ marginBottom: '22px' }}>
            <div style={sectionTitle}>Delivery</div>
            {field('Street address', 'address', { placeholder: '5500 Industrial Pkwy' })}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              {field('City', 'city', { placeholder: 'Katy' })}
              {field('State', 'state', { placeholder: 'TX' })}
              {field('ZIP', 'zip', { placeholder: '77493' })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('Preferred delivery date', 'deliveryDate', { type: 'date' })}
              {field('Site access notes', 'accessNotes', { placeholder: 'Gate code, forklift on site…' })}
            </div>
          </div>

          {/* Rental start — only when the cart contains rentals; per-item term is set above */}
          {rentItems.length > 0 && (
            <div style={{ marginBottom: '22px' }}>
              <div style={sectionTitle}>Rental start <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary)', background: 'var(--pri-c,#D6E4FF)', padding: '2px 8px', borderRadius: 'var(--r4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{rentItems.length} rental{rentItems.length > 1 ? 's' : ''}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {field('Rental start date', 'rentStart', { type: 'date' })}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>Set each unit's rental term (1–12 months) in the item list above. Need longer? <button onClick={onLongTermInquiry} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', padding: 0, fontSize: '11px' }}>Contact us</button>.</div>
            </div>
          )}

          {/* Payment — collected by phone after the order is validated */}
          <div>
            <div style={sectionTitle}>Payment</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'var(--green-cont)', border: '1px solid var(--green)', borderRadius: 'var(--r8)', padding: '12px 14px', fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.6 }}>
              <span style={{ flexShrink: 0, fontSize: '15px' }}>📞</span>
              <span>
                <strong style={{ color: 'var(--ink)' }}>No payment is collected online.</strong> Placing this order reserves your
                container{cart.length > 1 ? 's' : ''} — a member of our team will call you
                {form.phone ? <> at <strong style={{ color: 'var(--ink)' }}>{form.phone}</strong></> : null} to confirm availability,
                collect payment, and schedule delivery. You won't be charged until that call.
              </span>
            </div>
          </div>

          {/* Notifications — email required, SMS opt-in */}
          <div>
            <div style={sectionTitle}>Notifications</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}>
              <input type="checkbox" checked={form.notifySms} onChange={e => set('notifySms', e.target.checked)} style={{ width: '17px', height: '17px', accentColor: 'var(--primary)' }} />
              <span style={{ fontSize: '13px' }}>Text me (SMS) when dispatch or my driver sends a message</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" checked disabled style={{ width: '17px', height: '17px', accentColor: 'var(--green)' }} />
              <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>Email me order &amp; message updates <span style={{ color: 'var(--ink3)' }}>· required</span></span>
            </label>
          </div>
        </div>

        {/* ── Right: order summary ── */}
        <div style={{ position: 'sticky', top: '0', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r16)', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Order summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            {buyItems.length > 0 && <Row label={`Purchases (${buyItems.length})`} val={num(buyTotal)} />}
            {rentItems.map(({ container: c, rentTerm }) => (
              <Row key={c.id} label={`Rent · ${rentTerm} mo × $${c.rentMonthly}`} val={num((c.rentMonthly || 0) * rentTerm)} />
            ))}
            {rentItems.length > 0 && <Row label="Refundable deposit" val={num(deposit)} sub />}
            <Row label="Delivery" val="Included" green />
          </div>
          <div style={{ borderTop: '1px solid var(--div)', margin: '12px 0', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Due today</span>
            <span style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)' }}>{num(dueToday)}</span>
          </div>
          {rentItems.length > 0 && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '12px', textAlign: 'right' }}>{num(rentContract)} rental + {num(deposit)} deposit</div>}

          {placeError && (
            <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', color: '#B3261E', borderRadius: 'var(--r8)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, marginBottom: '10px' }}>
              {placeError}
            </div>
          )}

          {!user ? (
            /* ── Step 0: checkout requires an account ── */
            <div style={{ borderTop: '1px solid var(--div)', paddingTop: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Sign in to complete your order</div>
              <LoginForm allowRegister subtitle="Orders are tied to your MVP Container account so you can track delivery and message your driver." />
            </div>
          ) : !needsTwoFa ? (
            <button onClick={place} disabled={!canPlace || placing} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: canPlace ? 'var(--cta)' : 'var(--surf-w)', color: canPlace ? '#fff' : 'var(--ink3)', fontSize: '14px', fontWeight: 700, border: canPlace ? 'none' : '1.5px solid var(--div)', cursor: canPlace ? 'pointer' : 'not-allowed', boxShadow: canPlace ? '0 4px 14px rgba(230,81,0,.3)' : 'none' }}>
              {placing ? 'Placing order…' : `Place order · ${num(dueToday)}`}
            </button>
          ) : twoFa.stage === 'idle' ? (
            /* ── Step 1: email a verification code (required on every order) ── */
            <div>
              <button onClick={sendCode} disabled={!canPlace || twoFa.sending} style={{ width: '100%', padding: '14px', borderRadius: 'var(--pill)', background: canPlace ? 'var(--primary)' : 'var(--surf-w)', color: canPlace ? '#fff' : 'var(--ink3)', fontSize: '14px', fontWeight: 700, border: canPlace ? 'none' : '1.5px solid var(--div)', cursor: canPlace ? 'pointer' : 'not-allowed' }}>
                {twoFa.sending ? 'Sending code…' : '✉️ Email me a verification code'}
              </button>
              <div style={{ fontSize: '10px', color: 'var(--ink3)', textAlign: 'center', marginTop: '8px', lineHeight: 1.5 }}>
                Every order is confirmed with a code sent to your account email{user?.email ? ` (${user.email})` : ''}.
              </div>
            </div>
          ) : (
            /* ── Step 2: enter the code, then the order places ── */
            <div style={{ background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--r12)', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Enter the 6-digit code we emailed to {user?.email || 'you'}</div>
              {twoFa.devCode && (
                <div style={{ fontSize: '11px', color: 'var(--ink3)', background: 'var(--amb-c,#FEF3C7)', borderRadius: 'var(--r8)', padding: '6px 9px', marginBottom: '8px' }}>
                  Dev mode — email delivery not configured. Your code: <strong style={{ fontFamily: 'var(--mono)' }}>{twoFa.devCode}</strong>
                </div>
              )}
              <input
                value={twoFa.code}
                onChange={e => setTwoFa(t => ({ ...t, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                onKeyDown={e => e.key === 'Enter' && twoFa.code.length === 6 && verifyAndPlace()}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
                style={{ width: '100%', padding: '11px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '20px', letterSpacing: '8px', textAlign: 'center', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
              />
              {twoFa.error && <div style={{ color: '#B3261E', fontSize: '11px', marginBottom: '8px' }}>{twoFa.error}</div>}
              <button onClick={verifyAndPlace} disabled={twoFa.code.length !== 6 || twoFa.sending || placing}
                style={{ width: '100%', padding: '13px', borderRadius: 'var(--pill)', background: twoFa.code.length === 6 ? 'var(--cta)' : 'var(--surf-w)', color: twoFa.code.length === 6 ? '#fff' : 'var(--ink3)', fontSize: '14px', fontWeight: 700, border: twoFa.code.length === 6 ? 'none' : '1.5px solid var(--div)', cursor: twoFa.code.length === 6 ? 'pointer' : 'not-allowed' }}>
                {placing ? 'Placing order…' : twoFa.sending ? 'Verifying…' : `Verify & place order · ${num(dueToday)}`}
              </button>
              <button onClick={sendCode} disabled={twoFa.sending} style={{ width: '100%', marginTop: '6px', padding: '8px', borderRadius: 'var(--pill)', background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                Resend code
              </button>
            </div>
          )}
          {user && !canPlace && !placing && <div style={{ fontSize: '10px', color: 'var(--ink3)', textAlign: 'center', marginTop: '8px' }}>Complete contact & delivery{rentItems.length > 0 ? ' & rental' : ''} details to continue</div>}
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, val, green, sub }: { label: string; val: string; green?: boolean; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: sub ? 'var(--ink3)' : 'var(--ink2)', fontSize: sub ? '12px' : '13px' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: green ? 'var(--green)' : 'var(--ink)' }}>{val}</span>
    </div>
  )
}
