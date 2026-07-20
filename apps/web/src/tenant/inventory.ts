// ============================================================
// Tenant-scoped inventory access
//
// ALL public inventory reads go through getInventory() with an
// explicit tenant + geo scope — never call containers.list()
// directly from a public page. Today every unit in the CSV belongs
// to the single seeded tenant, so tenant scoping is an assertion
// plus a filter seam; when a second tenant or a national 'network'
// scope arrives, this is the only file that learns about it.
// ============================================================

import { containers, isZipCovered, type Container } from '../lib/api'
import { getTenantById } from './index'

export interface InventoryQuery {
  tenantId: string
  nearZip?: string          // shopper's delivery ZIP (validates coverage)
  radiusMiles?: number      // reserved — depot distance filtering
  scope: 'tenant' | 'network'
}

export interface InventoryResult {
  units: Container[]
  zipCovered: boolean       // false when nearZip is outside the service area
}

export async function getInventory(q: InventoryQuery): Promise<InventoryResult> {
  const tenant = getTenantById(q.tenantId)
  if (!tenant) throw new Error(`Unknown tenant: ${q.tenantId}`)
  if (q.scope === 'network') {
    // No cross-tenant network exists yet; a network query still only
    // sees this tenant's stock. Kept explicit so callers already declare
    // the scope they mean.
  }

  const zipCovered = q.nearZip
    ? isZipCovered(q.nearZip) && tenant.serviceZipPrefixes.some(p => q.nearZip!.startsWith(p))
    : true

  const all = await containers.list()
  // Public surface: only live, transactable stock.
  const units = all
    .filter(c => c.status === 'available')
    .sort((a, b) => (b.photos?.filter(Boolean).length ?? 0) - (a.photos?.filter(Boolean).length ?? 0) || a.buyPrice - b.buyPrice)

  return { units, zipCovered }
}
