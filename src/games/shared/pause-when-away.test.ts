import { describe, expect, it, vi } from 'vitest'
import {
  createGameLifecycle,
  type GameAction,
  type GameState,
} from './game-lifecycle'
import { pauseWhenAway, type PageEvents } from './pause-when-away'

// Calls listeners directly (unlike a real EventTarget, which would only report
// a listener's error), so an error thrown by the helper fails the test.
class FakeTarget {
  private readonly listeners = new Map<string, Set<() => void>>()

  // Like the browser: nothing is added for an aborted signal, and the
  // listener is removed when the signal is aborted.
  addEventListener(type: string, listener: () => void, { signal }: { signal: AbortSignal }) {
    if (signal.aborted) return
    const forType = this.listeners.get(type) ?? new Set()
    forType.add(listener)
    this.listeners.set(type, forType)
    signal.addEventListener('abort', () => forType.delete(listener), { once: true })
  }

  get listenerCount() {
    let count = 0
    for (const forType of this.listeners.values()) {
      count += forType.size
    }
    return count
  }

  protected emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener()
    }
  }
}

class FakeDocument extends FakeTarget {
  visibilityState: DocumentVisibilityState = 'visible'

  hide() {
    this.visibilityState = 'hidden'
    this.emit('visibilitychange')
  }

  show() {
    this.visibilityState = 'visible'
    this.emit('visibilitychange')
  }
}

class FakeWindow extends FakeTarget {
  blur() {
    this.emit('blur')
  }
}

function setup(path: GameAction[] = []) {
  const page = { document: new FakeDocument(), window: new FakeWindow() }
  const screen = new AbortController()
  const lifecycle = createGameLifecycle({ signal: screen.signal })
  for (const action of path) {
    lifecycle[action]()
  }
  pauseWhenAway(lifecycle, page satisfies PageEvents)
  return { page, screen, lifecycle }
}

type LookAway = (page: ReturnType<typeof setup>['page']) => void

const lookAwayEvents: [name: string, lookAway: LookAway][] = [
  ['the page is hidden', (page) => page.document.hide()],
  ['the window loses focus', (page) => page.window.blur()],
]

describe('pauseWhenAway', () => {
  describe.each(lookAwayEvents)('when %s', (_name, lookAway) => {
    it('pauses a playing game', () => {
      const { page, lifecycle } = setup(['start'])
      const listener = vi.fn()
      lifecycle.subscribe(listener)

      lookAway(page)

      expect(lifecycle.state).toBe('paused')
      expect(listener).toHaveBeenCalledExactlyOnceWith({
        state: 'paused',
        previousState: 'playing',
        action: 'pause',
      })
    })

    it.each<[GameState, GameAction[]]>([
      ['ready', []],
      ['paused', ['start', 'pause']],
      ['finished', ['start', 'finish']],
    ])('leaves a %s game alone', (state, path) => {
      const { page, lifecycle } = setup(path)
      const listener = vi.fn()
      lifecycle.subscribe(listener)

      expect(() => lookAway(page)).not.toThrow()

      expect(lifecycle.state).toBe(state)
      expect(listener).not.toHaveBeenCalled()
    })

    it('pauses again after the player resumes', () => {
      const { page, lifecycle } = setup(['start'])

      lookAway(page)
      lifecycle.resume()
      lookAway(page)

      expect(lifecycle.state).toBe('paused')
    })
  })

  it('pauses only once when the page is hidden and loses focus together', () => {
    const { page, lifecycle } = setup(['start'])
    const listener = vi.fn()
    lifecycle.subscribe(listener)

    page.window.blur()
    page.document.hide()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not resume by itself when the page is visible again', () => {
    const { page, lifecycle } = setup(['start'])

    page.document.hide()
    page.document.show()

    expect(lifecycle.state).toBe('paused')
  })

  it('ignores the page becoming visible while playing', () => {
    const { page, lifecycle } = setup(['start'])

    page.document.show()

    expect(lifecycle.state).toBe('playing')
  })

  it('removes its listeners when the lifecycle is stopped', () => {
    const { page, screen } = setup(['start'])
    expect(page.document.listenerCount).toBe(1)
    expect(page.window.listenerCount).toBe(1)

    screen.abort()

    expect(page.document.listenerCount).toBe(0)
    expect(page.window.listenerCount).toBe(0)
    expect(() => page.document.hide()).not.toThrow()
    expect(() => page.window.blur()).not.toThrow()
  })

  it('adds no listeners for an already stopped lifecycle', () => {
    const page = { document: new FakeDocument(), window: new FakeWindow() }
    const lifecycle = createGameLifecycle({ signal: AbortSignal.abort() })

    pauseWhenAway(lifecycle, page)

    expect(page.document.listenerCount).toBe(0)
    expect(page.window.listenerCount).toBe(0)
  })
})
