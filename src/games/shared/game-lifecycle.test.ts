import { describe, expect, it, vi } from 'vitest'
import {
  createGameLifecycle,
  GameStoppedError,
  isNewRound,
  InvalidTransitionError,
  nextGameState,
  type GameAction,
  type GameLifecycle,
  type GameState,
  type GameStateChange,
} from './game-lifecycle'

const states: GameState[] = ['ready', 'playing', 'paused', 'finished']
const actions: GameAction[] = ['start', 'pause', 'resume', 'finish', 'restart']

// The expected state machine, spelled out independently of the implementation.
const validTransitions: [from: GameState, action: GameAction, to: GameState][] =
  [
    ['ready', 'start', 'playing'],
    ['playing', 'pause', 'paused'],
    ['playing', 'finish', 'finished'],
    ['paused', 'resume', 'playing'],
    ['paused', 'finish', 'finished'],
    ['paused', 'restart', 'ready'],
    ['finished', 'restart', 'ready'],
  ]

const invalidTransitions = states.flatMap((from) =>
  actions
    .filter(
      (action) =>
        !validTransitions.some(([f, a]) => f === from && a === action),
    )
    .map((action): [GameState, GameAction] => [from, action]),
)

const pathTo: Record<GameState, GameAction[]> = {
  ready: [],
  playing: ['start'],
  paused: ['start', 'pause'],
  finished: ['start', 'finish'],
}

function newLifecycle(signal = new AbortController().signal) {
  return createGameLifecycle({ signal })
}

function lifecycleIn(
  state: GameState,
  signal = new AbortController().signal,
): GameLifecycle {
  const lifecycle = newLifecycle(signal)

  for (const action of pathTo[state]) {
    lifecycle[action]()
  }

  expect(lifecycle.state).toBe(state)
  return lifecycle
}

describe('game lifecycle transitions', () => {
  it('starts in the ready state', () => {
    expect(newLifecycle().state).toBe('ready')
  })

  it('covers every state/action combination', () => {
    expect(validTransitions.length + invalidTransitions.length).toBe(
      states.length * actions.length,
    )
  })

  it.each(validTransitions)('%s --%s--> %s', (from, action, to) => {
    const lifecycle = lifecycleIn(from)
    const listener = vi.fn()
    lifecycle.subscribe(listener)

    expect(lifecycle.can(action)).toBe(true)
    lifecycle[action]()

    expect(lifecycle.state).toBe(to)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ state: to, previousState: from, action })
  })

  it.each(invalidTransitions)(
    'rejects %s --%s--> without changing state or notifying',
    (from, action) => {
      const lifecycle = lifecycleIn(from)
      const listener = vi.fn()
      lifecycle.subscribe(listener)

      expect(lifecycle.can(action)).toBe(false)

      let caught: unknown
      try {
        lifecycle[action]()
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(InvalidTransitionError)
      expect(caught).toMatchObject({
        state: from,
        action,
        message: `Cannot ${action} a game that is ${from}`,
      })
      expect(lifecycle.state).toBe(from)
      expect(listener).not.toHaveBeenCalled()
    },
  )

  it('nextGameState agrees with the expected table', () => {
    for (const [from, action, to] of validTransitions) {
      expect(nextGameState(from, action)).toBe(to)
    }

    for (const [from, action] of invalidTransitions) {
      expect(nextGameState(from, action)).toBeUndefined()
    }
  })

  it('supports a full session and a second round after restart', () => {
    const lifecycle = newLifecycle()
    const seen: GameState[] = []
    lifecycle.subscribe(({ state }) => seen.push(state))

    lifecycle.start()
    lifecycle.pause()
    lifecycle.resume()
    lifecycle.finish()
    lifecycle.restart()
    lifecycle.start()

    expect(seen).toEqual([
      'playing',
      'paused',
      'playing',
      'finished',
      'ready',
      'playing',
    ])
  })

  it('keeps separate lifecycles independent', () => {
    const first = newLifecycle()
    const second = newLifecycle()
    const secondListener = vi.fn()
    second.subscribe(secondListener)

    first.start()

    expect(first.state).toBe('playing')
    expect(second.state).toBe('ready')
    expect(secondListener).not.toHaveBeenCalled()
  })
})

