// ============================================================
// SSG entry — built with `vite build --ssr` and invoked by
// prerender.mjs after the client build. Renders the landing
// page to static HTML with per-route meta, so the served HTML
// contains the real content (hero copy, FAQ) instead of an
// empty shell.
// ============================================================

import React from 'react'
import { renderToString } from 'react-dom/server'
import LandingPage from './pages/landing/index'
import { homeMeta, type RouteMeta } from './pages/landing/seo'
import { resolveTenant } from './tenant'

export interface SsgPage extends RouteMeta {
  html: string
}

// All prerenderable routes for the given tenant.
export function renderPages(): SsgPage[] {
  const tenant = resolveTenant()
  return [{
    ...homeMeta(tenant),
    html: renderToString(<LandingPage tenant={tenant} />),
  }]
}

export function tenantInfo() {
  const tenant = resolveTenant()
  return { primaryDomain: tenant.primaryDomain, name: tenant.name }
}
