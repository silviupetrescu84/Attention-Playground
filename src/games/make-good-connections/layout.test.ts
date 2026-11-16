import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../test/random'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { distanceToSegment, isInBox } from '../shared/geometry'
import {
  CLEARANCE,
  DOT_RADIUS,
  DOT_SPACING,
  DOTS_AREA,
  EDGE_GAP,
  FALLBACK_SPOTS,
  goesThrough,
  layOutRound,
  LINE_WIDTH,
  linesAreClear,
  linesOf,
  MOST_DOTS,
  pairsOf,
  TAP_RADIUS,
  WALL_LENGTH,
  WALL_THICKNESS,
  wallAcross,
  wallFits,
  type Layout,
} from './layout'

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/** Checks every rule a round's layout must keep (see layout.ts). */
function expectPlayable({ dots, walls, solution }: Layout, count: number) {
  expect(dots).toHaveLength(count)
  expect([...solution].sort()).toEqual(dots.map((_, i) => i))
  expect(walls).toHaveLength(count - 2)
  for (const [i, dot] of dots.entries()) {
    expect(isInBox(dot, DOTS_AREA)).toBe(true)
    for (const other of dots.slice(i + 1)) {
      expect(dist(dot, other)).toBeGreaterThanOrEqual(DOT_SPACING)
    }
  }
  const lines = linesOf(solution)
  expect(linesAreClear(dots, lines)).toBe(true)
  for (const [i, wall] of walls.entries()) {
    expect(wallFits(wall, dots, lines, walls.slice(0, i))).toBe(true)
    // Across the middle of a pair not next to each other in the solution, stopping it.
    const middle = { x: (wall.from.x + wall.to.x) / 2, y: (wall.from.y + wall.to.y) / 2 }
    const stopped = pairsOf(count).filter(([a, b]) => goesThrough(dots[a], dots[b], wall))
    expect(stopped.length).toBeGreaterThan(0)
    expect(
      stopped.some(
        ([a, b]) =>
          dist(middle, { x: (dots[a].x + dots[b].x) / 2, y: (dots[a].y + dots[b].y) / 2 }) < 1e-9,
      ),
    ).toBe(true)
  }
  // Connected along the solution, either way round, no line goes through a wall.
  for (const order of [solution, [...solution].reverse()]) {
    for (const [a, b] of linesOf(order)) {
      expect(walls.some((wall) => goesThrough(dots[a], dots[b], wall))).toBe(false)
    }
  }
}

describe('sizes', () => {
  it('uses the agreed numbers', () => {
    expect([DOT_RADIUS * 2, DOT_SPACING, LINE_WIDTH, WALL_LENGTH, WALL_THICKNESS]).toEqual([
      30, 100, 4, 30, 5,
    ])
    expect([TAP_RADIUS, CLEARANCE, EDGE_GAP, MOST_DOTS]).toEqual([45, 20, 20, 8])
  })

  it('takes taps on a dot well beyond its edge, but never on two dots at once', () => {
    // 30 px beyond its edge.
    expect(TAP_RADIUS - DOT_RADIUS).toBe(30)
    expect(2 * TAP_RADIUS).toBeLessThan(DOT_SPACING)
  })

  it('keeps dots EDGE_GAP from the edges of the canvas and the score bar', () => {
    expect(DOTS_AREA).toEqual({ left: 35, right: 365, top: GAME_BAR_HEIGHT + 35, bottom: 765 })
  })
})

describe('walls', () => {
  it('are across the middle of the line between two dots, WALL_LENGTH long', () => {
    const wall = wallAcross({ x: 0, y: 0 }, { x: 100, y: 0 })

    expect(wall.from.x).toBeCloseTo(50, 9)
    expect(wall.from.y).toBeCloseTo(-15, 9)
    expect(wall.to.x).toBeCloseTo(50, 9)
    expect(wall.to.y).toBeCloseTo(15, 9)
  })

  it('stop a line through them, or touching them, with its width', () => {
    const wall = wallAcross({ x: 0, y: 0 }, { x: 100, y: 0 })

    expect(goesThrough({ x: 0, y: 0 }, { x: 100, y: 0 }, wall)).toBe(true)
    // Half the wall's thickness and half the line's: 4.5 px from the wall's middle.
    expect(goesThrough({ x: 54.4, y: -50 }, { x: 54.4, y: 50 }, wall)).toBe(true)
    expect(goesThrough({ x: 54.6, y: -50 }, { x: 54.6, y: 50 }, wall)).toBe(false)
    // Past its end.
    expect(goesThrough({ x: 0, y: 20 }, { x: 100, y: 20 }, wall)).toBe(false)
  })
})

