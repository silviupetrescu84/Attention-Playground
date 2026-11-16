import type { WordLists } from '../shared/word-picker'

/** The things of Remember Gratitude: good ones to be grateful for, and bad ones (distractors). */

/** The shape of `data/remember-gratitude.json`. */
export interface GratitudeData {
  readonly gratefulFor: readonly { readonly text: string }[]
  readonly distractors: readonly { readonly text: string }[]
}

/** Things to be grateful for (good), and things not to (bad). */
export function thingsFrom({ gratefulFor, distractors }: GratitudeData): WordLists {
  return {
    good: gratefulFor.map(({ text }) => text),
    bad: distractors.map(({ text }) => text),
  }
}
