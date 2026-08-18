import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles/tokens.css'
import LandingPage from './pages/landing/index'
import MarketplacePage from './pages/marketplace'
import AdminPage from './pages/admin/index'
import SupplierPortalPage from './pages/supplier/index'
import ShipperReviewPage from './pages/shipper/index'
import ClaimPage from './pages/claim/index'
import FieldAppPage from './pages/field/index'
import { AuthProvider, RequireRole } from './lib/auth'
import { resolveTenant } from './tenant'
import { captureAttribution } from './lib/attribution'
import { BugReportTab } from './components/BugReport'

// Record UTM params / referrer once per page load so every lead or
// quote created later in the session carries its attribution.
captureAttribution()

// Brand/contact config resolved from the hostname —
// a second tenant is a config entry, not a code change.
const tenant = resolveTenant(window.location.hostname)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      {/* basename follows vite's base (/ in dev and on Vercel, /SteelBox/ on
          GitHub Pages) so every route resolves at both origins */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Public marketing page (statically prerendered at build time) */}
          <Route path="/" element={<LandingPage tenant={tenant} />} />

          {/* Marketplace — guests can search & view every listed container */}
          <Route path="/shop" element={<MarketplacePage />} />

          {/* Role-gated portals */}
          <Route path="/admin" element={
            <RequireRole roles={['admin']} title="Admin Portal">
              <AdminPage />
            </RequireRole>
          } />
          {/* Supplier portal — container owners; damage-claim pipeline */}
          <Route path="/supplier" element={
            <RequireRole roles={['supplier', 'admin']} title="Supplier Portal">
              <SupplierPortalPage />
            </RequireRole>
          } />
          {/* Shipping line — reviews damage-claim estimates */}
          <Route path="/shipper" element={
            <RequireRole roles={['shipper', 'admin']} title="Shipper Claims Review">
              <ShipperReviewPage />
            </RequireRole>
          } />
          {/* One claim, full page, its own tab — supplier, inspector or admin */}
          <Route path="/claim" element={
            <RequireRole roles={['supplier', 'driver', 'inspector', 'adjuster', 'admin']} title="Damage Claim">
              <ClaimPage />
            </RequireRole>
          } />
          <Route path="/field" element={
            <RequireRole roles={['driver', 'inspector', 'adjuster', 'admin']} title="Field App">
              <FieldAppPage />
            </RequireRole>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {/* Demo/beta: the floating "Report an issue" tab rides on every
            portal — one place for testers to log what they hit. */}
        <BugReportTab />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
)
