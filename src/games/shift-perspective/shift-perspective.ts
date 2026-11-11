import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { randomItem, shuffled, type Random } from '../shared/random'
import type { Score } from '../shared/score'
import { createThoughtPicker, type Thought, type ThoughtPicker } from './thoughts'

/**
 * The rules of Shift Perspective.
 *
 * A thought appears in a bubble in the middle of the canvas, with choices
 * around it in smaller bubbles: one good way to see the thought and the rest
 * bad ones, all different and all for that thought. The player taps the good
 * one: +1. Tapping a bad one, or choosing nothing in time, is a mistake (see
 * onMistake) and scores nothing.
 *
 * The thought fades in over 0.1 s and is shown alone for the first 3 s, so
 * the player can read it. Then the choices fade in over 0.1 s, and only once
 * they have does the time to choose start (a ring around the thought shows
 * what is left; it stays full until then). As soon as the player chooses, or
 * the time is up, everything fades out over 0.1 s and then the next thought
 * fades in. Taps on choices that are fading out do nothing; taps on choices
 * that are fading in count.
 *
 * The game gets harder as more thoughts are shown:
 *
 * - 2 choices at first, then 3 after 3 thoughts, 4 after 7, 5 after 15 and
 *   6 after 25 (CHOICE_STEPS). They sit at the corners of a regular shape
 *   with one corner straight up: above and below, a triangle, N E S W, a
 *   pentagon, a hexagon.
 * - 10 s to choose at first, 0.5 s less after every 10 thoughts, down to 5 s
 *   (after 100 thoughts).
 *
 * When a mistake ends the round, everything stops as it is: the thought and
 * its choices stay on screen, and no next thought comes.
 */

/** How many choices a thought comes with at first. */
export const START_CHOICES = 2

/** Once `thoughtsShown` thoughts have been shown, the next ones have `choices` choices. */
export type ChoiceStep = readonly [thoughtsShown: number, choices: number]

export const CHOICE_STEPS: readonly ChoiceStep[] = [
  [3, 3],
  [7, 4],
  [15, 5],
  [25, 6],
]

/** The most choices a thought is ever shown with: one good and the rest bad. */
export const MOST_CHOICES = CHOICE_STEPS.at(-1)![1]

/** How many choices a thought comes with after `thoughtsShown` thoughts. */
export function choicesAfter(thoughtsShown: number): number {
  let choices = START_CHOICES

  for (const [after, stepChoices] of CHOICE_STEPS) {
    if (thoughtsShown >= after) {
      choices = stepChoices
    }
  }

  return choices
}

export const START_TIME_LIMIT_MS = 10_000
/** The time to choose gets this much shorter… */
export const TIME_LIMIT_STEP_MS = 500
/** …after every this many thoughts… */
export const THOUGHTS_PER_TIME_STEP = 10
/** …down to this. */
export const MIN_TIME_LIMIT_MS = 5_000

/** The time to choose for a thought shown after `thoughtsShown` thoughts. */
export function timeLimitAfter(thoughtsShown: number): number {
  const steps = Math.floor(thoughtsShown / THOUGHTS_PER_TIME_STEP)
  return Math.max(MIN_TIME_LIMIT_MS, START_TIME_LIMIT_MS - steps * TIME_LIMIT_STEP_MS)
}

export const POINTS = {
  good: 1,
} as const

/** How long the thought is shown alone, from when it starts to fade in, before the choices come. */
export const READING_MS = 3_000

/** How long a thought and its choices take to fade in, and to fade out. */
export const FADE_MS = 100

/** Where the thought is: the middle of the canvas below the score bar. */
export const CENTRE: GamePoint = { x: GAME_WIDTH / 2, y: (GAME_BAR_HEIGHT + GAME_HEIGHT) / 2 }
/** Bubbles are drawn at this size (the image, glow included), in game px. */
export const CHOICE_SIZE = 120
/** The thought's bubble: choices are 10% smaller than it. */
export const THOUGHT_SIZE = CHOICE_SIZE / 0.9
/** The bubble itself, without its glow, is at least this share of the image (measured). */
export const BUBBLE_BODY = 0.92
/** The radius of a choice's bubble, as seen and tapped. */
export const CHOICE_RADIUS = (CHOICE_SIZE / 2) * BUBBLE_BODY
/** The radius of the thought's bubble, as seen. */
export const THOUGHT_RADIUS = (THOUGHT_SIZE / 2) * BUBBLE_BODY
/** How far each choice's centre is from the thought's. */
export const CHOICE_DISTANCE = 134

