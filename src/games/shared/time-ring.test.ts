import { describe, expect, it } from 'vitest'
import { createFakeContext } from '../../test/fake-canvas-context'
import { drawTimeRing, TIME_RING_WIDTH } from './time-ring'

const centre = { x: 200, y: 432 }

describe('the time ring', () => {
  it.each([
    [1, 2 * Math.PI],
    [0.75, 1.5 * Math.PI],
    [0.5, Math.PI],
    [0.1, 0.2 * Math.PI],
  ])('with %s of the time left, goes that far round, clockwise from the top', (left, sweep) => {
    const context = createFakeContext()

    drawTimeRing(context.asContext(), centre, 70, left, 'ring colour')

    const [arc] = context.callsTo('arc')
    const [x, y, radius, start, end] = arc.args as number[]
    expect([x, y, radius, start]).toEqual([200, 432, 70, -Math.PI / 2])
    expect(end - start).toBeCloseTo(sweep, 9)
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth]).toEqual(['ring colour', TIME_RING_WIDTH])
    expect(TIME_RING_WIDTH).toBe(4)
    expect(context.lineCap).toBe('round')
  })

  it('is gone when no time is left', () => {
    const context = createFakeContext()

    drawTimeRing(context.asContext(), centre, 70, 0, 'ring colour')

    expect(context.calls).toEqual([])
  })
})
