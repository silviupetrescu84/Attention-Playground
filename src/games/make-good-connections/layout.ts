import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import {
  distanceBetweenSegments,
  distanceToSegment,
  segmentsCross,
  type Box,
} from '../shared/geometry'
import { randomLayout } from '../shared/placing'
import { shuffled, type Random } from '../shared/random'

/**
 * Where things are in Make Good Connections, and how big, and how each
 * round's dots and walls are laid out.
 *
 * Each round has dots at random places, at least DOT_SPACING apart, and
 * walls: each a short bar across the middle of the straight line between two
 * dots, so those two cannot be connected directly. A round is laid out
 * around a hidden solution, an order of the dots in which each line from one
 * to the next keeps CLEARANCE from every wall and from the other dots, and
 * crosses none of the others. So every round can be done (that way, or the
 * other way round), and there may be other ways too.
 *
 * It is laid out like this, trying again until every rule is kept (a few
 * tries for a few dots, about 50 for 8, under 1 ms a round; measured):
 *
 * 1. the dots, at random;
 * 2. the solution: the dots in a random order, kept if its lines keep clear
 *    of the other dots and of each other;
 * 3. the walls, two fewer than the dots, each across the line between two
 *    dots not next to each other in the solution, kept if it keeps clear of
 *    the solution's lines, the dots and the other walls.
 */

/** Dots are circles this big (30 px across)… */
export const DOT_RADIUS = 15
/** …at least this far apart, centre to centre. */
export const DOT_SPACING = 100
/**
 * A tap this close to a dot's centre is on it: 30 px beyond its edge, for
 * fingers (never on two: dots are DOT_SPACING apart).
 */
export const TAP_RADIUS = DOT_RADIUS + 30
/** How wide the lines between dots are. */
export const LINE_WIDTH = 4
/** Walls are bars this long, across the line they stop… */
export const WALL_LENGTH = 30
/** …and this thick. */
export const WALL_THICKNESS = 5
/** Space the solution keeps between its lines and the walls and other dots, and walls keep from dots and each other. */
export const CLEARANCE = 20
/** Space between the dots and the edges of the canvas or the score bar: room for the ring around one. */
export const EDGE_GAP = 20
/** The most dots a round can have: as many as the places that always fit. */
export const MOST_DOTS = 8
/**
 * Tries at laying out a round before making do with one without walls: far
 * more than ever needed (8 dots took at most 297 in 300 rounds, measured).
 */
export const ROUND_TRIES = 3_000

/** Where the dots' centres can be. */
export const DOTS_AREA: Box = {
  left: DOT_RADIUS + EDGE_GAP,
  right: GAME_WIDTH - DOT_RADIUS - EDGE_GAP,
  top: GAME_BAR_HEIGHT + DOT_RADIUS + EDGE_GAP,
  bottom: GAME_HEIGHT - DOT_RADIUS - EDGE_GAP,
}

/** Eight places at least DOT_SPACING apart that always fit: two columns of four. */
export const FALLBACK_SPOTS: readonly GamePoint[] = [0, 1, 2, 3].flatMap((row) =>
  [GAME_WIDTH / 2 - 85, GAME_WIDTH / 2 + 85].map((x) => ({ x, y: 150 + row * 170 })),
)

/** A wall: a bar WALL_THICKNESS thick along the line from `from` to `to` (WALL_LENGTH long). */
export interface Wall {
  readonly from: GamePoint
  readonly to: GamePoint
}

/** The wall across the middle of the straight line from `a` to `b`. */
export function wallAcross(a: GamePoint, b: GamePoint): Wall {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  // Along the wall: the line's direction, turned a quarter.
  const across = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const half = WALL_LENGTH / 2
  return {
    from: { x: middle.x - across.x * half, y: middle.y - across.y * half },
    to: { x: middle.x + across.x * half, y: middle.y + across.y * half },
  }
}

/** Whether a line from `a` to `b` (LINE_WIDTH wide) touches `wall`. */
export function goesThrough(a: GamePoint, b: GamePoint, wall: Wall): boolean {
  return distanceBetweenSegments(a, b, wall.from, wall.to) < WALL_THICKNESS / 2 + LINE_WIDTH / 2
}

/** A round's dots, its walls, and the hidden solution they were laid out around. */
export interface Layout {
  readonly dots: readonly GamePoint[]
  readonly walls: readonly Wall[]
  /** The dots (their indexes) in an order that connects them all, through no wall. */
  readonly solution: readonly number[]
}

