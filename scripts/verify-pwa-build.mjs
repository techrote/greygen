import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const baseArgument = process.argv.find((argument) => argument.startsWith('--base='))
const expectedBase = baseArgument?.slice('--base='.length) ?? '/'
const dist = new URL('../dist/', import.meta.url)

function fail(message) {
  throw new Error(`PWA build verification failed: ${message}`)
}

function readDistText(path) {
  const url = new URL(path, dist)
  if (!existsSync(url)) {
    fail(`missing dist/${path}`)
  }
  return readFileSync(url, 'utf8')
}

if (!expectedBase.startsWith('/') || !expectedBase.endsWith('/')) {
  fail(`base must be an absolute path ending in '/': ${expectedBase}`)
}

const indexHtml = readDistText('index.html')
const serviceWorker = readDistText('sw.js')
const manifest = JSON.parse(readDistText('manifest.webmanifest'))

if (!indexHtml.includes(`href="${expectedBase}manifest.webmanifest"`)) {
  fail(`index.html does not use manifest base ${expectedBase}`)
}
if (!indexHtml.includes(`href="${expectedBase}icons/greygen.svg"`)) {
  fail(`index.html does not use icon base ${expectedBase}`)
}
if (manifest.start_url !== './' || manifest.scope !== './') {
  fail('manifest start_url and scope must remain deployment-relative')
}
if (manifest.display !== 'standalone') {
  fail('manifest display must be standalone')
}

const assetsDirectory = new URL('assets/', dist)
const assetFiles = existsSync(assetsDirectory)
  ? readdirSync(assetsDirectory)
  : []
const workletFile = assetFiles.find(
  (file) => file.includes('greygen-processor') && file.endsWith('.js'),
)

if (!workletFile) {
  fail('built AudioWorklet asset was not found')
}
if (!serviceWorker.includes(`assets/${workletFile}`)) {
  fail('service worker does not precache the built AudioWorklet asset')
}
if (!serviceWorker.includes('index.html')) {
  fail('service worker does not precache the navigation shell')
}
if (!serviceWorker.includes("event.data?.type === 'SKIP_WAITING'")) {
  fail('service worker does not expose explicit update activation')
}
if (!/greygen-shell-[0-9a-f]{8}/.test(serviceWorker)) {
  fail('service worker cache name is not revisioned')
}

const moduleReferences = [
  ...indexHtml.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g),
].map((match) => match[1])

for (const reference of moduleReferences) {
  const relative = reference.startsWith(expectedBase)
    ? reference.slice(expectedBase.length)
    : reference.replace(/^\//, '')
  if (!serviceWorker.includes(relative)) {
    fail(`service worker does not precache index dependency ${reference}`)
  }
}

const iconPath = new URL('icons/greygen.svg', dist)
if (!existsSync(iconPath)) {
  fail('manifest icon was not copied to the production artifact')
}

console.log(
  `Verified PWA build at base ${expectedBase}: ${assetFiles.length} assets, worklet ${workletFile}`,
)
