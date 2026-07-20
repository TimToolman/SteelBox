import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import './styles/tokens.css'
import LandingPage from './pages/landing/index'
import CityPage, { ServiceAreaIndexPage } from './pages/landing/city'
import MarketplacePage from './pages/index'
import AdminPage from './pages/admin/index'
import FieldAppPage from './pages/field/index'
import { AuthProvider, RequireRole } from './lib/auth'
import { resolveTenant, cityBySlug } from './tenant'
import { captureAttribution } from './lib/attribution'

// Record UTM params / referrer once per page load so every lead or
// quote created later in the session carries its attribution.
captureAttribution()

// Brand/contact/service-area config resolved from the hostname —
// a second tenant is a config entry, not a code change.
const tenant = resolveTenant(window.location.hostname)

function CityRoute() {
  const { slug } = useParams()
  const city = slug ? cityBySlug(tenant, slug) : undefined
  if (!city) return <Navigate to="/service-area" replace />
  return <CityPage tenant={tenant} city={city} initialInventory={null} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      {/* basename follows vite's base (/ in dev and on Vercel, /SteelBox/ on
          GitHub Pages) so every route resolves at both origins */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Public marketing pages (statically prerendered at build time) */}
          <Route path="/" element={<LandingPage tenant={tenant} initialInventory={null} />} />
          <Route path="/service-area" element={<ServiceAreaIndexPage tenant={tenant} />} />
          <Route path="/service-area/:slug" element={<CityRoute />} />

          {/* Marketplace — guests can search & view every listed container */}
          <Route path="/shop" element={<MarketplacePage />} />

          {/* Role-gated portals */}
          <Route path="/admin" element={
            <RequireRole roles={['admin']} title="Admin Portal">
              <AdminPage />
            </RequireRole>
          } />
          <Route path="/field" element={
            <RequireRole roles={['driver', 'admin']} title="Field App">
              <FieldAppPage />
            </RequireRole>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
)
