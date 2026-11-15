/** Numbers helpers shared by every minigame. */

/** `value`, or `min` if it is below, or `max` if it is above. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
