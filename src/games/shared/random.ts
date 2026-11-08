/**
 * Random helpers for games. Every game takes its random source as an option
 * (Math.random by default) so tests can use a predictable one.
 */

/** Returns a number in [0, 1), like Math.random. */
export type Random = () => number

/** A random number between `min` and `max`. */
export function randomBetween(random: Random, min: number, max: number): number {
  return min + random() * (max - min)
}

/** A random index into a list of `length` items. */
export function randomIndex(random: Random, length: number): number {
  return Math.min(length - 1, Math.floor(random() * length))
}

/** A random item of `items`, which must not be empty. */
export function randomItem<T>(random: Random, items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError('Cannot pick an item from an empty list')
  }

  return items[randomIndex(random, items.length)]
}

/** A copy of `items` in random order; every order is equally likely. */
export function shuffled<T>(random: Random, items: readonly T[]): T[] {
  const copy = [...items]

  // Fisher–Yates: swap each place with a random one at or before it.
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIndex(random, i + 1)
    const item = copy[i]
    copy[i] = copy[j]
    copy[j] = item
  }

  return copy
}
