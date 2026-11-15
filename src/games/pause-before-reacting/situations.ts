import type { WordLists } from '../shared/word-picker'

/** The situations of Pause Before Reacting: good ones to react to, bad ones to let pass. */

/** The shape of `data/pause-before-reacting.json`. */
export interface SituationsData {
  readonly goodSituations: readonly { readonly text: string }[]
  readonly badSituations: readonly { readonly text: string }[]
}

/** Helpful opportunities worth responding to (good), and impulses to let pass (bad). */
export function situationsFrom({ goodSituations, badSituations }: SituationsData): WordLists {
  return {
    good: goodSituations.map(({ text }) => text),
    bad: badSituations.map(({ text }) => text),
  }
}