/**
 * Where `count` choices go: the corners of a regular shape around the
 * thought, the first straight up, then clockwise.
 */
export function choicePositions(count: number): GamePoint[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count
    return {
      x: CENTRE.x + CHOICE_DISTANCE * Math.cos(angle),
      y: CENTRE.y + CHOICE_DISTANCE * Math.sin(angle),
    }
  })
}

export interface Choice extends GamePoint {
  readonly text: string
  readonly good: boolean
}

/** One thought, from when it starts to fade in until it has faded out. */
export interface Turn {
  readonly thought: string
  readonly choices: readonly Choice[]
  /** When the thought starts to fade in. */
  readonly shownAtMs: number
  /** When the choices start to fade in: they can be tapped from then. */
  readonly choicesAtMs: number
  /** When the choices have faded in, and the time to choose starts. */
  readonly readyAtMs: number
  readonly timeLimitMs: number
  /** When the time to choose is up. */
  readonly deadlineMs: number
  /** When the player chose, or the time was up; undefined until then. */
  endedAtMs: number | undefined
  /** What the player chose; undefined if nothing (yet). */
  chosen: Choice | undefined
}

/**
 * How visible something that starts to fade in at `fromMs` is at `timeMs`,
 * 0 (hidden) to 1, as part of `turn`: it stops fading in when the turn ends,
 * and fades out from there.
 */
function fadedAt({ endedAtMs }: Turn, fromMs: number, timeMs: number): number {
  const fadedIn = (Math.min(timeMs, endedAtMs ?? timeMs) - fromMs) / FADE_MS
  const fadedOut = endedAtMs === undefined ? 1 : 1 - (timeMs - endedAtMs) / FADE_MS
  return Math.min(1, Math.max(0, Math.min(fadedIn, fadedOut)))
}

/** How visible `turn`'s thought (and its ring) is at the round's time `timeMs`: 0 to 1. */
export function thoughtOpacityAt(turn: Turn, timeMs: number): number {
  return fadedAt(turn, turn.shownAtMs, timeMs)
}

/** How visible `turn`'s choices are at the round's time `timeMs`: 0 to 1. */
export function choicesOpacityAt(turn: Turn, timeMs: number): number {
  return fadedAt(turn, turn.choicesAtMs, timeMs)
}

/** How much of the time to choose is left at `timeMs`: 1 (all) to 0 (none). */
export function timeLeftAt(turn: Turn, timeMs: number): number {
  const now = Math.min(timeMs, turn.endedAtMs ?? timeMs)
  return Math.min(1, Math.max(0, (turn.deadlineMs - now) / turn.timeLimitMs))
}

/** A mistake the player can make: choosing a bad way to see the thought, or nothing in time. */
export type Mistake = 'badChosen' | 'tooSlow'

/** What the player chose in a round. */
export interface ShiftPerspectiveStats {
  readonly good: number
  readonly bad: number
  readonly tooSlow: number
}

export interface ShiftPerspectiveOptions {
  thoughts: readonly Thought[]
  score: Score
  random?: Random
  /** Called for every mistake. */
  onMistake?: (mistake: Mistake, turn: Turn) => void
}

export interface ShiftPerspective {
  /** The thought being shown, or about to be (while the one before fades out). */
  readonly turn: Turn | undefined
  /** The thought before, while it fades out. */
  readonly previous: Turn | undefined
  /** The round's time at the last update. */
  readonly timeMs: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: ShiftPerspectiveStats
  /** Removes everything. */
  clear(): void
  /** Starts a round: the first thought starts to fade in straight away. */
  start(): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** Chooses the choice tapped, if any, at the time of the last update. */
  tap(point: GamePoint): void
  /** Stops the round at once: nothing changes until the next start. */
  stop(): void
}

