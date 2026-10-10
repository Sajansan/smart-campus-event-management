import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: 'https://smart-campus-event-management-production-1133.up.railway.app', changeOrigin: true } } },
  preview: { proxy: { '/api': { target: 'https://smart-campus-event-management-production-1133.up.railway.app', changeOrigin: true } } },
})
