// ============================================================
// SSG entry — built with `vite build --ssr` and invoked by
// prerender.mjs after the client build. Renders the landing,
// service-area index, and every city page to static HTML with
// per-route meta, so the served HTML contains the real content
// (hero copy, product grid, FAQ) instead of an empty shell.
// ============================================================

import React from 'react'
import { renderToString } from 'react-dom/server'
import LandingPage from './pages/landing/index'
import CityPage, { ServiceAreaIndexPage } from './pages/landing/city'
import { homeMeta, cityMeta, serviceAreaMeta, type RouteMeta } from './pages/landing/seo'
import { resolveTenant } from './tenant'
import type { Container } from './lib/api'

export interface SsgPage extends RouteMeta {
  html: string
}

// All prerenderable routes for the given tenant. `inventory` is the
// live unit list fetched at build time by prerender.mjs (null when
// the API was unreachable — pages fall back to category spec cards).
export function renderPages(inventory: Container[] | null): SsgPage[] {
  const tenant = resolveTenant()
  const pages: SsgPage[] = []

  pages.push({
    ...homeMeta(tenant),
    html: renderToString(<LandingPage tenant={tenant} initialInventory={inventory} />),
  })

  pages.push({
    ...serviceAreaMeta(tenant),
    html: renderToString(<ServiceAreaIndexPage tenant={tenant} />),
  })

  for (const city of tenant.cities) {
    pages.push({
      ...cityMeta(tenant, city),
      html: renderToString(<CityPage tenant={tenant} city={city} initialInventory={inventory} />),
    })
  }

  return pages
}

export function tenantInfo() {
  const tenant = resolveTenant()
  return { primaryDomain: tenant.primaryDomain, name: tenant.name }
}
