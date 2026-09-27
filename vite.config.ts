import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Absolute base: published blueprints live at real paths (/b/:id, /gallery), and
  // loadCatalog()/iconUrl() build their URLs from import.meta.env.BASE_URL. A relative
  // base would resolve those to /b/data/catalog.json and 404 on every route but "/".
  // The trade is that the build can no longer be served from an arbitrary subpath.
  base: '/',
  plugins: [react()],
  server: {
    // `wrangler dev` serves the API; vite keeps HMR. Run both for a full local loop.
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/storage': 'http://127.0.0.1:8787',
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
