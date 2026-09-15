import { AppStateRepository, type StoragePort } from './AppStateRepository'

class UnavailableStorage implements StoragePort {
  constructor(private readonly reason: string) {}

  getItem(): string | null {
    throw new Error(this.reason)
  }

  setItem(): void {
    throw new Error(this.reason)
  }

  removeItem(): void {
    throw new Error(this.reason)
  }
}

export function createBrowserAppStateRepository(): AppStateRepository {
  try {
    const storage = globalThis.localStorage
    if (!storage) {
      return new AppStateRepository(
        new UnavailableStorage('localStorage is unavailable in this browser context'),
      )
    }
    return new AppStateRepository(storage)
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'localStorage access was denied'
    return new AppStateRepository(new UnavailableStorage(reason))
  }
}
