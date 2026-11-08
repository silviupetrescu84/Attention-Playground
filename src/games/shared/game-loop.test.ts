import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGameLifecycle, type GameLifecycle } from './game-lifecycle'
import { FakeFrames } from '../../test/fake-frames'
import {
  browserFrameScheduler,
  createGameLoop,
  GAME_DURATION_MS,
  type GameFrame,
  type GameLoopOptions,
} from './game-loop'

function setup(options: Partial<GameLoopOptions> = {}) {
  const screen = new AbortController()
  const lifecycle = createGameLifecycle({ signal: screen.signal })
  const frames = new FakeFrames()
  const seen: GameFrame[] = []
  const onFrame = vi.fn((frame: GameFrame) => {
    seen.push(frame)
  })
  const loop = createGameLoop({
    lifecycle,
    onFrame,
    scheduler: frames,
    ...options,
  })
  return { screen, lifecycle, frames, loop, onFrame, seen }
}

describe('game loop timer', () => {
  it('starts at 0 with no frames', () => {
    const { loop, frames } = setup()

    expect(loop.elapsedMs).toBe(0)
    expect(loop.durationMs).toBe(GAME_DURATION_MS)
    expect(loop.durationMs).toBe(60_000)
    expect(frames.pending).toBe(0)
  })

  it('does not count time before the game starts', () => {
    const { lifecycle, loop, frames } = setup()

    frames.wait(5_000)
    lifecycle.start()
    frames.frame(16)

    expect(loop.elapsedMs).toBe(16)
  })

  it('adds the time since the previous frame on every frame', () => {
    const { lifecycle, loop, frames, seen } = setup()
    lifecycle.start()

    frames.frame(16)
    frames.frame(17)
    frames.frame(33)

    expect(loop.elapsedMs).toBe(66)
    expect(seen).toEqual([
      { deltaMs: 16, elapsedMs: 16 },
      { deltaMs: 17, elapsedMs: 33 },
      { deltaMs: 33, elapsedMs: 66 },
    ])
  })

  it('keeps exactly one frame pending while playing', () => {
    const { lifecycle, frames } = setup()
    lifecycle.start()

    expect(frames.pending).toBe(1)
    frames.frames(10)
    expect(frames.pending).toBe(1)
  })

  it('never counts negative time', () => {
    const { lifecycle, loop, frames } = setup()
    lifecycle.start()

    // The browser may stamp a frame slightly before the loop started.
    frames.frame(0, frames.time - 5)
    frames.frame(16)

    expect(loop.elapsedMs).toBe(16)
  })
})

describe('game loop and the lifecycle', () => {
  it('stops counting while paused and continues after resume', () => {
    const { lifecycle, loop, frames, onFrame } = setup()
    lifecycle.start()
    frames.frames(3, 100)

    lifecycle.pause()
    expect(frames.pending).toBe(0)
    frames.wait(10_000)
    frames.frame(100)
    expect(loop.elapsedMs).toBe(300)
    expect(onFrame).toHaveBeenCalledTimes(3)

    lifecycle.resume()
    frames.frame(50)
    expect(loop.elapsedMs).toBe(350)
  })

  it('finishes the game when the timer reaches 60 seconds', () => {
    const { lifecycle, loop, frames, seen } = setup()
    lifecycle.start()

    frames.frames(59, 1_000)
    expect(lifecycle.state).toBe('playing')

    frames.frame(1_000)

    expect(lifecycle.state).toBe('finished')
    expect(loop.elapsedMs).toBe(60_000)
    expect(seen.at(-1)).toEqual({ deltaMs: 1_000, elapsedMs: 60_000 })
    expect(frames.pending).toBe(0)
  })

  it('stops exactly at 60 seconds when the last frame goes past it', () => {
    const { lifecycle, loop, frames, seen } = setup()
    lifecycle.start()
    frames.frame(59_990)

    frames.frame(100)

    expect(lifecycle.state).toBe('finished')
    expect(loop.elapsedMs).toBe(60_000)
    expect(seen.at(-1)?.deltaMs).toBe(10)
  })

  it('reaches exactly 60 seconds with uneven frame times', () => {
    const { lifecycle, loop, frames } = setup()
    lifecycle.start()

    let count = 0
    while (lifecycle.state === 'playing' && count < 10_000) {
      frames.frame(1000 / 60)
      count++
    }

    expect(lifecycle.state).toBe('finished')
    expect(loop.elapsedMs).toBe(60_000)
    expect(count).toBeGreaterThanOrEqual(3_600)
    expect(count).toBeLessThanOrEqual(3_601)
  })

  it('does not run frames after finishing', () => {
    const { lifecycle, frames, onFrame } = setup()
    lifecycle.start()
    frames.frame(60_000)
    onFrame.mockClear()

    frames.frames(5)

    expect(onFrame).not.toHaveBeenCalled()
  })

  it('keeps the time when finished from the pause menu', () => {
    const { lifecycle, loop, frames } = setup()
    lifecycle.start()
    frames.frame(12_345)
    lifecycle.pause()

    lifecycle.finish()
    frames.frames(5)

    expect(loop.elapsedMs).toBe(12_345)
    expect(frames.pending).toBe(0)
  })

  it.each([
    ['from the pause menu', (lifecycle: GameLifecycle) => lifecycle.pause()],
    ['after finishing', (lifecycle: GameLifecycle) => lifecycle.finish()],
  ])('resets the timer on restart %s', (_when, stop) => {
    const { lifecycle, loop, frames } = setup()
    lifecycle.start()
    frames.frame(5_000)
    stop(lifecycle)

    lifecycle.restart()
    expect(loop.elapsedMs).toBe(0)
    expect(frames.pending).toBe(0)

    frames.wait(3_000)
    lifecycle.start()
    frames.frame(16)
    expect(loop.elapsedMs).toBe(16)
  })

  it('runs a full 60 seconds again after a restart', () => {
    const { lifecycle, frames } = setup()
    lifecycle.start()
    frames.frame(60_000)
    lifecycle.restart()
    lifecycle.start()

    frames.frame(59_999)
    expect(lifecycle.state).toBe('playing')
    frames.frame(1)
    expect(lifecycle.state).toBe('finished')
  })

  it('starts running if created while the game is already playing', () => {
    const screen = new AbortController()
    const lifecycle = createGameLifecycle({ signal: screen.signal })
    lifecycle.start()
    const frames = new FakeFrames()

    const loop = createGameLoop({ lifecycle, scheduler: frames })
    frames.frame(16)

    expect(loop.elapsedMs).toBe(16)
  })
})

