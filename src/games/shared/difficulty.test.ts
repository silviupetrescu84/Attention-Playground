import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  createDifficulty,
  type DifficultySettings,
  type DifficultyStep,
  type DifficultyValues,
} from './difficulty'

/** A speed that is harder when higher and a delay that is harder when lower. */
const settings = {
  speed: { start: 100, harder: 'higher' },
  delayMs: { start: 1_000, harder: 'lower' },
} as const satisfies DifficultySettings

function difficultyWith(steps: readonly DifficultyStep[]) {
  return createDifficulty({ steps, settings })
}

describe('steps', () => {
  const difficulty = difficultyWith([
    [10_000, 15],
    [23_000, 28],
  ])
  const speedAt = (elapsedMs: number) => difficulty.valuesAt(elapsedMs).speed

  it('keeps the starting values until the first step', () => {
    expect(difficulty.valuesAt(0)).toEqual({ speed: 100, delayMs: 1_000 })
    expect(difficulty.valuesAt(9_999)).toEqual({ speed: 100, delayMs: 1_000 })
  })

  it('takes each step exactly when it is reached, not before', () => {
    expect(speedAt(10_000)).toBeCloseTo(115, 10)
    expect(speedAt(22_999.9)).toBeCloseTo(115, 10)
    expect(speedAt(23_000)).toBeCloseTo(128, 10)
  })

  it('counts each percentage from the starting values, not from the step before', () => {
    // 100 + 28%, not 100 × 1.15 × 1.28.
    expect(speedAt(23_000)).toBeCloseTo(128, 10)
  })

  it('stays at the last step after it, however long the game', () => {
    expect(speedAt(60_000)).toBeCloseTo(128, 10)
    expect(speedAt(3_600_000)).toBeCloseTo(128, 10)
  })

  it('keeps the starting values before the round starts', () => {
    expect(speedAt(-1)).toBe(100)
  })

  it('can make the game harder from the very start', () => {
    expect(difficultyWith([[0, 50]]).valuesAt(0).speed).toBe(150)
  })

  it('can ease off again, for a breather', () => {
    const withBreather = difficultyWith([
      [10_000, 40],
      [20_000, 20],
    ])

    expect(withBreather.valuesAt(15_000).speed).toBeCloseTo(140, 10)
    expect(withBreather.valuesAt(25_000).speed).toBeCloseTo(120, 10)
  })

  it('keeps the starting values all round without any steps', () => {
    const flat = difficultyWith([])

    for (const elapsedMs of [0, 10_000, 59_999, 600_000]) {
      expect(flat.valuesAt(elapsedMs)).toEqual({ speed: 100, delayMs: 1_000 })
    }
  })
})

describe('settings', () => {
  const difficulty = difficultyWith([
    [10_000, 25],
    [20_000, 50],
  ])

  it('multiplies the ones that are harder when higher', () => {
    expect(difficulty.valuesAt(10_000).speed).toBe(125)
    expect(difficulty.valuesAt(20_000).speed).toBe(150)
  })

  it('divides the ones that are harder when lower: things happen that many times as often', () => {
    expect(difficulty.valuesAt(10_000).delayMs).toBe(800)
    expect(difficulty.valuesAt(20_000).delayMs).toBeCloseTo(666.667, 3)
  })

  it('changes every setting by the same factor', () => {
    for (const elapsedMs of [0, 10_000, 30_000]) {
      const { speed, delayMs } = difficulty.valuesAt(elapsedMs)

      expect(1_000 / delayMs).toBeCloseTo(speed / 100, 10)
    }
  })

  it('gives a value for every setting the game declared, and nothing else', () => {
    const many = createDifficulty({
      steps: [[0, 100]],
      settings: {
        a: { start: 1, harder: 'higher' },
        b: { start: 2, harder: 'higher' },
        c: { start: 4, harder: 'lower' },
      },
    })

    expect(many.valuesAt(0)).toEqual({ a: 2, b: 4, c: 2 })
  })

  it('keeps a setting that starts at 0 at 0', () => {
    const zero = createDifficulty({
      steps: [[0, 100]],
      settings: {
        extra: { start: 0, harder: 'higher' },
        wait: { start: 0, harder: 'lower' },
      },
    })

    expect(zero.valuesAt(0)).toEqual({ extra: 0, wait: 0 })
  })

  it('works without any settings', () => {
    expect(createDifficulty({ steps: [[0, 10]], settings: {} }).valuesAt(0)).toEqual({})
  })

  it('is not changed by changing the steps or settings afterwards', () => {
    const steps: [number, number][] = [[10_000, 10]]
    const changing = { speed: { start: 100, harder: 'higher' as const } }
    const copied = createDifficulty({ steps, settings: changing })

    steps[0][1] = 90
    steps.push([20_000, 200])
    changing.speed = { start: 5, harder: 'higher' }

    expect(copied.valuesAt(30_000).speed).toBeCloseTo(110, 10)
  })

  it('only knows the settings the game declared (checked by the type checker)', () => {
    const values = difficulty.valuesAt(0)

    expectTypeOf(values).toEqualTypeOf<DifficultyValues<'speed' | 'delayMs'>>()
    // @ts-expect-error A setting the game did not declare.
    expect(values.sped).toBeUndefined()
  })
})

