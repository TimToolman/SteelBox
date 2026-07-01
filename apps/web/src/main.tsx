import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles/tokens.css'
import MarketplacePage from './pages/index'
import AdminPage from './pages/admin/index'
import FieldAppPage from './pages/field/index'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<MarketplacePage />} />

        {/* Internal — add auth guards here once JWT is wired */}
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/field" element={<FieldAppPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