describe('game loop and the game', () => {
  it('lets the game finish early from a frame', () => {
    const { lifecycle, loop, frames } = setup({
      onFrame: ({ elapsedMs }) => {
        if (elapsedMs >= 3_000) lifecycle.finish()
      },
    })
    lifecycle.start()

    frames.frames(10, 1_000)

    expect(lifecycle.state).toBe('finished')
    expect(loop.elapsedMs).toBe(3_000)
    expect(frames.pending).toBe(0)
  })

  it('does not finish twice when the game finishes on the last frame', () => {
    const { lifecycle, frames } = setup({
      onFrame: ({ elapsedMs }) => {
        if (elapsedMs === 60_000) lifecycle.finish()
      },
    })
    const finished = vi.fn()
    lifecycle.subscribe(({ state }) => {
      if (state === 'finished') finished()
    })
    lifecycle.start()

    expect(() => frames.frame(60_000)).not.toThrow()
    expect(lifecycle.state).toBe('finished')
    expect(finished).toHaveBeenCalledTimes(1)
  })

  it('stops frames when the game pauses from a frame', () => {
    const { lifecycle, frames } = setup({
      onFrame: () => lifecycle.pause(),
    })
    lifecycle.start()

    frames.frame()

    expect(lifecycle.state).toBe('paused')
    expect(frames.pending).toBe(0)
  })

  it('never runs two loops when a frame pauses and resumes', () => {
    const { lifecycle, frames } = setup({
      onFrame: () => {
        lifecycle.pause()
        lifecycle.resume()
      },
    })
    lifecycle.start()

    frames.frame()

    expect(lifecycle.state).toBe('playing')
    expect(frames.pending).toBe(1)
  })

  it('keeps running when a frame throws', () => {
    const failure = new Error('draw failed')
    const { lifecycle, loop, frames } = setup({
      onFrame: () => {
        throw failure
      },
    })
    lifecycle.start()

    expect(() => frames.frame(16)).toThrow(failure)
    expect(frames.pending).toBe(1)
    expect(() => frames.frame(16)).toThrow(failure)
    expect(loop.elapsedMs).toBe(32)
  })

  it('still finishes at 60 seconds when the last frame throws', () => {
    const failure = new Error('draw failed')
    const { lifecycle, frames } = setup({
      onFrame: ({ elapsedMs }) => {
        if (elapsedMs === 60_000) throw failure
      },
    })
    lifecycle.start()

    expect(() => frames.frame(60_000)).toThrow(failure)
    expect(lifecycle.state).toBe('finished')
  })

  it('works without an onFrame callback', () => {
    const { lifecycle, loop, frames } = setup({ onFrame: undefined })
    lifecycle.start()

    frames.frame(60_000)

    expect(loop.elapsedMs).toBe(60_000)
    expect(lifecycle.state).toBe('finished')
  })
})

describe('game loop options', () => {
  it('uses a custom duration', () => {
    const { lifecycle, loop, frames } = setup({ durationMs: 10_000 })
    lifecycle.start()

    frames.frame(9_999)
    expect(lifecycle.state).toBe('playing')
    expect(loop.elapsedMs).toBe(9_999)
    frames.frame(1)

    expect(loop.durationMs).toBe(10_000)
    expect(lifecycle.state).toBe('finished')
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a duration of %s',
    (durationMs) => {
      expect(() => setup({ durationMs })).toThrow(RangeError)
    },
  )
})

describe('game loop when leaving the screen', () => {
  it('stops all frames and keeps the time', () => {
    const { screen, lifecycle, loop, frames, onFrame } = setup()
    lifecycle.start()
    frames.frame(2_000)
    onFrame.mockClear()

    screen.abort()
    frames.frames(5, 1_000)

    expect(frames.pending).toBe(0)
    expect(onFrame).not.toHaveBeenCalled()
    expect(loop.elapsedMs).toBe(2_000)
  })

  it('does nothing for a lifecycle that is already stopped', () => {
    const lifecycle = createGameLifecycle({ signal: AbortSignal.abort() })
    const frames = new FakeFrames()

    const loop = createGameLoop({ lifecycle, scheduler: frames })

    expect(frames.pending).toBe(0)
    expect(loop.elapsedMs).toBe(0)
  })
})

describe('browserFrameScheduler', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses requestAnimationFrame, cancelAnimationFrame and performance.now', () => {
    const requestAnimationFrame = vi.fn(() => 7)
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
    vi.spyOn(performance, 'now').mockReturnValue(1234)
    const callback = () => {}

    expect(browserFrameScheduler.requestFrame(callback)).toBe(7)
    browserFrameScheduler.cancelFrame(7)

    expect(requestAnimationFrame).toHaveBeenCalledWith(callback)
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7)
    expect(browserFrameScheduler.now()).toBe(1234)
  })
})