describe('paths', () => {
  it('join each dot to the next', () => {
    expect(linesOf([2, 0, 1])).toEqual([
      [2, 0],
      [0, 1],
    ])
    expect(linesOf([3])).toEqual([])
  })

  it('can be made of any two dots', () => {
    expect(pairsOf(3)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ])
    expect(pairsOf(8)).toHaveLength(28)
  })

  const square = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 300 },
    { x: 100, y: 300 },
  ]

  it('are clear when their lines cross nothing and pass no other dot closely', () => {
    expect(linesAreClear(square, linesOf([0, 1, 2, 3]))).toBe(true)
  })

  it('are not when their lines cross', () => {
    expect(linesAreClear(square, linesOf([0, 2, 1, 3]))).toBe(false)
  })

  it('are not when a line passes close to another dot', () => {
    const inLine = [
      { x: 100, y: 100 },
      { x: 200, y: 130 },
      { x: 300, y: 100 },
    ]

    expect(linesAreClear(inLine, [[0, 2]])).toBe(false)
    expect(distanceToSegment(inLine[1], inLine[0], inLine[2])).toBeLessThan(
      DOT_RADIUS + LINE_WIDTH / 2 + CLEARANCE,
    )
  })
})

describe('a wall fitting', () => {
  const dots = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 300 },
  ]
  const lines = linesOf([0, 1, 2])

  it('keeps clear of the solution, the dots and the other walls', () => {
    expect(wallFits(wallAcross(dots[0], dots[2]), dots, lines, [])).toBe(true)
  })

  it('does not, too close to a line of the solution', () => {
    // Across the line from dot 0 to a point just beyond dot 1: right on the solution's line.
    expect(wallFits(wallAcross(dots[0], { x: 320, y: 100 }), dots, lines, [])).toBe(false)
  })

  it('does not, too close to a dot', () => {
    // 27 px from dot 0's centre: under its radius, half the wall's thickness and CLEARANCE.
    const wall = { from: { x: 110, y: 125 }, to: { x: 140, y: 125 } }

    expect(wallFits(wall, dots, [], [])).toBe(false)
  })

  it('does not, too close to another wall', () => {
    const wall = wallAcross(dots[0], dots[2])

    expect(wallFits(wall, dots, lines, [wall])).toBe(false)
  })
})

describe('laying out a round', () => {
  it('always gives every size of round, 2 to 8 dots, with 2 fewer walls, that can be done', () => {
    for (let count = 2; count <= MOST_DOTS; count++) {
      for (let seed = 1; seed <= 8; seed++) {
        expectPlayable(layOutRound(count, seededRandom(seed * 10 + count)), count)
      }
    }
  })

  it('makes each wall stop a way the player might try: 3 dots must be joined through the middle one', () => {
    const { dots, walls, solution } = layOutRound(3, seededRandom(1))
    const [start, middle, end] = solution

    expect(goesThrough(dots[start], dots[end], walls[0])).toBe(true)
    expect(goesThrough(dots[start], dots[middle], walls[0])).toBe(false)
  })

  it('lays out a different round each time', () => {
    const random = seededRandom(2)

    expect(layOutRound(5, random)).not.toEqual(layOutRound(5, random))
  })

  it('makes do with the places that always fit, without walls, if no layout is found', () => {
    const layout = layOutRound(8, seededRandom(3), 0)

    expect(layout).toEqual({ dots: FALLBACK_SPOTS, walls: [], solution: [0, 1, 2, 3, 4, 5, 6, 7] })
    expect(linesAreClear(layout.dots, linesOf(layout.solution))).toBe(true)
    for (const [i, spot] of FALLBACK_SPOTS.entries()) {
      expect(isInBox(spot, DOTS_AREA)).toBe(true)
      for (const other of FALLBACK_SPOTS.slice(i + 1)) {
        expect(dist(spot, other)).toBeGreaterThanOrEqual(DOT_SPACING)
      }
    }
  })
})
