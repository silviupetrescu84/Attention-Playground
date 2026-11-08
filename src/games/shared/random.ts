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
