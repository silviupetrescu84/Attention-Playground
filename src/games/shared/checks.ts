/**
 * Checks for numbers that games are configured with or given at run time.
 * Each one throws a RangeError that names the value, so a wrong setting fails
 * straight away instead of quietly breaking the game.
 */

/** Throws unless `value` is a finite number of 0 or more. */
export function checkNotNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number ≥ 0, got ${value}`)
  }
}

/** Throws unless `value` is a finite number above 0. */
export function checkPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number > 0, got ${value}`)
  }
}

/** Throws unless `value` is a whole number from `min` to `max` (by default, any). */
export function checkWholeNumber(
  value: number,
  name: string,
  min = -Infinity,
  max = Infinity,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a whole number${rangeText(min, max)}, got ${value}`)
  }
}

/** " from 2 to 6", " ≥ 1", " ≤ 6", or "" for any number. */
function rangeText(min: number, max: number) {
  if (min === -Infinity) {
    return max === Infinity ? '' : ` ≤ ${max}`
  }
  return max === Infinity ? ` ≥ ${min}` : ` from ${min} to ${max}`
}

/** Throws unless `value` is at least `min`, named `minName`. */
export function checkAtLeast(value: number, name: string, min: number, minName: string): void {
  if (!(value >= min)) {
    throw new RangeError(`${name} must be ≥ ${minName} (${min}), got ${value}`)
  }
}

/** Throws unless `value` is at most `max`, named `maxName`. */
export function checkAtMost(value: number, name: string, max: number, maxName: string): void {
  if (!(value <= max)) {
    throw new RangeError(`${name} must be ≤ ${maxName} (${max}), got ${value}`)
  }
}
