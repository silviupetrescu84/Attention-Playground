import { DIFFICULTY } from '../../config/difficulty'
import { LARGE_OVAL } from '../shared/artwork'
import { checkPositive, checkWholeNumber } from '../shared/checks'
import { checkSteps, steppedAfter, type Steps } from '../shared/difficulty'
import type { GamePoint } from '../shared/game-canvas'
import { isInEllipse } from '../shared/geometry'
import {
  createGoodOrBadTally,
  type GoodOrBadCount,
  type GoodOrBadEnd,
  type GoodOrBadMistake,
  type GoodOrBadStats,
} from '../shared/good-or-bad'
import { AS_SET, checkPaces, pacingFor, type Pace, type PacePercents } from '../shared/pace'
import { findRandomSpot, gapBetweenOvals, playAreaFor, randomPointIn } from '../shared/placing'
import type { Random } from '../shared/random'
import type { Score } from '../shared/score'
import { FADE_MS, fadeAt, passDeadlines, type Due } from '../shared/timed-turns'
import { createWordPicker, type Word, type WordLists, type WordPicker } from '../shared/word-picker'

/**
 * The rules of Pause Before Reacting.
 *
 * Situations appear one after another, each in an oval at a random place on
 * the canvas: the first as soon as the round starts, then one every
 * SPAWN_DELAY, shorter as more are shown (longer or shorter at the pace
 * chosen, see the shared pace).
 * Each is good or bad, at random, but never more than 4 of a kind in a row
 * (see the shared word picker). Each fades in over 0.1 s and stays until
 * tapped, or until the screen is full: when a new one comes and
 * MOST_ON_SCREEN are already shown, the oldest goes, fading out over 0.1 s.
 *
 * - Tapping a good one: +1.
 * - Tapping a bad one: a mistake.
 * - A good one gone without a tap: a mistake.
 * - A bad one gone without a tap: nothing (no points).
 *
 * A tapped situation fades out over 0.1 s with a green or red hue. New ones
 * keep coming at their times whatever the player taps, so the screen can be
 * empty for a while. Each is at least SITUATION_GAP from the others, border
 * to border, those fading out included, and EDGE_GAP from the edges.
 *
 * When a mistake ends the round, everything stops as it is.
 */

/** How much slower each pace is than the settings here (see config/difficulty.json and the shared pace). */
export const PACE_PERCENTS: PacePercents = DIFFICULTY.pauseBeforeReacting.paces
checkPaces(PACE_PERCENTS, 'pauseBeforeReacting.paces')

const { spawnDelayMsBySituations, mostOnScreen } = DIFFICULTY.pauseBeforeReacting

/** The time from one situation to the next, by how many have been shown (see config/difficulty.json). */
export const SPAWN_DELAY: Steps = spawnDelayMsBySituations
checkSteps(SPAWN_DELAY, 'pauseBeforeReacting.spawnDelayMsBySituations', checkPositive)

/** The most situations on screen at once. */
export const MOST_ON_SCREEN = mostOnScreen
checkWholeNumber(MOST_ON_SCREEN, 'pauseBeforeReacting.mostOnScreen', 1)

/** A situation does not come back while among the last this many of its kind. */
export const RECENT_TO_AVOID = 10

/** Points for each way a situation can end (none for a bad one let pass). */
export const POINTS: Readonly<Partial<Record<GoodOrBadCount, number>>> = {
  goodTapped: 1,
}

/** Space always kept between two situations, border to border… */
export const SITUATION_GAP = 15
/** …and between a situation and the score bar or the edges of the canvas. */
export const EDGE_GAP = 4
/** Random places tried for a new situation before making do. */
export const PLACE_TRIES = 500

/** Where a situation's centre can be. */
const AREA = playAreaFor(LARGE_OVAL, EDGE_GAP)

export interface Situation extends GamePoint {
  readonly word: Word
  /** When it starts to fade in. */
  readonly shownAtMs: number
  /** When it was tapped or went, and starts to fade out; undefined until then. */
  endedAtMs: number | undefined
  /** How it ended; undefined while it is on screen. */
  end: GoodOrBadEnd | undefined
}

/** How visible `situation` is at the round's time `timeMs`: 0 to 1. */
export function situationOpacityAt(situation: Situation, timeMs: number): number {
  const { shownAtMs, endedAtMs } = situation
  return fadeAt({ fromMs: shownAtMs, endedAtMs }, timeMs)
}

/** Whether `situation` is still on screen at `timeMs`: not ended, or still fading out. */
function stillShownAt({ endedAtMs }: Situation, timeMs: number): boolean {
  return endedAtMs === undefined || timeMs < endedAtMs + FADE_MS
}

/** Whether `point` is on `situation`'s oval, as seen. */
export function isOnSituation(point: GamePoint, situation: GamePoint): boolean {
  return isInEllipse(point, situation, LARGE_OVAL.radiusX, LARGE_OVAL.radiusY)
}

