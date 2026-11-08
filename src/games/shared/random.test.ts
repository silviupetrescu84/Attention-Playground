import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { randomBetween, randomIndex, randomItem, shuffled } from './random'

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

describe('randomItem', () => {
  it('picks the item at the random index', () => {
    const items = ['a', 'b', 'c']

    expect(randomItem(constantRandom(0), items)).toBe('a')
    expect(randomItem(constantRandom(0.5), items)).toBe('b')
    expect(randomItem(constantRandom(0.9999), items)).toBe('c')
  })

  it('refuses an empty list', () => {
    expect(() => randomItem(constantRandom(0.5), [])).toThrow(
      new RangeError('Cannot pick an item from an empty list'),
    )
  })
})

describe('shuffled', () => {
  it('returns a new list with the same items, leaving the original alone', () => {
    const items = [1, 2, 3, 4, 5]

    const result = shuffled(seededRandom(1), items)

    expect(result).not.toBe(items)
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5])
    expect(items).toEqual([1, 2, 3, 4, 5])
  })

  it('handles empty and single-item lists', () => {
    expect(shuffled(seededRandom(1), [])).toEqual([])
    expect(shuffled(seededRandom(1), ['only'])).toEqual(['only'])
  })

  it('makes every order about equally likely', () => {
    const random = seededRandom(2)
    const counts = new Map<string, number>()

    for (let i = 0; i < 24_000; i++) {
      const order = shuffled(random, ['a', 'b', 'c', 'd']).join('')
      counts.set(order, (counts.get(order) ?? 0) + 1)
    }

    // 4 items have 24 orders: about 1,000 each.
    expect(counts.size).toBe(24)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(850)
      expect(count).toBeLessThan(1_150)
    }
  })
})
