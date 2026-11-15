import { shuffled, type Random } from './random'

/**
 * Items dealt in random order, each once before any comes again, shared by
 * the minigames that show things from a list (thoughts, goals, actions…).
 */

export interface Deck<T> {
  /**
   * The next `count` items, all different, none of them in `avoid`. Throws
   * if there are not that many items besides those in `avoid`.
   */
  take(count: number, avoid?: readonly T[]): T[]
}

/**
 * Deals `items` like a deck of cards: every item once, in random order,
 * then all of them again in a new order, and so on. An item left out (it was
 * in `avoid`, or already taken for the same call) stays on top for next time.
 */
export function createDeck<T>(items: readonly T[], random: Random = Math.random): Deck<T> {
  const unique = [...new Set(items)]
  let left: T[] = []

  return {
    take(count, avoid = []) {
      const allowed = unique.filter((item) => !avoid.includes(item)).length

      if (count > allowed) {
        throw new RangeError(`Cannot take ${count} different items out of ${allowed}`)
      }

      const taken: T[] = []

      while (taken.length < count) {
        const index = left.findIndex((item) => !taken.includes(item) && !avoid.includes(item))

        if (index === -1) {
          // None left that may be taken: deal a new round of all the others,
          // under the ones still left over.
          left = [
            ...left,
            ...shuffled(
              random,
              unique.filter((item) => !left.includes(item)),
            ),
          ]
          continue
        }

        taken.push(left.splice(index, 1)[0])
      }

      return taken
    },
  }
}
