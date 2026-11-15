import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { BUBBLE_HEIGHT, BUBBLE_WIDTH } from '../emotions-rise/emotions-rise'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT, PLAY_CENTRE } from '../shared/game-hud'
import {
  CENTRE,
  EDGE_GAP,
  FALLBACK_SPOTS,
  gapToGoal,
  GOAL_GAP,
  GOAL_SIZE,
  GOAL_STEP,
  GOAL_STEPS,
  goalRadiusFor,
  goalSizeFor,
  MOST_ACTIONS_THAT_FIT,
  OPTION_GAP,
  OPTION_HEIGHT,
  OPTION_HIT_HEIGHT,
  OPTION_HIT_WIDTH,
  OPTION_WIDTH,
  placeOptions,
  RING_OFFSET,
  ringOuterRadiusFor,
  SPREAD,
} from './layout'

/** The levels actions are ever laid out around: short of reached and failed. */
const LEVELS = [-2, -1, 0, 1, 2]
const BIGGEST = ringOuterRadiusFor(goalSizeFor(GOAL_STEPS - 1))

/** Points all around the border of an oval at `at`, under 1 px apart. */
function borderOf({ x, y }: GamePoint, points = 720): GamePoint[] {
  return Array.from({ length: points }, (_, i) => {
    const angle = (i * 2 * Math.PI) / points
    return {
      x: x + (OPTION_WIDTH / 2) * Math.cos(angle),
      y: y + (OPTION_HEIGHT / 2) * Math.sin(angle),
    }
  })
}

/** The smallest distance between two sets of points. */
function closest(a: readonly GamePoint[], b: readonly GamePoint[]) {
  let smallest = Infinity
  for (const p of a) {
    for (const q of b) smallest = Math.min(smallest, Math.hypot(p.x - q.x, p.y - q.y))
  }
  return smallest
}

/** The gaps around `spots`, measured independently of the layout's own checks. */
function measuredGaps(spots: readonly GamePoint[], goalRadius: number) {
  const borders = spots.map((spot) => borderOf(spot, 180))
  const all = borders.flat()
  return {
    toEdges: Math.min(
      ...all.flatMap((p) => [p.x, GAME_WIDTH - p.x, p.y - GAME_BAR_HEIGHT, GAME_HEIGHT - p.y]),
    ),
    toGoal: Math.min(...all.map((p) => Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y))) - goalRadius,
    between: Math.min(
      ...borders.flatMap((border, i) =>
        borders.slice(i + 1).map((other) => closest(border, other)),
      ),
    ),
  }
}

/** Checks every gap around `spots`, less the error of measuring with points 2 px apart. */
function expectGaps(spots: readonly GamePoint[], goalRadius: number) {
  const gaps = measuredGaps(spots, goalRadius)

  expect(gaps.toEdges).toBeGreaterThanOrEqual(EDGE_GAP - 0.01)
  expect(gaps.toGoal).toBeGreaterThanOrEqual(GOAL_GAP - 0.01)
  if (spots.length > 1) expect(gaps.between).toBeGreaterThanOrEqual(OPTION_GAP - 0.01)
}

describe('sizes', () => {
  it('uses the agreed numbers', () => {
    expect(CENTRE).toBe(PLAY_CENTRE)
    expect([GOAL_SIZE, GOAL_STEP, GOAL_STEPS, RING_OFFSET]).toEqual([150, 0.15, 3, 6])
    expect([OPTION_GAP, GOAL_GAP, EDGE_GAP, SPREAD]).toEqual([15, 4, 4, 130])
  })

  it('makes the ovals 20% bigger than the Emotions Rise oval', () => {
    expect(OPTION_WIDTH).toBeCloseTo(BUBBLE_WIDTH * 1.2, 9)
    expect(OPTION_HEIGHT).toBeCloseTo(BUBBLE_HEIGHT * 1.2, 9)
    // Taps count on the oval as seen, slightly inside the image.
    expect(OPTION_HIT_WIDTH).toBeCloseTo(164.4, 9)
    expect(OPTION_HIT_HEIGHT).toBeCloseTo(88.8, 9)
  })

  it('makes the goal a step (15% of its size) smaller or bigger per level', () => {
    expect(LEVELS.map(goalSizeFor)).toEqual([105, 127.5, 150, 172.5, 195])
    expect(goalSizeFor(-GOAL_STEPS)).toBeCloseTo(82.5)
    expect(goalSizeFor(GOAL_STEPS)).toBeCloseTo(217.5)
  })

  it('measures the goal as its bubble without the glow, and the ring outside it', () => {
    expect(goalRadiusFor(150)).toBe(67.5)
    expect(ringOuterRadiusFor(150)).toBe(67.5 + 6 + 2)
  })
})

