import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import emotions from './data/emotions.json'
import {
  createEmotionGenerator,
  MAX_SAME_TYPE_IN_A_ROW,
  REPEAT_WINDOW,
  type Emotion,
  type EmotionType,
} from './emotion-generator'

const good = ['Joy', 'Hope', 'Calm', 'Love', 'Awe']
const bad = ['Fear', 'Anger', 'Shame', 'Envy', 'Guilt']

function take(count: number, random: () => number, lists = { good, bad }) {
  const generator = createEmotionGenerator({ ...lists, random })
  return Array.from({ length: count }, () => generator.next())
}

function longestRun(types: EmotionType[]) {
  let longest = 0
  let run = 0
  types.forEach((type, i) => {
    run = type === types[i - 1] ? run + 1 : 1
    longest = Math.max(longest, run)
  })
  return longest
}

/** Emotions of one type, in order. */
function ofType(sequence: Emotion[], type: EmotionType) {
  return sequence.filter((emotion) => emotion.type === type).map((e) => e.text)
}

describe('choosing the type', () => {
  it('uses the random number: below 0.5 is good, otherwise bad', () => {
    expect(take(1, constantRandom(0.49))[0].type).toBe('good')
    expect(take(1, constantRandom(0.5))[0].type).toBe('bad')
  })

  it('switches to bad after 4 good in a row, whatever the random number says', () => {
    const types = take(10, constantRandom(0)).map((e) => e.type)

    expect(types).toEqual([
      'good', 'good', 'good', 'good', 'bad',
      'good', 'good', 'good', 'good', 'bad',
    ])
  })

  it('switches to good after 4 bad in a row', () => {
    const types = take(5, constantRandom(0.9)).map((e) => e.type)

    expect(types).toEqual(['bad', 'bad', 'bad', 'bad', 'good'])
  })

  it('never has more than 4 of the same type in a row', () => {
    expect(MAX_SAME_TYPE_IN_A_ROW).toBe(4)

    for (const seed of [1, 2, 3, 4, 5]) {
      const types = take(5_000, seededRandom(seed)).map((e) => e.type)
      expect(longestRun(types)).toBeLessThanOrEqual(4)
    }
  })

  it('still picks both types about equally often', () => {
    const types = take(10_000, seededRandom(7)).map((e) => e.type)
    const goodShare = types.filter((type) => type === 'good').length / types.length

    expect(goodShare).toBeGreaterThan(0.47)
    expect(goodShare).toBeLessThan(0.53)
  })
})

describe('choosing the emotion', () => {
  it('returns emotions from the list of their type', () => {
    for (const emotion of take(500, seededRandom(3))) {
      expect(emotion.type === 'good' ? good : bad).toContain(emotion.text)
    }
  })

  it('lets an emotion come back only after 4 others of its type', () => {
    expect(REPEAT_WINDOW).toBe(5)
    // With exactly 5 good emotions, always taking the first allowed one, the
    // good emotions must cycle through all 5 before repeating.
    const goodOnes = ofType(take(20, constantRandom(0)), 'good')

    expect(goodOnes.slice(0, 12)).toEqual([
      'Joy', 'Hope', 'Calm', 'Love', 'Awe',
      'Joy', 'Hope', 'Calm', 'Love', 'Awe',
      'Joy', 'Hope',
    ])
  })

  it('lets an emotion come back right after 4 others of its type, never sooner', () => {
    // E.g. emotion1, emotion6, emotion8, emotion9, emotion10, then emotion1
    // may appear again.
    const numbered = Array.from({ length: 10 }, (_, i) => `emotion${i + 1}`)
    const texts = ofType(take(20_000, seededRandom(5), { good: numbered, bad }), 'good')
    const gaps: number[] = []
    const lastSeen = new Map<string, number>()

    texts.forEach((text, position) => {
      const previous = lastSeen.get(text)
      if (previous !== undefined) gaps.push(position - previous - 1)
      lastSeen.set(text, position)
    })

    expect(Math.min(...gaps)).toBe(4)
  })

  it('never repeats an emotion within 5 of its type', () => {
    for (const seed of [11, 12, 13]) {
      const sequence = take(5_000, seededRandom(seed))

      for (const type of ['good', 'bad'] as const) {
        const texts = ofType(sequence, type)
        for (let start = 0; start + REPEAT_WINDOW <= texts.length; start++) {
          const window = texts.slice(start, start + REPEAT_WINDOW)
          expect(new Set(window).size, `${type} at ${start}: ${window}`).toBe(REPEAT_WINDOW)
        }
      }
    }
  })

  it('uses every emotion of the real list', () => {
    const sequence = take(20_000, seededRandom(21), {
      good: emotions.positive,
      bad: emotions.negative,
    })

    expect(new Set(ofType(sequence, 'good'))).toEqual(new Set(emotions.positive))
    expect(new Set(ofType(sequence, 'bad'))).toEqual(new Set(emotions.negative))
    expect(longestRun(sequence.map((e) => e.type))).toBeLessThanOrEqual(4)
  })
})

describe('emotion lists', () => {
  it('needs at least 5 different emotions of each type', () => {
    expect(() =>
      createEmotionGenerator({ good: ['Joy', 'Hope', 'Calm', 'Love'], bad }),
    ).toThrow('Need at least 5 different good emotions, got 4')
    expect(() =>
      createEmotionGenerator({ good, bad: ['Fear', 'Fear', 'Fear', 'Anger', 'Shame', 'Envy'] }),
    ).toThrow('Need at least 5 different bad emotions, got 4')
  })

  it('has enough emotions in the real list', () => {
    expect(() =>
      createEmotionGenerator({ good: emotions.positive, bad: emotions.negative }),
    ).not.toThrow()
  })
})
