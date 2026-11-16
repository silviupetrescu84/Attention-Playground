import { describe, expect, it } from 'vitest'
import {
  checkCappedSpeedUp,
  checkSpeedUp,
  distanceIn,
  spedUp,
  timeToGo,
  type CappedSpeedUp,
  type SpeedUp,
} from './motion'

describe('distanceIn', () => {
  it('is how far a speed in px per second goes in a time in ms', () => {
    expect([
      distanceIn(60, 1_000),
      distanceIn(60, 500),
      distanceIn(40, 16),
      distanceIn(0, 900),
    ]).toEqual([60, 30, 0.64, 0])
  })
})

describe('timeToGo', () => {
  it('is how long, in ms, a speed in px per second takes to go a distance', () => {
    expect([timeToGo(60, 60), timeToGo(30, 60), timeToGo(100, 40)]).toEqual([1_000, 500, 2_500])
  })

  it('undoes distanceIn', () => {
    expect(distanceIn(75, timeToGo(420, 75))).toBeCloseTo(420, 9)
  })
})

describe('spedUp', () => {
  const rising: SpeedUp = { start: 60, accelerationPerS: 40 }

  it('gets faster by its acceleration every second, a share of it for part of one', () => {
    expect([spedUp(rising, 60, 1_000), spedUp(rising, 60, 250), spedUp(rising, 100, 0)]).toEqual([
      100, 70, 100,
    ])
  })

  it('has no top speed without a max', () => {
    expect(spedUp(rising, 1_000, 10_000)).toBe(1_400)
  })

  it('goes no faster than its max, if it has one', () => {
    const capped: CappedSpeedUp = { start: 60, accelerationPerS: 10, max: 80 }

    expect([spedUp(capped, 60, 1_000), spedUp(capped, 75, 1_000), spedUp(capped, 80, 16)]).toEqual([
      70, 80, 80,
    ])
  })
})

describe('checkSpeedUp', () => {
  it('accepts a speed that sets off above 0 and never slows down', () => {
    expect(() => checkSpeedUp({ start: 30, accelerationPerS: 0 }, 'fall')).not.toThrow()
  })

  it.each<[SpeedUp, string]>([
    [{ start: 0, accelerationPerS: 10 }, 'fall.start must be a finite number > 0, got 0'],
    [
      { start: 30, accelerationPerS: -1 },
      'fall.accelerationPerS must be a finite number ≥ 0, got -1',
    ],
  ])('throws for %j, naming the setting', (speedUp, message) => {
    expect(() => checkSpeedUp(speedUp, 'fall')).toThrow(new RangeError(message))
  })
})

describe('checkCappedSpeedUp', () => {
  it('accepts a max as fast as the start, or faster', () => {
    expect(() =>
      checkCappedSpeedUp({ start: 60, accelerationPerS: 10, max: 60 }, 'pad'),
    ).not.toThrow()
  })

  it.each<[CappedSpeedUp, string]>([
    [{ start: 60, accelerationPerS: 10, max: 50 }, 'pad.max must be ≥ its start (60), got 50'],
    [{ start: -1, accelerationPerS: 10, max: 80 }, 'pad.start must be a finite number > 0, got -1'],
    [
      { start: 60, accelerationPerS: Number.NaN, max: 80 },
      'pad.accelerationPerS must be a finite number ≥ 0, got NaN',
    ],
  ])('throws for %j, naming the setting', (speedUp, message) => {
    expect(() => checkCappedSpeedUp(speedUp, 'pad')).toThrow(new RangeError(message))
  })
})
