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
 * Tapping a good emotion: +1. Tapping a bad one: −1. A good emotion that
 * escapes at the top: −1. A bad one that escapes: +1. Tapped bubbles
 * disappear, and a tap counts for every bubble under it.
 *
 * Each round also counts how many good and bad emotions were tapped or
 * escaped, to show at the end.
 */

/**
 * Every bubble is the same oval: 140 × 88 game px, wide enough for the
 * longest emotion. Like everything on the canvas it scales with the canvas.
 */
export const BUBBLE_WIDTH = 140
export const BUBBLE_HEIGHT = 88
const RADIUS_X = BUBBLE_WIDTH / 2
const RADIUS_Y = BUBBLE_HEIGHT / 2
export const MIN_SPEED = 40
export const MAX_SPEED = 80
export const MIN_SPAWN_DELAY_MS = 700
export const MAX_SPAWN_DELAY_MS = 1_500
/** A new bubble's centre is at least this far to the side of the previous one's. */
export const MIN_SIDEWAYS_DISTANCE = 25
/** …and at least this far from it in a straight line, centre to centre. */
export const MIN_CENTRE_DISTANCE = 50

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
export const SPAWN_Y = GAME_HEIGHT + RADIUS_Y

export interface Bubble {
  readonly emotion: Emotion
  readonly x: number
  /** Current centre height, updated every frame. */
  y: number
  /** Pixels per second, upwards. */
  readonly speed: number
  readonly spawnedAtMs: number
}

/** Whether `point` is on `bubble` (inside its oval or on its edge). */
export function isInBubble(bubble: Centre, { x, y }: GamePoint): boolean {
  return ((x - bubble.x) / RADIUS_X) ** 2 + ((y - bubble.y) / RADIUS_Y) ** 2 <= 1
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
  const min = RADIUS_X
  const max = GAME_WIDTH - RADIUS_X

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
}

export function createEmotionsRise({
  emotions,
  score,
  random = Math.random,
  onMistake,
}: EmotionsRiseOptions): EmotionsRise {
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
    const bubble: Bubble = {
      emotion: generator.next(),
      x,
      y: SPAWN_Y,
      speed: randomBetween(random, MIN_SPEED, MAX_SPEED),
      spawnedAtMs: atMs,
    }
    bubbles.push(bubble)
    previous = bubble
    nextSpawnAtMs = atMs + randomBetween(random, MIN_SPAWN_DELAY_MS, MAX_SPAWN_DELAY_MS)
  }

  function clear() {
    bubbles = []
    previous = undefined
    stats = noStats
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
      // Spawn at the exact moments due, even if a frame took long.
      while (nextSpawnAtMs <= elapsedMs) {
        spawn(nextSpawnAtMs)
      }

      const escaped: Bubble[] = []

      for (const bubble of bubbles) {
        bubble.y = heightAt(bubble, elapsedMs)

        if (bubble.y + RADIUS_Y < 0) {
          escaped.push(bubble)
        }
      }

      if (escaped.length > 0) {
        bubbles = bubbles.filter((bubble) => !escaped.includes(bubble))

        for (const bubble of escaped) {
          if (bubble.emotion.type === 'good') {
            count('goodMissed')
            score.subtract(POINTS.goodEscaped)
            onMistake?.('goodMissed', bubble.emotion)
          } else {
            count('badLetGo')
            score.add(POINTS.badEscaped)
          }
        }
      }
    },
    tap(point) {
      const hit = bubbles.filter((bubble) => isInBubble(bubble, point))

      if (hit.length === 0) {
        return
      }

      bubbles = bubbles.filter((bubble) => !hit.includes(bubble))

      for (const bubble of hit) {
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
  }
}
