// ============================================================
// Field app — contractor Profile tab (Uber-style driver B2B).
// The driver's own record: stats (trips, customer ratings,
// earnings), contractor onboarding (CDL, truck, hauling
// capabilities, service area, available days) and compliance
// document uploads (license / insurance).
// ============================================================

import React, { useRef, useState } from 'react'
import { drivers as driversApi, fileToDataUrl, photoUrl, type Driver, type Order } from '../../lib/api'

const INK = '#1A1C2E', INK2 = '#44475A', DIV = '#E1E2EC', BLUE = '#0057B8', GREEN = '#1B7A5A'
const card: React.CSSProperties = { margin: '0 12px 12px', background: '#fff', borderRadius: '16px', border: `1px solid ${DIV}`, padding: '16px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }
const cardTitle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: `1.5px solid ${DIV}`, borderRadius: '10px', fontSize: '14px', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: INK2, margin: '10px 0 5px' }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HAUL_OPTIONS = ['20ft', '40ft', '45ft high cube', 'Chassis / drayage', 'Tilt-bed self-offload', 'Crane / HIAB']

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: '1px', verticalAlign: '-2px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          fill={value >= i - 0.25 ? '#F5A623' : 'none'} stroke="#F5A623" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M12 2.5l2.6 6.2 6.7.5-5.1 4.4 1.5 6.5L12 16.6 6.3 20.1l1.5-6.5-5.1-4.4 6.7-.5z" />
        </svg>
      ))}
    </span>
  )
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{ background: '#F7F8FC', borderRadius: '12px', padding: '11px 12px', minWidth: 0 }}>
      <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: INK2 }}>{label}</div>
      <div style={{ fontSize: '19px', fontWeight: 800, fontFamily: 'monospace', marginTop: '2px', color: INK }}>{value}</div>
      {sub && <div style={{ fontSize: '10.5px', color: INK2, marginTop: '1px' }}>{sub}</div>}
    </div>
  )
}

