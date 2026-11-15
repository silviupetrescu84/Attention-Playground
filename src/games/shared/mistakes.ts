import { DIFFICULTY } from '../../config/difficulty'
import { checkWholeNumber } from './checks'
import { isNewRound, type GameLifecycle } from './game-lifecycle'
import { createListeners } from './listeners'

/**
 * The difficulty the player picks before a round, and the mistakes they
 * make in it, shared by every minigame.
 *
 * Each difficulty fails the round on a number of mistakes (MISTAKES_TO_FAIL,
 * set in config/difficulty.json), the moment that mistake happens. Mistakes
 * after that (say, a second wrong item under the
 * same tap) are not counted, so the count ends on exactly that number.
 * What counts as a mistake is up to each game, which calls `add()` for each
 * one.
 *
 * The count goes back to 0 whenever a round starts (and on restart). The
 * difficulty stays as chosen until the player changes it.
 */

/** In the order the difficulty button goes through them. */
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard', 'extreme'] as const

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number]

/** A value for each difficulty: `valueFor` it. */
export function byLevel<Value>(
  valueFor: (level: DifficultyLevel) => Value,
): Record<DifficultyLevel, Value> {
  const entries = DIFFICULTY_LEVELS.map((level) => [level, valueFor(level)])
  // Object.fromEntries loses the levels' type; these are exactly DIFFICULTY_LEVELS.
  return Object.fromEntries(entries) as Record<DifficultyLevel, Value>
}

/** The mistake that fails (ends) the round, at each difficulty. */
export const MISTAKES_TO_FAIL: Readonly<Record<DifficultyLevel, number>> = DIFFICULTY.mistakesToFail

for (const level of DIFFICULTY_LEVELS) {
  checkWholeNumber(MISTAKES_TO_FAIL[level], `mistakesToFail.${level}`, 1)
}

export const DIFFICULTY_NAMES: Readonly<Record<DifficultyLevel, string>> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  extreme: 'Extreme',
}

export interface Mistakes {
  /** The difficulty chosen: easy until the player changes it. */
  readonly level: DifficultyLevel
  /** Mistakes made in the current round. */
  readonly count: number
  /**
   * Chooses the next difficulty: easy → medium → hard → extreme → easy. Only
   * before a round starts, so a round is played at one difficulty.
   */
  nextLevel(): void
  /**
   * Counts a mistake in the round being played, and ends the round at once if
   * it is the one the difficulty fails on. Does nothing once it is over.
   */
  add(): void
  /** Calls `listener` with the new count whenever it changes (also back to 0). */
  subscribe(listener: (count: number) => void): () => void
}

export interface MistakesOptions {
  lifecycle: GameLifecycle
}

export function createMistakes({ lifecycle }: MistakesOptions): Mistakes {
  let level: DifficultyLevel = DIFFICULTY_LEVELS[0]
  let count = 0
  const listeners = createListeners<[number]>()

  lifecycle.subscribe((change) => {
    if (isNewRound(change) && count !== 0) {
      count = 0
      listeners.notify(count)
    }
  })

  return {
    get level() {
      return level
    },
    get count() {
      return count
    },
    nextLevel() {
      if (lifecycle.state !== 'ready') {
        throw new Error(`Cannot change the difficulty of a game that is ${lifecycle.state}`)
      }

      const next = (DIFFICULTY_LEVELS.indexOf(level) + 1) % DIFFICULTY_LEVELS.length
      level = DIFFICULTY_LEVELS[next]
    },
    add() {
      if (lifecycle.state !== 'playing') {
        return
      }

      count++
      listeners.notify(count)

      if (count >= MISTAKES_TO_FAIL[level]) {
        lifecycle.finish()
      }
    },
    subscribe: listeners.add,
  }
}
