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
