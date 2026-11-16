import { DIFFICULTY } from '../../config/difficulty'
import { checkPositive } from '../shared/checks'
import { GAME_HEIGHT, GAME_WIDTH } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { checkSpeedUp, distanceIn, spedUp, type SpeedUp } from '../shared/motion'
import { clamp } from '../shared/numbers'
import { TIME_RING_WIDTH } from '../shared/time-ring'

/**
 * The ball the player keeps in the zone, in the middle of the canvas across.
 *
 * It starts still at the bottom. While the player holds a finger down
 * (anywhere on the game) it rises: it sets off at RISE_SPEED's start (or goes
 * on at the speed it is already rising at, if faster) and speeds up every
 * second, a little every frame. Once they let go it turns around the way a
 * ball thrown up does: it goes on up for a moment, slowing down, then comes
 * back down as fast as it was rising when let go (at least FALL_SPEED's
 * start), and from then on falls faster and faster. It stops at the top, just
 * below the score bar, and at the bottom of the canvas, each time with its
 * white ring (see draw.ts) fully on the canvas.
 */

/** How big the ball is across, as seen (whatever its artwork). */
export const BALL_SIZE = 60
export const BALL_RADIUS = BALL_SIZE / 2
/** Where its centre is, across. */
export const BALL_X = GAME_WIDTH / 2

/** The middle of the white ring around it: just outside the ball… */
export const BALL_RING_RADIUS = BALL_RADIUS + 6
/** …so the ball and its ring reach this far from its centre. */
export const BALL_REACH = BALL_RING_RADIUS + TIME_RING_WIDTH / 2

/** The highest its centre goes: its ring just below the score bar… */
export const HIGHEST_Y = GAME_BAR_HEIGHT + BALL_REACH
/** …and the lowest, where it starts: its ring just above the bottom of the canvas. */
export const LOWEST_Y = GAME_HEIGHT - BALL_REACH

const { riseSpeed, fallSpeed } = DIFFICULTY.stayInTheZone

/** How fast it rises while held, in game px per second (see config/difficulty.json)… */
export const RISE_SPEED: SpeedUp = riseSpeed
checkSpeedUp(RISE_SPEED, 'stayInTheZone.riseSpeed')

/** …and falls once let go, once it has turned around… */
export const FALL_SPEED: SpeedUp = fallSpeed
checkSpeedUp(FALL_SPEED, 'stayInTheZone.fallSpeed')

/** …which it does changing speed by this much every second. */
export const TURN_ACCELERATION = fallSpeed.turnAccelerationPerS
checkPositive(TURN_ACCELERATION, 'stayInTheZone.fallSpeed.turnAccelerationPerS')

export interface Ball {
  /** Where its centre is, up and down. */
  readonly y: number
  /** How fast it is going up, in px per second: less than 0 going down, 0 when still. */
  readonly velocity: number
  /** Whether the player is holding it up. */
  readonly held: boolean
  /** Rises from now on while `held`, falls once not. */
  hold(held: boolean): void
  /** Moves on by `deltaMs`. */
  move(deltaMs: number): void
}

/** A ball, still, at the bottom. */
export function createBall(): Ball {
  let y = LOWEST_Y
  let velocity = 0
  let held = false
  /** How fast it falls once it has turned around: set as it is let go. */
  let fallFrom = FALL_SPEED.start

  /** The velocity after `deltaMs` more of falling. */
  function falling(deltaMs: number) {
    // Still turning around: slowing down going up, or speeding up going down…
    if (velocity > -fallFrom) {
      return Math.max(-fallFrom, velocity - TURN_ACCELERATION * (deltaMs / 1_000))
    }
    // …then falling faster and faster, the way it rises.
    return -spedUp(FALL_SPEED, -velocity, deltaMs)
  }

  return {
    get y() {
      return y
    },
    get velocity() {
      return velocity
    },
    get held() {
      return held
    },
    hold(holding) {
      if (held && !holding) {
        fallFrom = Math.max(velocity, FALL_SPEED.start)
      }
      held = holding
    },
    move(deltaMs) {
      if (held) {
        // Setting off (or turning back up): from the start speed; going on up: faster.
        velocity =
          velocity >= RISE_SPEED.start ? spedUp(RISE_SPEED, velocity, deltaMs) : RISE_SPEED.start
      } else {
        velocity = falling(deltaMs)
      }

      // Up is towards the top of the canvas, where y is 0.
      y = clamp(y - distanceIn(velocity, deltaMs), HIGHEST_Y, LOWEST_Y)

      // At the top or the bottom: it stops there.
      if (y === HIGHEST_Y || y === LOWEST_Y) {
        velocity = 0
      }
    },
  }
}
