// ============================================================
// SteelBox Field App — Mobile web app for drivers + inspectors
// Route: /field (role: driver | employee)
// Design source: Field App.dc.html
// Responsive web route — no Expo required
// ============================================================

import React, { useState, useRef, useEffect } from 'react'
import { useSnackbar, useAuth } from '../../hooks'
import { Snackbar } from '../../components/ui'
import { activity, depots as depotsApi, drivers as driversApi, schedule as scheduleApi, containers as containersApi, availability as availabilityApi, messages as messagesApi, customers as customersApi, orders as ordersApi, parseTrucks, parseWorkHours, encodeWorkHours, photoUrl, fileToDataUrl, type ActivityEvent, type Depot, type Driver, type SchedJob, type DayHours, type Availability, type Message, type Customer, type Container, type Order } from '../../lib/api'

// Fallback driver when an admin opens the field app (admin accounts have no
// linked driver record). Driver logins use their own drivers.csv row.
const FALLBACK_DRIVER_ID = 'drv_01'
const ACTOR = 'Mike Torres'
// Company dispatch identity for driver ⇄ admin messaging (single place to change).
const DISPATCH = { name: 'Dispatch (James R.)', email: 'ops@steelbox.co' }

// ── Stroke icons (match the admin portal's simple iconography) ──
const ICON_PATHS: Record<string, React.ReactNode> = {
  home:   <><rect x="2" y="2" width="7" height="7" rx="1.5" /><rect x="11" y="2" width="7" height="7" rx="1.5" /><rect x="2" y="11" width="7" height="7" rx="1.5" /><rect x="11" y="11" width="7" height="7" rx="1.5" /></>,
  truck:  <><rect x="1" y="6" width="11" height="9" rx="1.5" /><path d="M12 9h4l3 3v3h-7V9z" /><circle cx="5" cy="16.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="16.5" r="1.5" fill="currentColor" stroke="none" /></>,
  box:    <><rect x="2" y="6" width="16" height="11" rx="1.5" /><path d="M2 9h16" /><path d="M8 6v11" /></>,
  camera: <><path d="M2 7h2.5L6 5h8l1.5 2H18a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V8a1 1 0 011-1z" /><circle cx="10" cy="11" r="3" /></>,
  calendar: <><rect x="2" y="4" width="16" height="14" rx="2" /><line x1="2" y1="8.5" x2="18" y2="8.5" /><line x1="7" y1="2" x2="7" y2="6" /><line x1="13" y1="2" x2="13" y2="6" /></>,
  pin:    <><path d="M10 2a5.5 5.5 0 0 0-5.5 5.5c0 4 5.5 10 5.5 10s5.5-6 5.5-10A5.5 5.5 0 0 0 10 2z" /><circle cx="10" cy="7.5" r="1.8" /></>,
  phone:  <><path d="M6.5 2h7a1 1 0 011 1v14a1 1 0 01-1 1h-7a1 1 0 01-1-1V3a1 1 0 011-1z" /><line x1="9" y1="15.5" x2="11" y2="15.5" /></>,
  sms:    <><path d="M3 4h14a1 1 0 011 1v8a1 1 0 01-1 1H8l-4 3v-3H3a1 1 0 01-1-1V5a1 1 0 011-1z" /></>,
  check:  <><polyline points="3,10.5 8,16 17,5" /></>,
  pen:    <><path d="M13.5 3.5l3 3L7 16H4v-3z" /><path d="M12 5l3 3" /></>,
  receipt: <><path d="M5 2h10v16l-2.5-1.5L10 18l-2.5-1.5L5 18z" /><line x1="8" y1="6.5" x2="12" y2="6.5" /><line x1="8" y1="9.5" x2="12" y2="9.5" /></>,
  user:   <><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></>,
  star:   <><path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z" /></>,
  arrow:  <><polyline points="8,4 14,10 8,16" /></>,
  ret:    <><path d="M8 4L4 8l4 4" /><path d="M4 8h9a4 4 0 0 1 4 4v2" /></>,
  alert:  <><path d="M10 2.5L1.5 17.5h17L10 2.5z" /><line x1="10" y1="8" x2="10" y2="12" /><circle cx="10" cy="14.6" r="0.5" fill="currentColor" stroke="none" /></>,
  refresh: <><path d="M15.5 6.5A6.5 6.5 0 1 0 17 11" /><polyline points="16 2.5 16 6.5 12 6.5" /></>,
  inbox: <><path d="M2.5 11.5 5 4h10l2.5 7.5v4a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /><path d="M2.5 11.5H7l1 2h4l1-2h4.5" /></>,
  trash: <><polyline points="3 5.5 17 5.5" /><path d="M5.5 5.5 6.5 17h7l1-11.5" /><path d="M8 5.5V3h4v2.5" /></>,
}
function Icon({ name, size = 18, color = 'currentColor', sw = 1.6 }: { name: string; size?: number; color?: string; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{ICON_PATHS[name]}</svg>
}

// ── Job model + workflows ─────────────────────────────────

type JobKind = 'pickup' | 'delivery' | 'return'
interface Job {
  id: string
  kind: JobKind
  dest?: 'depot' | 'customer'   // delivery only
  sku: string
  containerId: string
  depotId?: string              // pickup source depot OR delivery destination depot
  originDepotId?: string        // delivery-from-depot origin
  customer?: string
  contact?: string
  address?: string
  email?: string
  time: string
}

// Schedule entry types (shared with admin) + a minutes formatter.
const SCHED_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  pickup:   { label: 'Pickup',   color: '#E65100', bg: '#FFE0CC' },
  delivery: { label: 'Delivery', color: '#0057B8', bg: '#EEF2FF' },
  return:   { label: 'Return',   color: '#6D28D9', bg: '#EDE9FE' },
  transfer: { label: 'Transfer', color: '#B45309', bg: '#FEF3C7' },
}
const fmtMin = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60, ap = h < 12 ? 'AM' : 'PM', hh = ((h + 11) % 12) + 1; return `${hh}:${String(mm).padStart(2, '0')} ${ap}` }

const KIND_META: Record<JobKind, { label: string; icon: string; color: string; bg: string }> = {
  pickup:   { label: 'Pickup',   icon: 'box',   color: '#E65100', bg: '#FFE0CC' },
  delivery: { label: 'Delivery', icon: 'truck', color: '#0057B8', bg: '#EEF2FF' },
  return:   { label: 'Return',   icon: 'ret',   color: '#6D28D9', bg: '#EDE9FE' },
}

// A step: an action key + label. `photos1`/`photos12` gate on captures;
// `signature`/`receipt`/`sms` run inline side effects.
type StepKey = 'travel' | 'arrive' | 'load' | 'photos12' | 'unload' | 'drop' | 'sms' | 'signature' | 'photo1' | 'score' | 'receipt' | 'complete'
interface FlowStep { key: StepKey; label: string; detail?: string; cta: string }

function stepsFor(job: Job): FlowStep[] {
  if (job.kind === 'pickup') return [
    { key: 'travel',   label: 'Travel to depot',        detail: 'Check in with the lot attendant', cta: 'On my way' },
    { key: 'arrive',   label: 'Arrived at depot',       cta: 'Arrived' },
    { key: 'load',     label: 'Load container',         detail: 'Secure the unit on the trailer', cta: 'Loaded' },
    { key: 'photos12', label: 'Photo documentation',    detail: `${PHOTO_TARGET} photos required`, cta: 'Open Photo Session' },
    { key: 'score',    label: 'Score condition',        detail: 'Rate the unit 1–5', cta: 'Save Score' },
    { key: 'complete', label: 'Pickup complete',        cta: 'Finish Pickup' },
  ]
  if (job.kind === 'delivery' && job.dest === 'depot') return [
    { key: 'travel',   label: 'Depart origin depot',    cta: 'On my way' },
    { key: 'arrive',   label: 'Arrived at destination', cta: 'Arrived' },
    { key: 'drop',     label: 'Drop container in yard', detail: 'No customer contact', cta: 'Dropped' },
    { key: 'complete', label: 'Transfer complete',      cta: 'Finish Transfer' },
  ]
  if (job.kind === 'delivery') return [
    { key: 'sms',       label: 'Text customer ETA',      detail: 'On-the-way notification', cta: 'Send SMS' },
    { key: 'arrive',    label: 'Arrived on site',        cta: 'Arrived' },
    { key: 'unload',    label: 'Unload container',       cta: 'Unloaded' },
    { key: 'photo1',    label: 'Proof-of-delivery photo', detail: '1 photo after unload', cta: 'Capture Photo' },
    { key: 'signature', label: 'Customer signature',     detail: 'After photo', cta: 'Capture Signature' },
    { key: 'receipt',   label: 'Email receipt',          detail: 'PDF to customer + admin', cta: 'Send Receipt' },
    { key: 'complete',  label: 'Delivery complete',      cta: 'Finish Delivery' },
  ]
  // return
  return [
    { key: 'travel',    label: 'Travel to customer',     cta: 'On my way' },
    { key: 'arrive',    label: 'Arrived on site',        cta: 'Arrived' },
    { key: 'photo1',    label: 'Photograph returned unit', detail: '1 condition photo', cta: 'Capture Photo' },
    { key: 'score',     label: 'Score condition',        detail: 'Rate the returned unit 1–5', cta: 'Save Score' },
    { key: 'signature', label: 'Customer signature',     cta: 'Capture Signature' },
    { key: 'receipt',   label: 'Email receipt',          detail: 'PDF to customer + admin', cta: 'Send Receipt' },
    { key: 'complete',  label: 'Return complete',        cta: 'Finish Return' },
  ]
}

// Human-readable labels + colors for activity types.
const ACTIVITY_META: Record<string, { label: string; color: string; bg: string }> = {
  arrived:          { label: 'Arrived',          color: '#E65100', bg: '#FFE0CC' },
  photos_started:   { label: 'Photos started',   color: '#0057B8', bg: '#EEF2FF' },
  photos_submitted: { label: 'Photos submitted', color: '#1B7A5A', bg: '#B7F0DA' },
  pickup_complete:  { label: 'Pickup complete',  color: '#1B7A5A', bg: '#B7F0DA' },
  delivery_complete:{ label: 'Delivery complete', color: '#0057B8', bg: '#EEF2FF' },
  return_complete:  { label: 'Return complete',  color: '#6D28D9', bg: '#EDE9FE' },
  sms_sent:         { label: 'SMS sent',         color: '#0057B8', bg: '#EEF2FF' },
  signature:        { label: 'Signature',        color: '#1B7A5A', bg: '#B7F0DA' },
  receipt_sent:     { label: 'Receipt sent',     color: '#7B4F00', bg: '#FFF8E1' },
  event:            { label: 'Event',            color: '#44475A', bg: '#EEF2FF' },
}

