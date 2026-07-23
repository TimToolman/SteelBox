// ============================================================
// MVP Container Marketplace — shared types, constants & helpers
// Single source of truth for the component modules in this
// directory, so filters, cards, cart, and checkout can't disagree.
// ============================================================

import { SIZE_LABEL, type Container, type ContainerCondition, type ContainerSize } from '../../lib/api'

export type Tab = 'buy' | 'rent' | 'custom' | 'bulk'
export type SortKey = 'price-asc' | 'price-desc' | 'condition' | 'newest' | 'new-first'
export type CartMode = 'buy' | 'rent'
export interface CartItem { container: Container; mode: CartMode; rentTerm: number }

// Checkout form shape shared by the cart modal and the page-level placeOrder.
export interface CheckoutDetails {
  firstName: string; lastName: string; email: string; phone: string
  address: string; city: string; state: string; zip: string
  deliveryDate: string; accessNotes: string
  rentStart: string
  notifySms: boolean
}

// Which transaction modes a container allows, from its listingType.
export function allowedModes(c: Container): { buy: boolean; rent: boolean } {
  const lt = c.listingType ?? 'both'
  return { buy: lt !== 'rent', rent: lt !== 'buy' && c.rentMonthly != null }
}

// Canonical labels live in lib/api (SIZE_LABEL) so admin + storefront stay in sync.
export const SIZE_LABELS = SIZE_LABEL

// Canonical ordered size list for filters and forms.
export const SIZE_OPTIONS = Object.entries(SIZE_LABELS) as [ContainerSize, string][]

// Every unit is either factory-new or pre-owned; rows missing the field
// (pre-migration data) are treated as used.
export const condOf = (c: Container): ContainerCondition => c.condition === 'new' ? 'new' : 'used'
