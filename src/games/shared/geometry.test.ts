import { describe, expect, it } from 'vitest'
import type { GamePoint } from './game-canvas'
import { distanceToEllipse, ellipseTouchesBox, isInEllipse } from './geometry'

const centre = { x: 200, y: 400 }

/** The distance from `point` to the ellipse's edge, the slow way: from many points along it. */
function measured(point: GamePoint, radiusX: number, radiusY: number) {
  let closest = Infinity
  for (let i = 0; i < 20_000; i++) {
    const angle = (i * 2 * Math.PI) / 20_000
    const x = centre.x + radiusX * Math.cos(angle)
    const y = centre.y + radiusY * Math.sin(angle)
    closest = Math.min(closest, Math.hypot(point.x - x, point.y - y))
  }
  return closest
}

describe('isInEllipse', () => {
  it('is true inside and on the edge, and false outside', () => {
    expect(isInEllipse(centre, centre, 80, 40)).toBe(true)
    expect(isInEllipse({ x: 280, y: 400 }, centre, 80, 40)).toBe(true)
    expect(isInEllipse({ x: 200, y: 440 }, centre, 80, 40)).toBe(true)
    expect(isInEllipse({ x: 200 + 80 * 0.7, y: 400 - 40 * 0.7 }, centre, 80, 40)).toBe(true)
    expect(isInEllipse({ x: 281, y: 400 }, centre, 80, 40)).toBe(false)
    expect(isInEllipse({ x: 200, y: 359 }, centre, 80, 40)).toBe(false)
    // The corner of the box around it.
    expect(isInEllipse({ x: 200 + 80 * 0.8, y: 400 + 40 * 0.8 }, centre, 80, 40)).toBe(false)
  })
})

describe('distanceToEllipse', () => {
  it('is the distance to the closest point of the edge, outside', () => {
    // Ovals, wide and tall, a circle, and the doubled oval games keep ovals apart with.
    for (const [radiusX, radiusY] of [
      [84, 46.2],
      [46.2, 84],
      [60, 60],
      [168, 92.4],
    ]) {
      for (let i = 0; i < 24; i++) {
        const angle = (i * 2 * Math.PI) / 24 + 0.1
        for (const away of [1, 15, 60, 200]) {
          const point = {
            x: centre.x + (radiusX + away) * Math.cos(angle),
            y: centre.y + (radiusY + away) * Math.sin(angle),
          }
          const distance = distanceToEllipse(point, centre, radiusX, radiusY)
          expect(distance).toBeGreaterThan(0)
          expect(Math.abs(distance - measured(point, radiusX, radiusY))).toBeLessThan(0.001)
        }
      }
    }
  })

  it('is exact straight across and straight up', () => {
    expect(distanceToEllipse({ x: 300, y: 400 }, centre, 80, 40)).toBeCloseTo(20, 9)
    expect(distanceToEllipse({ x: 200, y: 330 }, centre, 80, 40)).toBeCloseTo(30, 9)
  })

  it('is negative inside, by how far in', () => {
    expect(distanceToEllipse({ x: 270, y: 400 }, centre, 80, 40)).toBeCloseTo(-10, 6)
    expect(distanceToEllipse({ x: 200, y: 390 }, centre, 80, 40)).toBeCloseTo(-30, 6)
    expect(distanceToEllipse({ x: 220, y: 410 }, centre, 80, 40)).toBeLessThan(0)
  })

  it('is 0 on the edge', () => {
    expect(distanceToEllipse({ x: 280, y: 400 }, centre, 80, 40)).toBeCloseTo(0, 9)
  })

  it('is the radius, inside, at the centre of a circle', () => {
    expect(distanceToEllipse(centre, centre, 50, 50)).toBeCloseTo(-50, 9)
  })
})

describe('ellipseTouchesBox', () => {
  // A pad-like box below and around the ellipse's centre (200, 400), radii 50 × 25.
  const box = (left: number, top: number, width = 100, height = 16) => ({
    left,
    right: left + width,
    top,
    bottom: top + height,
  })

  it('is true when the ellipse dips into the box, or just touches it', () => {
    expect(ellipseTouchesBox(centre, 50, 25, box(150, 420))).toBe(true)
    expect(ellipseTouchesBox(centre, 50, 25, box(150, 425))).toBe(true)
    // Beside it, level with the centre.
    expect(ellipseTouchesBox(centre, 50, 25, box(245, 390))).toBe(true)
  })

  it('is false just short of touching', () => {
    expect(ellipseTouchesBox(centre, 50, 25, box(150, 425.5))).toBe(false)
    expect(ellipseTouchesBox(centre, 50, 25, box(250.5, 390))).toBe(false)
  })

  it('goes by the curve at the corners, not the box around the ellipse', () => {
    // A box just off the ellipse's bottom right, inside the box around it.
    const corner = box(200 + 50 * 0.8, 400 + 25 * 0.8, 20, 20)
    expect(ellipseTouchesBox(centre, 50, 25, corner)).toBe(false)
    const nearer = box(200 + 50 * 0.6, 400 + 25 * 0.6, 20, 20)
    expect(ellipseTouchesBox(centre, 50, 25, nearer)).toBe(true)
  })

  it('is true when the ellipse is inside the box, or the box inside the ellipse', () => {
    expect(ellipseTouchesBox(centre, 50, 25, box(100, 300, 200, 200))).toBe(true)
    expect(ellipseTouchesBox(centre, 50, 25, box(195, 395, 10, 10))).toBe(true)
  })
})
