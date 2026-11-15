import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../test/random'
import data from './data/shift-perspective.json'
import { createThoughtPicker, thoughtsFrom, type Thought } from './thoughts'

const thoughts = thoughtsFrom(data)

/** Made-up thoughts, named A, B, C… */
const made = (count: number): Thought[] =>
  Array.from({ length: count }, (_, i) => ({
    text: String.fromCharCode(65 + i),
    good: ['good'],
    bad: ['bad'],
  }))

describe('thoughts', () => {
  it('reads each thought with its good and bad ways to see it', () => {
    expect(
      thoughtsFrom({
        thoughts: [
          {
            thought: 'They did not reply',
            choices: {
              good: [{ text: 'They may be busy' }],
              bad: [{ text: 'They hate me' }, { text: 'I annoyed them' }],
            },
          },
        ],
      }),
    ).toEqual([
      {
        text: 'They did not reply',
        good: ['They may be busy'],
        bad: ['They hate me', 'I annoyed them'],
      },
    ])
  })

  it('has 100 thoughts, each with 3 good and 5 bad ways to see it, all different', () => {
    expect(thoughts).toHaveLength(100)
    expect(new Set(thoughts.map((thought) => thought.text)).size).toBe(100)
    for (const { text, good, bad } of thoughts) {
      expect([good.length, bad.length], text).toEqual([3, 5])
      expect(new Set([...good, ...bad]).size, text).toBe(8)
    }
  })
})

describe('picking thoughts', () => {
  it('shows every thought once before any comes again', () => {
    const picker = createThoughtPicker(thoughts, seededRandom(1))

    for (let round = 0; round < 3; round++) {
      const picked = Array.from({ length: 100 }, () => picker.next())
      expect(new Set(picked)).toEqual(new Set(thoughts))
    }
  })

  it('picks in a different order each time all have been shown', () => {
    const picker = createThoughtPicker(thoughts, seededRandom(2))

    const first = Array.from({ length: 100 }, () => picker.next())
    const second = Array.from({ length: 100 }, () => picker.next())

    expect(second).not.toEqual(first)
  })

  it('never shows the same thought twice in a row, not even from one order to the next', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const picker = createThoughtPicker(made(2), seededRandom(seed))
      const picked = Array.from({ length: 40 }, () => picker.next().text)

      // With 2 thoughts, that leaves only taking turns.
      expect(picked.join('')).toMatch(/^(AB)+$|^(BA)+$/)
    }
  })

  it('keeps the thought just shown for later when the next order would start with it', () => {
    // The first order is A B C (picked A, B, C); the next is C B A, which
    // would start with C again, so C waits: B, C, A.
    const numbers = [0.99, 0.99, 0, 0.99]
    const picker = createThoughtPicker(made(3), () => numbers.shift()!)

    const picked = Array.from({ length: 6 }, () => picker.next().text)

    expect(picked).toEqual(['A', 'B', 'C', 'B', 'C', 'A'])
  })

  it('needs at least 2 thoughts', () => {
    expect(() => createThoughtPicker(made(1))).toThrow(
      new RangeError('Need at least 2 thoughts, got 1'),
    )
  })
})
