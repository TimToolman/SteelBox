// ============================================================
// Filter rail — the marketplace-style left sidebar, reusable by
// the supplier fleet, supplier claims, and shipper review lists.
// Chip groups toggle set membership; the rail shows a live match
// count and a one-click reset. On narrow screens the rail wraps
// above the content instead of beside it.
// ============================================================

import React, { useState } from 'react'

const INK = '#0D0E12', INK3 = '#6B7280', DIV = '#E2E4E9', BLUE = '#0057B8'

export function useSetFilter<T>() {
  const [set, setSet] = useState<Set<T>>(new Set())
  const toggle = (v: T) => setSet(prev => {
    const next = new Set(prev)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  })
  const clear = () => setSet(new Set())
  // Empty selection = no filter (everything passes) — matches the marketplace.
  const passes = (v: T) => set.size === 0 || set.has(v)
  return { set, toggle, clear, passes }
}

export function FilterRail({ title = 'Filters', count, total, onReset, children }: {
  title?: string
  count: number
  total: number
  onReset: () => void
  children: React.ReactNode
}) {
  return (
    <aside style={{ width: '218px', flexShrink: 0, background: '#fff', border: `1px solid ${DIV}`, borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', padding: '14px 16px', alignSelf: 'flex-start', position: 'sticky', top: '74px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{title}</span>
        <button onClick={onReset} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: BLUE, fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Reset</button>
      </div>
      <div style={{ fontSize: '11px', color: INK3, marginBottom: '10px' }}>{count} of {total} shown</div>
      {children}
    </aside>
  )
}

export function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '13px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: INK3, marginBottom: '6px' }}>{label}</div>
      {children}
    </div>
  )
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>{children}</div>
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 11px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
      border: `1.5px solid ${on ? BLUE : DIV}`,
      background: on ? '#E3F0FF' : '#fff',
      color: on ? BLUE : '#44474F',
      whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

export const railSelect: React.CSSProperties = { width: '100%', padding: '7px 9px', border: `1.5px solid ${DIV}`, borderRadius: '10px', fontSize: '12px', outline: 'none', fontFamily: 'inherit', background: '#fff', color: INK, boxSizing: 'border-box' }
export const railInput: React.CSSProperties = { width: '100%', padding: '7px 9px', border: `1.5px solid ${DIV}`, borderRadius: '10px', fontSize: '12px', fontFamily: 'var(--mono)', outline: 'none', boxSizing: 'border-box' }

// Claim-date period filter: quick ranges plus a specific month/year drill.
export interface Period { quick: 'all' | 'today' | 'month' | 'year'; year: string; month: string }
export const PERIOD_ALL: Period = { quick: 'all', year: 'all', month: 'all' }

export function periodPasses(iso: string | undefined | null, p: Period): boolean {
  if (!iso) return p.quick === 'all' && p.year === 'all' && p.month === 'all'
  const d = new Date(iso)
  const now = new Date()
  if (p.quick === 'today' && d.toDateString() !== now.toDateString()) return false
  if (p.quick === 'month' && (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth())) return false
  if (p.quick === 'year' && d.getFullYear() !== now.getFullYear()) return false
  if (p.year !== 'all' && d.getFullYear() !== Number(p.year)) return false
  if (p.month !== 'all' && d.getMonth() !== Number(p.month)) return false
  return true
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function PeriodFilter({ period, onChange, years }: {
  period: Period
  onChange: (p: Period) => void
  years: number[]   // distinct years present in the data
}) {
  return (
    <FilterGroup label="Filed">
      <ChipRow>
        {([['all', 'All'], ['today', 'Today'], ['month', 'This month'], ['year', 'This year']] as const).map(([k, label]) => (
          <Chip key={k} on={period.quick === k && period.year === 'all' && period.month === 'all'}
            onClick={() => onChange({ quick: k, year: 'all', month: 'all' })}>{label}</Chip>
        ))}
      </ChipRow>
      <div style={{ display: 'flex', gap: '6px', marginTop: '7px' }}>
        <select value={period.month} onChange={e => onChange({ quick: 'all', year: period.year === 'all' ? String(new Date().getFullYear()) : period.year, month: e.target.value })} style={railSelect}>
          <option value="all">Any month</option>
          {MONTHS.map((m, i) => <option key={m} value={String(i)}>{m}</option>)}
        </select>
        <select value={period.year} onChange={e => onChange({ quick: 'all', year: e.target.value, month: period.month })} style={railSelect}>
          <option value="all">Any year</option>
          {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>
    </FilterGroup>
  )
}
