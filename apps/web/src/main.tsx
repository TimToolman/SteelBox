import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles/tokens.css'
import MarketplacePage from './pages/index'
import AdminPage from './pages/admin/index'
import FieldAppPage from './pages/field/index'
import { AuthProvider, RequireRole } from './lib/auth'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      {/* basename follows vite's base (/ in dev, /SteelBox/ on GitHub Pages)
          so /admin and /field resolve at both origins */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Public — guests can search & view every listed container */}
          <Route path="/" element={<MarketplacePage />} />

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
