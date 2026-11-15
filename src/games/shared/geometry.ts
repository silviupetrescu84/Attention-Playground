import type { GamePoint } from './game-canvas'
import { clamp } from './numbers'

/**
 * Ellipses (ovals, and circles: ellipses with both radii the same) in game
 * units, shared by every minigame: for taps, and for keeping things apart.
 * Every ellipse here is upright: `radiusX` across, `radiusY` up and down.
 */

/** Whether `point` is inside the ellipse centred on `centre`, or on its edge. */
export function isInEllipse(
  point: GamePoint,
  centre: GamePoint,
  radiusX: number,
  radiusY: number,
): boolean {
  return ((point.x - centre.x) / radiusX) ** 2 + ((point.y - centre.y) / radiusY) ** 2 <= 1
}

/** Rounds of refining the closest point: each makes it far closer (see below). */
const REFINEMENTS = 4

/**
 * How far `point` is from the edge of the ellipse centred on `centre`:
 * positive outside, negative inside. Within a thousandth of a pixel for the
 * sizes games use (tested).
 *
 * It finds the closest point on the edge by starting halfway round a quarter
 * of it and moving along it, each time towards where the circle that best
 * fits the edge there points (Carl Chatfield's method). Points are folded
 * into the quarter where x and y are positive: the ellipse is the same in
 * each.
 */
export function distanceToEllipse(
  point: GamePoint,
  centre: GamePoint,
  radiusX: number,
  radiusY: number,
): number {
  const px = Math.abs(point.x - centre.x)
  const py = Math.abs(point.y - centre.y)
  // Where on the quarter of the edge, as a direction: (cos, sin) of its angle.
  let tx = Math.SQRT1_2
  let ty = Math.SQRT1_2

  for (let i = 0; i < REFINEMENTS; i++) {
    // The centre of the circle that best fits the edge at (x, y)…
    const ex = ((radiusX ** 2 - radiusY ** 2) * tx ** 3) / radiusX
    const ey = ((radiusY ** 2 - radiusX ** 2) * ty ** 3) / radiusY
    const r = Math.hypot(radiusX * tx - ex, radiusY * ty - ey)
    const q = Math.hypot(px - ex, py - ey)

    // …is the point itself only at the very centre of a circle, where every
    // point of the edge is as close.
    if (q === 0) {
      break
    }

    // …and the point's direction from it, that circle's radius away, is
    // closer to the closest point of the edge.
    tx = clamp(((px - ex) * r) / q / radiusX + ex / radiusX, 0, 1)
    ty = clamp(((py - ey) * r) / q / radiusY + ey / radiusY, 0, 1)
    const length = Math.hypot(tx, ty)
    tx /= length
    ty /= length
  }

  const distance = Math.hypot(px - radiusX * tx, py - radiusY * ty)
  return isInEllipse(point, centre, radiusX, radiusY) ? -distance : distance
}

/** A rectangle, upright: where its sides are. */
export interface Box {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/**
 * Whether the ellipse centred on `centre` overlaps `box` (touching counts).
 * Exact: stretched up or down until the ellipse is a circle, they touch when
 * the point of the (stretched) box closest to the circle's centre is inside it.
 */
export function ellipseTouchesBox(
  centre: GamePoint,
  radiusX: number,
  radiusY: number,
  box: Box,
): boolean {
  const closestX = clamp(centre.x, box.left, box.right)
  const closestY = clamp(centre.y, box.top, box.bottom)
  return isInEllipse({ x: closestX, y: closestY }, centre, radiusX, radiusY)
}
