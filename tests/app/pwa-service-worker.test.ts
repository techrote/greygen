import { describe, expect, it } from 'vitest'
import {
  createPwaCacheRevision,
  renderServiceWorker,
} from '../../src/pwa/serviceWorkerSource'
import { resolveServiceWorkerUrl } from '../../src/pwa/serviceWorkerRegistration'

describe('PWA cache versioning', () => {
  const baseEntries = [
    { path: 'index.html', signature: '<html>v1</html>' },
    { path: 'assets/main-abc123.js', signature: 'main-v1' },
    {
      path: 'assets/greygen-processor-def456.js',
      signature: 'worklet-protocol-v6',
    },
    { path: 'manifest.webmanifest', signature: '{"name":"Greygen"}' },
  ] as const

  it('is deterministic regardless of bundle enumeration order', () => {
    const forward = createPwaCacheRevision(baseEntries)
    const reverse = createPwaCacheRevision([...baseEntries].reverse())

    expect(reverse).toBe(forward)
    expect(forward).toMatch(/^[0-9a-f]{8}$/)
  })

  it('changes the cache identity when the worklet payload changes', () => {
    const before = createPwaCacheRevision(baseEntries)
    const after = createPwaCacheRevision(
      baseEntries.map((entry) =>
        entry.path.includes('greygen-processor')
          ? { ...entry, signature: 'worklet-protocol-v7' }
          : entry,
      ),
    )

    expect(after).not.toBe(before)
  })

  it('rejects duplicate or unsafe cache paths', () => {
    expect(() =>
      createPwaCacheRevision([
        { path: 'index.html', signature: 'a' },
        { path: './index.html', signature: 'b' },
      ]),
    ).toThrow('Duplicate PWA precache path')

    expect(() =>
      renderServiceWorker(['index.html', '../private.txt'], '1234abcd'),
    ).toThrow('Unsafe PWA precache path')
    expect(() =>
      renderServiceWorker(
        ['index.html', 'https://example.test/external.js'],
        '1234abcd',
      ),
    ).toThrow('Unsafe PWA precache path')
  })

  it('requires the offline navigation shell and precaches the worklet atomically', () => {
    const revision = createPwaCacheRevision(baseEntries)
    const source = renderServiceWorker(
      baseEntries.map((entry) => entry.path),
      revision,
    )

    expect(source).toContain('index.html')
    expect(source).toContain('assets/greygen-processor-def456.js')
    expect(source).toContain("event.data?.type === 'SKIP_WAITING'")
    expect(source).toContain('cache.addAll')
    expect(source).toContain('key.startsWith(CACHE_PREFIX)')

    expect(() => renderServiceWorker(['assets/main.js'], revision)).toThrow(
      'PWA precache must contain index.html',
    )
  })

  it('matches the versioned shell and assets independently of server Vary headers', () => {
    const revision = createPwaCacheRevision(baseEntries)
    const source = renderServiceWorker(
      baseEntries.map((entry) => entry.path),
      revision,
    )

    expect(source).toContain("cache.match(scopedUrl('index.html'), {")
    expect(source).toContain('ignoreVary: true')
    expect(source).toContain(
      'const cached = await cache.match(request, { ignoreVary: true })',
    )
  })
})

describe('service worker URL resolution', () => {
  it('keeps root and GitHub Pages deployments inside their configured base', () => {
    expect(
      resolveServiceWorkerUrl('/', 'https://example.test/index.html'),
    ).toBe('https://example.test/sw.js')
    expect(
      resolveServiceWorkerUrl(
        '/greygen/',
        'https://techrote.github.io/greygen/index.html',
      ),
    ).toBe('https://techrote.github.io/greygen/sw.js')
  })
})
