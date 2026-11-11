import type { Random } from '../shared/random'
import { createWordPicker, type Word, type WordPicker } from '../shared/word-picker'

/**
 * Picks the emotions for Emotions Rise (see the shared word picker): good
 * or bad 50/50, never more than 4 of a type in a row, and an emotion never
 * comes back within REPEAT_WINDOW (5) emotions of its type: after Joy, the
 * next 4 good emotions are all different from Joy.
 */

export type Emotion = Word
export type EmotionGenerator = WordPicker

export const REPEAT_WINDOW = 5

export interface EmotionGeneratorOptions {
  good: readonly string[]
  bad: readonly string[]
  random?: Random
}

export function createEmotionGenerator({
  good,
  bad,
  random,
}: EmotionGeneratorOptions): EmotionGenerator {
  return createWordPicker({
    good,
    bad,
    random,
    recentToAvoid: REPEAT_WINDOW - 1,
    name: 'emotions',
  })
}
