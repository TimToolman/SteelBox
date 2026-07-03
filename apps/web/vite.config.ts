import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/SteelBox/',
  plugins: [react()],
  server: {
    port: 3000,
  },

})
