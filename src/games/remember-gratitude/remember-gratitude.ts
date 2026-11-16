import { DIFFICULTY } from '../../config/difficulty'
import { isOnButton } from '../shared/canvas-button'
import type { BubbleSize } from '../shared/canvas-style'
import { checkPositive, checkWholeNumber } from '../shared/checks'
import { createDeck, type Deck } from '../shared/deck'
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
import type { Random } from '../shared/random'
import type { Score } from '../shared/score'
import { FADE_MS, fadeAt, passDeadlines, timeLeftAt, type Due } from '../shared/timed-turns'
import type { Word, WordLists, WordType } from '../shared/word-picker'
import { DONE_BUTTON, MOST_THINGS, ovalFor, placeThings } from './layout'

/**
 * The rules of Remember Gratitude.
 *
 * Each turn, things appear all at once, each in an oval at a random place
 * (see layout.ts), and fade in over FADE_MS: one good (a thing to be grateful
 * for) for sure, and each of the others good or bad, 50/50. They are shown for a while (REMEMBER_TIME; a ring where
 * the Done button will be runs out with it), then they turn around: their
 * texts are hidden, and only then can the player tap them, and the Done
 * button appears.
 *
 * - Tapping a good one: +1; it turns green, its text shown again.
 * - Tapping a bad one: a mistake; it turns red, its text shown again.
 * - Done, or every thing tapped: the turn is over. Every good one not tapped
 *   is a mistake, and turns red, its text shown again; bad ones not tapped
 *   are fine. If the turn had any mistake, everything stays REVIEW_MS, so
 *   the player sees what went wrong. Then everything fades out over FADE_MS,
 *   and the next turn appears NEXT_TURN_GAP_MS after that.
 *
 * Taps before the things turn around, on a thing already tapped, or on
 * nothing do nothing. As more turns are played, turns have more things
 * (THINGS), up to MOST_THINGS, and less time to remember them
 * (REMEMBER_TIME), both set in config/difficulty.json (the time longer or
 * shorter at the pace chosen, see the shared pace). Texts come from two
 * decks, so none comes back before every other of its kind has.
 *
 * When a mistake ends the round, everything stops as it is.
 */

/** How much slower each pace is than the settings here (see config/difficulty.json and the shared pace). */
export const PACE_PERCENTS: PacePercents = DIFFICULTY.rememberGratitude.paces
checkPaces(PACE_PERCENTS, 'rememberGratitude.paces')

const { rememberMsByTurns, thingsByTurns } = DIFFICULTY.rememberGratitude

/** How long the things are shown before they turn around, by how many turns were played before. */
export const REMEMBER_TIME: Steps = rememberMsByTurns
checkSteps(REMEMBER_TIME, 'rememberGratitude.rememberMsByTurns', checkPositive)

/** How many things a turn has, by how many turns were played before it. */
export const THINGS: Steps = thingsByTurns
checkSteps(THINGS, 'rememberGratitude.thingsByTurns', (value, name) => {
  checkWholeNumber(value, name, 2, MOST_THINGS)
})

/** How long a turn with mistakes stays once over, before it fades out. */
export const REVIEW_MS = 2_000

/** The time between a turn having faded out and the next appearing. */
export const NEXT_TURN_GAP_MS = 500

/** Points for each way a thing can end (none for a bad one left). */
export const POINTS: Readonly<Partial<Record<GoodOrBadCount, number>>> = {
  goodTapped: 1,
}

/** How many of the `count` things of a turn are good: one for sure, and each of the others 50/50. */
export function goodOnesFor(count: number, random: Random): number {
  return 1 + Array.from({ length: count - 1 }).filter(() => random() < 0.5).length
}

export interface Thing extends GamePoint {
  readonly word: Word
  /** Tapped, or left untapped when the player was done; undefined until then. */
  end: GoodOrBadEnd | undefined
}

/** One turn, from when its things appear until the next turn's do. */
export interface Turn {
  readonly things: readonly Thing[]
  /** How big every oval of the turn is. */
  readonly size: BubbleSize
  /** When the things start to fade in. */
  readonly shownAtMs: number
  /** When they turn around: their texts hide, and the player can tap them and be done. */
  readonly choosingAtMs: number
  /** When the turn was over (Done, or every thing tapped); undefined until then. */
  endedAtMs: number | undefined
  /** When its things start to fade out: as it is over, or REVIEW_MS later; undefined until then. */
  goneAtMs: number | undefined
}

/** How visible `turn`'s things are at the round's time `timeMs`: 0 to 1. */
export function thingsOpacityAt({ shownAtMs, goneAtMs }: Turn, timeMs: number): number {
  return fadeAt({ fromMs: shownAtMs, endedAtMs: goneAtMs }, timeMs)
}

/** How much of the time to remember `turn`'s things is left at `timeMs`: 1 (all) to 0. */
export function rememberTimeLeftAt({ shownAtMs, choosingAtMs }: Turn, timeMs: number): number {
  const time = { timeLimitMs: choosingAtMs - shownAtMs, deadlineMs: choosingAtMs }
  return timeLeftAt({ ...time, endedAtMs: undefined }, timeMs)
}

/**
 * How `thing` is marked once chosen or missed: right (a good one tapped),
 * wrong (a bad one tapped, or a good one missed), or not at all.
 */
export function markOf({ word, end }: Thing): 'right' | 'wrong' | undefined {
  if (end === 'tapped') {
    return word.type === 'good' ? 'right' : 'wrong'
  }

  return end === 'gone' && word.type === 'good' ? 'wrong' : undefined
}

