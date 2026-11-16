import { DIFFICULTY } from '../../config/difficulty'
import { GAME_HEIGHT, GAME_WIDTH } from '../shared/game-canvas'
import type { Box } from '../shared/geometry'
import { checkCappedSpeedUp, distanceIn, spedUp, type CappedSpeedUp } from '../shared/motion'
import { clamp } from '../shared/numbers'

/**
 * The pad the player catches words with, at the bottom of the canvas.
 *
 * It moves towards where the player's finger is (left and right only), but
 * no faster than it can: it sets off at PAD_START_SPEED and speeds up by
 * PAD_ACCELERATION every second, a little every frame, up to PAD_MAX_SPEED.
 * It stops when its centre gets to the finger (or as near as it can go
 * without leaving the canvas), when the finger lifts, and before it turns
 * back: each time it sets off again at PAD_START_SPEED.
 */

/** A quarter of the canvas wide. */
export const PAD_WIDTH = GAME_WIDTH / 4
/** Tall enough to write on. */
export const PAD_HEIGHT = 28
/** Space below the pad, to the bottom of the canvas. */
export const PAD_BOTTOM_GAP = 24
export const PAD_TOP = GAME_HEIGHT - PAD_BOTTOM_GAP - PAD_HEIGHT

/** How the pad speeds up, in game px per second (see config/difficulty.json). */
export const PAD_SPEED: CappedSpeedUp = DIFFICULTY.improveInnerVoice.padSpeed
checkCappedSpeedUp(PAD_SPEED, 'improveInnerVoice.padSpeed')

export const PAD_START_SPEED = PAD_SPEED.start
export const PAD_MAX_SPEED = PAD_SPEED.max
/** How much faster it gets every second. */
export const PAD_ACCELERATION = PAD_SPEED.accelerationPerS

/** Where the pad's centre can be, for all of it to stay on the canvas. */
const LEFTMOST = PAD_WIDTH / 2
const RIGHTMOST = GAME_WIDTH - PAD_WIDTH / 2

export interface Pad {
  /** Where its centre is, across. */
  readonly x: number
  /** Where it is, all of it. */
  readonly box: Box
  /** How fast it is moving, in px per second: 0 when still. */
  readonly speed: number
  /** Moves towards the finger at `x` from now on; stops at once when there is none. */
  aim(x: number | undefined): void
  /** Moves on by `deltaMs`. */
  move(deltaMs: number): void
}

/** A pad, still, in the middle at the bottom. */
export function createPad(): Pad {
  let x = GAME_WIDTH / 2
  let target: number | undefined
  let speed = 0
  /** Which way it is moving: -1 left, 1 right, 0 still. */
  let direction = 0

  function stop() {
    speed = 0
    direction = 0
  }

  return {
    get x() {
      return x
    },
    get box() {
      return {
        left: x - PAD_WIDTH / 2,
        right: x + PAD_WIDTH / 2,
        top: PAD_TOP,
        bottom: PAD_TOP + PAD_HEIGHT,
      }
    },
    get speed() {
      return speed
    },
    aim(fingerX) {
      target = fingerX === undefined ? undefined : clamp(fingerX, LEFTMOST, RIGHTMOST)

      if (target === undefined) {
        stop()
      }
    },
    move(deltaMs) {
      if (target === undefined || target === x) {
        stop()
        return
      }

      const towards = Math.sign(target - x)
      // Setting off (or turning back): from the start speed; going on: faster.
      speed = towards === direction ? spedUp(PAD_SPEED, speed, deltaMs) : PAD_START_SPEED
      direction = towards

      const step = distanceIn(speed, deltaMs)
      if (step >= Math.abs(target - x)) {
        x = target
        stop()
      } else {
        x += towards * step
      }
    },
  }
}