describe('measuring gaps', () => {
  it('between an oval and the goal, ring included', () => {
    for (const at of [
      { x: CENTRE.x, y: CENTRE.y - 200 },
      { x: 80, y: CENTRE.y },
      { x: 100, y: 250 },
    ]) {
      const measured = Math.min(
        ...borderOf(at).map((p) => Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y)),
      )
      expect(gapToGoal(at, 80)).toBeCloseTo(measured - 80, 1)
    }
    expect(gapToGoal({ x: CENTRE.x + 60, y: CENTRE.y }, 80)).toBeLessThan(0)
  })
})

describe('placing the actions', () => {
  it('keeps every gap, to the edges, the goal and each other, at every size of goal', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const random = seededRandom(seed)
      for (const level of LEVELS) {
        for (let count = 2; count <= MOST_ACTIONS_THAT_FIT; count++) {
          const radius = ringOuterRadiusFor(goalSizeFor(level))
          const spots = placeOptions(count, radius, random)

          expect(spots).toHaveLength(count)
          expectGaps(spots, radius)
        }
      }
    }
    // Many placements: about 2 s alone, more with every other test running at once.
  }, 20_000)

  it('spreads them at least 130 px apart, centre to centre, when there is room', () => {
    const random = seededRandom(7)

    for (let i = 0; i < 20; i++) {
      const spots = placeOptions(6, BIGGEST, random)
      for (const [j, spot] of spots.entries()) {
        for (const other of spots.slice(j + 1)) {
          expect(Math.hypot(spot.x - other.x, spot.y - other.y)).toBeGreaterThanOrEqual(SPREAD)
        }
      }
    }
  })

  it('puts them in different places each time, not the fallback ones', () => {
    const random = seededRandom(1)
    const first = placeOptions(6, BIGGEST, random)
    const second = placeOptions(6, BIGGEST, random)

    expect(second).not.toEqual(first)
    const fallback = ({ x, y }: GamePoint) => FALLBACK_SPOTS.some((f) => f.x === x && f.y === y)
    expect([...first, ...second].some(fallback)).toBe(false)
  })

  it('lets them closer than 130 px, centre to centre, when it must', () => {
    // Only two places come up, one above the other, 115 px apart: far enough
    // for the 15 px gap, too close for 130 px.
    const top = GAME_BAR_HEIGHT + OPTION_HEIGHT / 2 + EDGE_GAP
    const range = GAME_HEIGHT - OPTION_HEIGHT / 2 - EDGE_GAP - top
    const numbers = [0, 0, 0, 115 / range]
    let next = 0

    const spots = placeOptions(2, 10, () => numbers[next++ % numbers.length])

    const [a, b] = spots
    expect(a.x).toBe(b.x)
    expect(Math.abs(a.y - b.y)).toBeCloseTo(115, 9)
    expectGaps(spots, 10)
  })

  it('uses the fallback places when random ones do not fit', () => {
    // Always the middle of the canvas: on the goal.
    const spots = placeOptions(6, BIGGEST, constantRandom(0.5))

    expect(spots).toHaveLength(6)
    for (const spot of spots) {
      expect(FALLBACK_SPOTS).toContainEqual(spot)
    }
    expectGaps(spots, BIGGEST)
  })

  it('has 8 fallback places, keeping every gap around the biggest goal', () => {
    expect(FALLBACK_SPOTS).toHaveLength(8)
    expectGaps(FALLBACK_SPOTS, BIGGEST)
  })

  it('refuses more ovals than there are fallback places', () => {
    expect(() => placeOptions(9, BIGGEST, seededRandom(1))).toThrow(
      'Cannot place more than 8 ovals, got 9',
    )
  })
})
