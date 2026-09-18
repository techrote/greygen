export interface PwaCacheEntry {
  readonly path: string
  readonly signature: string
}

const CACHE_PREFIX = 'greygen-shell-'

function normalizePrecachePath(path: string): string {
  const normalized = path.startsWith('./') ? path.slice(2) : path

  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.includes('\\') ||
    normalized.includes('..') ||
    normalized.includes('?') ||
    normalized.includes('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    throw new Error(`Unsafe PWA precache path: ${path}`)
  }

  return normalized
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

export function createPwaCacheRevision(entries: readonly PwaCacheEntry[]): string {
  const normalized = entries
    .map((entry) => ({
      path: normalizePrecachePath(entry.path),
      signature: entry.signature,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))

  const uniquePaths = new Set<string>()
  let material = 'greygen-pwa-cache-v1\n'

  for (const entry of normalized) {
    if (uniquePaths.has(entry.path)) {
      throw new Error(`Duplicate PWA precache path: ${entry.path}`)
    }
    uniquePaths.add(entry.path)
    material += `${entry.path}\u0000${entry.signature}\n`
  }

  return fnv1a32(material).toString(16).padStart(8, '0')
}

export function renderServiceWorker(
  precachePaths: readonly string[],
  revision: string,
): string {
  if (!/^[0-9a-f]{8}$/.test(revision)) {
    throw new Error(`Invalid PWA cache revision: ${revision}`)
  }

  const paths = [...new Set(precachePaths.map(normalizePrecachePath))].sort()

  if (!paths.includes('index.html')) {
    throw new Error('PWA precache must contain index.html')
  }

  const serializedPaths = JSON.stringify(paths, null, 2)
  const cacheName = `${CACHE_PREFIX}${revision}`

  return `const CACHE_PREFIX = ${JSON.stringify(CACHE_PREFIX)}
const CACHE_NAME = ${JSON.stringify(cacheName)}
const PRECACHE_PATHS = ${serializedPaths}

function scopedUrl(path) {
  return new URL(path, self.registration.scope).toString()
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_PATHS.map(scopedUrl))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(request.url)
  const scopeUrl = new URL(self.registration.scope)

  if (
    requestUrl.origin !== scopeUrl.origin ||
    !requestUrl.pathname.startsWith(scopeUrl.pathname)
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        return (await cache.match(scopedUrl('index.html'))) ?? Response.error()
      }),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) {
        return cached
      }

      const response = await fetch(request)
      if (response.ok) {
        await cache.put(request, response.clone())
      }
      return response
    }),
  )
})
`
}
