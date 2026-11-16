import type { GameLifecycle } from './game-lifecycle'
import { nextChoice, recordOf } from './records'

/**
 * The pace the player picks before a round, besides the difficulty, shared by
 * every minigame: how fast things go. Each game sets, in its own part of
 * config/difficulty.json, how much slower each pace is than its settings
 * there, in percent (faster if negative). 15% slower means:
 *
 * - speeds (things moving on their own) 15% lower: × 0.85;
 * - times (things staying, time to do something) 15% longer: × 1.15;
 * - times the player must keep something up (Stay in the Zone's time in the
 *   zone) 15% shorter: × 0.85, as that is easier, like the rest.
 *
 * The player's own controls (Improve Inner Voice's pad, Stay in the Zone's
 * ball) go at the same speed at every pace, and so do counts (choices,
 * dots…), the times in the round when games get harder, and short pauses
 * and animations set in the code.
 */

/** In the order the pace button goes through them, from the one it starts on. */
export const PACES = ['slow', 'normal', 'fast'] as const

export type Pace = (typeof PACES)[number]

export const PACE_NAMES: Readonly<Record<Pace, string>> = {
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
}

/** A value for each pace: `valueFor` it. */
export function byPace<Value>(valueFor: (pace: Pace) => Value): Record<Pace, Value> {
  return recordOf(PACES, valueFor)
}

/** How much slower each pace is than a game's settings, in percent (faster if negative). */
export type PacePercents = Readonly<Record<Pace, number>>

/** Throws unless each of `percents` (named `name`) is a pace: between 100% slower (still) and 100% faster. */
export function checkPaces(percents: PacePercents, name: string): void {
  for (const pace of PACES) {
    const percent = percents[pace]

    if (!(Math.abs(percent) < 100)) {
      throw new RangeError(`${name}.${pace} must be a number between -100 and 100, got ${percent}`)
    }
  }
}

/** How a pace changes a game's settings (see the top). */
export interface Pacing {
  /** A speed of things moving on their own. */
  speed(value: number): number
  /** A time something stays, or the player has to do something. */
  time(value: number): number
  /** A time the player must keep something up. */
  timeNeeded(value: number): number
}

/** How `pace` changes the settings of a game whose paces are `percents` slower. */
export function pacingFor(pace: Pace, percents: PacePercents): Pacing {
  const slower = percents[pace] / 100
  return {
    speed: (value) => value * (1 - slower),
    time: (value) => value * (1 + slower),
    timeNeeded: (value) => value * (1 - slower),
  }
}

/** The settings as they are (0% slower): what games use before a round. */
export const AS_SET: Pacing = {
  speed: (value) => value,
  time: (value) => value,
  timeNeeded: (value) => value,
}

export interface PaceChoice {
  /** The pace chosen: Slow until the player changes it. */
  readonly pace: Pace
  /**
   * Chooses the next pace: Slow → Normal → Fast → Slow. Only before a round
   * starts, so a round is played at one pace.
   */
  next(): void
}

export interface PaceChoiceOptions {
  lifecycle: GameLifecycle
}

export function createPaceChoice({ lifecycle }: PaceChoiceOptions): PaceChoice {
  let pace: Pace = PACES[0]

  return {
    get pace() {
      return pace
    },
    next() {
      if (lifecycle.state !== 'ready') {
        throw new Error(`Cannot change the pace of a game that is ${lifecycle.state}`)
      }

      pace = nextChoice(PACES, pace)
    },
  }
}