/** Whether a situation at `spot` is SITUATION_GAP from each of `others`. */
function clearOf(others: readonly GamePoint[]) {
  return (spot: GamePoint) =>
    others.every((other) => gapBetweenOvals(spot, other, LARGE_OVAL) >= SITUATION_GAP)
}

/** The smallest gap from `spot` to any of `others`. */
function smallestGap(spot: GamePoint, others: readonly GamePoint[]): number {
  return Math.min(...others.map((other) => gapBetweenOvals(spot, other, LARGE_OVAL)))
}

/**
 * A random place for a new situation, SITUATION_GAP from those `staying` and
 * those `fading` out. If none is found (it practically never happens), one
 * clear of those staying only (the others are about to go), or else the
 * clearest place tried.
 */
export function placeSituation(
  staying: readonly GamePoint[],
  fading: readonly GamePoint[],
  random: Random,
): GamePoint {
  const clear =
    findRandomSpot(AREA, random, PLACE_TRIES, clearOf([...staying, ...fading])) ??
    findRandomSpot(AREA, random, PLACE_TRIES, clearOf(staying))

  if (clear) {
    return clear
  }

  const tried = Array.from({ length: PLACE_TRIES }, () => randomPointIn(AREA, random))
  return tried.reduce((best, spot) =>
    smallestGap(spot, staying) > smallestGap(best, staying) ? spot : best,
  )
}

export interface PauseBeforeReactingOptions {
  situations: WordLists
  score: Score
  random?: Random
  /** Called for every mistake. */
  onMistake?: (mistake: GoodOrBadMistake, situation: Situation) => void
}

export interface PauseBeforeReacting {
  /** The situations on screen, and those fading out, oldest first. */
  readonly situations: readonly Situation[]
  /** The round's time at the last update. */
  readonly timeMs: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: GoodOrBadStats
  /** Removes everything. */
  clear(): void
  /** Starts a round at `pace` (Normal if none): the first situation starts to fade in straight away. */
  start(pace?: Pace): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** Taps the situation under `point`, if any, at the time of the last update. */
  tap(point: GamePoint): void
  /** Stops the round at once: nothing changes until the next start. */
  stop(): void
}

export function createPauseBeforeReacting({
  situations: { good, bad },
  score,
  random = Math.random,
  onMistake,
}: PauseBeforeReactingOptions): PauseBeforeReacting {
  function newPicker(): WordPicker {
    return createWordPicker({
      good,
      bad,
      recentToAvoid: RECENT_TO_AVOID,
      random,
      name: 'situations',
    })
  }

  let picker = newPicker()
  let situations: Situation[] = []
  /** When the next situation comes; undefined before the round starts. */
  let next: Due | undefined
  let shown = 0
  let pacing = AS_SET
  let timeMs = 0
  const tally = createGoodOrBadTally({ score, points: POINTS, onMistake })
  /** Set when the round is stopped, even in the middle of an update or tap. */
  let stopped = false

  function onScreen() {
    return situations.filter((situation) => situation.endedAtMs === undefined)
  }

  /** Ends `situation` at `atMs`, tapped or gone, and counts it. */
  function end(situation: Situation, how: GoodOrBadEnd, atMs: number) {
    situation.endedAtMs = atMs
    situation.end = how
    tally.count(situation, situation.word.type, how)
  }

  /** Shows the next situation at `atMs`, making room first if the screen is full. */
  function show(atMs: number) {
    const before = onScreen()

    if (before.length >= MOST_ON_SCREEN) {
      end(before[0], 'gone', atMs)

      // Missing it was one mistake too many: everything stays as it is.
      if (stopped) {
        return
      }
    }

    // Those that have faded out are gone for good.
    situations = situations.filter((situation) => stillShownAt(situation, atMs))
    const staying = onScreen()
    const fading = situations.filter((situation) => !staying.includes(situation))
    const spot = placeSituation(staying, fading, random)

    const word = picker.next()
    situations.push({ word, ...spot, shownAtMs: atMs, endedAtMs: undefined, end: undefined })
    shown++
    next = { deadlineMs: atMs + pacing.time(steppedAfter(SPAWN_DELAY, shown)) }
  }

  function clear() {
    situations = []
    next = undefined
    shown = 0
    timeMs = 0
    tally.reset()
    stopped = false
  }

  return {
    get situations() {
      return situations
    },
    get timeMs() {
      return timeMs
    },
    get stats() {
      return tally.stats
    },
    clear,
    start(pace: Pace = 'normal') {
      clear()
      pacing = pacingFor(pace, PACE_PERCENTS)
      picker = newPicker()
      show(0)
    },
    update(elapsedMs) {
      if (stopped || !next) {
        return
      }

      timeMs = passDeadlines(elapsedMs, {
        current: () => next,
        expire: (due) => show(due.deadlineMs),
        stopped: () => stopped,
      })
    },
    tap(point) {
      if (stopped || !next) {
        return
      }

      // Situations never overlap, so a tap is on one at most.
      const tapped = onScreen().find((situation) => isOnSituation(point, situation))

      if (tapped) {
        end(tapped, 'tapped', timeMs)
      }
    },
    stop() {
      stopped = true
    },
  }
}
