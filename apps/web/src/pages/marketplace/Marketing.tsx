// ============================================================
// Marketing portal — reseller campaigns behind the marketplace
// login ('marketing' grant). Upload a contact database, build and
// launch email / social / ad campaigns, read per-campaign funnels,
// compose social ads, connect send providers, pick a paid plan.
// All data is tenant-scoped server-side to the account's reseller.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  marketingApi, sellers as sellersApi,
  type AuthUser, type MarketingCampaign, type MarketingConnection, type MarketingContact, type MarketingPlanId, type Seller,
} from '../../lib/api'
import { Button, Input, Modal, Select } from '../../components/ui'

// ── Pricing catalog (shown in the builder + Plans tab) ─────
const PLANS: Array<{ id: MarketingPlanId; name: string; price: string; blurb: string; features: string[] }> = [
  { id: 'starter', name: 'Starter', price: 'Free', blurb: 'Get your list in and send your first campaigns.', features: ['500 contacts', '1,000 emails / month', 'Campaign reports', '1 connected provider'] },
  { id: 'growth', name: 'Growth', price: '$149/mo', blurb: 'Everything a growing reseller needs to fill the calendar.', features: ['10,000 contacts', '25,000 emails / month', 'Ad Studio + social campaigns', 'ZIP & region targeting', 'All integrations'] },
  { id: 'pro', name: 'Pro', price: '$399/mo', blurb: 'Full-funnel marketing across every channel and market.', features: ['Unlimited contacts & sends', 'Paid search + social ads', 'API access & data export', 'Priority support'] },
]
const SEND_RATES = [
  { label: 'Email blast', cost: '$0.02 / recipient ($25 min)' },
  { label: 'Social post boost', cost: '$15 flat per post' },
  { label: 'Paid ads (search / social)', cost: 'Your daily budget, from $10/day' },
]
const PROVIDERS = [
  { id: 'sendgrid', name: 'SendGrid', kind: 'Email delivery' },
  { id: 'mailchimp', name: 'Mailchimp', kind: 'Email + audiences' },
  { id: 'meta', name: 'Meta Business', kind: 'Facebook & Instagram ads' },
  { id: 'google', name: 'Google Ads', kind: 'Search & display ads' },
  { id: 'twilio', name: 'Twilio', kind: 'SMS campaigns' },
  { id: 'zapier', name: 'Zapier', kind: 'CRM & 6,000+ app sync' },
]

const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')

// ── Tiny presentation helpers (dataviz: single hue, ink text) ──
function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r12, 12px)', padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.3px', marginTop: '3px' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}
function BarRow({ label, value, max, fmt }: { label: string; value: number; max: number; fmt: (n: number) => string }) {
  const w = max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 74px', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
      <span style={{ fontSize: '12px', color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ height: '14px', borderRadius: '4px', background: 'var(--surf1)', overflow: 'hidden' }}>
        {value > 0 && <div style={{ width: `${w}%`, height: '100%', borderRadius: '4px', background: 'var(--primary)' }} />}
      </div>
      <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'var(--mono)', textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  )
}
function StatusPill({ status }: { status: string }) {
  const meta = status === 'sent' ? { bg: 'var(--green-cont)', fg: 'var(--green)', label: 'Sent' }
    : status === 'running' ? { bg: '#FFF3E0', fg: '#B45309', label: 'Running' }
    : { bg: 'var(--surf1)', fg: 'var(--ink2)', label: 'Draft' }
  return <span style={{ padding: '2px 9px', borderRadius: 'var(--pill)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: meta.bg, color: meta.fg }}>{meta.label}</span>
}
const TYPE_LABEL: Record<string, string> = { email: 'Email', social: 'Social', ad: 'Paid Ad' }

// Minimal CSV parser: quoted fields, commas, CRLF. Returns rows of cells.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cell = '', row: string[] = [], q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows
}
// Map arbitrary CSV headers onto contact fields (case/space tolerant).
function mapCsvContacts(rows: string[][]): Array<Partial<MarketingContact>> {
  if (rows.length < 2) return []
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''))
  const col = (...names: string[]) => head.findIndex(h => names.includes(h))
  const iName = col('name', 'fullname', 'contact', 'customer')
  const iFirst = col('firstname', 'first')
  const iLast = col('lastname', 'last')
  const iEmail = col('email', 'emailaddress', 'mail')
  const iPhone = col('phone', 'phonenumber', 'cell', 'mobile')
  const iZip = col('zip', 'zipcode', 'postal', 'postalcode')
  const iCity = col('city', 'town')
  const iState = col('state', 'province', 'st')
  return rows.slice(1).map(r => ({
    name: iName >= 0 ? r[iName] : [iFirst >= 0 ? r[iFirst] : '', iLast >= 0 ? r[iLast] : ''].filter(Boolean).join(' '),
    email: iEmail >= 0 ? r[iEmail] : '',
    phone: iPhone >= 0 ? r[iPhone] : '',
    zip: iZip >= 0 ? r[iZip] : '',
    city: iCity >= 0 ? r[iCity] : '',
    state: iState >= 0 ? r[iState] : '',
  }))
}

