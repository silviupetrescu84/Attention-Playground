import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import {
  createWordPicker,
  MAX_SAME_TYPE_IN_A_ROW,
  type Word,
  type WordPickerOptions,
  type WordType,
} from './word-picker'

const good = ['Joy', 'Hope', 'Calm', 'Love', 'Awe']
const bad = ['Fear', 'Anger', 'Shame', 'Envy', 'Guilt']

function take(
  count: number,
  random: () => number,
  options: Partial<WordPickerOptions> = {},
) {
  const picker = createWordPicker({ good, bad, recentToAvoid: 4, random, ...options })
  return Array.from({ length: count }, () => picker.next())
}

function longestRun(types: WordType[]) {
  let longest = 0
  let run = 0
  types.forEach((type, i) => {
    run = type === types[i - 1] ? run + 1 : 1
    longest = Math.max(longest, run)
  })
  return longest
}

/** Words of one type, in order. */
function ofType(sequence: Word[], type: WordType) {
  return sequence.filter((word) => word.type === type).map((word) => word.text)
}

/** The fewest other words of its type between a word and its next appearance. */
function shortestGap(texts: string[]) {
  const gaps: number[] = []
  const lastSeen = new Map<string, number>()
  texts.forEach((text, position) => {
    const previous = lastSeen.get(text)
    if (previous !== undefined) gaps.push(position - previous - 1)
    lastSeen.set(text, position)
  })
  return Math.min(...gaps)
}

describe('choosing the type', () => {
  it('uses the random number: below 0.5 is good, otherwise bad', () => {
    expect(take(1, constantRandom(0.49))[0].type).toBe('good')
    expect(take(1, constantRandom(0.5))[0].type).toBe('bad')
  })

  it('switches to bad after 4 good in a row, whatever the random number says', () => {
    const types = take(10, constantRandom(0)).map((word) => word.type)

    expect(types).toEqual([
      'good', 'good', 'good', 'good', 'bad',
      'good', 'good', 'good', 'good', 'bad',
    ])
  })

  it('switches to good after 4 bad in a row', () => {
    const types = take(5, constantRandom(0.9)).map((word) => word.type)

    expect(types).toEqual(['bad', 'bad', 'bad', 'bad', 'good'])
  })

  it('never has more than 4 of the same type in a row', () => {
    expect(MAX_SAME_TYPE_IN_A_ROW).toBe(4)

    for (const seed of [1, 2, 3, 4, 5]) {
      const types = take(5_000, seededRandom(seed)).map((word) => word.type)
      expect(longestRun(types)).toBeLessThanOrEqual(4)
    }
  })

  it('still picks both types about equally often', () => {
    const types = take(10_000, seededRandom(7)).map((word) => word.type)
    const goodShare = types.filter((type) => type === 'good').length / types.length

    expect(goodShare).toBeGreaterThan(0.47)
    expect(goodShare).toBeLessThan(0.53)
  })
})

describe('choosing the word', () => {
  it('returns words from the list of their type', () => {
    for (const word of take(500, seededRandom(3))) {
      expect(word.type === 'good' ? good : bad).toContain(word.text)
    }
  })

  it('goes through every word of a type before one comes back, if it has one more', () => {
    // 5 good words, the last 4 avoided, always taking the first allowed one.
    const goodOnes = ofType(take(20, constantRandom(0)), 'good')

    expect(goodOnes.slice(0, 12)).toEqual([
      'Joy', 'Hope', 'Calm', 'Love', 'Awe',
      'Joy', 'Hope', 'Calm', 'Love', 'Awe',
      'Joy', 'Hope',
    ])
  })

  it.each([1, 4, 10])(
    'lets a word come back right after %i others of its type, never sooner',
    (recentToAvoid) => {
      const numbered = (prefix: string) =>
        Array.from({ length: recentToAvoid * 2 + 1 }, (_, i) => `${prefix}${i + 1}`)
      const sequence = take(20_000, seededRandom(5), {
        good: numbered('good'),
        bad: numbered('bad'),
        recentToAvoid,
      })

      expect(shortestGap(ofType(sequence, 'good'))).toBe(recentToAvoid)
    },
  )

  it('keeps each type’s recent words apart', () => {
    // The same word in both lists: avoiding it as good does not avoid it as bad.
    const sequence = take(2_000, seededRandom(9), {
      good: ['Same', 'G1', 'G2'],
      bad: ['Same', 'B1', 'B2'],
      recentToAvoid: 2,
    })

    expect(shortestGap(ofType(sequence, 'good'))).toBe(2)
    expect(shortestGap(ofType(sequence, 'bad'))).toBe(2)
    const texts = sequence.map((word) => word.text)
    expect(texts.some((text, i) => text === 'Same' && texts[i + 1] === 'Same')).toBe(true)
  })
})

describe('word lists', () => {
  it('needs more different words of each type than it avoids, naming them', () => {
    expect(() =>
      createWordPicker({ good: ['Joy', 'Hope', 'Calm', 'Love'], bad, recentToAvoid: 4 }),
    ).toThrow(new RangeError('Need at least 5 different good words, got 4'))
    expect(() =>
      createWordPicker({
        good,
        bad: ['Fear', 'Fear', 'Anger'],
        recentToAvoid: 2,
        name: 'values',
      }),
    ).toThrow(new RangeError('Need at least 3 different bad values, got 2'))
  })
})