const fmtTime = (iso: string) => { const d = new Date(iso); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }

// ── Types ─────────────────────────────────────────────────

type Screen = 'dashboard' | 'jobs' | 'flow' | 'camera' | 'review' | 'success' | 'schedule' | 'inbox'

interface PhotoShot {
  id: number
  group: 'exterior' | 'interior'
  label: string
  required: boolean
  done: boolean
  url?: string       // uploaded photo URL (API-relative) once captured
  tip: string
}

// ── Photo checklist — the 12-shot standard ────────────────
// Every container gets exactly these 12 labelled photos.

const PHOTO_TARGET = 12

const SHOT_LIST: PhotoShot[] = [
  // Exterior
  { id: 1,  group: 'exterior', label: 'Front doors closed',        required: true, done: false, tip: 'Center the doors. Capture full door height.' },
  { id: 2,  group: 'exterior', label: 'Front doors open',          required: true, done: false, tip: 'Open both doors fully. Capture the inside threshold.' },
  { id: 3,  group: 'exterior', label: 'Right hand side',           required: true, done: false, tip: 'Step back to frame the complete right side panel.' },
  { id: 4,  group: 'exterior', label: 'Back',                      required: true, done: false, tip: 'Frame the entire rear panel end-on.' },
  { id: 5,  group: 'exterior', label: 'Left hand side',            required: true, done: false, tip: 'Step back to frame the complete left side panel.' },
  { id: 6,  group: 'exterior', label: 'SKU sticker — outside door', required: true, done: false, tip: 'Close-up of the SKU sticker on the exterior door. Must be legible.' },
  // Interior
  { id: 7,  group: 'interior', label: 'Inside back',              required: true, done: false, tip: 'Stand at the doors. Capture the full back wall.' },
  { id: 8,  group: 'interior', label: 'Inside right',             required: true, done: false, tip: 'Capture the full right interior wall.' },
  { id: 9,  group: 'interior', label: 'Inside left',              required: true, done: false, tip: 'Capture the full left interior wall.' },
  { id: 10, group: 'interior', label: 'Inside ceiling',          required: true, done: false, tip: 'Point up. Capture the full ceiling / roof panel.' },
  { id: 11, group: 'interior', label: 'Inside floor',            required: true, done: false, tip: 'Show the full floor surface including corners.' },
  { id: 12, group: 'interior', label: 'SKU sticker — inside door', required: true, done: false, tip: 'Close-up of the SKU sticker on the inside of the door. Must be legible.' },
]

const CHIP_COLORS = {
  blue:   { bg: '#D6E4FF', color: '#0057B8' },
  orange: { bg: '#FFE0CC', color: '#E65100' },
  green:  { bg: '#B7F0DA', color: '#1B7A5A' },
  warn:   { bg: '#FFF8E1', color: '#7B4F00' },
  grey:   { bg: '#EEF2FF', color: '#44475A' },
}