// Canned copy the "Suggest copy" button rotates through — populated with
// the reseller's name so drafts start on-brand.
const AD_IDEAS = [
  { headline: 'Your exact container. Photos, grade, all-in price.', body: 'No stock photos, no call-for-quote. Pick the unit, see its real condition, and get a delivered price to your ZIP in seconds.', cta: 'Get My Price' },
  { headline: 'Delivered in 3–5 days, tracked to your site.', body: '{{seller}} delivers AI-graded used containers with an all-in price — unit, haul and drop included.', cta: 'Shop Inventory' },
  { headline: 'One-trip and cargo-worthy units, graded by AI.', body: 'Every container is photographed 8 ways and condition-graded before it lists. What you see is the box you get.', cta: 'See the Yard' },
  { headline: 'Storage on your lot beats rent by the month.', body: 'Own a graded container from $2,150 delivered. {{seller}} services your ZIP with local yards and drivers.', cta: 'Check My ZIP' },
]

type SectionKey = 'dashboard' | 'audience' | 'campaigns' | 'adstudio' | 'plans'

export function MarketingPortal({ user, onToast }: { user: AuthUser; onToast: (m: string) => void }) {
  const [section, setSection] = useState<SectionKey>('dashboard')
  const [contacts, setContacts] = useState<MarketingContact[]>([])
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([])
  const [connections, setConnections] = useState<MarketingConnection[]>([])
  const [plan, setPlan] = useState<MarketingPlanId>('starter')
  const [sellerList, setSellerList] = useState<Seller[]>([])
  // SteelBox Co. HQ (blank-sellerId admin) manages marketing ON BEHALF of a
  // reseller: everything below is scoped to the picked reseller, and
  // campaigns HQ creates are stamped managedBy='hq'.
  const isHq = user.role === 'admin' && !user.sellerId
  const [actingFor, setActingFor] = useState('sel_mvp')
  const behalfOf = isHq ? actingFor : undefined
  const reload = useCallback(() => {
    marketingApi.contacts().then(setContacts).catch(() => {})
    marketingApi.campaigns().then(setCampaigns).catch(() => {})
    marketingApi.connections().then(setConnections).catch(() => {})
    marketingApi.plan(isHq ? actingFor : undefined).then(p => setPlan(p.plan)).catch(() => {})
  }, [isHq, actingFor])
  useEffect(() => { reload(); sellersApi.list().then(setSellerList).catch(() => {}) }, [reload])
  // HQ receives every reseller's rows — narrow to the one being managed.
  const forActing = <T extends { sellerId: string }>(rows: T[]): T[] =>
    isHq ? rows.filter(r => (r.sellerId || 'sel_mvp') === actingFor) : rows
  const visContacts = forActing(contacts)
  const visCampaigns = forActing(campaigns)
  const visConnections = forActing(connections)
  const sellerName = sellerList.find(s => s.id === (isHq ? actingFor : user.sellerId))?.name || 'National SteelBox'

  const [builderOpen, setBuilderOpen] = useState(false)
  const [reportFor, setReportFor] = useState<MarketingCampaign | null>(null)

  const sent = visCampaigns.filter(c => c.status !== 'draft')
  const totSpend = sent.reduce((a, c) => a + c.spend, 0)
  const totRevenue = sent.reduce((a, c) => a + c.revenue, 0)
  const totDelivered = sent.reduce((a, c) => a + c.delivered, 0)
  const totOpens = sent.reduce((a, c) => a + c.opens, 0)
  const totClicks = sent.reduce((a, c) => a + c.clicks, 0)

  const SECTIONS: Array<{ key: SectionKey; label: string }> = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'audience', label: `Audience (${visContacts.length})` },
    { key: 'campaigns', label: `Campaigns (${visCampaigns.length})` },
    { key: 'adstudio', label: 'Ad Studio' },
    { key: 'plans', label: 'Integrations & Plans' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>Marketing</h1>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
            {isHq ? (
              <>
                <span style={{ fontWeight: 700, color: 'var(--ink2)' }}>National SteelBox HQ</span>
                <span>managing on behalf of</span>
                <select value={actingFor} onChange={e => setActingFor(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', fontSize: '12px', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', outline: 'none', background: 'var(--surf-w)' }}>
                  {sellerList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <span>· {PLANS.find(p => p.id === plan)?.name} plan</span>
              </>
            ) : (
              <span>{sellerName} · {PLANS.find(p => p.id === plan)?.name} plan</span>
            )}
          </div>
        </div>
        <Button variant="primary" onClick={() => setBuilderOpen(true)}>+ New Campaign</Button>
      </div>

      {/* Section nav — text-only, mirrors the portal strip styling */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid var(--div)', margin: '10px 0 18px', overflowX: 'auto' }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)} style={{
            padding: '9px 14px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
            background: 'transparent', color: section === s.key ? 'var(--primary)' : 'var(--ink3)',
            borderBottom: section === s.key ? '2.5px solid var(--primary)' : '2.5px solid transparent', marginBottom: '-2px',
          }}>{s.label}</button>
        ))}
      </div>

      {section === 'dashboard' && (
        <Dashboard sent={sent} contacts={visContacts} totSpend={totSpend} totRevenue={totRevenue}
          totDelivered={totDelivered} totOpens={totOpens} totClicks={totClicks} onReport={setReportFor} />
      )}
      {section === 'audience' && <Audience contacts={visContacts} behalfOf={behalfOf} onChanged={reload} onToast={onToast} />}
      {section === 'campaigns' && (
        <Campaigns campaigns={visCampaigns} onChanged={reload} onToast={onToast} onReport={setReportFor} onNew={() => setBuilderOpen(true)} />
      )}
      {section === 'adstudio' && <AdStudio sellerName={sellerName} behalfOf={behalfOf} onSaved={() => { reload(); setSection('campaigns') }} onToast={onToast} />}
      {section === 'plans' && (
        <PlansAndIntegrations plan={plan} connections={visConnections} behalfOf={behalfOf} onToast={onToast}
          onPlan={p => marketingApi.setPlan(p, behalfOf).then(() => { setPlan(p); onToast(`Marketing plan switched to ${PLANS.find(x => x.id === p)?.name}`) }).catch(e => onToast(e.message))}
          onChanged={reload} />
      )}

      <CampaignBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} contacts={visContacts} behalfOf={behalfOf}
        onSaved={(launched) => { setBuilderOpen(false); reload(); setSection('campaigns'); onToast(launched ? 'Campaign launched' : 'Campaign saved as draft') }}
        onToast={onToast} />
      <CampaignReport campaign={reportFor} onClose={() => setReportFor(null)} />
    </div>
  )
}

