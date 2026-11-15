import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { createDeck } from './deck'

describe('a deck', () => {
  it('deals every item once, in random order, before any comes again', () => {
    const deck = createDeck(['a', 'b', 'c', 'd', 'e'], seededRandom(3))

    const first = deck.take(5)
    const second = deck.take(5)

    expect([...first].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect([...second].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('deals in a different order each time round', () => {
    const deck = createDeck(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], seededRandom(1))
    const orders = Array.from({ length: 4 }, () => deck.take(8).join(''))

    expect(new Set(orders).size).toBeGreaterThan(1)
  })

  it('deals several at once, all different, even across two rounds', () => {
    const deck = createDeck(['a', 'b', 'c'], seededRandom(2))

    for (let i = 0; i < 20; i++) {
      const taken = deck.take(2)
      expect(new Set(taken).size).toBe(2)
    }
  })

  it('leaves out what it is asked to avoid, keeping it for later', () => {
    const deck = createDeck(['a', 'b', 'c'], constantRandom(0))
    const order = deck.take(3)

    // A new round: the first one would be order's first again, unless avoided.
    const next = deck.take(1, [order[2]])

    expect(next).not.toEqual([order[2]])
    expect([...deck.take(2)].sort()).toEqual([...order.filter((item) => item !== next[0])].sort())
  })

  it('never deals what it is asked to avoid, many times over', () => {
    const deck = createDeck(['a', 'b', 'c', 'd'], seededRandom(5))
    let last = deck.take(1)[0]

    for (let i = 0; i < 50; i++) {
      const next = deck.take(1, [last])[0]
      expect(next).not.toBe(last)
      last = next
    }
  })

  it('deals duplicates in the list once', () => {
    const deck = createDeck(['a', 'a', 'b'], seededRandom(1))

    expect([...deck.take(2)].sort()).toEqual(['a', 'b'])
    expect(() => deck.take(3)).toThrow('Cannot take 3 different items out of 2')
  })

  it('refuses to deal more different items than it may', () => {
    const deck = createDeck(['a', 'b', 'c'], seededRandom(1))

    expect(() => deck.take(3, ['a'])).toThrow('Cannot take 3 different items out of 2')
    expect(deck.take(2, ['a']).sort()).toEqual(['b', 'c'])
  })

  it('uses Math.random by default', () => {
    const deck = createDeck(['a', 'b'])

    expect([...deck.take(2)].sort()).toEqual(['a', 'b'])
  })
})
