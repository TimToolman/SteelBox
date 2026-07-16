// ============================================================
// MVP Container UI Primitives
// Shared across Marketplace, Admin, and Field surfaces
// ============================================================

import React, { useEffect, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────

export type GradeKey = 'A' | 'B' | 'C' | 'R' | 'X'
export type StatusKey =
  | 'available'
  | 'sale_in_progress'
  | 'sold'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'draft'
  | 'estimate_requested'
  | 'estimate_in_progress'
  | 'estimate_sent'
  | 'estimate_approved'
  | 'custom_in_progress'
  | 'pending_review'
  | 'confirmed'
  | 'cancelled'

// ── Grade Badge ────────────────────────────────────────────

const GRADE_COLORS: Record<GradeKey, string> = {
  A: '#1B7A5A',
  B: '#2563EB',
  C: '#D97706',
  R: '#6D28D9',
  X: '#374151',
}

const GRADE_LABELS: Record<GradeKey, string> = {
  A: 'One-Trip',
  B: 'Cargo-Worthy',
  C: 'Wind & Watertight',
  R: 'Refurbished',
  X: 'Custom Build',
}

interface GradeBadgeProps {
  grade: GradeKey
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function GradeBadge({ grade, showLabel = false, size = 'sm' }: GradeBadgeProps) {
  const bg = GRADE_COLORS[grade] ?? '#374151'
  const fontSize = size === 'md' ? '11px' : '10px'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: bg,
        color: '#fff',
        borderRadius: '4px',
        padding: size === 'md' ? '4px 10px' : '3px 8px',
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.3px',
        whiteSpace: 'nowrap',
      }}
    >
      {grade}
      {showLabel && ` · ${GRADE_LABELS[grade]}`}
    </span>
  )
}

// ── Status Badge ───────────────────────────────────────────

const STATUS_STYLES: Record<StatusKey, { bg: string; color: string; dot: string; label: string }> = {
  available:         { bg: '#E6F4EA', color: '#188038', dot: '#188038', label: 'Available' },
  sale_in_progress:  { bg: '#FFE0CC', color: '#E65100', dot: '#E65100', label: 'Sale in Progress' },
  sold:              { bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF', label: 'Sold' },
  assigned:          { bg: '#D6E4FF', color: '#0057B8', dot: '#0057B8', label: 'Assigned' },
  in_transit:        { bg: '#E3F2FD', color: '#0277BD', dot: '#0277BD', label: 'In Transit' },
  delivered:         { bg: '#E6F4EE', color: '#1B7A5A', dot: '#1B7A5A', label: 'Delivered' },
  draft:             { bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF', label: 'Draft' },
  estimate_requested:  { bg: '#FFF8E1', color: '#B45309', dot: '#B45309', label: 'Estimate Requested' },
  estimate_in_progress:{ bg: '#E3F2FD', color: '#0277BD', dot: '#0277BD', label: 'Estimate In Progress' },
  estimate_sent:       { bg: '#D6E4FF', color: '#0057B8', dot: '#0057B8', label: 'Estimate Sent' },
  estimate_approved:   { bg: '#E6F4EA', color: '#188038', dot: '#188038', label: 'Estimate Approved' },
  custom_in_progress:  { bg: '#EDE9FE', color: '#6D28D9', dot: '#6D28D9', label: 'Build In Progress' },
  pending_review:      { bg: '#FFF8E1', color: '#B45309', dot: '#B45309', label: 'Pending Review' },
  confirmed:           { bg: '#E6F4EA', color: '#188038', dot: '#188038', label: 'Paid · Confirmed' },
  cancelled:           { bg: '#FDECEA', color: '#B3261E', dot: '#B3261E', label: 'Cancelled' },
}

interface StatusBadgeProps {
  status: StatusKey
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: s.bg,
        color: s.color,
        borderRadius: '4px',
        padding: '3px 9px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.3px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: '6px', color: s.dot }}>●</span>
      {s.label}
    </span>
  )
}

// ── Button ─────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'cta' | 'ghost' | 'ghost-white' | 'danger' | 'success'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  icon?: React.ReactNode
}