describe('game lifecycle subscriptions', () => {
  it('does not call a listener on subscribe', () => {
    const lifecycle = newLifecycle()
    const listener = vi.fn()

    lifecycle.subscribe(listener)

    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies every subscriber once per change', () => {
    const lifecycle = newLifecycle()
    const first = vi.fn()
    const second = vi.fn()
    lifecycle.subscribe(first)
    lifecycle.subscribe(second)

    lifecycle.start()

    const change: GameStateChange = {
      state: 'playing',
      previousState: 'ready',
      action: 'start',
    }
    expect(first).toHaveBeenCalledExactlyOnceWith(change)
    expect(second).toHaveBeenCalledExactlyOnceWith(change)
  })

  it('does not notify when a transition is rejected', () => {
    const lifecycle = newLifecycle()
    const listener = vi.fn()
    lifecycle.subscribe(listener)

    expect(() => lifecycle.pause()).toThrow(InvalidTransitionError)
    expect(() => lifecycle.finish()).toThrow(InvalidTransitionError)
    lifecycle.start()
    expect(() => lifecycle.start()).toThrow(InvalidTransitionError)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies a listener subscribed twice only once per change', () => {
    const lifecycle = newLifecycle()
    const listener = vi.fn()
    lifecycle.subscribe(listener)
    lifecycle.subscribe(listener)

    lifecycle.start()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe, without affecting others', () => {
    const lifecycle = newLifecycle()
    const removed = vi.fn()
    const kept = vi.fn()
    const unsubscribe = lifecycle.subscribe(removed)
    lifecycle.subscribe(kept)

    lifecycle.start()
    unsubscribe()
    lifecycle.pause()

    expect(removed).toHaveBeenCalledTimes(1)
    expect(kept).toHaveBeenCalledTimes(2)
  })

  it('allows unsubscribe to be called more than once', () => {
    const lifecycle = newLifecycle()
    const listener = vi.fn()
    const unsubscribe = lifecycle.subscribe(listener)

    unsubscribe()
    expect(() => unsubscribe()).not.toThrow()

    lifecycle.start()
    expect(listener).not.toHaveBeenCalled()
  })

  it('skips a listener removed by an earlier listener in the same change', () => {
    const lifecycle = newLifecycle()
    const second = vi.fn()
    let unsubscribeSecond = () => {}
    lifecycle.subscribe(() => unsubscribeSecond())
    unsubscribeSecond = lifecycle.subscribe(second)

    lifecycle.start()

    expect(second).not.toHaveBeenCalled()
  })

  it('lets a listener unsubscribe itself while being notified', () => {
    const lifecycle = newLifecycle()
    const once = vi.fn(() => unsubscribe())
    const other = vi.fn()
    const unsubscribe = lifecycle.subscribe(once)
    lifecycle.subscribe(other)

    lifecycle.start()
    lifecycle.pause()

    expect(once).toHaveBeenCalledTimes(1)
    expect(other).toHaveBeenCalledTimes(2)
  })

  it('notifies a listener added during a change from the next change on', () => {
    const lifecycle = newLifecycle()
    const late = vi.fn()
    let added = false
    lifecycle.subscribe(() => {
      if (!added) {
        added = true
        lifecycle.subscribe(late)
      }
    })

    lifecycle.start()
    expect(late).not.toHaveBeenCalled()

    lifecycle.pause()
    expect(late).toHaveBeenCalledExactlyOnceWith({
      state: 'paused',
      previousState: 'playing',
      action: 'pause',
    })
  })

  it('delivers changes in order when a listener triggers a transition', () => {
    const lifecycle = newLifecycle()
    const firstSeen: GameState[] = []
    const secondSeen: GameState[] = []

    // E.g. a game with nothing to play finishes as soon as it starts.
    lifecycle.subscribe(({ state }) => {
      firstSeen.push(state)
      if (state === 'playing') {
        lifecycle.finish()
      }
    })
    lifecycle.subscribe(({ state }) => secondSeen.push(state))

    lifecycle.start()

    expect(lifecycle.state).toBe('finished')
    expect(firstSeen).toEqual(['playing', 'finished'])
    expect(secondSeen).toEqual(['playing', 'finished'])
  })

  it('still notifies other listeners when one throws, then rethrows', () => {
    const lifecycle = newLifecycle()
    const failure = new Error('listener failed')
    const after = vi.fn()
    lifecycle.subscribe(() => {
      throw failure
    })
    lifecycle.subscribe(after)

    expect(() => lifecycle.start()).toThrow(failure)

    // The transition itself happened and everyone heard about it.
    expect(lifecycle.state).toBe('playing')
    expect(after).toHaveBeenCalledTimes(1)

    // The lifecycle keeps working afterwards.
    expect(() => lifecycle.pause()).toThrow(failure)
    expect(lifecycle.state).toBe('paused')
    expect(after).toHaveBeenCalledTimes(2)
  })

  it('reports several failing listeners together', () => {
    const lifecycle = newLifecycle()
    const first = new Error('first')
    const second = new Error('second')
    lifecycle.subscribe(() => {
      throw first
    })
    lifecycle.subscribe(() => {
      throw second
    })

    let caught: unknown
    try {
      lifecycle.start()
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([first, second])
    expect(lifecycle.state).toBe('playing')
  })
})

describe('stopping a game lifecycle', () => {
  it('exposes the signal it was created with', () => {
    const { signal } = new AbortController()

    expect(newLifecycle(signal).signal).toBe(signal)
  })

  it('pauses a playing game when stopped, notifying subscribers once', () => {
    const controller = new AbortController()
    const lifecycle = lifecycleIn('playing', controller.signal)
    const listener = vi.fn()
    lifecycle.subscribe(listener)

    controller.abort()

    expect(lifecycle.state).toBe('paused')
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      state: 'paused',
      previousState: 'playing',
      action: 'pause',
    })
  })

  it.each<GameState>(['ready', 'paused', 'finished'])(
    'leaves a %s game as it is when stopped',
    (state) => {
      const controller = new AbortController()
      const lifecycle = lifecycleIn(state, controller.signal)
      const listener = vi.fn()
      lifecycle.subscribe(listener)

      controller.abort()

      expect(lifecycle.state).toBe(state)
      expect(listener).not.toHaveBeenCalled()
    },
  )

  it.each(states)('rejects every action once stopped in %s', (state) => {
    const controller = new AbortController()
    const lifecycle = lifecycleIn(state, controller.signal)
    controller.abort()
    const stoppedIn = lifecycle.state
    const listener = vi.fn()
    lifecycle.subscribe(listener)

    for (const action of actions) {
      expect(lifecycle.can(action)).toBe(false)
      expect(() => lifecycle[action]()).toThrow(GameStoppedError)
      expect(() => lifecycle[action]()).toThrow(
        `Cannot ${action} a game that has been stopped`,
      )
    }

    expect(lifecycle.state).toBe(stoppedIn)
    expect(listener).not.toHaveBeenCalled()
  })

  it('is stopped from the start when given an aborted signal', () => {
    const lifecycle = newLifecycle(AbortSignal.abort())

    expect(lifecycle.state).toBe('ready')
    expect(lifecycle.can('start')).toBe(false)
    expect(() => lifecycle.start()).toThrow(GameStoppedError)
  })

  it('does not let a subscriber restart the game during the final pause', () => {
    const controller = new AbortController()
    const lifecycle = lifecycleIn('playing', controller.signal)
    let caught: unknown
    lifecycle.subscribe(({ state }) => {
      if (state === 'paused') {
        try {
          lifecycle.resume()
        } catch (error) {
          caught = error
        }
      }
    })

    controller.abort()

    expect(caught).toBeInstanceOf(GameStoppedError)
    expect(lifecycle.state).toBe('paused')
  })

  it('delivers changes in order when a subscriber leaves the screen', () => {
    const controller = new AbortController()
    const lifecycle = newLifecycle(controller.signal)
    const firstSeen: GameState[] = []
    const secondSeen: GameState[] = []
    lifecycle.subscribe(({ state }) => {
      firstSeen.push(state)
      if (state === 'playing') {
        controller.abort()
      }
    })
    lifecycle.subscribe(({ state }) => secondSeen.push(state))

    lifecycle.start()

    expect(lifecycle.state).toBe('paused')
    expect(firstSeen).toEqual(['playing', 'paused'])
    expect(secondSeen).toEqual(['playing', 'paused'])
  })
})

describe('isNewRound', () => {
  it('is true for start and restart only', () => {
    const roundStarts = validTransitions
      .filter(([from, action, state]) => isNewRound({ previousState: from, action, state }))
      .map(([, action]) => action)

    expect(roundStarts).toEqual(['start', 'restart', 'restart'])
  })
})
