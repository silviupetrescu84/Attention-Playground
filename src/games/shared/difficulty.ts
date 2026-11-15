import { checkNotNegative, checkWholeNumber } from './checks'

/**
 * How games get harder as a round goes on, shared by every minigame. Each
 * game's numbers are in config/difficulty.json.
 *
 * Three ways:
 *
 * - `Steps`: a value that changes by the same amount every so many things
 *   counted (words shown, goals played…), up to a limit;
 * - `StepTable`: a value that changes to each of a list of values, from some
 *   count or time in the round on;
 * - `createDifficulty`: settings that all get harder by the same percentage,
 *   from some times in the round on.
 *
 * ---
 *
 * `createDifficulty`: difficulty that rises with the round's time.
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
 *   [{ from: 10_000, percent: 10 }, { from: 20_000, percent: 25 }]
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
 * From `from` ms into the round, the game is `percent` % harder than at the
 * start: { from: 30_000, percent: 45 } means ×1.45 from 30 s on.
 */
export interface DifficultyStep {
  readonly from: number
  readonly percent: number
}

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
  checkDifficultySteps(steps, 'Difficulty steps')

  // Copied, so changing either afterwards cannot change the difficulty.
  const multipliers = steps.map(({ from, percent }) => ({
    atMs: from,
    multiplier: 1 + percent / 100,
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

/**
 * Throws unless `steps` (named `name`) are in order of time, each at 0 ms or
 * later and each 0 % harder or more.
 */
export function checkDifficultySteps(steps: readonly DifficultyStep[], name: string): void {
  steps.forEach(({ from, percent }, i) => {
    checkNotNegative(from, `${name}[${i}].from`)
    checkNotNegative(percent, `${name}[${i}].percent`)
  })
  checkInOrder(steps, name)
}

/** Throws unless each of `steps` is `from` later than the one before. */
function checkInOrder(steps: readonly { readonly from: number }[], name: string) {
  steps.forEach(({ from }, i) => {
    const previous = i > 0 ? steps[i - 1].from : -Infinity
    if (from <= previous) {
      throw new RangeError(`${name} must be in order of "from", got ${from} after ${previous}`)
    }
  })
}

/** Checks a value a setting can take, naming it `name` if it throws. */
export type ValueCheck = (value: number, name: string) => void

/**
 * A setting that changes in steps as things are counted (thoughts shown,
 * goals played…): `start` at first, then `change` more (less, if negative)
 * every `every` of them, never going past `limit`.
 */
export interface Steps {
  readonly start: number
  readonly change: number
  readonly every: number
  readonly limit: number
}

/** The value of `steps` once `count` have been counted. */
export function steppedAfter({ start, change, every, limit }: Steps, count: number): number {
  const value = start + change * Math.floor(count / every)
  return change < 0 ? Math.max(limit, value) : Math.min(limit, value)
}

/**
 * Throws unless `steps` (named `name`) start and end on values `checkValue`
 * accepts, change every whole number of things (1 or more), and change
 * towards their limit (or not at all).
 */
export function checkSteps(steps: Steps, name: string, checkValue: ValueCheck): void {
  const { start, change, every, limit } = steps
  checkValue(start, `${name}.start`)
  checkValue(limit, `${name}.limit`)
  checkWholeNumber(every, `${name}.every`, 1)

  if (!Number.isFinite(change)) {
    throw new RangeError(`${name}.change must be a finite number, got ${change}`)
  }
  if (change < 0 ? limit > start : limit < start) {
    const way = change < 0 ? 'down' : 'up'
    throw new RangeError(
      `${name} goes ${way} (change ${change}), so its limit must be ${change < 0 ? '≤' : '≥'} ` +
        `its start (${start}), got ${limit}`,
    )
  }
}

/**
 * A setting that is `start` at first, then each step's `value` from its
 * `from` on: from that many things counted (goals shown…), or from that
 * time in the round (in ms). Steps are in order of `from`.
 */
export interface StepTable {
  readonly start: number
  readonly steps: readonly TableStep[]
}

export interface TableStep {
  readonly from: number
  readonly value: number
}

/** The value of `table` at `at` (a count, or a time in the round). */
export function valueAt({ start, steps }: StepTable, at: number): number {
  let value = start

  for (const step of steps) {
    if (at >= step.from) {
      value = step.value
    }
  }

  return value
}

/** The largest value `table` ever takes. */
export function largestIn({ start, steps }: StepTable): number {
  return Math.max(start, ...steps.map((step) => step.value))
}

/**
 * Throws unless `table` (named `name`) only takes values `checkValue`
 * accepts, with its steps in order, each from 0 or later.
 */
export function checkStepTable(table: StepTable, name: string, checkValue: ValueCheck): void {
  checkValue(table.start, `${name}.start`)
  table.steps.forEach(({ from, value }, i) => {
    checkNotNegative(from, `${name}.steps[${i}].from`)
    checkValue(value, `${name}.steps[${i}].value`)
  })
  checkInOrder(table.steps, `${name}.steps`)
}
