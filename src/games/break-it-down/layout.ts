import { GREEN_BUBBLE_BODY, LARGE_OVAL } from '../shared/artwork'
import { GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { PLAY_CENTRE } from '../shared/game-hud'
import { distanceToEllipse } from '../shared/geometry'
import { findRandomSpot, gapBetweenOvals, playAreaFor } from '../shared/placing'
import { shuffled, type Random } from '../shared/random'
import { TIME_RING_WIDTH } from '../shared/time-ring'

/**
 * Where things are in Break It Down, and how big.
 *
 * The goal is in a green bubble in the middle of the canvas, with a ring
 * around it that shows the time left. Each good action makes the bubble a
 * step (GOAL_STEP) smaller, and each bad one a step bigger: GOAL_STEPS steps
 * smaller and the goal is reached, as many bigger and it is failed.
 *
 * The actions are in ovals around it, at random places: each at least
 * OPTION_GAP from the others, border to border, and GOAL_GAP from the goal's
 * ring and EDGE_GAP from the score bar and the edges of the canvas; and, if
 * there is room, at least SPREAD from each other, centre to centre. When no
 * such places are found, they go in some of the FALLBACK_SPOTS.
 */

/** Where the goal is: the middle of the canvas below the score bar. */
export const CENTRE: GamePoint = PLAY_CENTRE

/** The goal's bubble image is drawn at this size at the start. */
export const GOAL_SIZE = 150
/** Each step makes the bubble this share of GOAL_SIZE smaller or bigger. */
export const GOAL_STEP = 0.15
/** Steps smaller to reach the goal, and steps bigger to fail it. */
export const GOAL_STEPS = 3
/** The most actions that fit around the goal, at any size, with every gap kept. */
export const MOST_ACTIONS_THAT_FIT = 6
/** The middle of the ring is this far outside the goal's bubble. */
export const RING_OFFSET = 6

/** The size of the goal's bubble image `level` steps bigger than at first (smaller: negative). */
export function goalSizeFor(level: number): number {
  return GOAL_SIZE * (1 + GOAL_STEP * level)
}

/** The radius of the goal's bubble as seen (without its glow), for a bubble image of `size`. */
export function goalRadiusFor(size: number): number {
  return (size / 2) * GREEN_BUBBLE_BODY
}

/** How far the ring reaches from the centre, around a bubble image of `size`. */
export function ringOuterRadiusFor(size: number): number {
  return goalRadiusFor(size) + RING_OFFSET + TIME_RING_WIDTH / 2
}

/** The ovals are drawn 20% bigger than the Emotions Rise oval (see LARGE_OVAL). */
export const OPTION_WIDTH = LARGE_OVAL.width
export const OPTION_HEIGHT = LARGE_OVAL.height
/** The oval as seen, slightly inside its image: taps count within it. */
export const OPTION_HIT_WIDTH = LARGE_OVAL.radiusX * 2
export const OPTION_HIT_HEIGHT = LARGE_OVAL.radiusY * 2

/** Space always kept between two ovals, border to border. */
export const OPTION_GAP = 15
/** Space always kept between an oval and the goal's ring… */
export const GOAL_GAP = 4
/** …and the score bar and the edges of the canvas. */
export const EDGE_GAP = 4
/** Ovals are at least this far from each other, centre to centre, when there is room. */
export const SPREAD = 130

/** Tries at laying out all the ovals, for each rule (with SPREAD, then without)… */
export const LAYOUT_TRIES = 60
/** …and random places tried for each oval, in each try. */
export const PLACE_TRIES = 150

/** Where an oval's centre can be, for it to be EDGE_GAP inside the canvas, below the score bar. */
const AREA = playAreaFor(LARGE_OVAL, EDGE_GAP)

/**
 * How far the border of the oval at `at` is from the goal, which reaches
 * `goalRadius` from the centre (ring included); negative if they overlap.
 */
export function gapToGoal(at: GamePoint, goalRadius: number): number {
  return distanceToEllipse(CENTRE, at, LARGE_OVAL.width / 2, LARGE_OVAL.height / 2) - goalRadius
}

/**
 * Eight places that always fit, around the biggest goal the ovals are laid
 * out around: two columns, two rows above the goal and two below.
 */
export const FALLBACK_SPOTS: readonly GamePoint[] = [-300, -170, 170, 300].flatMap((dy) =>
  [GAME_WIDTH / 4, (GAME_WIDTH * 3) / 4].map((x) => ({ x, y: CENTRE.y + dy })),
)

/** Whether an oval at `spot` keeps every gap to `placed` ovals and the goal, `spread` apart. */
function fits(spot: GamePoint, placed: readonly GamePoint[], goalRadius: number, spread: number) {
  // The other ovals first: quicker to check than the goal.
  return (
    placed.every(
      (other) =>
        Math.hypot(spot.x - other.x, spot.y - other.y) >= spread &&
        gapBetweenOvals(spot, other, LARGE_OVAL) >= OPTION_GAP,
    ) && gapToGoal(spot, goalRadius) >= GOAL_GAP
  )
}

function randomLayout(
  count: number,
  goalRadius: number,
  spread: number,
  random: Random,
): GamePoint[] | undefined {
  const placed: GamePoint[] = []

  while (placed.length < count) {
    const spot = findRandomSpot(AREA, random, PLACE_TRIES, (candidate) =>
      fits(candidate, placed, goalRadius, spread),
    )

    if (!spot) {
      return undefined
    }

    placed.push(spot)
  }

  return placed
}

/**
 * Random places for `count` ovals around a goal that reaches `goalRadius`
 * from the centre, ring included (see the rules at the top).
 */
export function placeOptions(count: number, goalRadius: number, random: Random): GamePoint[] {
  if (count > FALLBACK_SPOTS.length) {
    throw new RangeError(`Cannot place more than ${FALLBACK_SPOTS.length} ovals, got ${count}`)
  }

  for (const spread of [SPREAD, 0]) {
    for (let i = 0; i < LAYOUT_TRIES; i++) {
      const placed = randomLayout(count, goalRadius, spread, random)

      if (placed) {
        return placed
      }
    }
  }

  return shuffled(random, FALLBACK_SPOTS).slice(0, count)
}
