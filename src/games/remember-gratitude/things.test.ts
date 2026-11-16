import { describe, expect, it } from 'vitest'
import data from './data/remember-gratitude.json'
import { thingsFrom } from './things'

describe('the things', () => {
  it('are 100 to be grateful for (good) and 100 not (bad), all different', () => {
    const { good, bad } = thingsFrom(data)

    expect(good).toHaveLength(100)
    expect(bad).toHaveLength(100)
    expect(new Set([...good, ...bad]).size).toBe(200)
    expect([good[0], bad[0]]).toEqual(['A warm hug', 'Being insulted'])
  })

  it('are at most as long as the data says', () => {
    const { good, bad } = thingsFrom(data)

    for (const text of [...good, ...bad]) {
      expect(text.length, text).toBeLessThanOrEqual(data.maxCharacters)
    }
  })

  it('are read from the data as they are', () => {
    expect(
      thingsFrom({
        gratefulFor: [{ text: 'Clean water' }],
        distractors: [{ text: 'Being ignored' }, { text: 'Losing' }],
      }),
    ).toEqual({ good: ['Clean water'], bad: ['Being ignored', 'Losing'] })
  })
})
