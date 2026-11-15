import { describe, expect, it } from 'vitest'
import { clamp } from './numbers'

describe('clamp', () => {
  it.each([
    [0.5, 0.5],
    [0, 0],
    [1, 1],
    [-3, 0],
    [7, 1],
  ])('keeps %s between 0 and 1 as %s', (value, kept) => {
    expect(clamp(value, 0, 1)).toBe(kept)
  })

  it('works for any range', () => {
    expect([clamp(4, 5, 10), clamp(12, 5, 10), clamp(-2, -5, -1)]).toEqual([5, 10, -2])
  })
})