/** Whether any of `things` was a mistake: a bad one tapped, or a good one missed. */
export function hasMistakes(things: readonly Thing[]): boolean {
  return things.some((thing) => markOf(thing) === 'wrong')
}

/** How visible the Done button is at `timeMs`: from when the things turn around until done. */
export function doneOpacityAt({ choosingAtMs, endedAtMs }: Turn, timeMs: number): number {
  return fadeAt({ fromMs: choosingAtMs, endedAtMs }, timeMs)
}

/** Whether `thing`'s text shows at `timeMs`: before the things turn around, or once marked. */
export function isTextShownAt(thing: Thing, turn: Turn, timeMs: number): boolean {
  return timeMs < turn.choosingAtMs || markOf(thing) !== undefined
}

/** Whether the player can tap `turn`'s things and be done at `timeMs`. */
export function isChoosingAt(turn: Turn, timeMs: number): boolean {
  return turn.endedAtMs === undefined && timeMs >= turn.choosingAtMs
}

/** The thing of `turn` at `point`, if any, as seen. */
export function thingAt(turn: Turn, point: GamePoint): Thing | undefined {
  const { radiusX, radiusY } = turn.size
  return turn.things.find((thing) => isInEllipse(point, thing, radiusX, radiusY))
}

export interface RememberGratitudeOptions {
  things: WordLists
  score: Score
  random?: Random
  /** Called for every mistake. */
  onMistake?: (mistake: GoodOrBadMistake, thing: Thing) => void
}

export interface RememberGratitude {
  /** The turn shown; once done, it stays (fading out, then gone) until the next appears. */
  readonly turn: Turn | undefined
  /** The round's time at the last update. */
  readonly timeMs: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: GoodOrBadStats
  /** Removes everything. */
  clear(): void
  /** Starts a round at `pace` (Normal if none): the first turn appears straight away. */
  start(pace?: Pace): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** Taps the thing or the Done button under `point`, if any, at the time of the last update. */
  tap(point: GamePoint): void
  /** Stops the round at once: nothing changes until the next start. */
  stop(): void
}

export function createRememberGratitude({
  things: { good, bad },
  score,
  random = Math.random,
  onMistake,
}: RememberGratitudeOptions): RememberGratitude {
  function newDecks(): Record<WordType, Deck<string>> {
    return { good: createDeck(good, random), bad: createDeck(bad, random) }
  }

  let decks = newDecks()
  let turn: Turn | undefined
  /** When the next turn appears; undefined while one is being played. */
  let next: Due | undefined
  let turns = 0
  let pacing = AS_SET
  let timeMs = 0
  const tally = createGoodOrBadTally({ score, points: POINTS, onMistake })
  /** Set when the round is stopped, even in the middle of a tap. */
  let stopped = false

  function show(atMs: number) {
    const count = steppedAfter(THINGS, turns)
    const goodOnes = goodOnesFor(count, random)
    const words: Word[] = [
      ...decks.good.take(goodOnes).map((text) => ({ text, type: 'good' as const })),
      ...decks.bad.take(count - goodOnes).map((text) => ({ text, type: 'bad' as const })),
    ]
    const size = ovalFor(count)
    const spots = placeThings(count, size, random)

    turn = {
      things: words.map((word, i) => ({ word, ...spots[i], end: undefined })),
      size,
      shownAtMs: atMs,
      choosingAtMs: atMs + pacing.time(steppedAfter(REMEMBER_TIME, turns)),
      endedAtMs: undefined,
      goneAtMs: undefined,
    }
    turns++
    next = undefined
  }

  /** Ends `thing`, tapped or left, and counts it. */
  function end(thing: Thing, how: GoodOrBadEnd) {
    thing.end = how
    tally.count(thing, thing.word.type, how)
  }

  /**
   * `current` is over: every thing left is counted, and the next turn set,
   * after a look at what went wrong, if anything did.
   */
  function done(current: Turn) {
    current.endedAtMs = timeMs

    for (const thing of current.things.filter(({ end }) => end === undefined)) {
      end(thing, 'gone')

      // Missing it was one mistake too many: everything stays as it is.
      if (stopped) {
        return
      }
    }

    const goneAtMs = timeMs + (hasMistakes(current.things) ? REVIEW_MS : 0)
    current.goneAtMs = goneAtMs
    next = { deadlineMs: goneAtMs + FADE_MS + NEXT_TURN_GAP_MS }
  }

  function clear() {
    turn = undefined
    next = undefined
    turns = 0
    timeMs = 0
    tally.reset()
    stopped = false
  }

  return {
    get turn() {
      return turn
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
      decks = newDecks()
      show(0)
    },
    update(elapsedMs) {
      if (stopped || !turn) {
        return
      }

      timeMs = passDeadlines(elapsedMs, {
        current: () => next,
        expire: (due) => show(due.deadlineMs),
        stopped: () => stopped,
      })
    },
    tap(point) {
      if (stopped || !turn || !isChoosingAt(turn, timeMs)) {
        return
      }

      if (isOnButton(point, DONE_BUTTON)) {
        done(turn)
        return
      }

      const tapped = thingAt(turn, point)

      if (tapped && tapped.end === undefined) {
        end(tapped, 'tapped')

        // Every thing tapped: nothing left to choose, so no need for Done.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- end() can stop it
        if (!stopped && turn.things.every((thing) => thing.end === 'tapped')) {
          done(turn)
        }
      }
    },
    stop() {
      stopped = true
    },
  }
}