// ── Dashboard — cross-campaign analytics ───────────────────
function Dashboard({ sent, contacts, totSpend, totRevenue, totDelivered, totOpens, totClicks, onReport }: {
  sent: MarketingCampaign[]; contacts: MarketingContact[]
  totSpend: number; totRevenue: number; totDelivered: number; totOpens: number; totClicks: number
  onReport: (c: MarketingCampaign) => void
}) {
  const roi = totSpend > 0 ? `${(totRevenue / totSpend).toFixed(1)}×` : '—'
  const byRevenue = [...sent].sort((a, b) => b.revenue - a.revenue)
  const maxRev = Math.max(...byRevenue.map(c => c.revenue), 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
        <Tile label="Contacts" value={String(contacts.length)} sub={`${contacts.filter(c => c.consent).length} opted in`} />
        <Tile label="Campaigns live" value={String(sent.length)} sub={`${sent.filter(c => c.status === 'running').length} running now`} />
        <Tile label="Reached" value={totDelivered.toLocaleString()} sub={`${totOpens.toLocaleString()} opens · ${pct(totOpens, totDelivered)}`} />
        <Tile label="Clicks" value={totClicks.toLocaleString()} sub={`${pct(totClicks, totOpens)} of opens`} />
        <Tile label="Attributed revenue" value={money(totRevenue)} sub={`${money(totSpend)} spend · ${roi} return`} />
      </div>
      <div style={{ background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r12, 12px)', padding: '14px 16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: '8px' }}>Revenue by campaign</div>
        {byRevenue.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Launch your first campaign to see attributed revenue here.</div>}
        {byRevenue.map(c => (
          <div key={c.id} onClick={() => onReport(c)} style={{ cursor: 'pointer' }} title="Open campaign report">
            <BarRow label={c.name} value={c.revenue} max={maxRev} fmt={money} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Audience — CSV upload + contact table ──────────────────
function Audience({ contacts, behalfOf, onChanged, onToast }: { contacts: MarketingContact[]; behalfOf?: string; onChanged: () => void; onToast: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const zip3 = useMemo(() => {
    const m = new Map<string, number>()
    contacts.forEach(c => { const p = (c.zip || '').slice(0, 3); if (p.length === 3) m.set(p, (m.get(p) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [contacts])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      const rows = mapCsvContacts(parseCsv(await f.text()))
      if (!rows.length) { onToast('No contact rows found — the first line must be a header (name, email, …)'); return }
      const res = await marketingApi.importContacts(rows, 'csv', behalfOf)
      onToast(`Imported ${res.imported} contact${res.imported === 1 ? '' : 's'} (${res.skipped} skipped as duplicate/invalid) — ${res.total} total`)
      onChanged()
    } catch (e) { onToast((e as Error).message) } finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: '-2px' }}><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
          {busy ? 'Importing…' : 'Upload customer CSV'}
        </Button>
        <span style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>
          Header row with any of: name (or first/last), email, phone, zip, city, state. Duplicates skipped by email.
        </span>
      </div>
      {zip3.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ink3)' }}>By ZIP zone</span>
          {zip3.map(([p, n]) => (
            <span key={p} style={{ padding: '3px 10px', borderRadius: 'var(--pill)', border: '1.5px solid var(--div)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--mono)' }}>{p}xx · {n}</span>
          ))}
        </div>
      )}
      <div style={{ background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r12, 12px)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: 'var(--surf1)' }}>
                {['Name', 'Email', 'ZIP', 'City', 'Tags', 'Source', 'Opt-in', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--div)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.name || '—'}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: '11.5px' }}>{c.email}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)' }}>{c.zip || '—'}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{c.city ? `${c.city}, ${c.state}` : '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{(c.tags || []).map(t => (
                    <span key={t} style={{ padding: '1px 7px', marginRight: '4px', borderRadius: 'var(--pill)', background: 'var(--primary-cont, #E3F0FF)', color: 'var(--primary)', fontSize: '10px', fontWeight: 700 }}>{t}</span>
                  ))}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{c.source}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <button title={c.consent ? 'Opted in — click to opt out' : 'Opted out — click to opt back in'}
                      onClick={() => marketingApi.updateContact(c.id, { consent: !c.consent }).then(onChanged).catch(e => onToast(e.message))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12px', padding: '2px 4px', color: c.consent ? 'var(--green)' : '#B3261E' }}>
                      {c.consent ? '\u2713 In' : '\u2715 Out'}
                    </button>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <button title="Remove contact" onClick={() => marketingApi.removeContact(c.id).then(onChanged).catch(e => onToast(e.message))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: '2px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '22px', textAlign: 'center', color: 'var(--ink3)' }}>No contacts yet — upload your customer CSV to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Campaigns list ─────────────────────────────────────────
function Campaigns({ campaigns, onChanged, onToast, onReport, onNew }: {
  campaigns: MarketingCampaign[]; onChanged: () => void; onToast: (m: string) => void
  onReport: (c: MarketingCampaign) => void; onNew: () => void
}) {
  const ordered = [...campaigns].sort((a, b) => (b.sentAt || b.createdAt).localeCompare(a.sentAt || a.createdAt))
  const launch = (c: MarketingCampaign) =>
    marketingApi.launchCampaign(c.id).then(r => { onToast(`${r.name} launched to ${r.audienceCount.toLocaleString()} ${r.type === 'ad' ? 'estimated reach' : 'contacts'}`); onChanged() }).catch(e => onToast(e.message))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {ordered.length === 0 && (
        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ink3)', border: '1.5px dashed var(--div)', borderRadius: 'var(--r12, 12px)' }}>
          No campaigns yet. <button onClick={onNew} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: 'inherit' }}>Create your first one</button>.
        </div>
      )}
      {ordered.map(c => (
        <div key={c.id} style={{ background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r12, 12px)', padding: '12px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{c.name}</span>
              <StatusPill status={c.status} />
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{TYPE_LABEL[c.type]}{c.platform ? ` · ${c.platform}` : ''}</span>
              {c.managedBy === 'hq' && <span title="Run by National SteelBox on this reseller's behalf" style={{ padding: '2px 8px', borderRadius: 'var(--pill)', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.5px', background: '#FCE7F3', color: '#9D174D' }}>HQ-MANAGED</span>}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '3px' }}>
              {c.audienceKind === 'zip' ? `ZIP zones ${c.zipPrefixes.map(p => `${p}xx`).join(', ')}` : 'Whole list'}
              {c.sentAt ? ` · ${c.status === 'running' ? 'started' : 'sent'} ${new Date(c.sentAt).toLocaleDateString()}` : ' · draft'}
            </div>
          </div>
          {c.status !== 'draft' && (
            <div style={{ display: 'flex', gap: '16px', fontFamily: 'var(--mono)', fontSize: '12px', flexWrap: 'wrap' }}>
              <span title="Delivered / reach">{c.delivered.toLocaleString()} <span style={{ color: 'var(--ink3)' }}>reach</span></span>
              <span title="Open / view rate">{pct(c.opens, c.delivered)} <span style={{ color: 'var(--ink3)' }}>open</span></span>
              <span title="Clicks">{c.clicks.toLocaleString()} <span style={{ color: 'var(--ink3)' }}>clicks</span></span>
              <span title="Attributed revenue vs spend" style={{ fontWeight: 700 }}>{money(c.revenue)} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>rev</span></span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            {c.status === 'draft' && <Button size="sm" variant="primary" onClick={() => launch(c)}>Launch</Button>}
            {c.status !== 'draft' && <Button size="sm" variant="ghost" onClick={() => onReport(c)}>Report</Button>}
            <button title="Delete campaign" onClick={() => marketingApi.removeCampaign(c.id).then(onChanged).catch(e => onToast(e.message))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: '4px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" /></svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Campaign builder ───────────────────────────────────────
function CampaignBuilder({ open, onClose, contacts, behalfOf, onSaved, onToast }: {
  open: boolean; onClose: () => void; contacts: MarketingContact[]; behalfOf?: string
  onSaved: (launched: boolean) => void; onToast: (m: string) => void
}) {
  const [type, setType] = useState<'email' | 'social' | 'ad'>('email')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [platform, setPlatform] = useState('facebook')
  const [cta, setCta] = useState('Shop Inventory')
  const [audienceKind, setAudienceKind] = useState<'all' | 'zip'>('all')
  const [zipPrefixes, setZipPrefixes] = useState('')
  const [budget, setBudget] = useState('150')
  const [busy, setBusy] = useState(false)

  const prefixes = zipPrefixes.split(/[,\s]+/).map(z => z.replace(/\D/g, '').slice(0, 3)).filter(z => z.length === 3)
  const matched = audienceKind === 'zip' && prefixes.length
    ? contacts.filter(c => prefixes.some(p => (c.zip || '').startsWith(p)))
    : contacts
  const optedIn = matched.filter(c => c.consent).length
  const estCost = type === 'email' ? Math.max(25, Math.round(optedIn * 0.02)) : type === 'social' ? 15 : Number(budget) || 0

  const save = async (launch: boolean) => {
    if (!name.trim()) { onToast('Give the campaign a name'); return }
    setBusy(true)
    try {
      const draft = await marketingApi.createCampaign({
        name, type, subject, content, cta,
        platform: type === 'email' ? '' : platform,
        audienceKind, zipPrefixes: prefixes, budget: type === 'ad' ? Number(budget) || 0 : 0,
        ...(behalfOf ? { sellerId: behalfOf } : {}),
      })
      if (launch) await marketingApi.launchCampaign(draft.id)
      setName(''); setSubject(''); setContent(''); setZipPrefixes('')
      onSaved(launch)
    } catch (e) { onToast((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 14px' }}>New Campaign</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['email', 'social', 'ad'] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, padding: '9px 0', borderRadius: 'var(--r8)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, fontFamily: 'inherit',
              border: `1.5px solid ${type === t ? 'var(--primary)' : 'var(--div)'}`,
              background: type === t ? 'var(--primary-cont, #E3F0FF)' : 'var(--surf-w)',
              color: type === t ? 'var(--primary)' : 'var(--ink2)',
            }}>{TYPE_LABEL[t]}</button>
          ))}
        </div>
        <Input label="Campaign name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Labor Day 20ft specials" />
        {type === 'email' && <Input label="Email subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="20ft one-trip specials — this week only" />}
        {type !== 'email' && (
          <Select label="Platform" value={platform} onChange={e => setPlatform(e.target.value)}>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            {type === 'ad' && <option value="google">Google Ads</option>}
          </Select>
        )}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>
            {type === 'email' ? 'Email body' : 'Post / ad copy'}
          </label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
            placeholder={type === 'email' ? 'Hi {{firstName}}, graded units from $2,150 delivered to {{zip}}…' : 'Fresh drop: 12 one-trip 40HCs just hit the yard…'}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          {type === 'email' && <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginTop: '3px' }}>Merge tags: {'{{firstName}}'} and {'{{zip}}'} personalize each send.</div>}
        </div>
        <Input label="Call to action" value={cta} onChange={e => setCta(e.target.value)} />
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Audience</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setAudienceKind('all')} style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--r8)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${audienceKind === 'all' ? 'var(--primary)' : 'var(--div)'}`, background: audienceKind === 'all' ? 'var(--primary-cont, #E3F0FF)' : 'var(--surf-w)', color: audienceKind === 'all' ? 'var(--primary)' : 'var(--ink2)' }}>Whole list</button>
            <button onClick={() => setAudienceKind('zip')} style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--r8)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${audienceKind === 'zip' ? 'var(--primary)' : 'var(--div)'}`, background: audienceKind === 'zip' ? 'var(--primary-cont, #E3F0FF)' : 'var(--surf-w)', color: audienceKind === 'zip' ? 'var(--primary)' : 'var(--ink2)' }}>Target ZIP zones</button>
          </div>
          {audienceKind === 'zip' && (
            <input value={zipPrefixes} onChange={e => setZipPrefixes(e.target.value)} placeholder="3-digit prefixes, e.g. 700, 770, 775"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: '7px', padding: '8px 10px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '12.5px', fontFamily: 'var(--mono)', outline: 'none' }} />
          )}
        </div>
        {type === 'ad' && <Input label="Total ad budget ($)" type="number" value={budget} onChange={e => setBudget(e.target.value)} />}
        <div style={{ padding: '10px 12px', borderRadius: 'var(--r8)', background: 'var(--surf1)', fontSize: '12px', lineHeight: 1.55 }}>
          {type === 'ad'
            ? <>Estimated reach scales with budget (~200 people per $1). <strong>Cost: {money(estCost)}</strong></>
            : <>Sends to <strong>{optedIn.toLocaleString()}</strong> opted-in contact{optedIn === 1 ? '' : 's'}{audienceKind === 'zip' && prefixes.length ? ` in ${prefixes.map(p => `${p}xx`).join(', ')}` : ''}. <strong>Cost: {money(estCost)}</strong></>}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => save(false)} disabled={busy}>Save Draft</Button>
          <Button variant="primary" onClick={() => save(true)} disabled={busy}>{busy ? 'Working…' : 'Launch Now'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Per-campaign report ────────────────────────────────────
function CampaignReport({ campaign, onClose }: { campaign: MarketingCampaign | null; onClose: () => void }) {
  const c = campaign
  const steps = c ? [
    { label: c.type === 'ad' ? 'Impressions' : 'Delivered', value: c.delivered },
    { label: c.type === 'ad' ? 'Viewed' : 'Opened', value: c.opens },
    { label: 'Clicked', value: c.clicks },
    { label: 'Purchased', value: c.conversions },
  ] : []
  const max = Math.max(...steps.map(s => s.value), 0)
  return (
    <Modal open={!!c} onClose={onClose} maxWidth={520}>
      {c && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{c.name}</h2>
            <StatusPill status={c.status} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', margin: '4px 0 14px' }}>
            {TYPE_LABEL[c.type]}{c.platform ? ` · ${c.platform}` : ''} · {c.audienceKind === 'zip' ? `ZIP zones ${c.zipPrefixes.map(p => `${p}xx`).join(', ')}` : 'whole list'}
            {c.sentAt && ` · ${new Date(c.sentAt).toLocaleString()}`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
            <Tile label="Spend" value={money(c.spend)} />
            <Tile label="Revenue" value={money(c.revenue)} sub={`${c.conversions} orders`} />
            <Tile label="Return" value={c.spend > 0 ? `${(c.revenue / c.spend).toFixed(1)}×` : '—'} />
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>Funnel</div>
          {steps.map(s => <BarRow key={s.label} label={s.label} value={s.value} max={max} fmt={n => n.toLocaleString()} />)}
          {c.type === 'email' && c.unsubs > 0 && (
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '8px' }}>{c.unsubs} unsubscribed ({pct(c.unsubs, c.delivered)}).</div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Ad Studio — social ad composer with live preview ───────
function AdStudio({ sellerName, behalfOf, onSaved, onToast }: { sellerName: string; behalfOf?: string; onSaved: () => void; onToast: (m: string) => void }) {
  const [platform, setPlatform] = useState('facebook')
  const [headline, setHeadline] = useState(AD_IDEAS[0].headline)
  const [copy, setCopy] = useState(AD_IDEAS[0].body.replace('{{seller}}', sellerName))
  const [cta, setCta] = useState(AD_IDEAS[0].cta)
  const [ideaIdx, setIdeaIdx] = useState(0)
  const [busy, setBusy] = useState(false)

  const suggest = () => {
    const next = (ideaIdx + 1) % AD_IDEAS.length
    setIdeaIdx(next)
    setHeadline(AD_IDEAS[next].headline)
    setCopy(AD_IDEAS[next].body.replace('{{seller}}', sellerName))
    setCta(AD_IDEAS[next].cta)
  }
  const saveDraft = async () => {
    setBusy(true)
    try {
      await marketingApi.createCampaign({
        name: `${platform[0].toUpperCase()}${platform.slice(1)} ad — ${headline.slice(0, 40)}`,
        type: 'ad', platform, subject: headline, content: copy, cta, budget: 150, audienceKind: 'all',
        ...(behalfOf ? { sellerId: behalfOf } : {}),
      })
      onToast('Ad saved as a draft campaign — launch it from Campaigns')
      onSaved()
    } catch (e) { onToast((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '18px', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Select label="Platform" value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="facebook">Facebook feed</option>
          <option value="instagram">Instagram feed</option>
          <option value="google">Google display</option>
        </Select>
        <Input label="Headline" value={headline} onChange={e => setHeadline(e.target.value)} />
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Ad copy</label>
          <textarea value={copy} onChange={e => setCopy(e.target.value)} rows={4}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
        </div>
        <Input label="Button text" value={cta} onChange={e => setCta(e.target.value)} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="ghost" onClick={suggest}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: '-2px' }}><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" /></svg>
            Suggest copy
          </Button>
          <Button variant="primary" onClick={saveDraft} disabled={busy}>{busy ? 'Saving…' : 'Save as draft campaign'}</Button>
        </div>
      </div>
      {/* Live preview — a neutral mock of a feed placement */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '7px' }}>Preview</div>
        <div style={{ maxWidth: '380px', background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r12, 12px)', overflow: 'hidden', boxShadow: '0 4px 14px rgba(26,28,46,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 12px' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '13px' }}>{sellerName.slice(0, 1)}</span>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700 }}>{sellerName}</div>
              <div style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>Sponsored · {platform === 'google' ? 'Display network' : platform === 'instagram' ? 'Instagram' : 'Facebook'}</div>
            </div>
          </div>
          <div style={{ padding: '0 12px 9px', fontSize: '12.5px', lineHeight: 1.5 }}>{copy}</div>
          <div style={{ background: 'linear-gradient(135deg,#CBD5E8,#A8BFDF)', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="140" height="52" viewBox="0 0 160 60" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round">
              <rect x="4" y="10" width="152" height="44" rx="2" />
              <line x1="34" y1="10" x2="34" y2="54" /><line x1="64" y1="10" x2="64" y2="54" />
              <line x1="94" y1="10" x2="94" y2="54" /><line x1="124" y1="10" x2="124" y2="54" />
            </svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', background: 'var(--surf1)' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, minWidth: 0 }}>{headline}</span>
            <span style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 'var(--r8)', background: 'var(--cta)', color: '#fff', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{cta}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Integrations + plans ───────────────────────────────────
function PlansAndIntegrations({ plan, connections, behalfOf, onPlan, onChanged, onToast }: {
  plan: MarketingPlanId; connections: MarketingConnection[]; behalfOf?: string
  onPlan: (p: MarketingPlanId) => void; onChanged: () => void; onToast: (m: string) => void
}) {
  const [keyFor, setKeyFor] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const connOf = (pid: string) => connections.find(c => c.provider === pid)
  const connect = async () => {
    if (!keyFor) return
    try {
      await marketingApi.connect(keyFor, apiKey, behalfOf)
      onToast(`${PROVIDERS.find(p => p.id === keyFor)?.name} connected`)
      setKeyFor(null); setApiKey(''); onChanged()
    } catch (e) { onToast((e as Error).message) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: '8px' }}>Plans</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: '10px' }}>
          {PLANS.map(p => (
            <div key={p.id} style={{ background: 'var(--surf-w)', border: `1.5px solid ${plan === p.id ? 'var(--primary)' : 'var(--div)'}`, borderRadius: 'var(--r12, 12px)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '15px', fontWeight: 800 }}>{p.name}</span>
                <span style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--mono)' }}>{p.price}</span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)', lineHeight: 1.45 }}>{p.blurb}</div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '11.5px', color: 'var(--ink2)', lineHeight: 1.6 }}>
                {p.features.map(f => <li key={f}>{f}</li>)}
              </ul>
              <div style={{ marginTop: 'auto' }}>
                {plan === p.id
                  ? <span style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 'var(--pill)', background: 'var(--primary-cont, #E3F0FF)', color: 'var(--primary)', fontSize: '11.5px', fontWeight: 700 }}>Current plan</span>
                  : <Button size="sm" variant="ghost" onClick={() => onPlan(p.id)}>Switch to {p.name}</Button>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--ink3)' }}>
          Per-send rates on every plan: {SEND_RATES.map(r => `${r.label} — ${r.cost}`).join(' · ')}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: '8px' }}>Integrations</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: '10px' }}>
          {PROVIDERS.map(p => {
            const conn = connOf(p.id)
            return (
              <div key={p.id} style={{ background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r12, 12px)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{p.kind}</div>
                  {conn && <div style={{ fontSize: '10.5px', fontFamily: 'var(--mono)', color: 'var(--green)', marginTop: '2px' }}>✓ {conn.apiKeyMasked || 'connected'}</div>}
                </div>
                {conn
                  ? <Button size="sm" variant="ghost" onClick={() => marketingApi.disconnect(conn.id).then(() => { onToast(`${p.name} disconnected`); onChanged() }).catch(e => onToast(e.message))}>Disconnect</Button>
                  : <Button size="sm" variant="primary" onClick={() => { setKeyFor(p.id); setApiKey('') }}>Connect</Button>}
              </div>
            )
          })}
        </div>
      </div>
      <Modal open={!!keyFor} onClose={() => setKeyFor(null)} maxWidth={420}>
        <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 6px' }}>Connect {PROVIDERS.find(p => p.id === keyFor)?.name}</h2>
        <p style={{ fontSize: '12.5px', color: 'var(--ink3)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Paste the API key from your {PROVIDERS.find(p => p.id === keyFor)?.name} account. Only a masked fingerprint is stored.
        </p>
        <Input label="API key" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste key…" />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <Button variant="ghost" onClick={() => setKeyFor(null)}>Cancel</Button>
          <Button variant="primary" onClick={connect} disabled={!apiKey.trim()}>Connect</Button>
        </div>
      </Modal>
    </div>
  )
}
