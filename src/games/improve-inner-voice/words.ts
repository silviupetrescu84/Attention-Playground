import type { WordLists } from '../shared/word-picker'

/** The shape of `data/improve-inner-voice.json`. */
export interface InnerVoiceData {
  readonly helpfulWords: readonly string[]
  readonly unhelpfulWords: readonly string[]
}

/** The words of Improve Inner Voice: helpful ones to catch (good), unhelpful ones not to (bad). */
export function wordsFrom({ helpfulWords, unhelpfulWords }: InnerVoiceData): WordLists {
  return { good: helpfulWords, bad: unhelpfulWords }
}
