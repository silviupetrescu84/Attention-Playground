import { describe, expect, it } from 'vitest'
import { repeatUntil } from '../../test/repeat'
import { GAME_HEIGHT } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import {
  BALL_RADIUS,
  BALL_REACH,
  BALL_RING_RADIUS,
  BALL_SIZE,
  BALL_X,
  createBall,
  FALL_SPEED,
  HIGHEST_Y,
  LOWEST_Y,
  RISE_SPEED,
  TURN_ACCELERATION,
  type Ball,
} from './ball'

/** Moves `ball` on for `ms`, in frames of `frameMs` (about 60 a second). */
function play(ball: Ball, ms: number, frameMs = 16) {
  for (let played = 0; played < ms; played += frameMs) {
    ball.move(Math.min(frameMs, ms - played))
  }
}

/** A ball held up until it is at the top. */
function ballAtTheTop() {
  const ball = createBall()
  ball.hold(true)
  play(ball, 10_000)
  return ball
}

/** A ball held up from the bottom for `ms`, then let go: rising at `velocity` as it was. */
function letGoAfter(ms: number) {
  const ball = createBall()
  ball.hold(true)
  play(ball, ms, 1)
  const { y, velocity } = ball
  ball.hold(false)
  return { ball, y, velocity }
}

describe('the ball', () => {
  it('is 60 px across, in the middle of the canvas', () => {
    expect([BALL_SIZE, BALL_RADIUS, BALL_X]).toEqual([60, 30, 200])
  })

  it('has its white ring just outside it: 6 px from its edge, 38 px from its centre to the ring’s outside', () => {
    expect([BALL_RING_RADIUS, BALL_REACH]).toEqual([36, 38])
  })

  it('goes from just below the score bar to the bottom of the canvas, its ring always fully shown', () => {
    expect(HIGHEST_Y - BALL_REACH).toBe(GAME_BAR_HEIGHT)
    expect(LOWEST_Y + BALL_REACH).toBe(GAME_HEIGHT)
    expect([HIGHEST_Y, LOWEST_Y]).toEqual([102, 762])
  })

  it('rises at 60 px/s at first, 40 faster every second; falls the same, once it has turned around at 800 px/s²', () => {
    expect(RISE_SPEED).toEqual({ start: 60, accelerationPerS: 40 })
    expect(FALL_SPEED).toMatchObject({ start: 60, accelerationPerS: 40 })
    expect(TURN_ACCELERATION).toBe(800)
  })

  it('starts still at the bottom, not held', () => {
    const ball = createBall()

    expect([ball.y, ball.velocity, ball.held]).toEqual([LOWEST_Y, 0, false])
  })

  it('stays at the bottom while not held: it cannot go below it', () => {
    const ball = createBall()

    play(ball, 2_000)

    expect([ball.y, ball.velocity]).toEqual([LOWEST_Y, 0])
  })
})

describe('rising', () => {
  it('sets off up at 60 px/s when held', () => {
    const ball = createBall()
    ball.hold(true)

    ball.move(100)

    expect(ball.held).toBe(true)
    expect(ball.velocity).toBe(60)
    expect(ball.y).toBeCloseTo(LOWEST_Y - 6, 9)
  })

  it('rises 40 px/s faster every second, a little every frame', () => {
    const ball = createBall()
    ball.hold(true)
    // The first frame sets off at 60 px/s; it speeds up from the next one on.
    ball.move(16)

    const speeds = [500, 500, 1_000].map((ms) => {
      play(ball, ms)
      return ball.velocity
    })

    expect(speeds[0]).toBeCloseTo(80, 9)
    expect(speeds[1]).toBeCloseTo(100, 9)
    expect(speeds[2]).toBeCloseTo(140, 9)
    // About 2 s: 60 × 2 + 40 × 2² / 2 = 200 px up.
    expect(LOWEST_Y - ball.y).toBeCloseTo(200, -1)
  })

  it('keeps speeding up as it rises (no top speed), and stops at once under the score bar', () => {
    const ball = createBall()
    ball.hold(true)
    let fastest = 0

    repeatUntil(
      () => ball.y <= HIGHEST_Y,
      () => {
        ball.move(16)
        fastest = Math.max(fastest, ball.velocity)
      },
    )

    // 660 px at 60 px/s, 40 faster every second: about 4.4 s, by then at about 240 px/s.
    expect(fastest).toBeGreaterThan(230)
    expect([ball.y, ball.velocity]).toEqual([HIGHEST_Y, 0])
  })

  it('stays at the top while held', () => {
    const ball = ballAtTheTop()

    play(ball, 1_000)

    expect([ball.y, ball.velocity]).toEqual([HIGHEST_Y, 0])
  })

  it('goes on speeding up when held again while already held', () => {
    const ball = createBall()
    ball.hold(true)
    play(ball, 1_000)

    ball.hold(true)
    ball.move(16)

    expect(ball.velocity).toBeGreaterThan(100)
  })
})