const BUTTON_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary:      { background: 'var(--primary)', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(0,87,184,.25)' },
  cta:          { background: 'var(--cta)', color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(230,81,0,.3)' },
  ghost:        { background: 'transparent', color: 'var(--ink)', border: '1.5px solid var(--div)' },
  'ghost-white': { background: 'rgba(255,255,255,.1)', color: '#fff', border: '1.5px solid rgba(255,255,255,.25)' },
  danger:       { background: 'transparent', color: 'var(--cta)', border: '1.5px solid var(--cta-cont)' },
  success:      { background: 'transparent', color: 'var(--green)', border: '1.5px solid var(--green-cont)' },
}

const BUTTON_SIZES: Record<string, React.CSSProperties> = {
  sm: { padding: '4px 11px', fontSize: '11px', borderRadius: 'var(--pill)' },
  md: { padding: '7px 16px', fontSize: '13px', borderRadius: 'var(--pill)' },
  lg: { padding: '12px 24px', fontSize: '14px', borderRadius: 'var(--pill)' },
}

export function Button({
  variant = 'ghost',
  size = 'md',
  fullWidth = false,
  icon,
  children,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        fontFamily: 'var(--sans)',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        width: fullWidth ? '100%' : undefined,
        ...BUTTON_STYLES[variant],
        ...BUTTON_SIZES[size],
        ...style,
      }}
      {...props}
    >
      {icon && <span style={{ flexShrink: 0 }}>{icon}</span>}
      {children}
    </button>
  )
}

// ── Modal ──────────────────────────────────────────────────

interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number
  noPadding?: boolean
  // 'dark' renders a frosted white-on-dark close button for modals whose top area is dark (e.g. a photo gallery).
  closeVariant?: 'light' | 'dark'
  // Show the word next to the round ✕ (e.g. "Close") for extra affordance.
  closeLabel?: string
  // Override for stacking a modal on top of another (e.g. edit-customer over the schedule modal).
  zIndex?: number
}

export function Modal({ open, onClose, children, maxWidth = 500, noPadding = false, closeVariant = 'light', closeLabel, zIndex = 600 }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'var(--surf-w)',
          maxWidth,
          width: '100%',
          borderRadius: 'var(--r24)',
          boxShadow: 'var(--sh3)',
          position: 'relative',
          animation: 'modalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          margin: 'auto',
          overflow: 'hidden',
          padding: noPadding ? 0 : '28px',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 10,
            height: '34px',
            width: closeLabel ? undefined : '34px',
            padding: closeLabel ? '0 14px 0 10px' : 0,
            borderRadius: closeLabel ? '999px' : '50%',
            background: closeVariant === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.07)',
            backdropFilter: closeVariant === 'dark' ? 'blur(6px)' : undefined,
            border: closeVariant === 'dark' ? '1px solid rgba(255,255,255,0.28)' : 'none',
            color: closeVariant === 'dark' ? '#fff' : 'var(--ink)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
          {closeLabel && <span style={{ fontSize: '13px', fontWeight: 600 }}>{closeLabel}</span>}
        </button>
        {children}
      </div>
    </div>
  )
}

// ── Snackbar ───────────────────────────────────────────────

interface SnackbarProps {
  message: string
  open: boolean
  onClose: () => void
}

export function Snackbar({ message, open, onClose }: SnackbarProps) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [open, onClose])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '22px',
        left: '50%',
        transform: open ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(70px)',
        transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        background: 'var(--ink)',
        color: '#fff',
        padding: '11px 20px',
        borderRadius: 'var(--r8)',
        fontSize: '13px',
        fontWeight: 500,
        boxShadow: 'var(--sh3)',
        zIndex: 800,
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        pointerEvents: open ? 'all' : 'none',
      }}
    >
      <span>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          fontSize: '15px',
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

