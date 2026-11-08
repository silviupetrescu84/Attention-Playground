import type { FrameScheduler } from '../games/shared/game-loop'

/** A frame scheduler whose clock only moves when the test says so. */
export class FakeFrames implements FrameScheduler {
  time = 1_000
  private nextId = 1
  private readonly callbacks = new Map<number, (timestamp: number) => void>()

  requestFrame(callback: (timestamp: number) => void) {
    const id = this.nextId++
    this.callbacks.set(id, callback)
    return id
  }

  cancelFrame(id: number) {
    this.callbacks.delete(id)
  }

  now() {
    return this.time
  }

  get pending() {
    return this.callbacks.size
  }

  /** Lets time pass without any frame (e.g. while paused). */
  wait(ms: number) {
    this.time += ms
  }

  /** Lets `ms` pass, then runs the frames requested so far at that time. */
  frame(ms = 16, timestamp = this.time + ms) {
    this.time += ms
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of callbacks) {
      callback(timestamp)
    }
  }

  /** Runs `count` frames of `ms` each. */
  frames(count: number, ms = 16) {
    for (let i = 0; i < count; i++) {
      this.frame(ms)
    }
  }
}
