// ============================================================
// One icon set for the whole platform.
//
// Flat 2D line art on a 20×20 grid, single stroke, no fills except
// where a dot reads better than a ring. Every icon inherits
// currentColor and the caller's size, so an icon in a button is the
// button's colour without being told.
//
// Emoji are not icons: they render as a different typeface on every
// OS, ignore the surrounding colour, and sit on the text baseline
// rather than the optical centre. Anything pictorial on this site
// comes from here.
// ============================================================

import React from 'react'

export const ICON_PATHS: Record<string, React.ReactNode> = {
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
  // Marketplace + admin additions
  shield: <><path d="M10 2.2l6.2 2.4v5c0 4-2.6 7-6.2 8.2C6.4 16.6 3.8 13.6 3.8 9.6v-5z" /><polyline points="7.2,9.8 9.3,12 12.9,7.8" /></>,
  wrench: <><path d="M13.6 3.2a4 4 0 0 0-5.2 5l-5.6 5.6a1.6 1.6 0 0 0 2.3 2.3l5.6-5.6a4 4 0 0 0 5-5.2L13.4 8 12 6.6z" /></>,
  globe:  <><circle cx="10" cy="10" r="7.6" /><path d="M2.4 10h15.2" /><path d="M10 2.4c2.1 2.2 3.2 4.8 3.2 7.6S12.1 15.4 10 17.6C7.9 15.4 6.8 12.8 6.8 10S7.9 4.6 10 2.4z" /></>,
  anchor: <><circle cx="10" cy="3.8" r="1.8" /><path d="M10 5.6v11.6" /><path d="M6.4 8.2h7.2" /><path d="M3.4 11.4c0 3.6 2.9 6.4 6.6 6.4s6.6-2.8 6.6-6.4" /></>,
  upload: <><path d="M10 13.5V3.5" /><polyline points="6,7 10,3.2 14,7" /><path d="M3 13v3.5a1 1 0 001 1h12a1 1 0 001-1V13" /></>,
  close:  <><path d="M5 5l10 10M15 5L5 15" /></>,
  search: <><circle cx="9" cy="9" r="5.6" /><path d="M13.2 13.2 17.5 17.5" /></>,
  clock:  <><circle cx="10" cy="10" r="7.6" /><polyline points="10,5.6 10,10 13,12" /></>,
}

export type IconName = keyof typeof ICON_PATHS

export function Icon({ name, size = 18, color = 'currentColor', sw = 1.6, title }: {
  name: string
  size?: number
  color?: string
  sw?: number
  title?: string       // set only when the icon carries meaning on its own
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {ICON_PATHS[name]}
    </svg>
  )
}