describe('adding up over time', () => {
  const difficulty = difficultyWith([
    [10_000, 25],
    [20_000, 50],
  ])

  it('is the value times the time when nothing changes in between', () => {
    // 100 per second for 3 s.
    expect(difficulty.totalBetween('speed', 1_000, 4_000)).toBe(300)
    // 125 per second for 2 s.
    expect(difficulty.totalBetween('speed', 12_000, 14_000)).toBe(250)
  })

  it('follows every step in between', () => {
    // 5 s at 100, 10 s at 125, 5 s at 150.
    expect(difficulty.totalBetween('speed', 5_000, 25_000)).toBe(500 + 1_250 + 750)
  })

  it('counts a step reached exactly at the start or end correctly', () => {
    expect(difficulty.totalBetween('speed', 10_000, 12_000)).toBe(250)
    expect(difficulty.totalBetween('speed', 8_000, 10_000)).toBe(200)
  })

  it('is 0 over no time', () => {
    expect(difficulty.totalBetween('speed', 15_000, 15_000)).toBe(0)
  })

  it('adds up what each moment is worth, in pieces or all at once', () => {
    const inPieces = [0, 3_000, 9_999, 10_000, 17_500, 26_000, 60_000]
    let sum = 0
    for (let i = 1; i < inPieces.length; i++) {
      sum += difficulty.totalBetween('speed', inPieces[i - 1], inPieces[i])
    }

    expect(sum).toBeCloseTo(difficulty.totalBetween('speed', 0, 60_000), 9)
  })

  it('adds up settings that are harder when lower too', () => {
    // 1 000 for 10 s, then 800 for 2 s.
    expect(difficulty.totalBetween('delayMs', 0, 12_000)).toBe(10_000 + 1_600)
  })

  it('does not go back in time', () => {
    expect(() => difficulty.totalBetween('speed', 5_000, 4_000)).toThrow(
      new RangeError('Cannot add up from 5000 ms back to 4000 ms'),
    )
  })
})

describe('checks', () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects a step at %s ms', (atMs) => {
    expect(() => difficultyWith([[atMs, 10]])).toThrow(
      new RangeError(`Difficulty step time (ms) must be a finite number ≥ 0, got ${atMs}`),
    )
  })

  it.each([-10, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an increase of %s %',
    (increasePercent) => {
      expect(() => difficultyWith([[10_000, increasePercent]])).toThrow(
        new RangeError(
          `Difficulty increase (%) must be a finite number ≥ 0, got ${increasePercent}`,
        ),
      )
    },
  )

  it.each<[string, DifficultyStep[], string]>([
    ['out of order', [[20_000, 10], [10_000, 20]], '10000 ms after 20000 ms'],
    ['at the same time', [[10_000, 10], [10_000, 20]], '10000 ms after 10000 ms'],
    [
      'out of order further down',
      [[5_000, 5], [30_000, 10], [20_000, 20]],
      '20000 ms after 30000 ms',
    ],
  ])('rejects steps %s', (_name, steps, got) => {
    expect(() => difficultyWith(steps)).toThrow(
      new RangeError(`Difficulty steps must be in order of time, got ${got}`),
    )
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a setting that starts at %s, naming it',
    (start) => {
      expect(() =>
        createDifficulty({ steps: [], settings: { speed: { start, harder: 'higher' } } }),
      ).toThrow(
        new RangeError(`Starting value of "speed" must be a finite number ≥ 0, got ${start}`),
      )
    },
  )
})
