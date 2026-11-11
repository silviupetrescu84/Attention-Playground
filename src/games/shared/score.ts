import { checkNotNegative } from './checks'
import { isNewRound, type GameLifecycle } from './game-lifecycle'
import { createListeners } from './listeners'

/**
 * The score shared by every minigame. Each game decides how many points to
 * add and when; mistakes are counted separately (see the shared mistakes).
 * The score goes back to 0 whenever a round starts (and on restart).
 */

export interface ScoreChange {
  /** `reset` is the automatic return to 0 when a round starts or restarts. */
  readonly reason: 'add' | 'reset'
}

export type ScoreListener = (score: number, change: ScoreChange) => void

export interface Score {
  readonly value: number
  add(points: number): void
  /** Calls `listener` with the new value (and why it changed) after every change. */
  subscribe(listener: ScoreListener): () => void
}

export interface ScoreOptions {
  lifecycle: GameLifecycle
}

export function createScore({ lifecycle }: ScoreOptions): Score {
  let value = 0
  const listeners = createListeners<[number, ScoreChange]>()

  function set(next: number, reason: ScoreChange['reason']) {
    if (next === value) {
      return
    }

    value = next
    listeners.notify(value, { reason })
  }

  lifecycle.subscribe((change) => {
    if (isNewRound(change)) {
      set(0, 'reset')
    }
  })

  return {
    get value() {
      return value
    },
    add(points) {
      checkNotNegative(points, 'Points')
      set(value + points, 'add')
    },
    subscribe: listeners.add,
  }
}
