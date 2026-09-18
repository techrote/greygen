import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import {
  createPwaCacheRevision,
  renderServiceWorker,
  type PwaCacheEntry,
} from './src/pwa/serviceWorkerSource'

const PUBLIC_PWA_ASSETS = ['manifest.webmanifest', 'icons/greygen.svg'] as const

function sourceSignature(source: string | Uint8Array): string {
  return typeof source === 'string'
    ? source
    : Array.from(source).join(',')
}

function greygenPwaPlugin(): Plugin {
  return {
    name: 'greygen-pwa',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entries: PwaCacheEntry[] = Object.values(bundle).map((output) => ({
        path: output.fileName,
        signature:
          output.type === 'chunk'
            ? output.code
            : sourceSignature(output.source),
      }))

      for (const path of PUBLIC_PWA_ASSETS) {
        entries.push({
          path,
          signature: readFileSync(
            new URL(`./public/${path}`, import.meta.url),
            'utf8',
          ),
        })
      }

      const revision = createPwaCacheRevision(entries)
      const serviceWorker = renderServiceWorker(
        entries.map((entry) => entry.path),
        revision,
      )

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorker,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), greygenPwaPlugin()],
})
