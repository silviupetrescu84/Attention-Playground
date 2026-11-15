import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from './game-canvas'
import { GAME_BAR_HEIGHT } from './game-hud'
import { distanceToEllipse, type Box } from './geometry'
import { randomBetween, type Random } from './random'

/**
 * Putting ovals at random places on the canvas, apart from each other,
 * shared by the minigames that scatter ovals (Break It Down, Pause Before
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
