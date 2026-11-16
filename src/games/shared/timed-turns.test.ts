import { describe, expect, it, vi } from 'vitest'
import { FADE_MS, fadeAt, passDeadlines, timeLeftAt, type TimedTurn } from './timed-turns'

describe('fadeAt', () => {
  const fade = { fromMs: 1_000, endedAtMs: undefined, inMs: 100, outMs: 300 }

  it('fades in over its time, from when it starts', () => {
    expect([900, 1_000, 1_050, 1_100, 9_000].map((t) => fadeAt(fade, t))).toEqual([0, 0, 0.5, 1, 1])
  })

  it('fades out over its own time once it ends', () => {
    const ended = { ...fade, endedAtMs: 5_000 }

    expect([5_000, 5_150, 5_300, 6_000].map((t) => fadeAt(ended, t))).toEqual([1, 0.5, 0, 0])
  })

  it('fades in and out over 0.1 s, as everything in the games, unless told otherwise', () => {
    const plain = { fromMs: 1_000, endedAtMs: 2_000 }

    expect(FADE_MS).toBe(100)
    expect([1_000, 1_050, 1_100, 2_000, 2_050, 2_100].map((t) => fadeAt(plain, t))).toEqual([
      0, 0.5, 1, 1, 0.5, 0,
    ])
  })

  it('fades out from as far as it got when it ends while fading in', () => {
    // Ended halfway in: it stays so until the fade out reaches that.
    const ended = { ...fade, endedAtMs: 1_050, outMs: 100 }
    const expected = [0.5, 0.5, 0.5, 0.25, 0]

    ;[1_050, 1_075, 1_100, 1_125, 1_150].forEach((t, i) =>
      expect(fadeAt(ended, t), `at ${t} ms`).toBeCloseTo(expected[i], 9),
    )
  })
})

describe('timeLeftAt', () => {
  const turn: TimedTurn = { timeLimitMs: 2_000, deadlineMs: 6_000, endedAtMs: undefined }

  it('is all of it until the time starts, then runs out until the deadline', () => {
    expect([1_000, 4_000, 5_000, 6_000, 7_000].map((t) => timeLeftAt(turn, t))).toEqual([
      1, 1, 0.5, 0, 0,
    ])
  })

  it('stops running out when the turn ends', () => {
    expect(timeLeftAt({ ...turn, endedAtMs: 5_000 }, 5_900)).toBe(0.5)
  })
})

describe('passDeadlines', () => {
  /** Turns of 1 s each, one after another from 0, ending when they expire. */
  function turns(stopAfter = Infinity) {
    let turn: TimedTurn = { timeLimitMs: 1_000, deadlineMs: 1_000, endedAtMs: undefined }
    const expired: number[] = []
    const expire = vi.fn((ended: TimedTurn) => {
      expired.push(ended.deadlineMs)
      turn = {
        timeLimitMs: 1_000,
        deadlineMs: ended.deadlineMs + 1_000,
        endedAtMs: undefined,
      }
    })
    return {
      expired,
      expire,
      deadlines: {
        current: () => turn,
        expire,
        stopped: () => expired.length >= stopAfter,
      },
    }
  }

  it('does nothing before the deadline', () => {
    const { deadlines, expire } = turns()

    expect(passDeadlines(999, deadlines)).toBe(999)
    expect(expire).not.toHaveBeenCalled()
  })

  it('ends each turn at its exact deadline, even several in one long frame', () => {
    const { deadlines, expired } = turns()

    expect(passDeadlines(3_500, deadlines)).toBe(3_500)
    expect(expired).toEqual([1_000, 2_000, 3_000])
  })

  it('stops at the deadline that stopped the round', () => {
    const { deadlines, expired } = turns(2)

    expect(passDeadlines(9_000, deadlines)).toBe(2_000)
    expect(expired).toEqual([1_000, 2_000])
  })

  it('does nothing without a turn', () => {
    expect(
      passDeadlines(5_000, { current: () => undefined, expire: vi.fn(), stopped: () => false }),
    ).toBe(5_000)
  })
})
