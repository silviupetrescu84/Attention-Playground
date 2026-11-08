import {
  createDifficulty,
  type DifficultySettings,
  type DifficultyStep,
} from '../shared/difficulty'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { randomBetween, type Random } from '../shared/random'
import type { Score } from '../shared/score'
import {
  createEmotionGenerator,
  type Emotion,
  type EmotionGenerator,
} from './emotion-generator'

/**
 * The rules of Emotions Rise.
 *
 * From the moment the round starts, emotions appear one after another (the
 * first straight away, then every 0.7–1.5 s at random) just below the canvas,
 * each in an oval bubble (all the same size) that rises at its own constant speed (40–80 px/s, at
 * random). Each new bubble's centre is at least 25 px to the side of the
 * previous bubble's centre, and at least 50 px from it in a straight line
 * (counting how far the previous bubble has risen since it appeared).
 *
 * Those are the starting values of DIFFICULTY_SETTINGS: the game gets harder
 * as the round goes on, following DIFFICULTY_STEPS (see the shared
 * difficulty). Each bubble takes the speed and the delay until the next one
 * from the difficulty at the moment it appears, and keeps its speed until it
 * leaves. Because speeds and how often bubbles appear grow
 * by the same factor, about as many bubbles are on screen at once all round;
 * they just come and go faster.
 *
 * Tapping a good emotion: +1. Tapping a bad one: −1. A good emotion that
 * escapes at the top: −1. A bad one that escapes: +1. Tapped bubbles
 * disappear, and a tap counts for every bubble under it, one at a time: if
 * the round is stopped after one of them (one mistake too many), the rest
 * stay and do not count.
 *
 * Each round also counts how many good and bad emotions were tapped or
 * escaped, to show at the end.
 */

/**
 * The cropped oval artwork is shown at 140 × 77 game px, preserving its
 * aspect ratio. Like everything on the canvas it scales with the canvas.
 */
export const BUBBLE_WIDTH = 140
export const BUBBLE_HEIGHT = 77
/**
 * The visible alpha is slightly inset from the cropped image edges. Taps use
 * this ellipse, so transparent edge pixels and corners do not count.
 */
export const BUBBLE_HIT_WIDTH = 137
export const BUBBLE_HIT_HEIGHT = 74
const HALF_WIDTH = BUBBLE_WIDTH / 2
const HALF_HEIGHT = BUBBLE_HEIGHT / 2
const HIT_RADIUS_X = BUBBLE_HIT_WIDTH / 2
const HIT_RADIUS_Y = BUBBLE_HIT_HEIGHT / 2
export const MIN_SPEED = 40
export const MAX_SPEED = 80
export const MIN_SPAWN_DELAY_MS = 700
export const MAX_SPAWN_DELAY_MS = 1_500
/** A new bubble's centre is at least this far to the side of the previous one's. */
export const MIN_SIDEWAYS_DISTANCE = 25
/** …and at least this far from it in a straight line, centre to centre. */
export const MIN_CENTRE_DISTANCE = 50
/**
 * When the game gets harder, and how much harder than the starting values:
 * ×1.1 from 20 s, ×1.25 from 40 s, ×1.45 from 60 s, ×1.7 from 80 s and
 * ×2.1 from 100 s on.
 */
export const DIFFICULTY_STEPS: readonly DifficultyStep[] = [
  [20_000, 10],
  [40_000, 25],
  [60_000, 45],
  [80_000, 70],
  [100_000, 110],
]
/** What gets harder: bubbles rise faster and come sooner. */
export const DIFFICULTY_SETTINGS = {
  minSpeed: { start: MIN_SPEED, harder: 'higher' },
  maxSpeed: { start: MAX_SPEED, harder: 'higher' },
  minSpawnDelayMs: { start: MIN_SPAWN_DELAY_MS, harder: 'lower' },
  maxSpawnDelayMs: { start: MAX_SPAWN_DELAY_MS, harder: 'lower' },
} as const satisfies DifficultySettings

export const POINTS = {
  tapGood: 1,
  tapBad: 1,
  goodEscaped: 1,
  badEscaped: 1,
} as const

/** What happened to the emotions of a round. */
export interface EmotionsRiseStats {
  readonly goodTapped: number
  readonly badTapped: number
  /** Good emotions that escaped at the top. */
  readonly goodMissed: number
  /** Bad emotions that escaped at the top. */
  readonly badLetGo: number
}

/** Centre height of a new bubble: its top touches the bottom of the canvas. */
export const SPAWN_Y = GAME_HEIGHT + HALF_HEIGHT

export interface Bubble {
  readonly emotion: Emotion
  readonly x: number
  /** Current centre height, updated every frame. */
  y: number
  /** Pixels per second, upwards. */
  readonly speed: number
  readonly spawnedAtMs: number
}

/** Whether `point` is on the visible oval, excluding transparent PNG pixels. */
export function isInBubble(bubble: Centre, { x, y }: GamePoint): boolean {
  return (
    ((x - bubble.x) / HIT_RADIUS_X) ** 2 + ((y - bubble.y) / HIT_RADIUS_Y) ** 2 <= 1
  )
}

interface Centre {
  readonly x: number
  readonly y: number
}

export interface EmotionLists {
  good: readonly string[]
  bad: readonly string[]
}

/** Where `bubble`'s centre is (its height) at the round's time `timeMs`. */
export function heightAt(bubble: Bubble, timeMs: number): number {
  return SPAWN_Y - (bubble.speed * (timeMs - bubble.spawnedAtMs)) / 1000
}

