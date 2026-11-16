import { isNewRound, type GameLifecycle } from './game-lifecycle'
import { createListeners } from './listeners'
import type { Mistakes } from './mistakes'

/**
 * The combo, shared by every minigame: good things done in a row (each one
 * that scores) multiply the points of the next ones.
 *
 * Every round starts at X1. After 5 good things in a row, the points of the
 * next ones count double (X2); after 7 more, triple (X3); after 10 more, X4;
 * after 15 more, X5, the most. The good thing that gets there still scores at
 * the multiplier before. Any mistake counted (see the shared mistakes) starts
 * again from X1 and none in a row; things that are neither good nor a
 * mistake (a bad word let fall…) change nothing.
 */

/** How many more good things in a row each multiplier takes after the one before: X2, X3, X4, X5. */
export const COMBO_STEPS: readonly number[] = [5, 7, 10, 15]

/** The most a combo multiplies points by. */
export const MAX_MULTIPLIER = COMBO_STEPS.length + 1

/** The multiplier after `inARow` good things in a row. */
export function multiplierAfter(inARow: number): number {
  let needed = 0
  let multiplier = 1

  for (const step of COMBO_STEPS) {
    needed += step
    if (inARow >= needed) {
      multiplier++
    }
  }

  return multiplier
}

export interface Combo {
  /** What the points of the next good thing are multiplied by: 1 to MAX_MULTIPLIER. */
  readonly multiplier: number
  /** Good things done in a row since the last mistake (or the start of the round). */
  readonly inARow: number
  /** The highest multiplier reached this round. */
  readonly best: number
  /** One more good thing done in a row. */
  scored(): void
  /** Calls `listener` after every change (a good thing, a mistake, a new round). */
  subscribe(listener: () => void): () => void
}

export interface ComboOptions {
  lifecycle: GameLifecycle
  mistakes: Mistakes
}

export function createCombo({ lifecycle, mistakes }: ComboOptions): Combo {
  let inARow = 0
  let best = 1
  const listeners = createListeners<[]>()

  function set(nextInARow: number, nextBest: number) {
    if (nextInARow === inARow && nextBest === best) {
      return
    }

    inARow = nextInARow
    best = nextBest
    listeners.notify()
  }

  lifecycle.subscribe((change) => {
    if (isNewRound(change)) {
      set(0, 1)
    }
  })

  mistakes.subscribe((count) => {
    // A mistake made (not the count going back to none for a new round).
    if (count > 0) {
      set(0, best)
    }
  })

  return {
    get multiplier() {
      return multiplierAfter(inARow)
    },
    get inARow() {
      return inARow
    },
    get best() {
      return best
    },
    scored() {
      set(inARow + 1, Math.max(best, multiplierAfter(inARow + 1)))
    },
    subscribe: listeners.add,
  }
}
