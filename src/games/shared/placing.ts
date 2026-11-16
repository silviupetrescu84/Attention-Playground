import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from './game-canvas'
import { GAME_BAR_HEIGHT } from './game-hud'
import { distanceToEllipse, type Box } from './geometry'
import { randomBetween, shuffled, type Random } from './random'

/**
 * Putting ovals at random places on the canvas, apart from each other,
 * shared by the minigames that scatter ovals (Make It Happen, Pause Before
 * Reacting).
 */

export interface Size {
  readonly width: number
  readonly height: number
}

/**
 * Where the centre of something of `size` may be for all of it to be at
 * least `edgeGap` inside the canvas, below the score bar.
 */
export function playAreaFor({ width, height }: Size, edgeGap: number): Box {
  return {
    left: width / 2 + edgeGap,
    right: GAME_WIDTH - width / 2 - edgeGap,
    top: GAME_BAR_HEIGHT + height / 2 + edgeGap,
    bottom: GAME_HEIGHT - height / 2 - edgeGap,
  }
}

/**
 * How far apart the borders of two ovals of `size` at `a` and `b` are;
 * negative if they overlap. Exact: for two ovals of one size, it is how far
 * one's centre is from an oval twice as big around the other's.
 */
export function gapBetweenOvals(a: GamePoint, b: GamePoint, { width, height }: Size): number {
  return distanceToEllipse(a, b, width, height)
}

/** A random point in `area`, every one as likely. */
export function randomPointIn(area: Box, random: Random): GamePoint {
  return {
    x: randomBetween(random, area.left, area.right),
    y: randomBetween(random, area.top, area.bottom),
  }
}

/** The first of up to `tries` random points in `area` that `fits`, or `undefined` if none does. */
export function findRandomSpot(
  area: Box,
  random: Random,
  tries: number,
  fits: (spot: GamePoint) => boolean,
): GamePoint | undefined {
  for (let i = 0; i < tries; i++) {
    const spot = randomPointIn(area, random)

    if (fits(spot)) {
      return spot
    }
  }

  return undefined
}

/** Whether `spot` may take a place in a layout, given the spots `placed` so far. */
export type SpotRule = (spot: GamePoint, placed: readonly GamePoint[]) => boolean

export interface LayoutOptions {
  /** Where the spots may be. */
  readonly area: Box
  /** The rules a layout must keep, strictest first: each is tried before the next. */
  readonly rules: readonly SpotRule[]
  /** Tries at laying out every spot, for each rule… */
  readonly layoutTries: number
  /** …and random places tried for each spot, in each try. */
  readonly placeTries: number
  /** Places that always fit, some of them taken at random when no try works. */
  readonly fallback: readonly GamePoint[]
}

/** `count` spots at random in `area`, one after another, each keeping `rule`; undefined if stuck. */
function tryLayout(
  count: number,
  rule: SpotRule,
  random: Random,
  { area, placeTries }: LayoutOptions,
): GamePoint[] | undefined {
  const placed: GamePoint[] = []

  while (placed.length < count) {
    const spot = findRandomSpot(area, random, placeTries, (candidate) => rule(candidate, placed))

    if (!spot) {
      return undefined
    }

    placed.push(spot)
  }

  return placed
}

/**
 * Random places for `count` ovals (or anything), shared by the minigames
 * that scatter several at once (Make It Happen, Remember Gratitude): the first
 * layout found keeping the strictest rule, or else the next rule… or, if none
 * is found, `count` of the fallback places, at random. Throws if there are
 * fewer fallback places than `count`.
 */
export function randomLayout(count: number, random: Random, options: LayoutOptions): GamePoint[] {
  const { rules, layoutTries, fallback } = options

  if (count > fallback.length) {
    throw new RangeError(`Cannot place more than ${fallback.length} ovals, got ${count}`)
  }

  for (const rule of rules) {
    for (let i = 0; i < layoutTries; i++) {
      const placed = tryLayout(count, rule, random, options)

      if (placed) {
        return placed
      }
    }
  }

  return shuffled(random, fallback).slice(0, count)
}
