import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' => aman untuk GitHub Pages, custom domain, maupun sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts'
          if (id.includes('react')) return 'react'
          return 'vendor'
        },
      },
    },
  },
  server: { host: '0.0.0.0', port: 5173, strictPort: false, allowedHosts: true },
})
