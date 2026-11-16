import type { DifficultyStep, Steps, StepTable } from '../games/shared/difficulty'
import type { DifficultyLevel } from '../games/shared/mistakes'
import type { CappedSpeedUp, SpeedUp } from '../games/shared/motion'
import type { PacePercents } from '../games/shared/pace'
import json from './difficulty.json'

/**
 * How hard every minigame is, read from difficulty.json: change the numbers
 * there to tune the games and compare them.
 *
 * Every time is in ms (…Ms) and every speed in game px per second (the
 * canvas is 400 × 800 game px). Each game's `paces` set how much slower
 * each pace is than its settings, in percent (faster if negative): speeds
 * that much lower, and times that much longer (see games/shared/pace.ts). What a setting changes by is in its name:
 * …ByWords changes as words are shown, …ByTimeMs with the round's time, and
 * so on. Settings come in three shapes (see games/shared/difficulty.ts):
 *
 * - { start, change, every, limit }: `start` at first, then `change` more
 *   (less, if negative) every `every`, never past `limit`;
 * - { start, steps: [{ from, value }…] }: `start` at first, then each
 *   `value` from its `from` on;
 * - [{ from, percent }…] (Emotions Rise): `percent` % harder than at the
 *   start from `from` ms on: things happen that much faster or sooner.
 *
 * Each game checks its numbers when the app loads, and fails straight away
 * with the setting's name if one cannot work (a negative speed, a limit the
 * other way from where it is going, more choices than fit on screen…).
 *
 * Tests play the games with their own copy of these numbers
 * (src/test/pinned-difficulty.ts), so changing them here does not break
 * tests; difficulty.test.ts checks that every game accepts them.
 */

export interface DifficultyConfig {
  /** The mistake each difficulty ends the round on: 10 = the 10th. */
  readonly mistakesToFail: Readonly<Record<DifficultyLevel, number>>
  readonly emotionsRise: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** Each bubble rises at a random speed between these… */
    readonly speed: Range
    /** …and the next comes after a random time between these. */
    readonly spawnDelayMs: Range
    /** How much harder all four get (faster, sooner) as the round goes on. */
    readonly harderByTimeMs: readonly DifficultyStep[]
  }
  readonly alignTheActions: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** How fast the rows move, by goals shown so far. Each row keeps its speed. */
    readonly rowSpeedByGoals: StepTable
  }
  readonly shiftPerspective: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** How long a thought is shown alone before its choices come. */
    readonly readingMs: number
    /** How many choices (one good) each thought has, by thoughts shown so far: 2 to 6. */
    readonly choicesByThoughts: StepTable
    /** The time to choose, by thoughts shown so far. */
    readonly timeToChooseMsByThoughts: Steps
  }
  readonly focusAttention: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** How fast every bubble moves, by the round's time. */
    readonly speedByTimeMs: StepTable
    /** The time from one bubble to the next, by the round's time. */
    readonly spawnDelayMsByTimeMs: StepTable
  }
  readonly makeItHappen: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** How long a goal is shown alone before its actions come. */
    readonly readingMs: number
    /** How many actions (one good) each goal has, by goals shown so far: 2 to 6. */
    readonly actionsByGoals: Steps
    /** The time to choose, by goals shown so far. */
    readonly timeToChooseMsByGoals: Steps
  }
  readonly pauseBeforeReacting: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** The most situations on screen: when another comes, the oldest goes. */
    readonly mostOnScreen: number
    /** The time from one situation to the next, by situations shown so far. */
    readonly spawnDelayMsBySituations: Steps
  }
  readonly improveInnerVoice: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** The time from one word to the next, by words shown so far. */
    readonly spawnDelayMsByWords: Steps
    /** How fast each word falls, by words shown before it. Each keeps its speed. */
    readonly fallSpeedByWords: Steps
    /** How fast the pad moves: it sets off at `start`, speeds up, up to `max`. */
    readonly padSpeed: CappedSpeedUp
    /** Good words caught in a row to be empowered (the next mistake is forgiven). */
    readonly goodInARowToEmpower: number
  }
  readonly stayInTheZone: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** How fast the ball rises while held: it sets off at `start`, then speeds up. */
    readonly riseSpeed: SpeedUp
    /**
     * How fast it falls once let go: it turns around, then falls as fast as it
     * was rising (at least `start`), and speeds up.
     */
    readonly fallSpeed: SpeedUp & {
      /** How much its speed changes every second as it turns: slowing going up, faster going down. */
      readonly turnAccelerationPerS: number
    }
    /** How tall each zone is, by zones shown so far. */
    readonly zoneHeightByZones: Steps
    /** How long each zone stays, by zones shown so far. */
    readonly zoneTimeMsByZones: Steps
    /** How long the ball must be in each zone (the white ring), by zones shown so far. */
    readonly timeInZoneMsByZones: Steps
  }
  readonly rememberGratitude: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** How long the things are shown before they turn around, by turns played so far. */
    readonly rememberMsByTurns: Steps
    /** How many things each turn has, by turns played so far: 2 to 8. */
    readonly thingsByTurns: Steps
  }
  readonly makeGoodConnections: {
    /** How much slower each pace is than the settings below, in percent. */
    readonly paces: PacePercents
    /** How many dots each round has, by rounds played so far: 2 to 8. */
    readonly dotsByRounds: StepTable
    /** The time to connect them all, by rounds played so far. */
    readonly timeToConnectMsByRounds: Steps
  }
}

/** From `min` to `max`. */
export interface Range {
  readonly min: number
  readonly max: number
}

/** How hard every minigame is (see above). */
export const DIFFICULTY: DifficultyConfig = json