// ── Form Input ─────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, id, ...props }: InputProps) {
  return (
    <div style={{ marginBottom: '13px' }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: 'var(--ink3)',
            marginBottom: '5px',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        style={{
          width: '100%',
          padding: '11px 13px',
          border: '1.5px solid var(--div)',
          borderRadius: 'var(--r12)',
          fontSize: '14px',
          color: 'var(--ink)',
          background: 'var(--surf-w)',
          outline: 'none',
          transition: 'border-color 0.15s',
          fontFamily: 'var(--sans)',
        }}
        {...props}
      />
    </div>
  )
}

// ── Select ─────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export function Select({ label, id, children, ...props }: SelectProps) {
  return (
    <div style={{ marginBottom: '13px' }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: 'var(--ink3)',
            marginBottom: '5px',
          }}
        >
          {label}
        </label>
      )}
      <select
        id={id}
        style={{
          width: '100%',
          padding: '11px 13px',
          border: '1.5px solid var(--div)',
          borderRadius: 'var(--r12)',
          fontSize: '14px',
          color: 'var(--ink)',
          background: 'var(--surf-w)',
          outline: 'none',
          fontFamily: 'var(--sans)',
          cursor: 'pointer',
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

// ── Custom-build clipart ───────────────────────────────────
// Clean line-art placeholders for the Custom Builds catalog — the "default
// view" until a real product photo is uploaded in Admin → Settings.
// The variant is inferred from the build's name.

type BuildKind = 'rollup' | 'doorwindow' | 'workshop' | 'retail' | 'vault' | 'generic'

function buildKind(name: string): BuildKind {
  const n = name.toLowerCase()
  if (/roll[- ]?up/.test(n)) return 'rollup'
  if (/personnel|window|office|door/.test(n)) return 'doorwindow'
  if (/workshop|power|electric/.test(n)) return 'workshop'
  if (/retail|pop[- ]?up|shop|kiosk/.test(n)) return 'retail'
  if (/vault|security|safe/.test(n)) return 'vault'
  return 'generic'
}

export function BuildClipart({ name, style }: { name: string; style?: React.CSSProperties }) {
  const kind = buildKind(name)
  const steel = '#8FB4E8'      // container line work
  const accent = '#FF7A2F'     // feature highlight
  const faint = 'rgba(143,180,232,0.35)'
  return (
    <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%', display: 'block', ...style }} role="img" aria-label={name}>
      <defs>
        <linearGradient id="cbBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1E293B" /><stop offset="1" stopColor="#0F2D4A" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#cbBg)" />
      {/* ground line */}
      <line x1="24" y1="146" x2="296" y2="146" stroke={faint} strokeWidth="2" strokeLinecap="round" />
      {/* container shell (isometric-ish front + side) */}
      <g stroke={steel} strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round">
        <rect x="46" y="58" width="176" height="88" rx="3" />
        <path d="M222 58 L262 40 L262 128 L222 146" />
        <path d="M46 58 L86 40 L262 40" />
        {/* corrugation on the side panel */}
        <line x1="232" y1="55" x2="232" y2="140" stroke={faint} strokeWidth="2" />
        <line x1="242" y1="50" x2="242" y2="136" stroke={faint} strokeWidth="2" />
        <line x1="252" y1="46" x2="252" y2="132" stroke={faint} strokeWidth="2" />
      </g>
      {/* front-face corrugation (skips the feature zone) */}
      <g stroke={faint} strokeWidth="2">
        {kind !== 'generic' ? <line x1="62" y1="66" x2="62" y2="138" /> : <>
          <line x1="78" y1="66" x2="78" y2="138" /><line x1="110" y1="66" x2="110" y2="138" />
          <line x1="142" y1="66" x2="142" y2="138" /><line x1="174" y1="66" x2="174" y2="138" /><line x1="206" y1="66" x2="206" y2="138" />
        </>}
        {kind !== 'generic' && <line x1="206" y1="66" x2="206" y2="138" />}
      </g>

      {kind === 'rollup' && (
        <g stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round">
          <rect x="86" y="72" width="96" height="74" rx="2" />
          {[84, 96, 108, 120, 132].map(y => <line key={y} x1="90" y1={y} x2="178" y2={y} strokeWidth="2" opacity="0.85" />)}
          {/* lift arrow */}
          <line x1="134" y1="120" x2="134" y2="96" opacity="0" />
          <path d="M198 116 L198 92 M191 100 L198 92 L205 100" stroke="#FFFFFF" strokeWidth="2.5" />
        </g>
      )}

      {kind === 'doorwindow' && (
        <g stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round">
          <rect x="86" y="80" width="34" height="66" rx="2" />
          <circle cx="113" cy="114" r="2.6" fill={accent} stroke="none" />
          <rect x="140" y="82" width="52" height="30" rx="2" />
          <line x1="166" y1="82" x2="166" y2="112" />
          <path d="M148 97 L158 97 M155 94 L158 97 L155 100" stroke="#FFFFFF" strokeWidth="2" />
        </g>
      )}

      {kind === 'workshop' && (
        <g stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* open double doors */}
          <path d="M86 74 L86 146 M86 74 L118 84 L118 146 L86 146" />
          {/* workbench + shelves inside */}
          <line x1="128" y1="126" x2="196" y2="126" />
          <line x1="132" y1="126" x2="132" y2="146" /><line x1="192" y1="126" x2="192" y2="146" />
          <line x1="128" y1="92" x2="196" y2="92" opacity="0.7" /><line x1="128" y1="108" x2="196" y2="108" opacity="0.7" />
          {/* power bolt */}
          <path d="M160 62 L150 80 L159 80 L152 96 L166 76 L157 76 Z" fill={accent} stroke="none" />
        </g>
      )}

      {kind === 'retail' && (
        <g stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* awning */}
          <path d="M82 84 L186 84 L196 100 L72 100 Z" />
          {[92, 112, 132, 152, 172].map(x => <line key={x} x1={x} y1="86" x2={x - 6} y2="98" strokeWidth="2" opacity="0.8" />)}
          {/* service window + fold-out counter */}
          <rect x="98" y="106" width="72" height="24" rx="2" />
          <line x1="86" y1="136" x2="182" y2="136" strokeWidth="3" />
          <circle cx="196" cy="118" r="3" fill={accent} stroke="none" />
        </g>
      )}

      {kind === 'vault' && (
        <g stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* reinforced door with cross-bracing */}
          <rect x="92" y="74" width="84" height="72" rx="2" />
          <line x1="92" y1="74" x2="176" y2="146" opacity="0.7" /><line x1="176" y1="74" x2="92" y2="146" opacity="0.7" />
          {/* padlock */}
          <rect x="122" y="98" width="26" height="20" rx="3" fill="#0F2D4A" />
          <path d="M127 98 L127 92 A8 8 0 0 1 143 92 L143 98" />
          <circle cx="135" cy="107" r="2.4" fill={accent} stroke="none" />
        </g>
      )}

      {/* nameplate */}
      <text x="160" y="168" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10" fill="rgba(255,255,255,0.55)" letterSpacing="1.5">
        {name.toUpperCase().slice(0, 34)}
      </text>
    </svg>
  )
}

// ── ProgressRing ───────────────────────────────────────────
// Circular percent indicator for photo upload + AI cropping progress.

export function ProgressRing({ pct, size = 36, stroke = 3.5, color = 'var(--primary, #0057B8)' }: {
  pct: number
  size?: number
  stroke?: number
  color?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="progressbar" aria-valuenow={Math.round(p)}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,130,150,.25)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset .25s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.3} fontWeight={700} fill={color} fontFamily="var(--mono, monospace)">
        {Math.round(p)}
      </text>
    </svg>
  )
}
