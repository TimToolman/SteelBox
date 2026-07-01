// ============================================================
// SteelBox UI Primitives
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
}

export function Modal({ open, onClose, children, maxWidth = 500, noPadding = false }: ModalProps) {
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
        zIndex: 600,
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
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.07)',
            border: 'none',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
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
