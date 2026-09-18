import { useEffect, useState } from 'react'
import {
  activateWaitingServiceWorker,
  registerGreygenServiceWorker,
} from './serviceWorkerRegistration'

export function PwaUpdatePrompt() {
  const [waitingRegistration, setWaitingRegistration] =
    useState<ServiceWorkerRegistration | null>(null)
  const [isReloading, setIsReloading] = useState(false)

  useEffect(() => {
    let mounted = true

    registerGreygenServiceWorker((registration) => {
      if (mounted) {
        setWaitingRegistration(registration)
      }
    }).catch(() => {
      // Offline capability is progressive enhancement. The core app remains usable
      // if registration is unavailable or the browser rejects it.
    })

    return () => {
      mounted = false
    }
  }, [])

  if (!waitingRegistration) {
    return null
  }

  const applyUpdate = () => {
    if (isReloading) {
      return
    }

    setIsReloading(true)
    let reloadRequested = false
    const reloadOnce = () => {
      if (reloadRequested) {
        return
      }
      reloadRequested = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, {
      once: true,
    })

    if (!activateWaitingServiceWorker(waitingRegistration)) {
      navigator.serviceWorker.removeEventListener('controllerchange', reloadOnce)
      setIsReloading(false)
      setWaitingRegistration(null)
    }
  }

  return (
    <aside className="pwa-update" role="status" aria-live="polite">
      <span>A Greygen update is ready.</span>
      <button type="button" onClick={applyUpdate} disabled={isReloading}>
        {isReloading ? 'Reloading…' : 'Reload update'}
      </button>
    </aside>
  )
}
