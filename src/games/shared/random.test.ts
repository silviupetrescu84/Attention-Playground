import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { randomBetween, randomBetweenAvoiding, randomIndex, randomItem, shuffled } from './random'

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

describe('randomBetweenAvoiding', () => {
  it('is anywhere between min and max at least the gap from what it avoids', () => {
    const random = seededRandom(1)

    for (let i = 0; i < 500; i++) {
      const value = randomBetweenAvoiding(random, 0, 500, 200, 100)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(500)
      expect(Math.abs(value - 200)).toBeGreaterThanOrEqual(100)
    }
  })

  it('makes every allowed value as likely, below and above', () => {
    // Allowed: 0 to 100 (a third), and 300 to 500 (two thirds).
    const at = (chance: number) => randomBetweenAvoiding(() => chance, 0, 500, 200, 100)

    expect([at(0), at(1 / 3 - 1e-9), at(1 / 3), at(2 / 3), at(0.999_999)]).toEqual([
      0,
      expect.closeTo(100, 6),
      300,
      400,
      expect.closeTo(500, 3),
    ])
  })

  it('uses only one side when the other is out of range', () => {
    expect(randomBetweenAvoiding(() => 0, 0, 500, 50, 100)).toBe(150)
    expect(randomBetweenAvoiding(() => 0.999_999, 0, 500, 450, 100)).toBeCloseTo(350, 3)
  })

  it('gives the one value allowed, at either end, when there is only one', () => {
    expect(randomBetweenAvoiding(() => 0.5, 0, 200, 100, 100)).toBe(0)
    expect(randomBetweenAvoiding(() => 0.5, 0, 150, 50, 100)).toBe(150)
  })

  it('cannot give a value when none is allowed', () => {
    expect(() => randomBetweenAvoiding(() => 0.5, 0, 150, 75, 100)).toThrow(
      new RangeError('Nothing from 0 to 150 is 100 from 75'),
    )
  })
})
