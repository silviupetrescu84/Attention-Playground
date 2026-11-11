import { checkNotNegative } from './checks'

/**
 * Difficulty that rises with the round's time, for games that get harder
 * as the round goes on.
 *
 * Each game declares its own settings: what they are called, their value at
 * the start of a round, and whether a higher or a lower value is harder. For
 * example:
 *
 *   minSpeed:     { start: 40, harder: 'higher' }   bubbles rise faster
 *   spawnDelayMs: { start: 700, harder: 'lower' }   bubbles come sooner
 *
 * and the moments it gets harder, with how much harder than the start, as a
 * percentage (not of the step before):
 *
 *   [[10_000, 10], [20_000, 25]]
 *
 *   0–10 s: ×1.0 (starting values)   10–20 s: ×1.1   from 20 s: ×1.25
 *
 * "×1.25 harder" means the same for every setting: things happen 1.25 times as
 * fast or as often. So a setting that is harder when `higher` (a speed, a
 * rate) is multiplied by it, and one that is harder when `lower` (a delay, a
 * time limit) is divided by it.
 *
 * The game asks for `valuesAt(elapsedMs)` wherever it uses a setting. The time
 * is the round's time (the game timer), so pauses do not count.
 */

/**
 * From `atMs` into the round, the game is `increasePercent` % harder than at
 * the start: [30_000, 45] means ×1.45 from 30 s on.
 */
export type DifficultyStep = readonly [atMs: number, increasePercent: number]

export interface DifficultySetting {
  /** The value at the start of a round. */
  readonly start: number
  /** Whether the game gets harder as the value goes up (speeds) or down (delays). */
  readonly harder: 'higher' | 'lower'
}

/** A game's settings that change with difficulty, by name. */
export type DifficultySettings<Name extends string = string> = Readonly<
  Record<Name, DifficultySetting>
>

/** The value of every setting at one moment. */
export type DifficultyValues<Name extends string> = Readonly<Record<Name, number>>

export interface DifficultyOptions<Name extends string> {
  /**
   * When the game gets harder, in order of time. Each percentage must be 0 or
   * more; it may be lower than the one before, for a breather. No steps: the
   * settings keep their starting values all round.
   */
  steps: readonly DifficultyStep[]
  settings: DifficultySettings<Name>
}

export interface Difficulty<Name extends string> {
  /** Every setting's value at the round's time `elapsedMs`. */
  valuesAt(elapsedMs: number): DifficultyValues<Name>
}

export function createDifficulty<Name extends string>({
  steps,
  settings,
}: DifficultyOptions<Name>): Difficulty<Name> {
  checkSteps(steps)

  // Copied, so changing either afterwards cannot change the difficulty.
  const multipliers = steps.map(([atMs, increasePercent]) => ({
    atMs,
    multiplier: 1 + increasePercent / 100,
  }))
  // Object.entries and Object.keys lose the names' type; these are exactly
  // the names in `settings`.
  const copies = Object.fromEntries(
    Object.entries<DifficultySetting>(settings).map(([name, { start, harder }]) => {
      checkNotNegative(start, `Starting value of "${name}"`)
      return [name, { start, harder }]
    }),
  ) as Record<Name, DifficultySetting>
  const names = Object.keys(copies) as Name[]

  function multiplierAt(elapsedMs: number) {
    let multiplier = 1

    for (const step of multipliers) {
      if (step.atMs > elapsedMs) {
        break
      }
      multiplier = step.multiplier
    }

    return multiplier
  }

  function valueAt(name: Name, elapsedMs: number) {
    const { start, harder } = copies[name]
    const multiplier = multiplierAt(elapsedMs)
    return harder === 'higher' ? start * multiplier : start / multiplier
  }

  return {
    valuesAt(elapsedMs) {
      const values = Object.fromEntries(names.map((name) => [name, valueAt(name, elapsedMs)]))
      // Every name in `settings` is in `values`, each with a number.
      return values as DifficultyValues<Name>
    },
  }
}

function checkSteps(steps: readonly DifficultyStep[]) {
  steps.forEach(([atMs, increasePercent], i) => {
    checkNotNegative(atMs, 'Difficulty step time (ms)')
    checkNotNegative(increasePercent, 'Difficulty increase (%)')

    const previousAtMs = steps[i - 1]?.[0]
    if (previousAtMs !== undefined && atMs <= previousAtMs) {
      throw new RangeError(
        `Difficulty steps must be in order of time, got ${atMs} ms after ${previousAtMs} ms`,
      )
    }
  })
}