/**
 * How far to the side of the previous centre a new one must be, when the
 * previous centre is `heightGap` px above it: at least MIN_SIDEWAYS_DISTANCE,
 * and enough for MIN_CENTRE_DISTANCE in a straight line.
 */
export function minSidewaysGap(heightGap: number): number {
  const forStraightLine = Math.sqrt(Math.max(0, MIN_CENTRE_DISTANCE ** 2 - heightGap ** 2))
  return Math.max(MIN_SIDEWAYS_DISTANCE, forStraightLine)
}

/**
 * A random centre x for a new bubble (appearing at SPAWN_Y) that keeps it
 * fully inside the canvas and far enough from `previous`: the previous
 * bubble's centre at this moment. Uniform over all allowed positions.
 */
export function pickSpawnX(previous: GamePoint | undefined, random: Random): number {
  const min = HALF_WIDTH
  const max = GAME_WIDTH - HALF_WIDTH

  if (!previous) {
    return randomBetween(random, min, max)
  }

  const gap = minSidewaysGap(SPAWN_Y - previous.y)
  const leftEnd = Math.min(max, previous.x - gap)
  const rightStart = Math.max(min, previous.x + gap)
  const leftLength = Math.max(0, leftEnd - min)
  const rightLength = Math.max(0, max - rightStart)
  const offset = random() * (leftLength + rightLength)

  return offset < leftLength ? min + offset : rightStart + (offset - leftLength)
}

/** A mistake the player can make: tapping a bad emotion, or missing a good one. */
export type Mistake = 'badTapped' | 'goodMissed'

export interface EmotionsRiseOptions {
  emotions: EmotionLists
  score: Score
  random?: Random
  /** When the game gets harder during a round. Defaults to DIFFICULTY_STEPS. */
  difficultySteps?: readonly DifficultyStep[]
  /** Called for every mistake, after the score has changed. */
  onMistake?: (mistake: Mistake, emotion: Emotion) => void
}

export interface EmotionsRise {
  /** Bubbles in the order they appeared. */
  readonly bubbles: readonly Bubble[]
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: EmotionsRiseStats
  /** Removes all bubbles. */
  clear(): void
  /** Starts a round: the first emotion appears straight away. */
  start(): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** Scores and removes every bubble under `point`. */
  tap(point: GamePoint): void
  /** Stops the round at once: nothing more moves, appears or counts until the next start. */
  stop(): void
}

export function createEmotionsRise({
  emotions,
  score,
  random = Math.random,
  difficultySteps = DIFFICULTY_STEPS,
  onMistake,
}: EmotionsRiseOptions): EmotionsRise {
  const difficulty = createDifficulty({ steps: difficultySteps, settings: DIFFICULTY_SETTINGS })
  let bubbles: Bubble[] = []
  let generator: EmotionGenerator
  /** The last bubble that appeared (even if it has since been tapped). */
  let previous: Bubble | undefined
  let nextSpawnAtMs = 0
  const noStats: EmotionsRiseStats = { goodTapped: 0, badTapped: 0, goodMissed: 0, badLetGo: 0 }
  let stats = noStats

  function count(key: keyof EmotionsRiseStats) {
    stats = { ...stats, [key]: stats[key] + 1 }
  }

  function spawn(atMs: number) {
    const x = pickSpawnX(previous && { x: previous.x, y: heightAt(previous, atMs) }, random)
    const now = difficulty.valuesAt(atMs)
    const bubble: Bubble = {
      emotion: generator.next(),
      x,
      y: SPAWN_Y,
      speed: randomBetween(random, now.minSpeed, now.maxSpeed),
      spawnedAtMs: atMs,
    }
    bubbles.push(bubble)
    previous = bubble
    nextSpawnAtMs = atMs + randomBetween(random, now.minSpawnDelayMs, now.maxSpawnDelayMs)
  }

  /** Set when the round is stopped, even in the middle of an update or tap. */
  let stopped = false

  function clear() {
    bubbles = []
    previous = undefined
    stats = noStats
    stopped = false
  }

  function remove(bubble: Bubble) {
    bubbles = bubbles.filter((other) => other !== bubble)
  }

  return {
    get bubbles() {
      return bubbles
    },
    get stats() {
      return stats
    },
    clear,
    start() {
      clear()
      generator = createEmotionGenerator({ ...emotions, random })
      spawn(0)
    },
    update(elapsedMs) {
      if (stopped) {
        return
      }

      // Spawn at the exact moments due, even if a frame took long.
      while (nextSpawnAtMs <= elapsedMs) {
        spawn(nextSpawnAtMs)
      }

      const escaped: Bubble[] = []

      for (const bubble of bubbles) {
        bubble.y = heightAt(bubble, elapsedMs)

        if (bubble.y + HALF_HEIGHT < 0) {
          escaped.push(bubble)
        }
      }

      for (const bubble of escaped) {
        if (stopped) {
          return
        }

        remove(bubble)

        if (bubble.emotion.type === 'good') {
          count('goodMissed')
          score.subtract(POINTS.goodEscaped)
          onMistake?.('goodMissed', bubble.emotion)
        } else {
          count('badLetGo')
          score.add(POINTS.badEscaped)
        }
      }
    },
    tap(point) {
      for (const bubble of bubbles.filter((candidate) => isInBubble(candidate, point))) {
        if (stopped) {
          return
        }

        remove(bubble)

        if (bubble.emotion.type === 'good') {
          count('goodTapped')
          score.add(POINTS.tapGood)
        } else {
          count('badTapped')
          score.subtract(POINTS.tapBad)
          onMistake?.('badTapped', bubble.emotion)
        }
      }
    },
    stop() {
      stopped = true
    },
  }
}
