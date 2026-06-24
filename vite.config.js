import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import manifest from './manifest.json' // .json extension zaroori hai

// https://vite.dev/config/
export default defineConfig({
  plugins: [crx({ manifest }),tailwindcss(),react()],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
      host: 'localhost',
      protocol: 'ws',
    },
    // Ye line CORS fix karegi
    cors: true,
  },
})
