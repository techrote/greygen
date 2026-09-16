import { describe, expect, it } from 'vitest'
import {
  BoundedFrameLoop,
  type FrameScheduler,
} from '../../src/features/analyzer/analyzerLoop'

describe('BoundedFrameLoop', () => {
  it('has only one pending frame and cancels it on stop', () => {
    let next = 1
    const callbacks = new Map<number, FrameRequestCallback>()
    const cancelled: number[] = []
    const scheduler: FrameScheduler = {
      request(callback) {
        const id = next++
        callbacks.set(id, callback)
        return id
      },
      cancel(handle) {
        cancelled.push(handle)
        callbacks.delete(handle)
      },
    }
    let samples = 0
    const loop = new BoundedFrameLoop(scheduler, 10, () => {
      samples += 1
    })
    loop.start()
    loop.start()
    expect(callbacks.size).toBe(1)
    const [firstId, callback] = [...callbacks.entries()][0] ?? []
    expect(firstId).toBeTruthy()
    callbacks.delete(firstId as number)
    callback?.(100)
    expect(samples).toBe(1)
    expect(callbacks.size).toBe(1)
    loop.stop()
    expect(callbacks.size).toBe(0)
    expect(cancelled).toHaveLength(1)
  })
})
