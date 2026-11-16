import { describe, expect, it, vi } from 'vitest'
import { seededRandom } from '../../test/random'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from './game-canvas'
import { GAME_BAR_HEIGHT } from './game-hud'
import { isInBox } from './geometry'
import {
  findRandomSpot,
  gapBetweenOvals,
  playAreaFor,
  randomLayout,
  randomPointIn,
  type SpotRule,
} from './placing'

const size = { width: 168, height: 92.4 }

/** The smallest distance between the borders of two ovals of `size`, measured point by point. */
function measuredGap(a: GamePoint, b: GamePoint) {
  const border = ({ x, y }: GamePoint) =>
    Array.from({ length: 720 }, (_, i) => ({
      x: x + (size.width / 2) * Math.cos((i * Math.PI) / 360),
      y: y + (size.height / 2) * Math.sin((i * Math.PI) / 360),
    }))
  const others = border(b)
  let smallest = Infinity
  for (const p of border(a)) {
    for (const q of others) smallest = Math.min(smallest, Math.hypot(p.x - q.x, p.y - q.y))
  }
  return smallest
}

describe('the play area', () => {
  it('keeps all of something its gap inside the canvas, below the score bar', () => {
    expect(playAreaFor(size, 4)).toEqual({
      left: 84 + 4,
      right: GAME_WIDTH - 84 - 4,
      top: GAME_BAR_HEIGHT + 46.2 + 4,
      bottom: GAME_HEIGHT - 46.2 - 4,
    })
  })
})

describe('the gap between two ovals', () => {
  it('is measured border to border, whichever way they are apart', () => {
    const a = { x: 200, y: 300 }

    for (const b of [
      { x: 200 + 168 + 15, y: 300 },
      { x: 200, y: 300 + 92.4 + 15 },
      { x: 330, y: 400 },
      { x: 90, y: 190 },
      { x: 250, y: 420 },
    ]) {
      expect(gapBetweenOvals(a, b, size)).toBeCloseTo(measuredGap(a, b), 1)
    }
  })

  it('is negative when they overlap', () => {
    expect(gapBetweenOvals({ x: 200, y: 300 }, { x: 250, y: 320 }, size)).toBeLessThan(0)
    expect(gapBetweenOvals({ x: 200, y: 300 }, { x: 200, y: 300 }, size)).toBeLessThan(0)
  })
})

describe('random spots', () => {
  const area = { left: 100, right: 300, top: 200, bottom: 600 }

  it('are anywhere in the area', () => {
    expect(randomPointIn(area, () => 0)).toEqual({ x: 100, y: 200 })
    expect(randomPointIn(area, () => 0.5)).toEqual({ x: 200, y: 400 })
    const random = seededRandom(1)
    for (let i = 0; i < 100; i++) {
      const { x, y } = randomPointIn(area, random)
      expect(x >= 100 && x <= 300 && y >= 200 && y <= 600).toBe(true)
    }
  })

  it('are the first that fits, of so many tries', () => {
    const fits = vi.fn((spot: GamePoint) => spot.x > 250)

    const spot = findRandomSpot(area, seededRandom(2), 50, fits)

    expect(spot!.x).toBeGreaterThan(250)
    expect(fits).toHaveBeenLastCalledWith(spot)
  })

  it('are none when nothing fits in time', () => {
    const fits = vi.fn(() => false)

    expect(findRandomSpot(area, seededRandom(3), 20, fits)).toBeUndefined()
    expect(fits).toHaveBeenCalledTimes(20)
  })
})

describe('randomLayout', () => {
  const area = { left: 0, right: 100, top: 0, bottom: 100 }
  const fallback = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
  ]
  const options = { area, layoutTries: 5, placeTries: 10, fallback }
  /** At least `distance` from every spot placed before. */
  const apart =
    (distance: number): SpotRule =>
    (spot, placed) =>
      placed.every((other) => Math.hypot(spot.x - other.x, spot.y - other.y) >= distance)

  it('places every spot in the area, keeping the rule', () => {
    const spots = randomLayout(3, seededRandom(1), { ...options, rules: [apart(30)] })

    expect(spots).toHaveLength(3)
    for (const [i, spot] of spots.entries()) {
      expect(isInBox(spot, area)).toBe(true)
      expect(apart(30)(spot, spots.slice(0, i))).toBe(true)
    }
  })

  it('keeps the strictest rule it can, then the next', () => {
    // Nowhere in the area is 200 apart from anything else.
    const spots = randomLayout(3, seededRandom(2), { ...options, rules: [apart(200), apart(30)] })

    expect(spots).toHaveLength(3)
    expect(spots.every((spot, i) => apart(30)(spot, spots.slice(0, i)))).toBe(true)
  })

  it('falls back on some of the places that always fit when no rule can be kept', () => {
    const spots = randomLayout(2, seededRandom(3), { ...options, rules: [apart(200)] })

    expect(spots).toHaveLength(2)
    expect(new Set(spots).size).toBe(2)
    for (const spot of spots) {
      expect(fallback).toContain(spot)
    }
  })

  it('cannot place more than the places that always fit', () => {
    expect(() => randomLayout(4, seededRandom(4), { ...options, rules: [apart(0)] })).toThrow(
      new RangeError('Cannot place more than 3 ovals, got 4'),
    )
  })
})