export function createShiftPerspective({
  thoughts,
  score,
  random = Math.random,
  onMistake,
}: ShiftPerspectiveOptions): ShiftPerspective {
  for (const { text, good, bad } of thoughts) {
    if (good.length < 1 || bad.length < MOST_CHOICES - 1) {
      throw new RangeError(
        `"${text}" needs at least 1 good and ${MOST_CHOICES - 1} bad ways to see it`,
      )
    }
  }

  let picker: ThoughtPicker
  let turn: Turn | undefined
  let previous: Turn | undefined
  let thoughtsShown = 0
  let timeMs = 0
  const noStats: ShiftPerspectiveStats = { good: 0, bad: 0, tooSlow: 0 }
  let stats = noStats
  /** Set when the round is stopped, even in the middle of an update or tap. */
  let stopped = false

  function show(atMs: number) {
    const thought = picker.next()
    const count = choicesAfter(thoughtsShown)
    const timeLimitMs = timeLimitAfter(thoughtsShown)
    thoughtsShown++

    const texts = [
      { text: randomItem(random, thought.good), good: true },
      ...shuffled(random, thought.bad)
        .slice(0, count - 1)
        .map((text) => ({ text, good: false })),
    ]
    const positions = choicePositions(count)
    const choicesAtMs = atMs + READING_MS
    const readyAtMs = choicesAtMs + FADE_MS

    turn = {
      thought: thought.text,
      choices: shuffled(random, texts).map((choice, i) => ({ ...choice, ...positions[i] })),
      shownAtMs: atMs,
      choicesAtMs,
      readyAtMs,
      timeLimitMs,
      deadlineMs: readyAtMs + timeLimitMs,
      endedAtMs: undefined,
      chosen: undefined,
    }
  }

  /** Ends `ended` at `atMs` with `chosen` (nothing if too slow), then brings the next thought. */
  function end(ended: Turn, chosen: Choice | undefined, atMs: number) {
    ended.endedAtMs = atMs
    ended.chosen = chosen

    if (chosen?.good) {
      stats = { ...stats, good: stats.good + 1 }
      score.add(POINTS.good)
    } else if (chosen) {
      stats = { ...stats, bad: stats.bad + 1 }
      onMistake?.('badChosen', ended)
    } else {
      stats = { ...stats, tooSlow: stats.tooSlow + 1 }
      onMistake?.('tooSlow', ended)
    }

    if (!stopped) {
      previous = ended
      show(atMs + FADE_MS)
    }
  }

  function clear() {
    turn = undefined
    previous = undefined
    thoughtsShown = 0
    timeMs = 0
    stats = noStats
    stopped = false
  }

  return {
    get turn() {
      return turn
    },
    get previous() {
      return previous
    },
    get timeMs() {
      return timeMs
    },
    get stats() {
      return stats
    },
    clear,
    start() {
      clear()
      picker = createThoughtPicker(thoughts, random)
      show(0)
    },
    update(elapsedMs) {
      if (stopped || !turn) {
        return
      }

      // Each time that runs out does so at its exact moment, and the next
      // thought follows from then, even if a frame took long.
      while (turn.deadlineMs <= elapsedMs) {
        const deadlineMs = turn.deadlineMs
        end(turn, undefined, deadlineMs)

        if (stopped) {
          timeMs = deadlineMs
          return
        }
      }

      timeMs = elapsedMs
    },
    tap({ x, y }) {
      // Nothing to choose until the choices start to fade in (nor while the
      // thought before fades out).
      if (stopped || !turn || timeMs < turn.choicesAtMs) {
        return
      }

      const tapped = turn.choices.find(
        (choice) => Math.hypot(x - choice.x, y - choice.y) <= CHOICE_RADIUS,
      )

      if (tapped) {
        end(turn, tapped, timeMs)
      }
    },
    stop() {
      stopped = true
    },
  }
}
