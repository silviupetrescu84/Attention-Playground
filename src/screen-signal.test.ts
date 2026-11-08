import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createGameLifecycle,
  GameStoppedError,
} from './games/shared/game-lifecycle'
import { pauseWhenAway } from './games/shared/pause-when-away'
import { getScreenSignal, leaveScreen } from './screen-signal'

describe('screen signal', () => {
  it('stays the same while the screen is shown', () => {
    expect(getScreenSignal()).toBe(getScreenSignal())
    expect(getScreenSignal().aborted).toBe(false)
  })

  it('is aborted when leaving the screen, and the next screen gets a fresh one', () => {
    const previous = getScreenSignal()

    leaveScreen()

    expect(previous.aborted).toBe(true)
    expect(getScreenSignal()).not.toBe(previous)
    expect(getScreenSignal().aborted).toBe(false)
  })

  it('gives the new signal to code that runs while the old one is aborted', () => {
    const previous = getScreenSignal()
    let seenDuringAbort: AbortSignal | undefined
    previous.addEventListener('abort', () => {
      seenDuringAbort = getScreenSignal()
    })

    leaveScreen()

    expect(seenDuringAbort).toBe(getScreenSignal())
    expect(seenDuringAbort).not.toBe(previous)
  })

  it('stops a running game and everything tied to it on a page swap', () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const visibilityListeners = new Set<() => void>()
    const blurListeners = new Set<() => void>()
    // Like the browser: listeners go away when their signal is aborted.
    const listenTo =
      (listeners: Set<() => void>) =>
      (_type: string, listener: () => void, { signal }: { signal: AbortSignal }) => {
        listeners.add(listener)
        signal.addEventListener('abort', () => listeners.delete(listener), { once: true })
      }
    const page = {
      document: {
        visibilityState: 'visible' as DocumentVisibilityState,
        addEventListener: listenTo(visibilityListeners),
      },
      window: { addEventListener: listenTo(blurListeners) },
    }

    // A game sets itself up on the current screen...
    const lifecycle = createGameLifecycle({ signal: getScreenSignal() })
    pauseWhenAway(lifecycle, page)
    const tick = vi.fn()
    let timer: ReturnType<typeof setInterval> | undefined
    lifecycle.subscribe(({ state }) => {
      clearInterval(timer)
      if (state === 'playing') {
        timer = setInterval(tick, 1)
      }
    })
    lifecycle.start()
    vi.advanceTimersByTime(10)
    expect(tick).toHaveBeenCalled()
    tick.mockClear()

    // ...and the player navigates away.
    leaveScreen()

    expect(lifecycle.state).toBe('paused')
    expect(lifecycle.can('resume')).toBe(false)
    expect(() => lifecycle.resume()).toThrow(GameStoppedError)
    expect(visibilityListeners.size).toBe(0)
    expect(blurListeners.size).toBe(0)

    // The game's timer was stopped by the final pause.
    vi.advanceTimersByTime(100)
    expect(tick).not.toHaveBeenCalled()
  })
})
