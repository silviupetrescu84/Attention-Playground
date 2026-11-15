import { createDeck } from '../shared/deck'
import type { Random } from '../shared/random'

/**
 * The thoughts of Shift Perspective, each with good and bad ways to see it,
 * and the order they are shown in.
 */

/** As written in data/shift-perspective.json. */
export interface ThoughtsData {
  readonly thoughts: readonly {
    readonly thought: string
    readonly choices: {
      readonly good: readonly { readonly text: string }[]
      readonly bad: readonly { readonly text: string }[]
    }
  }[]
}

export interface Thought {
  readonly text: string
  /** Helpful ways to see the thought. */
  readonly good: readonly string[]
  /** Unhelpful ways to see it. */
  readonly bad: readonly string[]
}

export function thoughtsFrom({ thoughts }: ThoughtsData): Thought[] {
  return thoughts.map(({ thought, choices }) => ({
    text: thought,
    good: choices.good.map(({ text }) => text),
    bad: choices.bad.map(({ text }) => text),
  }))
}

export interface ThoughtPicker {
  next(): Thought
}

/**
 * Picks every thought once, in random order, then all of them again in a
 * new order, and so on (see the shared deck). The same thought never comes
 * twice in a row, not even from one round of all of them to the next.
 */
export function createThoughtPicker(
  thoughts: readonly Thought[],
  random: Random = Math.random,
): ThoughtPicker {
  if (thoughts.length < 2) {
    throw new RangeError(`Need at least 2 thoughts, got ${thoughts.length}`)
  }

  const deck = createDeck(thoughts, random)
  let last: Thought | undefined

  return {
    next() {
      const [next] = deck.take(1, last ? [last] : [])
      last = next
      return next
    },
  }
}
