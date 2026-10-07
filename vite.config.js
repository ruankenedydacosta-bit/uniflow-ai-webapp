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
  const source = `${JSON.stringify({
    buildId,
    releasedAt,
    title: 'UniFlow AI',
    description: 'Atualização do aplicativo',
    novidades: [],
  }, null, 2)}\n`
  return {
    name: 'uniflow-version-manifest',
    // Em dev o arquivo não existe em disco: sem isto, a checagem de
    // atualização (pwaUpdateStore) recebe 404 a cada verificação.
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/version.json') return next()
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        response.end(source)
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source,
      })
    },
  }
}

// PWA-UPDATE3: terceira ponta do diagnostico de versao (runtime/server/SW).
// runtime vem de globalThis.__UNIFLOW_BUILD_ID__ (define abaixo) e server
// vem de version.json -- mas nenhum dos dois prova qual build o Service
// Worker ATIVO esta realmente servindo, porque skipWaiting/clientsClaim
// sao deliberadamente false (nunca trocamos o controller sem o usuario
// confirmar) e o SW gerado pelo Workbox nao expõe build id nenhum por
// padrao. Este bridge (mesmo mecanismo de legacy-update-bridge.js/
// push-notifications-bridge.js -- importScripts, nunca reescreve o SW
// gerado) responde a uma mensagem com o buildId do PROPRIO SW que a
// executa, permitindo provar de verdade um estado misturado (runtime=A,
// SW=B) em vez de inferir.
function buildIdBridgePlugin({ buildId }) {
  return {
    name: 'uniflow-build-id-bridge',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-id-bridge.js',
        source: `(() => {\n  const UNIFLOW_SW_BUILD_ID = ${JSON.stringify(buildId)};\n  self.addEventListener('message', (event) => {\n    if (event.data?.type !== 'UNIFLOW_GET_BUILD_ID') return;\n    const port = event.ports?.[0];\n    port?.postMessage({ type: 'UNIFLOW_SW_BUILD_ID', buildId: UNIFLOW_SW_BUILD_ID });\n  });\n})();\n`,
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
    buildIdBridgePlugin({ buildId }),
    VitePWA({
      // 'prompt' só faz o novo Service Worker esperar o SKIP_WAITING. Quem o
      // envia é o pwaUpdateStore, sozinho e num momento seguro; não há aviso
      // nem botão de atualizar na tela.
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
        cleanupOutdatedCaches: false,
        clientsClaim: false,
        skipWaiting: false,
        // PUSH1: extensao do SW via importScripts (mesmo mecanismo do
        // legacy-update-bridge) -- adiciona push/notificationclick sem
        // tocar em nenhuma das flags acima (update detection preservado).
        importScripts: ['/legacy-update-bridge.js', '/push-notifications-bridge.js', '/build-id-bridge.js'],
        globIgnores: ['**/version.json', '**/legacy-update-bridge.js', '**/push-notifications-bridge.js', '**/build-id-bridge.js'],
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
