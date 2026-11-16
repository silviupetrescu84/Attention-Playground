import { describe, expect, it } from 'vitest'
import { createGameLifecycle } from './game-lifecycle'
import {
  AS_SET,
  byPace,
  checkPaces,
  createPaceChoice,
  PACE_NAMES,
  PACES,
  pacingFor,
  type PacePercents,
} from './pace'

/** A game's paces as every game has them now: 15% slower and faster. */
const percents: PacePercents = { slow: 15, normal: 0, fast: -15 }

describe('paces', () => {
  it('are Slow, Normal and Fast, in the order the button goes through them', () => {
    expect(PACES).toEqual(['slow', 'normal', 'fast'])
    expect(PACE_NAMES).toEqual({ slow: 'Slow', normal: 'Normal', fast: 'Fast' })
  })

  it('can be given a value each', () => {
    expect(byPace((pace) => pace.length)).toEqual({ slow: 4, normal: 6, fast: 4 })
  })
})

describe('checking a game’s paces', () => {
  it('accepts anything between 100% slower and 100% faster', () => {
    expect(() => checkPaces({ slow: 99, normal: 0, fast: -99 }, 'game.paces')).not.toThrow()
  })

  it.each<[PacePercents, string]>([
    [
      { slow: 100, normal: 0, fast: -15 },
      'game.paces.slow must be a number between -100 and 100, got 100',
    ],
    [
      { slow: 15, normal: Number.NaN, fast: -15 },
      'game.paces.normal must be a number between -100 and 100, got NaN',
    ],
    [
      { slow: 15, normal: 0, fast: -150 },
      'game.paces.fast must be a number between -100 and 100, got -150',
    ],
  ])('rejects %j, naming the pace', (paces, message) => {
    expect(() => checkPaces(paces, 'game.paces')).toThrow(new RangeError(message))
  })
})

describe('pacing', () => {
  it('leaves every setting as it is, before a round and at a pace 0% slower', () => {
    const normal = pacingFor('normal', percents)

    for (const pacing of [AS_SET, normal]) {
      expect([pacing.speed(60), pacing.time(5_000), pacing.timeNeeded(1_000)]).toEqual([
        60, 5_000, 1_000,
      ])
    }
  })

  it('makes speeds 15% lower, times 15% longer and times needed 15% shorter at Slow', () => {
    const slow = pacingFor('slow', percents)

    expect(slow.speed(60)).toBeCloseTo(51, 9)
    expect(slow.time(5_000)).toBeCloseTo(5_750, 9)
    expect(slow.timeNeeded(1_000)).toBeCloseTo(850, 9)
  })

  it('does the opposite at Fast', () => {
    const fast = pacingFor('fast', percents)

    expect(fast.speed(60)).toBeCloseTo(69, 9)
    expect(fast.time(5_000)).toBeCloseTo(4_250, 9)
    expect(fast.timeNeeded(1_000)).toBeCloseTo(1_150, 9)
  })

  it('follows each game’s own percents', () => {
    const gentle: PacePercents = { slow: 30, normal: 0, fast: -5 }

    expect(pacingFor('slow', gentle).time(1_000)).toBeCloseTo(1_300, 9)
    expect(pacingFor('fast', gentle).speed(100)).toBeCloseTo(105, 9)
  })
})

describe('the pace chosen', () => {
  function setup() {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    return { lifecycle, choice: createPaceChoice({ lifecycle }) }
  }

  it('is Slow at first', () => {
    expect(setup().choice.pace).toBe('slow')
  })

  it('goes Slow, Normal, Fast, and back to Slow', () => {
    const { choice } = setup()
    const chosen = [choice.pace]

    for (let i = 0; i < 3; i++) {
      choice.next()
      chosen.push(choice.pace)
    }

    expect(chosen).toEqual(['slow', 'normal', 'fast', 'slow'])
  })

  it('can only change before a round', () => {
    const { choice, lifecycle } = setup()
    lifecycle.start()

    expect(() => choice.next()).toThrow('Cannot change the pace of a game that is playing')
    expect(choice.pace).toBe('slow')
  })
})
