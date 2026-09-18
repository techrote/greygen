export type ServiceWorkerUpdateHandler = (
  registration: ServiceWorkerRegistration,
) => void

export function resolveServiceWorkerUrl(
  baseUrl: string,
  locationHref: string,
): string {
  const scopeUrl = new URL(baseUrl, locationHref)
  return new URL('sw.js', scopeUrl).toString()
}

export async function registerGreygenServiceWorker(
  onUpdateReady: ServiceWorkerUpdateHandler,
): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return null
  }

  const registration = await navigator.serviceWorker.register(
    resolveServiceWorkerUrl(import.meta.env.BASE_URL, window.location.href),
    { scope: import.meta.env.BASE_URL },
  )

  const announceWaitingUpdate = () => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      onUpdateReady(registration)
    }
  }

  announceWaitingUpdate()
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) {
      return
    }

    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') {
        announceWaitingUpdate()
      }
    })
  })

  return registration
}

export function activateWaitingServiceWorker(
  registration: ServiceWorkerRegistration,
): boolean {
  if (!registration.waiting) {
    return false
  }

  registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}
