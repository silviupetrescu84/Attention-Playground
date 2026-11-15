import { describe, expect, it } from 'vitest'
import {
  createPad,
  PAD_ACCELERATION,
  PAD_BOTTOM_GAP,
  PAD_HEIGHT,
  PAD_MAX_SPEED,
  PAD_START_SPEED,
  PAD_TOP,
  PAD_WIDTH,
  type Pad,
} from './pad'

/** Moves `pad` on for `ms`, in frames of `frameMs` (about 60 a second). */
function play(pad: Pad, ms: number, frameMs = 16) {
  for (let played = 0; played < ms; played += frameMs) {
    pad.move(Math.min(frameMs, ms - played))
  }
}

describe('the pad', () => {
  it('is a quarter of the canvas wide, 28 px high, 24 px above the bottom', () => {
    expect([PAD_WIDTH, PAD_HEIGHT, PAD_BOTTOM_GAP, PAD_TOP]).toEqual([100, 28, 24, 748])
  })

  it('moves at 60 px/s at first, 10 faster every second, up to 80', () => {
    expect([PAD_START_SPEED, PAD_ACCELERATION, PAD_MAX_SPEED]).toEqual([60, 10, 80])
  })

  it('starts still, in the middle', () => {
    const pad = createPad()

    expect(pad.x).toBe(200)
    expect(pad.speed).toBe(0)
    expect(pad.box).toEqual({ left: 150, right: 250, top: 748, bottom: 776 })
  })

  it('stays still without a finger', () => {
    const pad = createPad()

    play(pad, 1_000)

    expect(pad.x).toBe(200)
  })

  it('sets off towards the finger at 60 px/s', () => {
    const pad = createPad()
    pad.aim(350)

    pad.move(100)

    expect(pad.x).toBeCloseTo(206, 9)
    expect(pad.speed).toBe(60)
    expect(pad.box.left).toBeCloseTo(156, 9)
  })

  it('speeds up a little every frame, by 10 px/s every second', () => {
    const pad = createPad()
    pad.aim(400)

    const speeds = [0, 500, 500].map((ms) => {
      play(pad, ms)
      return pad.speed
    })

    expect(speeds[0]).toBe(0)
    expect(speeds[1]).toBeCloseTo(65, 0)
    expect(speeds[2]).toBeCloseTo(70, 0)
  })

  it('goes no faster than 80 px/s, however long it goes', () => {
    const pad = createPad()
    pad.aim(0)
    play(pad, 3_000)
    // All the way across: 300 px, the longest run there is.
    pad.aim(400)

    play(pad, 2_500)
    const before = pad.x
    play(pad, 100)

    expect(pad.speed).toBe(80)
    // 0.1 s at 80 px/s.
    expect(pad.x - before).toBeCloseTo(8, 0)
  })

  it('covers the canvas, side to side, in about 4 s', () => {
    const pad = createPad()
    pad.aim(0)
    play(pad, 3_000)
    pad.aim(400)

    let ms = 0
    while (pad.x < 350) {
      pad.move(16)
      ms += 16
    }

    expect(ms / 1_000).toBeCloseTo(4, 0)
  })

  it('stops where the finger is, exactly, and sets off at 60 px/s again after', () => {
    const pad = createPad()
    pad.aim(230)

    play(pad, 1_000)
    expect(pad.x).toBe(230)
    expect(pad.speed).toBe(0)

    pad.aim(300)
    pad.move(16)
    expect(pad.speed).toBe(60)
  })

  it('does not move when the finger is on its centre', () => {
    const pad = createPad()
    pad.aim(200)

    pad.move(16)

    expect([pad.x, pad.speed]).toEqual([200, 0])
  })

  it('stops at once when the finger lifts', () => {
    const pad = createPad()
    pad.aim(400)
    play(pad, 1_000)
    const where = pad.x

    pad.aim(undefined)
    play(pad, 1_000)

    expect(pad.x).toBe(where)
    expect(pad.speed).toBe(0)
  })

  it('sets off at 60 px/s again when it turns back', () => {
    const pad = createPad()
    pad.aim(400)
    play(pad, 1_500)
    expect(pad.speed).toBeGreaterThan(70)
    const where = pad.x

    pad.aim(0)
    pad.move(16)

    expect(pad.speed).toBe(60)
    expect(pad.x).toBeLessThan(where)
  })

  it('stays on the canvas, however far out the finger goes', () => {
    const pad = createPad()

    pad.aim(-100)
    play(pad, 5_000)
    expect(pad.box.left).toBe(0)
    expect(pad.speed).toBe(0)

    pad.aim(900)
    play(pad, 6_000)
    expect(pad.box.right).toBe(400)
  })
})
