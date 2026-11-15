import { describe, expect, it, vi } from 'vitest'
import { seededRandom } from '../../test/random'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from './game-canvas'
import { GAME_BAR_HEIGHT } from './game-hud'
import { findRandomSpot, gapBetweenOvals, playAreaFor, randomPointIn } from './placing'

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