/** The lines from each dot of `order` to the next, as pairs of dots (their indexes). */
export function linesOf(order: readonly number[]): [number, number][] {
  return order.slice(1).map((dot, i) => [order[i], dot])
}

/** Whether the lines between `dots` keep CLEARANCE from the other dots, and cross each other nowhere. */
export function linesAreClear(
  dots: readonly GamePoint[],
  lines: readonly (readonly [number, number])[],
): boolean {
  const dotGap = DOT_RADIUS + LINE_WIDTH / 2 + CLEARANCE
  const clearOfDots = lines.every(([a, b]) =>
    dots.every(
      (dot, i) => i === a || i === b || distanceToSegment(dot, dots[a], dots[b]) >= dotGap,
    ),
  )
  const apart = lines.every(([a, b], i) =>
    lines.slice(i + 1).every(([c, d]) => !segmentsCross(dots[a], dots[b], dots[c], dots[d])),
  )
  return clearOfDots && apart
}

/** Whether `wall` keeps CLEARANCE from the `lines` between `dots`, the dots, and the `walls` before it. */
export function wallFits(
  wall: Wall,
  dots: readonly GamePoint[],
  lines: readonly (readonly [number, number])[],
  walls: readonly Wall[],
): boolean {
  const lineGap = WALL_THICKNESS / 2 + LINE_WIDTH / 2 + CLEARANCE
  const dotGap = DOT_RADIUS + WALL_THICKNESS / 2 + CLEARANCE
  const wallGap = WALL_THICKNESS + CLEARANCE
  return (
    lines.every(
      ([a, b]) => distanceBetweenSegments(dots[a], dots[b], wall.from, wall.to) >= lineGap,
    ) &&
    dots.every((dot) => distanceToSegment(dot, wall.from, wall.to) >= dotGap) &&
    walls.every(
      (other) => distanceBetweenSegments(wall.from, wall.to, other.from, other.to) >= wallGap,
    )
  )
}

/** Every pair of `count` dots (their indexes), each once. */
export function pairsOf(count: number): [number, number][] {
  return Array.from({ length: count }, (_, a) =>
    Array.from({ length: count - a - 1 }, (__, i): [number, number] => [a, a + 1 + i]),
  ).flat()
}

/** `count` dots at random, at least DOT_SPACING apart. */
function placeDots(count: number, random: Random): GamePoint[] {
  return randomLayout(count, random, {
    area: DOTS_AREA,
    rules: [
      (spot, placed) =>
        placed.every((other) => Math.hypot(spot.x - other.x, spot.y - other.y) >= DOT_SPACING),
    ],
    layoutTries: 20,
    placeTries: 200,
    fallback: FALLBACK_SPOTS,
  })
}

/** One try at laying out a round of `count` dots (see the steps at the top); undefined if a rule is broken. */
function tryLayout(count: number, random: Random): Layout | undefined {
  const dots = placeDots(count, random)
  const solution = shuffled(
    random,
    dots.map((_, i) => i),
  )
  const lines = linesOf(solution)

  if (!linesAreClear(dots, lines)) {
    return undefined
  }

  // Where each dot is in the solution: two dots are next to each other if one place apart.
  const place: number[] = []
  solution.forEach((dot, i) => (place[dot] = i))
  const notNext = pairsOf(count).filter(([a, b]) => Math.abs(place[a] - place[b]) > 1)
  const walls: Wall[] = []

  for (const [a, b] of shuffled(random, notNext)) {
    const wall = wallAcross(dots[a], dots[b])

    if (walls.length < count - 2 && wallFits(wall, dots, lines, walls)) {
      walls.push(wall)
    }
  }

  return walls.length === Math.max(0, count - 2) ? { dots, walls, solution } : undefined
}

/**
 * A round of `count` dots (2 to MOST_DOTS) with its walls, laid out at random
 * around a hidden solution (see the top). If none is found in `tries`, which
 * never happens, the places that always fit, in order, without walls.
 */
export function layOutRound(count: number, random: Random, tries = ROUND_TRIES): Layout {
  for (let i = 0; i < tries; i++) {
    const layout = tryLayout(count, random)

    if (layout) {
      return layout
    }
  }

  const dots = FALLBACK_SPOTS.slice(0, count)
  return { dots, walls: [], solution: dots.map((_, i) => i) }
}
