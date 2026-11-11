import { randomItem, type Random } from './random'

/**
 * Picks words that are either good or bad, for games where the player must
 * tell them apart (emotions, values…).
 *
 * First the type is chosen at random (50/50), then a word of that type. Two
 * rules override the randomness:
 *
 * - The same type never comes more than MAX_SAME_TYPE_IN_A_ROW (4) times in
 *   a row: after good, good, good, good the next one is bad.
 * - A word never comes back while it is among the last `recentToAvoid` of
 *   its type: with 4, after Joy the next 4 good words are all different from
 *   Joy. Each type keeps its own list of recent words.
 */

export type WordType = 'good' | 'bad'

export interface Word {
  readonly text: string
  readonly type: WordType
}

export const MAX_SAME_TYPE_IN_A_ROW = 4

export interface WordPickerOptions {
  good: readonly string[]
  bad: readonly string[]
  /** How many of the last words of each type may not come again yet. */
  recentToAvoid: number
  random?: Random
  /** What the words are, for error messages: "emotions", "values"… */
  name?: string
}

export interface WordPicker {
  next(): Word
}

export function createWordPicker({
  good,
  bad,
  recentToAvoid,
  random = Math.random,
  name = 'words',
}: WordPickerOptions): WordPicker {
  const words: Record<WordType, readonly string[]> = {
    good: [...new Set(good)],
    bad: [...new Set(bad)],
  }

  for (const type of ['good', 'bad'] as const) {
    if (words[type].length <= recentToAvoid) {
      throw new RangeError(
        `Need at least ${recentToAvoid + 1} different ${type} ${name}, got ${words[type].length}`,
      )
    }
  }

  // The last `recentToAvoid` words of each type, oldest first.
  const recent: Record<WordType, string[]> = { good: [], bad: [] }
  let lastType: WordType | undefined
  let sameTypeInARow = 0

  function pickType(): WordType {
    if (lastType && sameTypeInARow >= MAX_SAME_TYPE_IN_A_ROW) {
      return lastType === 'good' ? 'bad' : 'good'
    }

    return random() < 0.5 ? 'good' : 'bad'
  }

  return {
    next() {
      const type = pickType()
      const candidates = words[type].filter((text) => !recent[type].includes(text))
      const text = randomItem(random, candidates)

      recent[type].push(text)
      if (recent[type].length > recentToAvoid) {
        recent[type].shift()
      }

      sameTypeInARow = type === lastType ? sameTypeInARow + 1 : 1
      lastType = type

      return { text, type }
    },
  }
}
