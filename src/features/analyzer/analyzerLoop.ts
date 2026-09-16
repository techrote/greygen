export interface FrameScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

export class BoundedFrameLoop {
  private handle: number | null = null
  private lastSampleAt = Number.NEGATIVE_INFINITY

  constructor(
    private readonly scheduler: FrameScheduler,
    private readonly maxFps: number,
    private readonly sample: () => void,
  ) {}

  start(): void {
    if (this.handle !== null) return
    this.handle = this.scheduler.request(this.tick)
  }

  stop(): void {
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle)
      this.handle = null
    }
  }

  private readonly tick = (time: number): void => {
    this.handle = null
    const interval = 1000 / Math.max(1, this.maxFps)
    if (time - this.lastSampleAt >= interval) {
      this.lastSampleAt = time
      this.sample()
    }
    this.start()
  }
}
