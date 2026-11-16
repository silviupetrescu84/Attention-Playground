import { checkAtLeast, checkNotNegative, checkPositive } from './checks'

/**
 * Things that move, shared by the minigames: speeds in game px per second,
 * times in ms, like everything in config/difficulty.json.
 */

/** How far something moving at `speed` goes in `ms`. */
export function distanceIn(speed: number, ms: number): number {
  return (speed * ms) / 1_000
}

/** How long something moving at `speed` takes to go `distance`. */
export function timeToGo(distance: number, speed: number): number {
  return (distance / speed) * 1_000
}

/**
 * How something speeds up as it goes one way: it sets off at `start`, then
 * goes `accelerationPerS` faster every second, a little every frame.
 */
export interface SpeedUp {
  readonly start: number
  readonly accelerationPerS: number
}

/** …up to `max`, and no faster. */
export interface CappedSpeedUp extends SpeedUp {
  readonly max: number
}

/** The speed of something going at `speed` that speeds up as `speedUp` for `ms` more. */
export function spedUp(speedUp: SpeedUp | CappedSpeedUp, speed: number, ms: number): number {
  const faster = speed + speedUp.accelerationPerS * (ms / 1_000)
  return 'max' in speedUp ? Math.min(speedUp.max, faster) : faster
}

/** Throws unless `speedUp` (named `name`) sets off at a speed above 0 and never slows down. */
export function checkSpeedUp({ start, accelerationPerS }: SpeedUp, name: string): void {
  checkPositive(start, `${name}.start`)
  checkNotNegative(accelerationPerS, `${name}.accelerationPerS`)
}

/** Throws unless `speedUp` is as `checkSpeedUp` needs, with a `max` not below its start. */
export function checkCappedSpeedUp(speedUp: CappedSpeedUp, name: string): void {
  checkSpeedUp(speedUp, name)
  checkAtLeast(speedUp.max, `${name}.max`, speedUp.start, 'its start')
}
