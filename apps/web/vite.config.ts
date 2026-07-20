import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path is deploy-target dependent:
//   GitHub Pages (test bed):  /SteelBox/  (the default, unchanged)
//   Vercel production:        /           (vercel.json sets VITE_BASE=/)
export default defineConfig({
  base: process.env.VITE_BASE || '/SteelBox/',
  plugins: [react()],
  server: {
    port: 3000,
  },

})
