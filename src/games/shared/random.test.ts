import { describe, expect, it } from 'vitest'
import { constantRandom } from '../../test/random'
import { randomBetween, randomIndex } from './random'

describe('randomBetween', () => {
  it('maps [0, 1) onto min … max', () => {
    expect(randomBetween(constantRandom(0), 40, 80)).toBe(40)
    expect(randomBetween(constantRandom(0.5), 40, 80)).toBe(60)
    expect(randomBetween(constantRandom(0.999), 40, 80)).toBeCloseTo(79.96, 9)
  })
})

describe('randomIndex', () => {
  it('maps [0, 1) onto 0 … length - 1', () => {
    expect(randomIndex(constantRandom(0), 3)).toBe(0)
    expect(randomIndex(constantRandom(0.5), 3)).toBe(1)
    expect(randomIndex(constantRandom(0.9999), 3)).toBe(2)
  })

  it('stays in range even if the random source returns 1', () => {
    expect(randomIndex(constantRandom(1), 3)).toBe(2)
  })
})
