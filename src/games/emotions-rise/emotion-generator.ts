import { randomIndex, type Random } from '../shared/random'

/**
 * Picks the emotions for Emotions Rise.
 *
 * First the type (good or bad) is chosen at random, then an emotion of that
 * type. Two rules override the randomness:
 *
 * - The same type never comes more than MAX_SAME_TYPE_IN_A_ROW (4) times in
 *   a row: after good, good, good, good the next one is bad.
 * - An emotion never appears twice within REPEAT_WINDOW (5) emotions of its
 *   type: after Joy, the next 4 good emotions are all different from Joy.
 */

export type EmotionType = 'good' | 'bad'

export interface Emotion {
  readonly text: string
  readonly type: EmotionType
}

export const MAX_SAME_TYPE_IN_A_ROW = 4
export const REPEAT_WINDOW = 5

export interface EmotionGeneratorOptions {
  good: readonly string[]
  bad: readonly string[]
  random?: Random
}

export interface EmotionGenerator {
  next(): Emotion
}

export function createEmotionGenerator({
  good,
  bad,
  random = Math.random,
}: EmotionGeneratorOptions): EmotionGenerator {
  const emotions: Record<EmotionType, readonly string[]> = {
    good: [...new Set(good)],
    bad: [...new Set(bad)],
  }

  for (const type of ['good', 'bad'] as const) {
    if (emotions[type].length < REPEAT_WINDOW) {
      throw new RangeError(
        `Need at least ${REPEAT_WINDOW} different ${type} emotions, got ${emotions[type].length}`,
      )
    }
  }

  // The last REPEAT_WINDOW - 1 emotions of each type, oldest first.
  const recent: Record<EmotionType, string[]> = { good: [], bad: [] }
  let lastType: EmotionType | undefined
  let sameTypeInARow = 0

  function pickType(): EmotionType {
    if (lastType && sameTypeInARow >= MAX_SAME_TYPE_IN_A_ROW) {
      return lastType === 'good' ? 'bad' : 'good'
    }

    return random() < 0.5 ? 'good' : 'bad'
  }

  return {
    next() {
      const type = pickType()
      const candidates = emotions[type].filter(
        (text) => !recent[type].includes(text),
      )
      const text = candidates[randomIndex(random, candidates.length)]

      recent[type].push(text)
      if (recent[type].length > REPEAT_WINDOW - 1) {
        recent[type].shift()
      }

      sameTypeInARow = type === lastType ? sameTypeInARow + 1 : 1
      lastType = type

      return { text, type }
    },
  }
}
