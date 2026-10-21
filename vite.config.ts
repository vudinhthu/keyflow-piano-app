import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { buildIdentity } from './scripts/build-identity'

const buildId = buildIdentity()

export default defineConfig({
  define: { __KEYFLOW_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react(), tailwindcss(), VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.ts',
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['favicon.svg', 'icons/*.png'],
    manifest: {
      id: '/',
      name: 'KeyFlow — Piano studio',
      short_name: 'KeyFlow',
      description: 'Chơi grand piano bằng bàn phím máy tính.',
      lang: 'vi',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#131a1a',
      background_color: '#141b1b',
      icons: [
        { src: '/icons/piano-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/piano-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/piano-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,json,md,svg,png,webmanifest,mp3}'],
      globIgnores: ['**/offline-cache-contract.json'],
      rollupFormat: 'iife',
      buildPlugins: { vite: [{ name: 'worker-build-identity', config: () => ({ define: { __KEYFLOW_BUILD_ID__: JSON.stringify(buildId) } }) }] },
      manifestTransforms: [async entries => {
        const manifest = entries.map(entry => ({
          ...entry,
          integrity: `sha256-${createHash('sha256').update(readFileSync(resolve('dist', decodeURIComponent(entry.url)))).digest('base64')}`,
        }))
        // Build evidence only; runtime owns its contract embedded in sw.js.
        writeFileSync('dist/offline-cache-contract.json', JSON.stringify({ entries: manifest }, null, 2))
        return { manifest, warnings: [] }
      }],
    },
  })],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
