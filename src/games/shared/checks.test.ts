import { describe, expect, it } from 'vitest'
import { checkNotNegative } from './checks'

const notFinite = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

describe('checkNotNegative', () => {
  it.each([0, -0, 0.5, 1, 60_000])('accepts %s', (value) => {
    expect(() => checkNotNegative(value, 'Points')).not.toThrow()
  })

  it.each([-Number.MIN_VALUE, -1, ...notFinite])('rejects %s, naming the value', (value) => {
    expect(() => checkNotNegative(value, 'Points')).toThrow(
      new RangeError(`Points must be a finite number ≥ 0, got ${value}`),
    )
  })
})
