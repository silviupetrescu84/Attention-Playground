import { describe, expect, it } from 'vitest'
import { checkAtLeast, checkNotNegative, checkPositive, checkWholeNumber } from './checks'

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

describe('checkPositive', () => {
  it.each([Number.MIN_VALUE, 0.5, 1, 60_000])('accepts %s', (value) => {
    expect(() => checkPositive(value, 'Speed')).not.toThrow()
  })

  it.each([0, -0, -1, ...notFinite])('rejects %s, naming the value', (value) => {
    expect(() => checkPositive(value, 'Speed')).toThrow(
      new RangeError(`Speed must be a finite number > 0, got ${value}`),
    )
  })
})

describe('checkWholeNumber', () => {
  it.each([
    [1, 1, Infinity],
    [2, 2, 6],
    [6, 2, 6],
    [1_000, 0, Infinity],
  ])('accepts %s from %s to %s', (value, min, max) => {
    expect(() => checkWholeNumber(value, 'Choices', min, max)).not.toThrow()
  })

  it.each([1.5, 1, 7, ...notFinite])('rejects %s outside 2 to 6, naming the value', (value) => {
    expect(() => checkWholeNumber(value, 'Choices', 2, 6)).toThrow(
      new RangeError(`Choices must be a whole number from 2 to 6, got ${value}`),
    )
  })

  it.each<[number | undefined, number | undefined, string]>([
    [1, undefined, ' ≥ 1'],
    [undefined, 6, ' ≤ 6'],
    [undefined, undefined, ''],
  ])('can have no end, or neither: from %s to %s', (min, max, range) => {
    expect(() => checkWholeNumber(0.5, 'Change', min, max)).toThrow(
      new RangeError(`Change must be a whole number${range}, got 0.5`),
    )
    expect(() => checkWholeNumber(6, 'Change', min, max)).not.toThrow()
  })
})

describe('checkAtLeast', () => {
  it.each([80, 60])('accepts %s, not below the other', (value) => {
    expect(() => checkAtLeast(value, 'Top speed', 60, 'the starting speed')).not.toThrow()
  })

  it.each([59, Number.NaN])('rejects %s, naming both', (value) => {
    expect(() => checkAtLeast(value, 'Top speed', 60, 'the starting speed')).toThrow(
      new RangeError(`Top speed must be ≥ the starting speed (60), got ${value}`),
    )
  })
})
