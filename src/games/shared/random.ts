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

/**
 * A random number between `min` and `max` at least `gap` from `avoid`, every
 * one allowed as likely. Throws if none is.
 */
export function randomBetweenAvoiding(
  random: Random,
  min: number,
  max: number,
  avoid: number,
  gap: number,
): number {
  // Allowed: from `min` up to `gap` below `avoid`, and from `gap` above it up to `max`.
  const belowTo = Math.min(max, avoid - gap)
  const aboveFrom = Math.max(min, avoid + gap)
  const below = Math.max(0, belowTo - min)
  const above = Math.max(0, max - aboveFrom)

  if (below + above === 0) {
    // At most one allowed: the end of either part, if it is one.
    if (belowTo === min) {
      return min
    }
    if (aboveFrom === max) {
      return max
    }
    throw new RangeError(`Nothing from ${min} to ${max} is ${gap} from ${avoid}`)
  }

  const along = random() * (below + above)
  return along < below ? min + along : aboveFrom + (along - below)
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