function Chip({ label, color = 'grey' }: { label: string; color?: keyof typeof CHIP_COLORS }) {
  const s = CHIP_COLORS[color]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

// ── Bottom nav ─────────────────────────────────────────────

function BottomNav({ active, onNav, unread = 0 }: { active: Screen; onNav: (s: Screen) => void; unread?: number }) {
  const items: { id: Screen; label: string; icon: string; badge?: number }[] = [
    { id: 'dashboard', label: 'Home', icon: 'home' },
    { id: 'jobs',      label: 'Pickups & Returns', icon: 'truck' },
    { id: 'schedule',  label: 'Schedule', icon: 'calendar' },
    { id: 'inbox',     label: 'Inbox', icon: 'inbox', badge: unread },
  ]
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '72px', background: '#fff', borderTop: '1px solid #E1E2EC', display: 'flex', alignItems: 'center', padding: '0 4px 8px', boxShadow: '0 -3px 16px rgba(26,28,46,.07)', zIndex: 20 }}>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => onNav(item.id)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '6px 0', borderRadius: '999px', cursor: 'pointer', flex: 1, border: 'none', background: active === item.id ? '#D6E4FF' : 'transparent', transition: 'all 0.15s', color: active === item.id ? '#0057B8' : '#44475A' }}
        >
          <div style={{ position: 'relative', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={item.icon} size={20} sw={1.6} />
            {!!item.badge && item.badge > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-8px', minWidth: '15px', height: '15px', padding: '0 4px', borderRadius: '999px', background: '#E65100', color: '#fff', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.badge}</span>}
          </div>
          <span style={{ fontSize: item.label.length > 10 ? '9px' : '10px', fontWeight: 600, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Stepper ────────────────────────────────────────────────

interface StepItem { label: string; detail?: string; time?: string; status: 'done' | 'active' | 'pending' }

function Stepper({ steps, title = 'Job Progress' }: { steps: StepItem[]; title?: string }) {
  return (
    <div style={{ margin: '0 12px 10px', background: '#fff', borderRadius: '16px', border: '1px solid #E1E2EC', padding: '16px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#44475A', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px' }}>{title}</div>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: i < steps.length - 1 ? '12px' : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid',
              background: step.status === 'done' ? '#1B7A5A' : step.status === 'active' ? '#0057B8' : '#fff',
              borderColor: step.status === 'done' ? '#1B7A5A' : step.status === 'active' ? '#0057B8' : '#E1E2EC',
            }}>
              {step.status === 'done' && <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>}
              {step.status === 'active' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fff' }} />}
              {step.status === 'pending' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E1E2EC' }} />}
            </div>
            {i < steps.length - 1 && <div style={{ width: '2px', height: '20px', margin: '3px 0', background: step.status === 'done' ? '#1B7A5A' : '#E1E2EC', borderRadius: '1px' }} />}
          </div>
          <div style={{ flex: 1, paddingTop: '5px' }}>
            <div style={{ fontSize: '13px', fontWeight: step.status === 'pending' ? 400 : 700, color: step.status === 'pending' ? '#44475A' : '#1A1C2E', marginBottom: '2px' }}>{step.label}</div>
            {step.detail && <div style={{ fontSize: '11px', color: '#44475A' }}>{step.detail}</div>}
            {step.time && <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#1B7A5A', marginTop: '2px' }}>{step.time}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Field App ─────────────────────────────────────────

export default function FieldAppPage() {
  const { user, logout } = useAuth()
  // The signed-in driver's record id (admins previewing the app fall back to drv_01).
  const DRIVER_ID = user?.driverId || FALLBACK_DRIVER_ID
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [shots, setShots] = useState<PhotoShot[]>(SHOT_LIST.map(s => ({ ...s })))
  const [uploadingShot, setUploadingShot] = useState<number | null>(null)  // shot id mid-upload
  const [onDuty, setOnDuty] = useState(true)
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([])
  // Driver Inbox/Sent/Trash messaging
  const [messages, setMessages] = useState<Message[]>([])
  const [inboxTab, setInboxTab] = useState<'inbox' | 'sent' | 'trash'>('inbox')
  const [openMsgId, setOpenMsgId] = useState<string | null>(null)
  const [msgCustomers, setMsgCustomers] = useState<Customer[]>([])
  // Composer: reply (recipient known) or a new message to dispatch/a customer.
  const [compose, setCompose] = useState<null | { toRole: 'admin' | 'customer'; toName: string; toEmail: string; subject: string; body: string }>(null)
  const [depots, setDepots] = useState<Depot[]>([])
  // Shared containers/orders — used to link schedule jobs back to the container
  // + order records so completions and photo sessions update the same rows the
  // admin portal and marketplace read.
  const [containerList, setContainerList] = useState<Container[]>([])
  const [orderList, setOrderList] = useState<Order[]>([])
  const [me, setMe] = useState<Driver | null>(null)          // the signed-in driver
  const [mySchedule, setMySchedule] = useState<SchedJob[]>([]) // this driver's jobs (shared CSV)
  const [editJob, setEditJob] = useState<{ id: string; dayOffset: number; time: string } | null>(null)
  // Per-week working hours: schedule up to 4 weeks ahead.
  const [weekOffset, setWeekOffset] = useState(0)                 // 0=this week … 3
  const [availRows, setAvailRows] = useState<Availability[]>([])   // saved weeks (shared CSV)
  const [weekEdits, setWeekEdits] = useState<Record<string, Record<number, DayHours | null>>>({}) // unsaved edits by weekStart
  // Active workflow state
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [signed, setSigned] = useState(false)
  const [returnPhoto, setReturnPhoto] = useState(false)
  const [condScore, setCondScore] = useState(0)  // driver's 1–5 condition score for the active job
  const [inspectorNotes, setInspectorNotes] = useState('')  // optional notes attached to the photo submission
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()

  const doneCount = shots.filter(s => s.done).length
  const progress = Math.round((doneCount / PHOTO_TARGET) * 100)

  // Fetchers return their promise so callers decide how to surface failures
  // (background syncs stay silent; explicit refresh buttons toast an error).
  const fetchActivity = () => activity.list().then(setActivityLog)
  const fetchMessages = () => messagesApi.list(DRIVER_ID).then(setMessages)
  const fetchSchedule = () => scheduleApi.list().then(all => setMySchedule(all.filter(s => s.driverId === DRIVER_ID)))
  const loadMe = () => driversApi.list().then(ds => setMe(ds.find(x => x.id === DRIVER_ID) ?? null))
  const loadAvailability = () => availabilityApi.list().then(rows => setAvailRows(rows.filter(r => r.driverId === DRIVER_ID)))
  const fetchContainers = () => containersApi.list().then(setContainerList)
  const fetchOrders = () => ordersApi.list().then(setOrderList)
  useEffect(() => {
    fetchActivity().catch(() => {})
    depotsApi.list().then(setDepots).catch(() => {})
    loadMe().catch(() => {})
    loadAvailability().catch(() => {})
    fetchSchedule().catch(() => {})
    fetchMessages().catch(() => {})
    fetchContainers().catch(() => {})
    fetchOrders().catch(() => {})
    customersApi.list().then(cs => setMsgCustomers(cs.filter(c => c.active !== false))).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pull the latest shared schedule/availability whenever the driver navigates to a data screen,
  // or on window focus — so admin-side changes show up without a full reload.
  const syncFromServer = () => {
    ;[fetchSchedule(), loadAvailability(), loadMe(), fetchMessages(), fetchContainers(), fetchOrders()]
      .forEach(p => p.catch(() => {}))
  }
  useEffect(() => {
    if (screen === 'jobs' || screen === 'schedule') syncFromServer()
    if (screen === 'inbox') fetchMessages().catch(() => {})
  }, [screen]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') syncFromServer() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Monday (local) of the current week + `off` weeks, as YYYY-MM-DD.
  const mondayISO = (off: number) => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const weekStart = mondayISO(weekOffset)
  // Hours for the selected week: unsaved edits → saved availability → driver's base template.
  const savedForWeek = availRows.find(r => r.weekStart === weekStart)
  const weekDays: Record<number, DayHours | null> = weekEdits[weekStart]
    ?? parseWorkHours(savedForWeek ? savedForWeek.workHours : (me?.workHours || ''))
  const setDayHours = (d: number, h: DayHours | null) => setWeekEdits(prev => ({ ...prev, [weekStart]: { ...weekDays, [d]: h } }))
  const saveWorkHours = () => {
    availabilityApi.save({ driverId: DRIVER_ID, weekStart, workHours: encodeWorkHours(weekDays) })
      .then(() => {
        loadAvailability().catch(() => {})
        setWeekEdits(p => { const n = { ...p }; delete n[weekStart]; return n })
        toast('Working hours saved for this week')
      })
      .catch(() => toast('Could not save working hours — check connection and retry'))
  }

  const depotById = (id?: string) => depots.find(d => d.id === id)
  const depotByName = (name?: string) => depots.find(d => d.name === name)

  // Map a shared schedule entry → a field workflow Job (single source of truth).
  // Container id + customer email/phone are hydrated from the shared containers /
  // orders / customers tables so completions and receipts hit the right records.
  const schedToJob = (s: SchedJob): Job => {
    const isDepotDest = s.type === 'transfer' || /depot/i.test(s.destination)
    const kind: JobKind = s.type === 'pickup' ? 'pickup' : s.type === 'return' ? 'return' : 'delivery'
    const cust = s.customer && s.customer !== '-' ? s.customer : ''
    const cont = containerList.find(c => c.sku === s.sku)
    const order = orderList.find(o => o.containerSku === s.sku && o.status !== 'delivered')
      ?? orderList.find(o => o.containerSku === s.sku)
    const custRec = cust ? msgCustomers.find(c => c.name === cust || c.company === cust) : undefined
    return {
      id: s.id, kind,
      dest: kind === 'delivery' ? (isDepotDest ? 'depot' : 'customer') : undefined,
      sku: s.sku, containerId: cont?.id || '',
      depotId: (kind === 'pickup' ? depotByName(s.origin) : isDepotDest ? depotByName(s.destination) : undefined)?.id,
      originDepotId: kind === 'delivery' && isDepotDest ? depotByName(s.origin)?.id : undefined,
      customer: cust,
      contact: s.contact || order?.customerPhone || custRec?.phone || '',
      email: order?.customerEmail || custRec?.email || '',
      address: (kind === 'return' ? s.originAddress || s.origin : s.destinationAddress || s.destination),
      time: fmtMin(s.startMin),
    }
  }
  // Group a driver's schedule into Today + subsequent days for the field lists.
  const groupByDay = (jobs: SchedJob[]) => {
    const byDay: Record<number, SchedJob[]> = {}
    jobs.forEach(j => { (byDay[j.dayOffset] ||= []).push(j) })
    return Object.keys(byDay).map(Number).sort((a, b) => a - b).map(off => ({
      offset: off,
      label: off === 0 ? "Today's Jobs" : dayName(off),
      jobs: byDay[off].sort((a, b) => a.startMin - b.startMin),
    }))
  }

  // Depot + lot attendant summary for a pickup row.
  const pickupSub = (job: Job) => {
    const d = depotById(job.depotId)
    if (!d) return 'Depot'
    return `${d.name}${d.attendantName ? ` · ${d.attendantName}` : ''}${d.attendantCell ? ` · ${d.attendantCell}` : ''}`
  }
  // A short human location string for a job (depot name or customer city).
  const jobLocation = (j: Job) => j.dest === 'customer' || j.kind === 'return'
    ? `${j.customer ?? ''}${j.address ? ` · ${j.address}` : ''}`
    : (depotById(j.depotId)?.name ?? j.customer ?? '')

  // Record a timestamped activity to the CSV log, then refresh the history.
  const logActivity = async (job: Job | null, type: ActivityEvent['type'], note: string) => {
    if (!job) return
    try {
      await activity.log({ type, jobType: job.kind, sku: job.sku, containerId: job.containerId, actor: me?.name ?? ACTOR, location: jobLocation(job), note })
    } catch { /* offline — non-blocking */ }
    fetchActivity().catch(() => {})
  }

  // ── Real photo capture ─────────────────────────────────
  // "Take" opens the device camera (capture attr); "Upload" opens the photo
  // library — photos may already have been taken. Files are downscaled to
  // JPEG and uploaded into the shot's slot on the shared container record,
  // so the marketplace 360° spinner and admin portal see them immediately.

  const pickImage = (useCamera: boolean): Promise<File | null> => new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (useCamera) input.setAttribute('capture', 'environment')
    input.onchange = () => resolve(input.files?.[0] ?? null)
    // If the user cancels, no change event fires — fall back to reading the
    // input shortly after focus returns (first resolve wins on double-fire).
    window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 700), { once: true })
    input.click()
  })

  const captureShot = async (shot: PhotoShot, useCamera: boolean) => {
    const job = activeJob
    if (!job || uploadingShot) return
    const target = job.containerId || job.sku
    if (!target) { toast('No container record linked to this job'); return }
    const file = await pickImage(useCamera)
    if (!file) return
    setUploadingShot(shot.id)
    try {
      const dataUrl = await fileToDataUrl(file)
      const updated = await containersApi.uploadPhoto(target, {
        slot: shot.id - 1, label: shot.label, dataUrl, inspectorName: me?.name ?? ACTOR,
      })
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, done: true, url: updated.photos[shot.id - 1] } : s))
      setContainerList(prev => prev.map(c => c.id === updated.id ? updated : c))
      if (shots.filter(s => s.done).length === 0) logActivity(job, 'photos_started', `Photo session started (${shot.label})`)
      toast(`${shot.label} ✓ uploaded`)
    } catch (e) {
      toast(`Upload failed — ${e instanceof Error ? e.message : 'check connection and retry'}`)
    } finally {
      setUploadingShot(null)
    }
  }

  // Hydrate the checklist from photos already on the container (resume a
  // partially documented unit; also lets admins see what's been shot).
  const hydrateShots = (job: Job) => {
    const cont = containerList.find(c => c.id === job.containerId || c.sku === job.sku)
    const photos = cont?.photos ?? []
    setShots(SHOT_LIST.map(s => ({ ...s, done: !!photos[s.id - 1], url: photos[s.id - 1] || undefined })))
  }

  // Single proof photo (delivery proof / return condition) — a real capture,
  // stored after the 12 documentation slots so the spinner stays aligned.
  const capturePhoto1 = async (job: Job) => {
    if (uploadingShot) return
    const file = await pickImage(true)
    if (!file) return
    setUploadingShot(-1)
    try {
      const dataUrl = await fileToDataUrl(file)
      const target = job.containerId || job.sku
      const label = job.kind === 'return' ? 'Return condition' : 'Proof of delivery'
      if (target) await containersApi.uploadPhoto(target, { slot: 12, label, dataUrl, inspectorName: me?.name ?? ACTOR })
      setReturnPhoto(true)
      logActivity(job, 'photos_submitted', `${label} photo captured`)
      toast(`${label} photo uploaded`)
      setStepIndex(i => i + 1)
    } catch (e) {
      toast(`Photo upload failed — ${e instanceof Error ? e.message : 'try again'}`)
    } finally {
      setUploadingShot(null)
    }
  }

  const scrollTop = () => window.scrollTo({ top: 0 })
  const goTo = (s: Screen) => { setScreen(s); scrollTop() }

  // Open a workflow for a job (fresh state).
  const startJob = (job: Job) => {
    setActiveJob(job)
    setStepIndex(0)
    setSigned(false)
    setReturnPhoto(false)
    setCondScore(0)
    setInspectorNotes('')
    if (job.kind === 'pickup') hydrateShots(job)
    goTo('flow')
  }

  // Simulated PDF receipt — opens a printable window (save as PDF) + logs the send.
  const sendReceipt = (job: Job) => {
    logActivity(job, 'receipt_sent', `Receipt emailed to ${job.email || 'customer'} + admin`)
    const w = window.open('', '_blank', 'width=420,height=640')
    if (w) {
      const now = new Date().toLocaleString('en-US')
      w.document.write(`<html><head><title>SteelBox Receipt ${job.sku}</title><style>body{font:14px -apple-system,sans-serif;padding:28px;color:#0D0E12}h1{font-size:20px;margin:0 0 2px}.sub{color:#6B7280;font-size:12px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}.k{color:#6B7280}b{font-family:monospace}</style></head><body><h1><span style="color:#2B7FD4">Steel</span><span style="color:#E65100">Box</span></h1><div class="sub">${KIND_META[job.kind].label} receipt · ${now}</div><div style="margin-top:20px"><div class="row"><span class="k">Container</span><b>${job.sku}</b></div><div class="row"><span class="k">Customer</span><span>${job.customer || '—'}</span></div><div class="row"><span class="k">Location</span><span>${job.address || '—'}</span></div><div class="row"><span class="k">Field rep</span><span>${me?.name ?? ACTOR}</span></div><div class="row"><span class="k">Status</span><span>Completed</span></div></div><p class="sub" style="margin-top:24px">A copy has been emailed to ${job.email || 'the customer'} and the SteelBox admin portal.</p><button onclick="window.print()" style="margin-top:14px;padding:10px 18px;border:none;border-radius:999px;background:#0057B8;color:#fff;font-weight:700;cursor:pointer">Save as PDF</button></body></html>`)
      w.document.close()
    }
    toast(`Receipt PDF emailed to ${job.customer || 'customer'} + admin`)
  }

  // On completion, sync the shared tables so every portal agrees:
  // the order is marked delivered, the container status/location moves,
  // and the finished schedule row is cleared from the shared board.
  const finalizeJob = async (job: Job) => {
    const target = job.containerId || job.sku // API resolves either
    try {
      if (job.kind === 'delivery' && job.dest === 'customer') {
        const order = orderList.find(o => o.containerSku === job.sku && o.status !== 'delivered')
        if (order) await ordersApi.markDelivered(order.id)
        await containersApi.update(target, { status: 'delivered' })
      } else if (job.kind === 'delivery' && job.dest === 'depot') {
        // Storage transfer — the unit now lives at the destination depot.
        const destName = depotById(job.depotId)?.name
        if (destName) await containersApi.update(target, { depotLocation: destName })
      } else if (job.kind === 'return') {
        // Rental came back to the yard — relist it.
        await containersApi.update(target, { status: 'available' })
      }
      await scheduleApi.remove(job.id) // done — off the shared schedule board
    } catch {
      toast('Job completed — some updates didn’t sync. Use Refresh to retry.')
    }
    ;[fetchSchedule(), fetchOrders(), fetchContainers()].forEach(p => p.catch(() => {}))
  }

  // Advance the active workflow one step, running the step's side effect.
  const advanceStep = () => {
    const job = activeJob
    if (!job) return
    const steps = stepsFor(job)
    const step = steps[stepIndex]
    if (!step) return
    const nowT = fmtTime(new Date().toISOString())
    switch (step.key) {
      case 'arrive':    logActivity(job, 'arrived', 'Arrived on site'); toast(`Arrival recorded · ${nowT}`); break
      case 'sms':       logActivity(job, 'sms_sent', `ETA text sent to ${job.customer}`); toast('ETA text sent to customer'); break
      case 'photos12':  if (doneCount < PHOTO_TARGET) { hydrateShots(job); goTo('camera'); return } break // photos_submitted logged on submit
      case 'photo1':    capturePhoto1(job); return // advances after the photo uploads
      case 'score':
        containersApi.update(job.containerId || job.sku, { conditionScore: condScore })
          .then(() => fetchContainers().catch(() => {}))
          .catch(() => toast('Condition score didn’t sync — check connection'))
        logActivity(job, 'event', `Condition scored ${condScore}/5`); toast(`Condition ${condScore}/5 saved`); break
      case 'signature': setSigned(true); logActivity(job, 'signature', 'Customer signature captured'); break
      case 'receipt':   sendReceipt(job); break
      case 'complete':
        logActivity(job, (job.kind + '_complete') as ActivityEvent['type'], `${KIND_META[job.kind].label} complete`)
        finalizeJob(job)
        toast(`${KIND_META[job.kind].label} complete`)
        setActiveJob(null); goTo('dashboard'); return
      default: break
    }
    setStepIndex(i => i + 1)
  }

  // Fonts for field app
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500&family=Roboto+Mono:wght@400;500&display=swap'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  // Responsive column — full width on phones, capped/centered on tablet.
  const base: React.CSSProperties = {
    fontFamily: "'Roboto', system-ui, sans-serif",
    background: '#F8F9FF',
    minHeight: '100vh',
    color: '#1A1C2E',
    paddingBottom: '88px',
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
  }
  // The driver's primary vehicle string, from their record.
  const myVehicle = me ? (parseTrucks(me.trucks || '')[0]?.name || me.vehicle || '—') : '—'

  const secLabel = (text: string) => (
    <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#44475A', padding: '14px 16px 6px' }}>{text}</div>
  )

  const card = (children: React.ReactNode, style: React.CSSProperties = {}) => (
    <div style={{ background: '#fff', border: '1px solid #E1E2EC', borderRadius: '16px', boxShadow: '0 1px 4px rgba(26,28,46,.08)', margin: '0 12px 10px', overflow: 'hidden', ...style }}>{children}</div>
  )

  // A schedule row: tap to start the workflow, or use the Reschedule chip to move it.
  // `tight` = this job starts within 10 min of the previous job's est. end (same day).
  const jobRow = (s: SchedJob, last: boolean, tight = false) => {
    const job = schedToJob(s)
    const m = KIND_META[job.kind]
    const editing = editJob?.id === s.id
    // Est. end = 30 min load + drive (miles @ 60 mph = miles min) + 30 min unload.
    const endMin = s.startMin + 60 + s.miles
    const sub = job.dest === 'depot'
      ? `${depotByName(s.origin)?.name ?? s.origin} → ${depotByName(s.destination)?.name ?? s.destination} · storage`
      : job.kind === 'pickup' ? pickupSub(job)
        : `${job.customer || '—'}${job.address ? ` · ${job.address}` : ''}`
    return (
      <div key={s.id} style={{ borderBottom: last && !editing ? 'none' : '1px solid #E1E2EC', background: tight ? 'rgba(230,81,0,.04)' : 'transparent' }}>
        <div onClick={() => startJob(job)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', cursor: 'pointer' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={m.icon} size={19} color={m.color} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>{m.label} · <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{s.sku}</span>{tight && <span title="Tight turnaround — previous job may run into this one" style={{ display: 'inline-flex', color: '#E65100' }}><Icon name="alert" size={15} color="#E65100" sw={1.8} /></span>}</div>
            <div style={{ fontSize: '11px', color: '#44475A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700 }}>{fmtMin(s.startMin)}</div>
            <div style={{ fontSize: '8px', color: '#44475A', letterSpacing: '0.4px', textTransform: 'uppercase' }}>Start</div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#0057B8', marginTop: '3px' }}>{fmtMin(endMin)}</div>
            <div style={{ fontSize: '8px', color: '#44475A', letterSpacing: '0.4px', textTransform: 'uppercase' }}>Est. end</div>
          </div>
          <div style={{ color: '#C4C6D0', flexShrink: 0 }}><Icon name="arrow" size={16} /></div>
        </div>
        <div style={{ padding: '0 16px 12px 66px' }}>
          {editing ? (
            <div style={{ background: '#F8F9FF', border: '1px solid #E1E2EC', borderRadius: '10px', padding: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <select value={editJob.dayOffset} onChange={e => setEditJob({ ...editJob, dayOffset: Number(e.target.value) })} style={{ flex: 1, padding: '8px', border: '1.5px solid #C4C6D0', borderRadius: '8px', fontSize: '12px', fontFamily: "'Roboto', sans-serif" }}>
                  {Array.from({ length: 7 }, (_, o) => <option key={o} value={o}>{dayName(o)}</option>)}
                </select>
                <input type="time" value={editJob.time} onChange={e => setEditJob({ ...editJob, time: e.target.value })} style={{ padding: '8px', border: '1.5px solid #C4C6D0', borderRadius: '8px', fontSize: '12px', fontFamily: "'Roboto', sans-serif" }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEditJob(null)} style={{ flex: 1, padding: '9px', borderRadius: '999px', border: '1.5px solid #E1E2EC', background: 'transparent', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveReschedule} style={{ flex: 1, padding: '9px', borderRadius: '999px', border: 'none', background: '#0057B8', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={() => setEditJob({ id: s.id, dayOffset: s.dayOffset, time: `${String(Math.floor(s.startMin / 60)).padStart(2, '0')}:${String(s.startMin % 60).padStart(2, '0')}` })} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', border: `1.5px solid ${tight ? '#E65100' : '#E1E2EC'}`, background: 'transparent', fontSize: '11px', fontWeight: 700, cursor: 'pointer', color: tight ? '#E65100' : '#0057B8' }}>
                <Icon name="calendar" size={13} color={tight ? '#E65100' : '#0057B8'} /> Reschedule
              </button>
              {tight && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: 600, color: '#E65100' }}><Icon name="alert" size={13} color="#E65100" sw={1.8} /> Tight turnaround — likely need to reschedule</span>}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Dashboard ──────────────────────────────────────────

  const renderDashboard = () => (
    <div>
      {/* Hero — compact (≈half height) */}
      <div style={{ background: onDuty ? 'linear-gradient(135deg,#0057B8,#003882)' : 'linear-gradient(135deg,#374151,#1F2937)', padding: '22px 20px 14px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '130px', height: '130px', borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'rgba(255,255,255,.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="box" size={12} color="#fff" />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700 }}><span style={{ color: '#90C4FF' }}>Steel</span><span style={{ color: '#E65100' }}>Box</span></span>
          <button
            onClick={() => setOnDuty(d => !d)}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', background: onDuty ? 'rgba(61,255,160,.15)' : 'rgba(255,255,255,.15)', border: `1.5px solid ${onDuty ? 'rgba(61,255,160,.4)' : 'rgba(255,255,255,.3)'}`, borderRadius: '999px', padding: '5px 12px', cursor: 'pointer' }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: onDuty ? '#4DFFB4' : 'rgba(255,255,255,.5)', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{onDuty ? 'On Duty' : 'Off Duty'}</span>
          </button>
          <button onClick={logout} title={`Sign out (${user?.email ?? ''})`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.25)', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 17H4a1 1 0 01-1-1V4a1 1 0 011-1h4" /><polyline points="13,6 17,10 13,14" /><line x1="17" y1="10" x2="7" y2="10" /></svg>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px', marginTop: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.7)' }}>{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'},</div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '20px', fontWeight: 700, color: '#fff' }}>{me?.name ?? ACTOR}</div>
          </div>
          {/* Vehicle info from the driver record */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,.85)', background: 'rgba(255,255,255,.1)', padding: '5px 10px', borderRadius: '8px', maxWidth: '55%' }}>
            <Icon name="truck" size={14} color="rgba(255,255,255,.85)" />
            <span style={{ fontSize: '11px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myVehicle}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '14px 12px 0' }}>
        {[
          { icon: 'box',   num: mySchedule.filter(s => s.type === 'pickup').length, label: 'Pickups', color: '#E65100', bg: '#FFE0CC' },
          { icon: 'truck', num: mySchedule.filter(s => s.type === 'delivery' || s.type === 'transfer').length, label: 'Deliveries', color: '#0057B8', bg: '#EEF2FF' },
          { icon: 'ret',   num: mySchedule.filter(s => s.type === 'return').length, label: 'Returns', color: '#6D28D9', bg: '#EDE9FE' },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E1E2EC', padding: '12px', boxShadow: '0 1px 4px rgba(26,28,46,.08)', textAlign: 'center' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}><Icon name={k.icon} size={16} color={k.color} /></div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '24px', fontWeight: 700, lineHeight: 1, color: k.color }}>{k.num}</div>
            <div style={{ fontSize: '10px', color: '#44475A', marginTop: '2px', letterSpacing: '0.3px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Activity — timestamped history from the log */}
      {secLabel('Recent Activity')}
      {card(
        activityLog.length === 0 ? (
          <div style={{ padding: '16px', fontSize: '12px', color: '#44475A', textAlign: 'center' }}>No activity recorded yet.</div>
        ) : (
          <>
            {activityLog.slice(0, 6).map((e, i) => {
              const m = ACTIVITY_META[e.type] || ACTIVITY_META.event
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px', borderBottom: i < Math.min(activityLog.length, 6) - 1 ? '1px solid #E1E2EC' : 'none' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', color: m.color, background: m.bg, padding: '3px 8px', borderRadius: '8px', flexShrink: 0, whiteSpace: 'nowrap' }}>{m.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.sku}{e.actor ? ` · ${e.actor}` : ''}</div>
                    <div style={{ fontSize: '10px', color: '#44475A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note || e.location}</div>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '9px', color: '#44475A', flexShrink: 0, textAlign: 'right' }}>{fmtTime(e.timestamp)}</div>
                </div>
              )
            })}
          </>
        )
      )}
    </div>
  )

  // ── Job flow (pickup / delivery / return step process) ──

  const renderFlow = () => (
    <div>
      {(() => {
        const job = activeJob
        if (!job) return <div style={{ padding: '40px', textAlign: 'center', color: '#44475A' }}>No active job. <button onClick={() => goTo('jobs')} style={{ color: '#0057B8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>View jobs</button></div>
        const m = KIND_META[job.kind]
        const steps = stepsFor(job)
        const step = steps[stepIndex]
        const depot = depotById(job.depotId)
        const isCustomer = job.dest === 'customer' || job.kind === 'return'
        // Whether the current step's action can run. Photo steps are always
        // actionable — their button opens the camera / photo session (they
        // used to gate on photos already existing, which dead-locked the flow).
        const stepReady = step?.key === 'signature' ? signed : step?.key === 'score' ? condScore > 0 : true
        const photoCta = step?.key === 'photos12' && doneCount >= PHOTO_TARGET ? 'Continue' : step?.cta

        return (
          <>
            <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '44px 16px 14px' }}>
              <button onClick={() => goTo('jobs')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#0057B8', cursor: 'pointer', background: 'none', border: 'none', marginBottom: '10px' }}>← Jobs</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: m.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={m.icon} size={18} color={m.color} /></div>
                <div>
                  <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '18px', fontWeight: 700 }}>{m.label}{job.dest === 'depot' ? ' · Storage transfer' : ''}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#44475A' }}>{job.sku} · {job.time}</div>
                </div>
              </div>
            </div>

            {/* Location / contact card */}
            {card(
              <>
                <div style={{ background: m.bg, padding: '10px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: m.color, borderBottom: '1px solid #E1E2EC' }}>
                  {job.kind === 'pickup' ? 'Pickup Depot' : job.dest === 'depot' ? 'Drop-off Depot' : 'Customer'}
                </div>
                {(job.kind === 'pickup'
                  ? [
                    { icon: 'box', label: 'Depot', val: depot?.name ?? '—' },
                    { icon: 'pin', label: 'Address', val: depot?.address ?? '—' },
                    { icon: 'user', label: 'Lot Attendant', val: depot?.attendantName ?? '—' },
                    { icon: 'phone', label: 'Attendant Cell', val: depot?.attendantCell ?? '—', blue: true, onClick: () => toast(`Calling ${depot?.attendantName ?? 'attendant'}…`) },
                  ]
                  : job.dest === 'depot'
                    ? [
                      { icon: 'truck', label: 'Origin', val: depotById(job.originDepotId)?.name ?? '—' },
                      { icon: 'box', label: 'Destination', val: depot?.name ?? '—' },
                      { icon: 'pin', label: 'Address', val: depot?.address ?? '—' },
                    ]
                    : [
                      { icon: 'user', label: 'Customer', val: job.customer ?? '—' },
                      { icon: 'pin', label: 'Address', val: job.address ?? '—' },
                      { icon: 'phone', label: 'Site Contact', val: job.contact ?? '—', blue: true, onClick: () => toast(`Calling ${job.contact}…`) },
                    ]
                ).map((row: any, i: number) => (
                  <div key={i} onClick={row.onClick} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '11px 16px', borderBottom: '1px solid #E1E2EC', fontSize: '13px', cursor: row.onClick ? 'pointer' : 'default' }}>
                    <span style={{ width: '20px', flexShrink: 0, marginTop: '1px', color: '#44475A' }}><Icon name={row.icon} size={16} color="#44475A" /></span>
                    <div>
                      <div style={{ fontSize: '11px', color: '#44475A', marginBottom: '1px' }}>{row.label}</div>
                      <div style={{ fontWeight: 600, color: row.blue ? '#0057B8' : '#1A1C2E', textDecoration: row.blue ? 'underline' : 'none' }}>{row.val}</div>
                    </div>
                  </div>
                ))}
              </>,
              { marginBottom: '10px' }
            )}

            {/* Step process */}
            <Stepper title={`${m.label} Steps`} steps={steps.map((s, i) => ({
              label: s.label,
              detail: s.detail,
              status: i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending',
            }))} />

            {/* Condition scorer — 1–5 stars, shown when the active step needs it */}
            {step?.key === 'score' && (
              <div style={{ margin: '0 12px 10px', background: '#fff', border: '1px solid #E1E2EC', borderRadius: '16px', padding: '18px 16px', textAlign: 'center', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Rate container condition</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setCondScore(n)} aria-label={`${n} of 5`} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
                      <Icon name="star" size={34} color={n <= condScore ? '#F5A623' : '#D6D9E4'} sw={1.4} />
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: '#44475A', marginTop: '8px' }}>{condScore ? `${condScore} / 5 — ${['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][condScore]}` : 'Tap a star (1 = poor, 5 = excellent)'}</div>
              </div>
            )}

            {/* Signature pad — shown when the active step needs it */}
            {step?.key === 'signature' && (
              <div onClick={() => { if (!signed) advanceStep() }} style={{ margin: '0 12px 10px', background: signed ? '#B7F0DA' : 'transparent', border: `2px ${signed ? 'solid #1B7A5A' : 'dashed #C4C6D0'}`, borderRadius: '16px', padding: '22px 16px', textAlign: 'center', cursor: signed ? 'default' : 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}><Icon name={signed ? 'check' : 'pen'} size={26} color={signed ? '#1B7A5A' : '#44475A'} sw={2} /></div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{signed ? 'Signature Captured' : 'Customer Signature'}</div>
                <div style={{ fontSize: '11px', color: '#44475A', marginTop: '2px' }}>{signed ? `${job.customer} signed` : 'Tap to capture on-screen'}</div>
              </div>
            )}

            {/* Primary step action */}
            {step && (
              <div style={{ padding: '2px 12px 6px' }}>
                {isCustomer && step.key === 'sms' && (
                  <div style={{ fontSize: '11px', color: '#44475A', textAlign: 'center', marginBottom: '8px' }}>Customer delivery — notify, arrive, unload, sign, receipt.</div>
                )}
                {job.dest === 'depot' && stepIndex === 0 && (
                  <div style={{ fontSize: '11px', color: '#44475A', textAlign: 'center', marginBottom: '8px' }}>Depot-to-depot storage transfer — no customer contact.</div>
                )}
                <button
                  onClick={advanceStep}
                  disabled={!stepReady}
                  style={{ width: '100%', padding: '15px', background: !stepReady ? '#C4C6D0' : step.key === 'complete' ? '#1B7A5A' : '#0057B8', color: '#fff', border: 'none', borderRadius: '999px', fontFamily: "'Google Sans', sans-serif", fontSize: '15px', fontWeight: 700, cursor: stepReady ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: stepReady ? '0 4px 14px rgba(0,87,184,.25)' : 'none' }}
                >
                  {step.key === 'photos12' && <Icon name="camera" size={17} color="#fff" />}
                  {step.key === 'complete' && <Icon name="check" size={17} color="#fff" sw={2.2} />}
                  {step.key === 'receipt' && <Icon name="receipt" size={17} color="#fff" />}
                  {step.key === 'sms' && <Icon name="sms" size={17} color="#fff" />}
                  {photoCta}
                </button>
                {step.key === 'signature' && !signed && <div style={{ textAlign: 'center', fontSize: '11px', color: '#44475A', marginTop: '8px' }}>Capture the signature above to continue</div>}
              </div>
            )}
          </>
        )
      })()}
    </div>
  )

  // ── Jobs list (bottom-nav tab) ─────────────────────────

  const renderJobs = () => {
    const groups = groupByDay(mySchedule)
    return (
      <div>
        <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '18px 16px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
          <div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '20px', fontWeight: 700, marginBottom: '2px' }}>Pickups, Deliveries &amp; Returns</div>
            <div style={{ fontSize: '12px', color: '#44475A' }}>{mySchedule.length} jobs this week · tap to start the workflow</div>
          </div>
          <button onClick={() => { Promise.all([fetchSchedule(), fetchContainers(), fetchOrders()]).then(() => toast('Schedule refreshed')).catch(() => toast('Refresh failed — check connection')) }} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px', border: '1.5px solid #E1E2EC', background: 'transparent', fontSize: '12px', fontWeight: 700, color: '#0057B8', cursor: 'pointer' }}>
            <Icon name="refresh" size={14} color="#0057B8" sw={1.8} /> Refresh
          </button>
        </div>
        {groups.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#44475A', fontSize: '13px' }}>No jobs scheduled.</div>}
        {groups.map(g => (
          <div key={g.offset}>
            {secLabel(g.label)}
            {card(<>{g.jobs.map((s, i) => {
              const prev = g.jobs[i - 1]
              // Tight if this job starts within a 10-min buffer of the previous job's est. end.
              const tight = !!prev && (prev.startMin + 60 + prev.miles + 10) > s.startMin
              return jobRow(s, i === g.jobs.length - 1, tight)
            })}</>)}
          </div>
        ))}
      </div>
    )
  }

  // ── Camera / Photo Checklist ───────────────────────────

  const renderCamera = () => {
    const cont = activeJob ? containerList.find(c => c.sku === activeJob.sku) : undefined
    const locLine = cont
      ? `${cont.bayNumber ? `${cont.bayNumber} · ` : ''}${cont.depotLocation || depotById(activeJob?.depotId)?.name || 'Depot'}`
      : depotById(activeJob?.depotId)?.name || 'Photo session'
    return (
    <div>
      <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '44px 16px 14px' }}>
        <button onClick={() => goTo('dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#0057B8', cursor: 'pointer', background: 'none', border: 'none', marginBottom: '10px' }}>← Dashboard</button>
        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', marginBottom: '2px' }}>{locLine}</div>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '19px', fontWeight: 700 }}>{activeJob?.sku ?? 'Container'}</div>
      </div>

      {/* Progress */}
      <div style={{ margin: '10px 12px 0', background: '#fff', borderRadius: '12px', border: '1px solid #E1E2EC', padding: '14px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#44475A' }}>Progress</span>
          <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#0057B8' }}>{doneCount} / {PHOTO_TARGET} shots</span>
        </div>
        <div style={{ height: '6px', background: '#E1E2EC', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,#0057B8,#1B7A5A)', borderRadius: '3px', width: `${progress}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Shot list */}
      {(['exterior', 'interior'] as const).map(group => (
        <div key={group}>
          <div style={{ padding: '12px 16px 6px', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#44475A' }}>
            {group === 'exterior' ? 'Exterior — Required' : 'Interior — Required'}
          </div>
          {shots.filter(s => s.group === group).map(shot => {
            const busy = uploadingShot === shot.id
            return (
              <div
                key={shot.id}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 12px 6px', padding: '8px 12px', background: '#fff', borderRadius: '12px', border: `1px solid ${shot.done ? '#1B7A5A' : '#E1E2EC'}` }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', width: '20px', textAlign: 'right', flexShrink: 0 }}>{shot.id}</span>
                {/* Thumbnail — the uploaded shot, or an empty slot */}
                <div style={{ width: '46px', height: '36px', borderRadius: '6px', overflow: 'hidden', background: shot.done ? '#B7F0DA' : '#EEF2FF', border: `1.5px solid ${shot.done ? '#1B7A5A' : '#E1E2EC'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {busy
                    ? <span style={{ fontSize: '9px', color: '#0057B8', fontWeight: 700 }}>…</span>
                    : shot.url
                      ? <img src={photoUrl(shot.url)} alt={shot.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#44475A" strokeWidth="1.4" strokeLinecap="round"><path d="M2 7h2.5L6 5h8l1.5 2H18a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V8a1 1 0 011-1z" /><circle cx="10" cy="11" r="3" /></svg>}
                </div>
                <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, minWidth: 0 }}>
                  {shot.label}
                  {shot.required && !shot.done && <span style={{ color: '#E65100', fontWeight: 700 }}> *</span>}
                  {shot.done && <span style={{ display: 'block', fontSize: '10px', color: '#1B7A5A', fontWeight: 700 }}>✓ uploaded · retake anytime</span>}
                </span>
                {/* Take with camera / upload from library */}
                <button onClick={() => captureShot(shot, true)} disabled={busy} title="Take photo with camera"
                  style={{ width: '38px', height: '34px', borderRadius: '9px', border: 'none', background: busy ? '#C4C6D0' : '#0057B8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'wait' : 'pointer', flexShrink: 0 }}>
                  <Icon name="camera" size={16} color="#fff" sw={1.7} />
                </button>
                <button onClick={() => captureShot(shot, false)} disabled={busy} title="Upload an existing photo"
                  style={{ width: '38px', height: '34px', borderRadius: '9px', border: '1.5px solid #0057B8', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'wait' : 'pointer', flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#0057B8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13V3" /><polyline points="6,7 10,3 14,7" /><path d="M3 13v3a1 1 0 001 1h12a1 1 0 001-1v-3" /></svg>
                </button>
              </div>
            )
          })}
        </div>
      ))}

      <button
        onClick={() => {
          const next = shots.find(s => !s.done)
          if (next) captureShot(next, true)
          else goTo('review')
        }}
        style={{ margin: '12px', width: 'calc(100% - 24px)', background: doneCount >= PHOTO_TARGET ? '#1B7A5A' : '#0057B8', color: '#fff', border: 'none', borderRadius: '16px', padding: '16px', fontFamily: "'Google Sans', sans-serif", fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(0,87,184,.3)' }}>
        <Icon name="camera" size={17} color="#fff" /> {doneCount >= PHOTO_TARGET ? 'All shots done — Review & Submit' : `Take Next Shot (${(shots.find(s => !s.done)?.id) ?? 1} of ${PHOTO_TARGET})`}
      </button>
      <div style={{ textAlign: 'center', padding: '4px 12px 10px', fontSize: '11px', color: '#44475A' }}>📷 takes a new photo · ⬆ uploads one already taken · each shot uploads instantly</div>
    </div>
    )
  }

  // ── Review & Submit ────────────────────────────────────

  // Finalize the photo session. Each shot already uploaded on capture (the
  // server counts real photos and auto-promotes a draft at 12) — this records
  // the inspector + notes and notifies the admin portal via the activity log.
  const submitPhotos = async () => {
    const job = activeJob
    const note = `${doneCount}/${PHOTO_TARGET} photos uploaded${inspectorNotes.trim() ? ` — ${inspectorNotes.trim()}` : ''}`
    if (job) {
      try {
        await containersApi.update(job.containerId || job.sku, {
          inspectorName: me?.name ?? ACTOR,
          inspectedAt: new Date().toISOString(),
        })
        fetchContainers().catch(() => {})
      } catch {
        toast('Photo record didn’t sync — use Refresh on the Jobs tab to retry')
      }
    }
    logActivity(job, 'photos_submitted', note)
    goTo('success')
  }

  const GRADE_LABELS: Record<string, string> = { A: 'One-Trip', B: 'Cargo-Worthy', C: 'Wind & Watertight', R: 'Refurbished', X: 'Custom Build' }

  const renderReview = () => {
    const cont = activeJob ? containerList.find(c => c.sku === activeJob.sku) : undefined
    return (
    <div>
      <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '44px 16px 14px' }}>
        <button onClick={() => goTo('camera')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#0057B8', cursor: 'pointer', background: 'none', border: 'none', marginBottom: '10px' }}>← Checklist</button>
        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', marginBottom: '2px' }}>{activeJob?.sku ?? 'Container'} · {doneCount} photos captured</div>
        <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '19px', fontWeight: 700 }}>Review & Submit</div>
      </div>

      <div style={{ margin: '12px', background: '#B7F0DA', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#1B7A5A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(27,122,90,.2)' }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#1B7A5A" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>
        All {PHOTO_TARGET} required shots {doneCount >= PHOTO_TARGET ? 'complete' : `— ${PHOTO_TARGET - Math.min(doneCount, PHOTO_TARGET)} remaining`}
      </div>

      {/* Photo grid — the actual uploaded shots, slot-aligned with the marketplace spinner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px', padding: '0 12px', marginBottom: '12px' }}>
        {shots.map(shot => (
          <div key={shot.id} title={shot.label} style={{ aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${shot.done ? '#1B7A5A' : '#E1E2EC'}`, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', position: 'relative' }}>
            {shot.url
              ? <img src={photoUrl(shot.url)} alt={shot.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: '#9498A6' }}>{shot.id}</span>}
            {shot.done && <div style={{ position: 'absolute', top: '3px', right: '3px', width: '12px', height: '12px', borderRadius: '50%', background: '#1B7A5A', display: 'grid', placeItems: 'center' }}><svg width="7" height="7" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg></div>}
          </div>
        ))}
      </div>

      {/* Metadata */}
      {card(
        <>
          {[
            { label: 'SKU', val: activeJob?.sku ?? '—', blue: true },
            { label: 'GUID', val: cont?.guid ? cont.guid.slice(0, 19) : '—', small: true },
            { label: 'Condition', val: cont ? `Grade ${cont.grade} · ${GRADE_LABELS[cont.grade] ?? ''}` : condScore ? `${condScore}/5 scored` : '—', orange: true },
            { label: 'Photos', val: `${doneCount} / ${PHOTO_TARGET} ready`, green: doneCount >= PHOTO_TARGET },
            { label: 'Upload size', val: `~${doneCount * 4} MB` },
            { label: 'Captured by', val: `${me?.name ?? ACTOR} · ${me?.driverCode ?? 'DRV'}` },
            { label: 'GPS stamp', val: '29.7604° N · 95.3698° W', green: true, small: true },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', borderBottom: '1px solid #E1E2EC', fontSize: '12px' }}>
              <span style={{ color: '#44475A' }}>{row.label}</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: row.small ? '9px' : '12px', color: row.blue ? '#0057B8' : row.orange ? '#E65100' : row.green ? '#1B7A5A' : '#1A1C2E' }}>{row.val}</span>
            </div>
          ))}
        </>
      )}

      {/* Notes */}
      <div style={{ margin: '0 12px 12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#44475A', marginBottom: '6px' }}>Inspector Notes (optional)</div>
        <textarea value={inspectorNotes} onChange={e => setInspectorNotes(e.target.value)} placeholder="Condition observations, location notes, damage details…" rows={3} style={{ width: '100%', background: '#fff', border: '1.5px solid #C4C6D0', borderRadius: '12px', padding: '12px', color: '#1A1C2E', fontFamily: "'Roboto', sans-serif", fontSize: '13px', resize: 'none', height: '64px', outline: 'none' }} />
      </div>

      <button onClick={submitPhotos} disabled={doneCount < PHOTO_TARGET} style={{ margin: '0 12px 12px', width: 'calc(100% - 24px)', background: doneCount >= PHOTO_TARGET ? '#0057B8' : '#C4C6D0', color: '#fff', border: 'none', borderRadius: '16px', padding: '16px', fontFamily: "'Google Sans', sans-serif", fontSize: '15px', fontWeight: 700, cursor: doneCount >= PHOTO_TARGET ? 'pointer' : 'not-allowed', boxShadow: doneCount >= PHOTO_TARGET ? '0 4px 14px rgba(0,87,184,.3)' : 'none' }}>
        {doneCount >= PHOTO_TARGET ? 'Submit to Admin Portal →' : `${PHOTO_TARGET - doneCount} shot${PHOTO_TARGET - doneCount > 1 ? 's' : ''} still needed`}
      </button>
      <div style={{ textAlign: 'center', padding: '0 12px 12px', fontSize: '11px', color: '#44475A' }}>Uploads via WiFi or LTE · Admin notified instantly</div>
    </div>
    )
  }

  // ── Success ────────────────────────────────────────────

  const renderSuccess = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#B7F0DA', border: '3px solid #1B7A5A', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
        <svg width="36" height="36" viewBox="0 0 20 20" fill="none" stroke="#1B7A5A" strokeWidth="2.2" strokeLinecap="round"><polyline points="3,10.5 8,16 17,5" /></svg>
      </div>
      <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Photos Submitted!</div>
      <p style={{ fontSize: '13px', color: '#44475A', lineHeight: 1.65, marginBottom: '24px', maxWidth: '260px' }}>All {doneCount} photos for {activeJob?.sku ?? 'this container'} uploaded. Admin has been notified and will review for listing approval.</p>
      <div style={{ background: '#EEF2FF', color: '#0057B8', borderRadius: '16px', padding: '7px 18px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, marginBottom: '28px', border: '1px solid rgba(0,87,184,.2)' }}>{activeJob?.sku ?? 'SBX'} · uploaded</div>
      {activeJob && (
        <button onClick={() => goTo('flow')} style={{ width: '100%', padding: '13px', borderRadius: '16px', background: '#0057B8', color: '#fff', border: 'none', fontFamily: "'Google Sans', sans-serif", fontSize: '14px', fontWeight: 700, cursor: 'pointer', marginBottom: '10px', boxShadow: '0 4px 14px rgba(0,87,184,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Icon name="arrow" size={16} color="#fff" /> Continue {KIND_META[activeJob.kind].label}
        </button>
      )}
      <button onClick={() => goTo('dashboard')} style={{ width: '100%', padding: '13px', borderRadius: '16px', background: '#EEF2FF', color: '#1A1C2E', border: '1.5px solid #E1E2EC', fontFamily: "'Google Sans', sans-serif", fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Back to Dashboard</button>
      <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#44475A', marginTop: '14px', letterSpacing: '0.5px' }}>UPLOADED · ~{doneCount * 4} MB · WiFi</div>
    </div>
  )

  // ── Schedule ───────────────────────────────────────────

  // Save a reschedule edit back to the shared schedule CSV (admin sees it too).
  const saveReschedule = () => {
    if (!editJob) return
    const [h, m] = editJob.time.split(':').map(Number)
    if (Number.isNaN(h)) { toast('Pick a valid time first'); return }
    const startMin = h * 60 + (m || 0)
    setMySchedule(prev => prev.map(j => j.id === editJob.id ? { ...j, dayOffset: editJob.dayOffset, startMin } : j)) // optimistic
    scheduleApi.update(editJob.id, { dayOffset: editJob.dayOffset, startMin })
      .then(() => { fetchSchedule().catch(() => {}); toast('Rescheduled · dispatch notified') })
      .catch(() => { fetchSchedule().catch(() => {}); toast('Reschedule didn’t save — previous time restored') })
    setEditJob(null)
  }
  const dayName = (off: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + off); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }

  // Schedule tab = the driver sets their own weekly working hours (6 AM–10 PM).
  const renderSchedule = () => {
    const DAYS: [number, string][] = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']]
    const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6 (6 AM) .. 22 (10 PM)
    const hourLabel = (h: number) => { const ap = h < 12 ? 'AM' : 'PM', hh = ((h + 11) % 12) + 1; return `${hh} ${ap}` }
    const weekRange = (off: number) => {
      const [y, m, d] = mondayISO(off).split('-').map(Number)
      const mon = new Date(y, m - 1, d), sun = new Date(y, m - 1, d + 6)
      const f = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return `${f(mon)} – ${f(sun)}`
    }
    const weekTab = (off: number) => off === 0 ? 'This Week' : off === 1 ? 'Next Week' : `Week of ${mondayISO(off).slice(5).replace('-', '/')}`
    const dirty = !!weekEdits[weekStart]
    return (
      <div>
        <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '18px 16px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
          <div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '20px', fontWeight: 700, marginBottom: '2px' }}>My Working Hours</div>
            <div style={{ fontSize: '12px', color: '#44475A' }}>Set your Mon–Sun availability (6 AM–10 PM) up to 4 weeks ahead.</div>
          </div>
          <button onClick={() => { Promise.all([loadAvailability(), loadMe()]).then(() => toast('Hours refreshed')).catch(() => toast('Refresh failed — check connection')) }} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px', border: '1.5px solid #E1E2EC', background: 'transparent', fontSize: '12px', fontWeight: 700, color: '#0057B8', cursor: 'pointer' }}>
            <Icon name="refresh" size={14} color="#0057B8" sw={1.8} /> Refresh
          </button>
        </div>
        {/* Week selector */}
        <div style={{ display: 'flex', gap: '6px', padding: '10px 12px 4px', overflowX: 'auto' }}>
          {[0, 1, 2, 3].map(off => {
            const active = weekOffset === off
            const saved = availRows.some(r => r.weekStart === mondayISO(off))
            return (
              <button key={off} onClick={() => setWeekOffset(off)} style={{ flexShrink: 0, padding: '8px 12px', borderRadius: '14px', border: `1.5px solid ${active ? '#0057B8' : '#E1E2EC'}`, background: active ? '#0057B8' : '#fff', color: active ? '#fff' : '#1A1C2E', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>{weekTab(off)}{saved && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: active ? '#4DFFB4' : '#1B7A5A' }} />}</div>
                <div style={{ fontSize: '10px', color: active ? 'rgba(255,255,255,.8)' : '#44475A', fontFamily: 'monospace' }}>{weekRange(off)}</div>
              </button>
            )
          })}
        </div>
        <div style={{ padding: '6px 12px 12px' }}>
          <div style={{ background: '#fff', border: '1px solid #E1E2EC', borderRadius: '14px', boxShadow: '0 1px 4px rgba(26,28,46,.08)', overflow: 'hidden' }}>
            {DAYS.map(([d, name], i) => {
              const dh = weekDays[d] || null
              const on = !!dh
              const sel = { padding: '5px 6px', border: '1.5px solid #C4C6D0', borderRadius: '7px', fontSize: '12px', fontFamily: "'Roboto', sans-serif", background: '#fff' } as const
              return (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 12px', borderBottom: i < DAYS.length - 1 ? '1px solid #EEF0F4' : 'none' }}>
                  <button onClick={() => setDayHours(d, on ? null : { start: 6, end: 18 })} style={{ width: '38px', height: '22px', borderRadius: '999px', border: 'none', background: on ? '#1B7A5A' : '#C4C6D0', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .15s' }}>
                    <span style={{ position: 'absolute', top: '2px', left: on ? '18px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                  </button>
                  <div style={{ fontSize: '13px', fontWeight: 700, width: '76px', flexShrink: 0 }}>{name}</div>
                  {on && dh ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'flex-end' }}>
                      <select value={dh.start} onChange={e => { const v = Number(e.target.value); setDayHours(d, { start: v, end: Math.max(v + 1, dh.end) }) }} style={sel}>
                        {HOURS.filter(h => h < 22).map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
                      </select>
                      <span style={{ fontSize: '11px', color: '#44475A' }}>to</span>
                      <select value={dh.end} onChange={e => setDayHours(d, { ...dh, end: Number(e.target.value) })} style={sel}>
                        {HOURS.filter(h => h > dh.start).map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div style={{ flex: 1, textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#9498A6' }}>Off</div>
                  )}
                </div>
              )
            })}
          </div>
          <button onClick={saveWorkHours} style={{ width: '100%', padding: '13px', borderRadius: '999px', border: 'none', background: dirty ? '#0057B8' : '#1B7A5A', color: '#fff', fontFamily: "'Google Sans', sans-serif", fontSize: '14px', fontWeight: 700, cursor: 'pointer', marginTop: '12px', boxShadow: '0 4px 14px rgba(0,87,184,.3)' }}>{dirty ? `Save ${weekTab(weekOffset)}` : `✓ ${weekTab(weekOffset)} saved · update`}</button>
        </div>
      </div>
    )
  }

  // ── Inbox / Sent / Trash ───────────────────────────────
  // Inbox = messages addressed to this driver; Sent = messages this driver sent.
  const isReceived = (m: Message) => m.toRole === 'driver'
  const unreadCount = messages.filter(m => isReceived(m) && !m.trashed && !m.read).length
  const patchMsg = (id: string, patch: Partial<Message>) => {
    setMessages(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))          // optimistic
    messagesApi.update(id, patch).catch(() => {
      fetchMessages().catch(() => {})                                                // revert to server truth
      toast('Change didn’t sync — check connection')
    })
  }
  const openMessage = (m: Message) => { setOpenMsgId(m.id); if (isReceived(m) && !m.read) patchMsg(m.id, { read: true }) }
  const trashMsg = (m: Message) => { patchMsg(m.id, { trashed: true }); setOpenMsgId(null); toast('Moved to Trash') }
  const restoreMsg = (m: Message) => { patchMsg(m.id, { trashed: false }); toast('Restored') }
  const deleteMsg = (m: Message) => {
    setMessages(prev => prev.filter(x => x.id !== m.id))
    messagesApi.remove(m.id).catch(() => { fetchMessages().catch(() => {}); toast('Delete didn’t sync — message restored') })
    setOpenMsgId(null)
  }
  const emptyTrash = () => {
    setMessages(prev => prev.filter(x => !x.trashed))
    messagesApi.emptyTrash(DRIVER_ID)
      .then(() => toast('Trash emptied'))
      .catch(() => { fetchMessages().catch(() => {}); toast('Could not empty trash — check connection') })
  }
  const fmtMsgTime = (iso: string) => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return iso } }
  const sendCompose = () => {
    if (!compose || !compose.body.trim()) return
    const c = compose
    const payload = { fromRole: 'driver' as const, fromName: me?.name || 'Driver', fromEmail: '', toDriverId: DRIVER_ID, toRole: c.toRole, toName: c.toName, toEmail: c.toEmail, subject: c.subject.trim() || '(no subject)', body: c.body.trim() }
    setCompose(null); setOpenMsgId(null); setInboxTab('sent')
    messagesApi.create(payload)
      .then(() => { fetchMessages().catch(() => {}); toast(c.toRole === 'admin' ? 'Sent to Dispatch' : `Sent to ${c.toName}`) })
      .catch(() => toast('Message didn’t send — please try again'))
  }
  const replyTo = (m: Message) => setCompose({ toRole: m.fromRole === 'customer' ? 'customer' : 'admin', toName: m.fromName, toEmail: m.fromEmail, subject: m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`, body: '' })

  const renderInbox = () => {
    const open = openMsgId ? messages.find(m => m.id === openMsgId) : null
    const list = messages.filter(m => inboxTab === 'trash' ? m.trashed : inboxTab === 'sent' ? (m.fromRole === 'driver' && !m.trashed) : (isReceived(m) && !m.trashed))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    const trashCount = messages.filter(m => m.trashed).length
    const chip = (role: Message['fromRole'], label?: string) => (
      <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', padding: '2px 7px', borderRadius: '999px', background: role === 'admin' ? '#D6E4FF' : role === 'customer' ? '#FFE0CC' : '#E7F5EF', color: role === 'admin' ? '#0057B8' : role === 'customer' ? '#E65100' : '#1B7A5A' }}>{label || (role === 'admin' ? 'Dispatch' : role === 'customer' ? 'Customer' : 'You')}</span>
    )
    const tabs: ('inbox' | 'sent' | 'trash')[] = ['inbox', 'sent', 'trash']
    return (
      <div style={{ paddingBottom: '84px' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #E1E2EC', padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <div>
              <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '20px', fontWeight: 700 }}>Messages</div>
              <div style={{ fontSize: '12px', color: '#44475A' }}>{unreadCount} unread · dispatch &amp; customers</div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button onClick={() => { setCompose({ toRole: 'admin', toName: DISPATCH.name, toEmail: DISPATCH.email, subject: '', body: '' }) }} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '999px', border: 'none', background: '#0057B8', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>+ New</button>
              <button onClick={() => { fetchMessages().then(() => toast('Refreshed')).catch(() => toast('Refresh failed — check connection')) }} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 10px', borderRadius: '999px', border: '1.5px solid #E1E2EC', background: 'transparent', fontSize: '12px', fontWeight: 700, color: '#0057B8', cursor: 'pointer' }}><Icon name="refresh" size={14} color="#0057B8" sw={1.8} /></button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '18px' }}>
            {tabs.map(t => (
              <button key={t} onClick={() => { setInboxTab(t); setOpenMsgId(null) }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 0', border: 'none', background: 'transparent', borderBottom: `2.5px solid ${inboxTab === t ? '#0057B8' : 'transparent'}`, color: inboxTab === t ? '#0057B8' : '#44475A', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                <Icon name={t === 'trash' ? 'trash' : t === 'sent' ? 'arrow' : 'inbox'} size={15} sw={1.7} /> {t === 'inbox' ? 'Inbox' : t === 'sent' ? 'Sent' : 'Trash'}{t === 'inbox' && unreadCount > 0 ? ` (${unreadCount})` : t === 'trash' && trashCount > 0 ? ` (${trashCount})` : ''}
              </button>
            ))}
          </div>
        </div>

        {open ? (() => {
          const received = isReceived(open)
          return (
            <div style={{ padding: '14px 16px' }}>
              <button onClick={() => setOpenMsgId(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: '#0057B8', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: '0 0 12px' }}>‹ Back</button>
              <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E1E2EC', padding: '16px', boxShadow: '0 1px 4px rgba(26,28,46,.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>{received ? chip(open.fromRole) : chip('driver', 'Sent')}<span style={{ fontSize: '11px', color: '#44475A', marginLeft: 'auto' }}>{fmtMsgTime(open.createdAt)}</span></div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '2px' }}>{open.subject}</div>
                <div style={{ fontSize: '12px', color: '#44475A', marginBottom: '14px' }}>{received ? `From ${open.fromName}${open.fromEmail ? ` · ${open.fromEmail}` : ''}` : `To ${open.toName || (open.toRole === 'admin' ? 'Dispatch' : 'Customer')}${open.toEmail ? ` · ${open.toEmail}` : ''}`}</div>
                <div style={{ fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{open.body}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                {open.trashed ? (
                  <>
                    <button onClick={() => restoreMsg(open)} style={{ flex: 1, padding: '11px', borderRadius: '999px', border: '1.5px solid #E1E2EC', background: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Restore</button>
                    <button onClick={() => deleteMsg(open)} style={{ flex: 1, padding: '11px', borderRadius: '999px', border: 'none', background: '#E65100', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Delete forever</button>
                  </>
                ) : (
                  <>
                    {received && <button onClick={() => replyTo(open)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px', borderRadius: '999px', border: 'none', background: '#0057B8', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}><Icon name="ret" size={15} color="#fff" sw={1.9} /> Reply</button>}
                    {received && <button onClick={() => patchMsg(open.id, { read: !open.read })} style={{ flex: 1, padding: '11px', borderRadius: '999px', border: '1.5px solid #E1E2EC', background: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Mark {open.read ? 'unread' : 'read'}</button>}
                    <button onClick={() => trashMsg(open)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px', borderRadius: '999px', border: '1.5px solid #E65100', background: '#fff', color: '#E65100', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}><Icon name="trash" size={15} color="#E65100" sw={1.8} /> Trash</button>
                  </>
                )}
              </div>
            </div>
          )
        })() : (
          <div style={{ padding: '10px 12px' }}>
            {inboxTab === 'trash' && trashCount > 0 && (
              <button onClick={emptyTrash} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1.5px solid #E65100', background: '#fff', color: '#E65100', fontSize: '12px', fontWeight: 700, cursor: 'pointer', marginBottom: '10px' }}>Empty Trash ({trashCount})</button>
            )}
            {list.length === 0 && <div style={{ textAlign: 'center', padding: '48px 20px', color: '#44475A', fontSize: '13px' }}>{inboxTab === 'trash' ? 'Trash is empty.' : inboxTab === 'sent' ? 'No sent messages.' : 'No messages.'}</div>}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E1E2EC', boxShadow: '0 1px 4px rgba(26,28,46,.08)', overflow: 'hidden' }}>
              {list.map((m, i) => {
                const received = isReceived(m)
                const unread = received && !m.read && !m.trashed
                return (
                  <div key={m.id} onClick={() => openMessage(m)} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '13px 14px', borderBottom: i < list.length - 1 ? '1px solid #EEF0F4' : 'none', cursor: 'pointer', background: unread ? '#F5F8FF' : '#fff' }}>
                    {unread && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0057B8', flexShrink: 0, marginTop: '5px' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        {received ? chip(m.fromRole) : chip('driver', 'Sent')}
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A1C2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{received ? m.fromName : `To ${m.toName || (m.toRole === 'admin' ? 'Dispatch' : 'Customer')}`}</span>
                        <span style={{ fontSize: '10px', color: '#9498A6', marginLeft: 'auto', flexShrink: 0 }}>{fmtMsgTime(m.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: unread ? 700 : 500, color: '#1A1C2E' }}>{m.subject}</div>
                      <div style={{ fontSize: '12px', color: '#44475A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {compose && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(11,22,41,.45)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setCompose(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#fff', borderRadius: '18px 18px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))', maxHeight: '88vh', overflowY: 'auto' }}>
              <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>New message</div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#44475A', marginBottom: '5px' }}>To</label>
              <select
                value={compose.toRole === 'admin' ? 'admin' : `c:${compose.toEmail}`}
                onChange={e => { const v = e.target.value; if (v === 'admin') setCompose(c => c && { ...c, toRole: 'admin', toName: DISPATCH.name, toEmail: DISPATCH.email }); else { const cust = msgCustomers.find(x => `c:${x.email}` === v); if (cust) setCompose(c => c && { ...c, toRole: 'customer', toName: cust.company || cust.name, toEmail: cust.email }) } }}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #C4C6D0', borderRadius: '10px', fontSize: '13px', fontFamily: "'Roboto', sans-serif", marginBottom: '10px' }}
              >
                <option value="admin">{DISPATCH.name}</option>
                <optgroup label="Customers">{msgCustomers.map(c => <option key={c.id} value={`c:${c.email}`}>{c.company || c.name}</option>)}</optgroup>
              </select>
              <input value={compose.subject} placeholder="Subject" onChange={e => setCompose(c => c && { ...c, subject: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #C4C6D0', borderRadius: '10px', fontSize: '13px', fontFamily: "'Roboto', sans-serif", marginBottom: '10px' }} />
              <textarea value={compose.body} placeholder="Write your message…" rows={5} onChange={e => setCompose(c => c && { ...c, body: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #C4C6D0', borderRadius: '10px', fontSize: '14px', fontFamily: "'Roboto', sans-serif", resize: 'vertical', marginBottom: '12px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setCompose(null)} style={{ flex: 1, padding: '12px', borderRadius: '999px', border: '1.5px solid #E1E2EC', background: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={sendCompose} disabled={!compose.body.trim()} style={{ flex: 2, padding: '12px', borderRadius: '999px', border: 'none', background: compose.body.trim() ? '#0057B8' : '#C4C6D0', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: compose.body.trim() ? 'pointer' : 'not-allowed' }}>Send</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const screens: Record<Screen, React.ReactNode> = {
    dashboard: renderDashboard(),
    jobs:      renderJobs(),
    flow:      renderFlow(),
    camera:    renderCamera(),
    review:    renderReview(),
    success:   renderSuccess(),
    schedule:  renderSchedule(),
    inbox:     renderInbox(),
  }

  // Camera/review/success and the job flow all belong to the Pickups & Returns tab.
  const navActive: Screen = ['review', 'success', 'flow', 'camera'].includes(screen) ? 'jobs' : screen

  return (
    <div style={base}>
      {screens[screen]}
      <BottomNav active={navActive} onNav={goTo} unread={unreadCount} />
      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}