describe('falling', () => {
  it('goes on up for a moment once let go, slowing down by 800 px/s every second', () => {
    const { ball, y, velocity } = letGoAfter(2_000)
    expect(velocity).toBeCloseTo(140, 0)

    ball.move(100)

    expect(ball.held).toBe(false)
    expect(ball.velocity).toBeCloseTo(velocity - 80, 9)
    expect(ball.y).toBeLessThan(y)
  })

  it('turns around like a thrown ball: as much higher as its speed takes, then back down', () => {
    const { ball, y, velocity } = letGoAfter(2_000)
    let highest = y

    repeatUntil(
      () => ball.velocity < 0,
      () => {
        ball.move(1)
        highest = Math.min(highest, ball.y)
      },
    )

    // v² / 2a: 140² / 1600 = 12.25 px.
    expect(y - highest).toBeCloseTo(velocity ** 2 / (2 * TURN_ACCELERATION), 0)
  })

  it('comes back down past where it was let go as fast as it was rising then, and speeds up from there', () => {
    const { ball, y, velocity } = letGoAfter(2_000)

    // Up, turning, and back down to where it was let go.
    repeatUntil(
      () => ball.velocity < 0 && ball.y >= y,
      () => ball.move(1),
    )
    const back = ball.velocity
    play(ball, 1_000, 1)

    expect(Math.abs(back + velocity)).toBeLessThan(1)
    expect(ball.velocity).toBeCloseTo(-velocity - 40, 0)
  })

  it('falls as fast as it rises: from the top to the bottom in about the time it takes to go up', () => {
    const up = createBall()
    up.hold(true)
    let upMs = 0
    repeatUntil(
      () => up.y === HIGHEST_Y,
      () => {
        up.move(16)
        upMs += 16
      },
    )

    up.hold(false)
    let downMs = 0
    repeatUntil(
      () => up.y === LOWEST_Y,
      () => {
        up.move(16)
        downMs += 16
      },
    )

    expect(Math.abs(downMs - upMs)).toBeLessThan(200)
  })

  it('sets off down from the top at 60 px/s within a moment', () => {
    const ball = ballAtTheTop()
    ball.hold(false)

    // 60 px/s at 800 px/s²: 75 ms.
    play(ball, 80, 1)

    expect(ball.velocity).toBeCloseTo(-60, 0)
    expect(ball.y).toBeGreaterThan(HIGHEST_Y)
  })

  it('stops at the top if it gets there going on up after being let go, then falls', () => {
    const ball = createBall()
    ball.hold(true)
    // Just below the top, rising at about 240 px/s.
    repeatUntil(
      () => ball.y < HIGHEST_Y + 10,
      () => ball.move(1),
    )
    ball.hold(false)

    repeatUntil(
      () => ball.y === HIGHEST_Y,
      () => ball.move(1),
      50,
    )
    expect(ball.velocity).toBe(0)

    play(ball, 500, 1)
    expect(ball.y).toBeGreaterThan(HIGHEST_Y)
  })

  it('stops at once at the bottom', () => {
    const ball = ballAtTheTop()
    ball.hold(false)

    play(ball, 20_000)

    expect([ball.y, ball.velocity]).toEqual([LOWEST_Y, 0])
  })

  it('is not changed by letting go again', () => {
    const once = letGoAfter(2_000).ball
    const twice = letGoAfter(2_000).ball

    twice.hold(false)
    play(once, 2_000)
    play(twice, 2_000)

    expect(twice.velocity).toBe(once.velocity)
  })
})

describe('held again', () => {
  it('sets off up at 60 px/s when held while falling', () => {
    const ball = ballAtTheTop()
    ball.hold(false)
    play(ball, 3_000)
    const where = ball.y

    ball.hold(true)
    ball.move(16)

    expect(ball.velocity).toBe(60)
    expect(ball.y).toBeLessThan(where)
  })

  it('goes on up at the speed it still has, if faster, when held while turning around', () => {
    const { ball } = letGoAfter(2_000)
    ball.move(16)
    const still = ball.velocity

    ball.hold(true)
    ball.move(16)

    expect(still).toBeGreaterThan(100)
    expect(ball.velocity).toBeGreaterThan(still)
  })

  it('sets off up at 60 px/s when held as it has nearly turned around', () => {
    const { ball } = letGoAfter(2_000)
    repeatUntil(
      () => ball.velocity < 30,
      () => ball.move(1),
    )

    ball.hold(true)
    ball.move(16)

    expect(ball.velocity).toBe(60)
  })
})
