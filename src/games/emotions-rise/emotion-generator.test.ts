import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../test/random'
import emotions from './data/emotions.json'
import { createEmotionGenerator, REPEAT_WINDOW, type Emotion } from './emotion-generator'

function take(count: number, seed: number) {
  const generator = createEmotionGenerator({
    good: emotions.positive,
    bad: emotions.negative,
    random: seededRandom(seed),
  })
  return Array.from({ length: count }, () => generator.next())
}

/** Emotions of one type, in order. */
const ofType = (sequence: Emotion[], type: Emotion['type']) =>
  sequence.filter((emotion) => emotion.type === type).map((emotion) => emotion.text)

describe('emotions', () => {
  it('never repeats an emotion within 5 of its type', () => {
    expect(REPEAT_WINDOW).toBe(5)

    for (const seed of [11, 12, 13]) {
      const sequence = take(5_000, seed)

      for (const type of ['good', 'bad'] as const) {
        const texts = ofType(sequence, type)
        for (let start = 0; start + REPEAT_WINDOW <= texts.length; start++) {
          const window = texts.slice(start, start + REPEAT_WINDOW)
          expect(new Set(window).size, `${type} at ${start}: ${window}`).toBe(REPEAT_WINDOW)
        }
      }
    }
  })

  it('uses every emotion of the real list, never more than 4 of a type in a row', () => {
    const sequence = take(20_000, 21)

    expect(new Set(ofType(sequence, 'good'))).toEqual(new Set(emotions.positive))
    expect(new Set(ofType(sequence, 'bad'))).toEqual(new Set(emotions.negative))
    const types = sequence.map((emotion) => emotion.type).join('')
    expect(types).not.toMatch(/(good){5}|(bad){5}/)
  })

  it('needs at least 5 different emotions of each type', () => {
    expect(() =>
      createEmotionGenerator({ good: ['Joy', 'Hope', 'Calm', 'Love'], bad: emotions.negative }),
    ).toThrow(new RangeError('Need at least 5 different good emotions, got 4'))
  })
})
