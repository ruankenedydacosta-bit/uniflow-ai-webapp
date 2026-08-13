import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { execFileSync } from 'node:child_process'

function resolveBuildId() {
  const vercelSha = String(globalThis.process?.env?.VERCEL_GIT_COMMIT_SHA ?? '').trim()
  if (vercelSha) return vercelSha
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'development'
  }
}

function versionManifestPlugin({ buildId, releasedAt }) {
  return {
    name: 'uniflow-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({
          buildId,
          releasedAt,
          title: 'UniFlow AI',
          description: 'Atualização do aplicativo',
          novidades: [],
        }, null, 2)}\n`,
      })
    },
  }
}

const buildId = resolveBuildId()
const releasedAt = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    versionManifestPlugin({ buildId, releasedAt }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'uniflow-icon.png',
        'uniflow-icon-192.png',
        'uniflow-icon-512.png',
      ],
      manifest: {
        name: 'UniFlow AI',
        short_name: 'UniFlow AI',
        description: 'Conectando você às melhores decisões financeiras.',
        theme_color: '#020817',
        background_color: '#020817',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/uniflow-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/uniflow-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/uniflow-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        globIgnores: ['**/version.json'],
      },
    }),
  ],
  define: {
    'globalThis.__UNIFLOW_BUILD_ID__': JSON.stringify(buildId),
    'globalThis.__UNIFLOW_RELEASED_AT__': JSON.stringify(releasedAt),
  },
  resolve: {
    alias: {
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
      'react/jsx-runtime': fileURLToPath(
        new URL('./node_modules/react/jsx-runtime.js', import.meta.url)
      ),
      'react/jsx-dev-runtime': fileURLToPath(
        new URL('./node_modules/react/jsx-dev-runtime.js', import.meta.url)
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
})