export function DriverProfileScreen({ me, orders, onUpdated, toast }: {
  me: Driver | null
  orders: Order[]
  onUpdated: () => void
  toast: (m: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{ cdl: boolean; cdlClass: string; truckType: string; serviceZips: string; cellPhone: string } | null>(null)
  const [caps, setCaps] = useState<Set<string>>(new Set())
  const [days, setDays] = useState<Set<string>>(new Set())
  const licRef = useRef<HTMLInputElement>(null)
  const insRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState('')

  if (!me) return <div style={{ padding: '40px', textAlign: 'center', color: INK2 }}>Loading your profile…</div>

  // Editor state hydrates from the record on first render per driver.
  const f = form ?? {
    cdl: me.cdl ?? (me.cdlClass ? true : false), cdlClass: me.cdlClass || 'A',
    truckType: me.truckType || me.vehicle || '', serviceZips: me.serviceZips || '', cellPhone: me.cellPhone || '',
  }
  const capSet = form ? caps : new Set(me.haulCaps || [])
  const daySet = form ? days : new Set(me.availableDays?.length ? me.availableDays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  const beginEdit = () => { if (!form) { setForm(f); setCaps(new Set(capSet)); setDays(new Set(daySet)) } }
  const setF = (patch: Partial<typeof f>) => { beginEdit(); setForm(p => ({ ...(p ?? f), ...patch })) }
  const toggleIn = (set: Set<string>, apply: (s: Set<string>) => void, v: string) => {
    beginEdit()
    const next = new Set(form ? set : (set === caps ? capSet : daySet))
    if (next.has(v)) next.delete(v); else next.add(v)
    apply(next)
  }

  // ── Stats: trips, ratings, earnings from tracked orders ──
  const mine = orders.filter(o => o.driverId === me.id)
  const delivered = mine.filter(o => o.status === 'delivered')
  const rated = delivered.filter(o => (o.rating ?? 0) >= 1)
  const avgRating = rated.length ? rated.reduce((a, o) => a + (o.rating || 0), 0) / rated.length : me.rating
  const now = new Date()
  const sameMonth = (iso?: string | null) => !!iso && new Date(iso).getMonth() === now.getMonth() && new Date(iso).getFullYear() === now.getFullYear()
  const payFor = (o: Order) => (o.driverHours && me.hourlyWage) ? o.driverHours * me.hourlyWage : 150
  const earnedMonth = delivered.filter(o => sameMonth(o.completedAt)).reduce((a, o) => a + payFor(o), 0)
  const earnedTotal = delivered.reduce((a, o) => a + payFor(o), 0)

  const save = async () => {
    setSaving(true)
    try {
      await driversApi.update(me.id, {
        cdl: f.cdl, cdlClass: f.cdl ? (f.cdlClass as Driver['cdlClass']) : ('' as Driver['cdlClass']),
        truckType: f.truckType, vehicle: f.truckType || me.vehicle,
        haulCaps: [...capSet], serviceZips: f.serviceZips.replace(/[^\d,\s]/g, ''),
        availableDays: DAYS.filter(d => daySet.has(d)), cellPhone: f.cellPhone,
      })
      setForm(null)
      onUpdated()
      toast('Contractor profile saved')
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save — try again') } finally { setSaving(false) }
  }

  const uploadDoc = async (kind: 'license' | 'insurance', file: File | undefined) => {
    if (!file) return
    setUploading(kind)
    try {
      const dataUrl = await fileToDataUrl(file)
      await driversApi.uploadDoc(me.id, kind, dataUrl)
      onUpdated()
      toast(`${kind === 'license' ? 'License' : 'Insurance'} uploaded — on file`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Upload failed — try a JPG or PNG') } finally { setUploading('') }
  }

  const DocRow = ({ kind, url, refEl }: { kind: 'license' | 'insurance'; url?: string; refEl: React.RefObject<HTMLInputElement> }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: `1px solid ${DIV}` }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: url ? '#B7F0DA' : '#FFF8E1', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={url ? GREEN : '#B45309'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M13 9h5M13 12.5h5M5 17c.8-1.6 2.1-2.4 3.5-2.4S11.2 15.4 12 17" /></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700 }}>{kind === 'license' ? 'Driver’s license / CDL' : 'Insurance card'}</div>
        <div style={{ fontSize: '11px', color: url ? GREEN : '#B45309', fontWeight: 600 }}>
          {url ? '✓ On file' : 'Required before your first dispatch'}
          {url && <a href={photoUrl(url)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px', color: BLUE, fontWeight: 600 }}>View</a>}
        </div>
      </div>
      <input ref={refEl} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadDoc(kind, e.target.files?.[0])} />
      <button onClick={() => refEl.current?.click()} disabled={uploading === kind}
        style={{ padding: '7px 14px', borderRadius: '999px', border: `1.5px solid ${url ? DIV : BLUE}`, background: url ? '#fff' : BLUE, color: url ? INK2 : '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        {uploading === kind ? 'Uploading…' : url ? 'Replace' : 'Upload'}
      </button>
    </div>
  )

  const chipBtn = (on: boolean): React.CSSProperties => ({
    padding: '7px 13px', borderRadius: '999px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, fontFamily: 'inherit',
    border: `1.5px solid ${on ? BLUE : DIV}`, background: on ? '#D6E4FF' : '#fff', color: on ? BLUE : INK2,
  })

  return (
    <div style={{ paddingBottom: '90px' }}>
      {/* Identity */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '13px' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: me.colorHex || BLUE, color: '#fff', display: 'grid', placeItems: 'center', fontSize: '19px', fontWeight: 800, flexShrink: 0 }}>{me.initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 800 }}>{me.name}</div>
          <div style={{ fontSize: '11.5px', color: INK2, fontFamily: 'monospace' }}>{me.driverCode}{me.contractor !== false ? ' · Independent Contractor' : ''}</div>
          <div style={{ marginTop: '3px' }}><Stars value={avgRating} /> <span style={{ fontSize: '12px', fontWeight: 700 }}>{avgRating.toFixed(1)}</span> <span style={{ fontSize: '11px', color: INK2 }}>({rated.length ? `${rated.length} customer rating${rated.length === 1 ? '' : 's'}` : 'career'})</span></div>
        </div>
      </div>

      {/* Stats */}
      <div style={card}>
        <div style={cardTitle}>Your Numbers</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '9px' }}>
          <Tile label="Trips (career)" value={me.deliveriesTotal || delivered.length} sub={`${me.deliveriesMonth || delivered.filter(o => sameMonth(o.completedAt)).length} this month`} />
          <Tile label="On-time" value={`${me.onTimePercent}%`} />
          <Tile label="Earnings · month" value={`$${Math.round(earnedMonth).toLocaleString()}`} sub="from tracked orders" />
          <Tile label="Earnings · total" value={`$${Math.round(earnedTotal).toLocaleString()}`} sub={me.hourlyWage ? `$${me.hourlyWage}/hr basis` : 'flat-rate estimate'} />
        </div>
        {rated.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: INK2, marginBottom: '6px' }}>Recent customer ratings</div>
            {rated.slice(0, 5).map(o => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', fontSize: '12px' }}>
                <Stars value={o.rating || 0} size={12} />
                <span style={{ fontFamily: 'monospace', color: INK2 }}>{o.orderNumber}</span>
                <span style={{ color: INK2 }}>· {o.containerSku}</span>
                <span style={{ marginLeft: 'auto', color: INK2, fontSize: '11px' }}>{o.completedAt ? new Date(o.completedAt).toLocaleDateString() : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compliance documents */}
      <div style={card}>
        <div style={cardTitle}>Documents</div>
        <DocRow kind="license" url={me.licenseDocUrl} refEl={licRef} />
        <DocRow kind="insurance" url={me.insuranceDocUrl} refEl={insRef} />
      </div>

      {/* Contractor profile */}
      <div style={card}>
        <div style={cardTitle}>Contractor Profile</div>
        <label style={{ ...lbl, marginTop: 0 }}>CDL license</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={chipBtn(f.cdl)} onClick={() => setF({ cdl: true })}>Yes</button>
          <button style={chipBtn(!f.cdl)} onClick={() => setF({ cdl: false })}>No</button>
          {f.cdl && (
            <select style={{ ...inp, width: 'auto', padding: '7px 10px', cursor: 'pointer' }} value={f.cdlClass} onChange={e => setF({ cdlClass: e.target.value })}>
              <option value="A">Class A</option>
              <option value="B">Class B</option>
            </select>
          )}
        </div>
        <label style={lbl}>Truck / equipment</label>
        <input style={inp} value={f.truckType} onChange={e => setF({ truckType: e.target.value })} placeholder="Tilt-bed roll-off" />
        <label style={lbl}>Container hauling capabilities</label>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
          {HAUL_OPTIONS.map(c => (
            <button key={c} style={chipBtn(capSet.has(c))} onClick={() => toggleIn(caps, setCaps, c)}>{c}</button>
          ))}
        </div>
        <label style={lbl}>Service area — 3-digit ZIP prefixes</label>
        <input style={{ ...inp, fontFamily: 'monospace' }} value={f.serviceZips} onChange={e => setF({ serviceZips: e.target.value })} placeholder="700, 701, 704" />
        <label style={lbl}>Days you can drive</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {DAYS.map(d => (
            <button key={d} style={chipBtn(daySet.has(d))} onClick={() => toggleIn(days, setDays, d)}>{d}</button>
          ))}
        </div>
        <label style={lbl}>Mobile</label>
        <input style={inp} type="tel" value={f.cellPhone} onChange={e => setF({ cellPhone: e.target.value })} />
        <button onClick={save} disabled={saving || !form}
          style={{ marginTop: '14px', width: '100%', padding: '12px 0', borderRadius: '999px', border: 'none', background: form ? BLUE : '#E9EBF3', color: form ? '#fff' : INK2, fontSize: '14px', fontWeight: 700, cursor: form ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          {saving ? 'Saving…' : form ? 'Save Profile' : 'Profile up to date'}
        </button>
      </div>
    </div>
  )
}
