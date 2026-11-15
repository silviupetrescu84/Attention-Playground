import { describe, expect, expectTypeOf, it } from 'vitest'
import { checkPositive } from './checks'
import {
  checkDifficultySteps,
  checkSteps,
  checkStepTable,
  createDifficulty,
  largestIn,
  steppedAfter,
  valueAt,
  type DifficultySettings,
  type DifficultyStep,
  type DifficultyValues,
  type Steps,
  type StepTable,
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
    { from: 10_000, percent: 15 },
    { from: 23_000, percent: 28 },
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
    expect(difficultyWith([{ from: 0, percent: 50 }]).valuesAt(0).speed).toBe(150)
  })

  it('can ease off again, for a breather', () => {
    const withBreather = difficultyWith([
      { from: 10_000, percent: 40 },
      { from: 20_000, percent: 20 },
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
    { from: 10_000, percent: 25 },
    { from: 20_000, percent: 50 },
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
      steps: [{ from: 0, percent: 100 }],
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
      steps: [{ from: 0, percent: 100 }],
      settings: {
        extra: { start: 0, harder: 'higher' },
        wait: { start: 0, harder: 'lower' },
      },
    })

    expect(zero.valuesAt(0)).toEqual({ extra: 0, wait: 0 })
  })

  it('works without any settings', () => {
    expect(
      createDifficulty({ steps: [{ from: 0, percent: 10 }], settings: {} }).valuesAt(0),
    ).toEqual({})
  })

  it('is not changed by changing the steps or settings afterwards', () => {
    const steps: { from: number; percent: number }[] = [{ from: 10_000, percent: 10 }]
    const changing = { speed: { start: 100, harder: 'higher' as const } }
    const copied = createDifficulty({ steps, settings: changing })

    steps[0].percent = 90
    steps.push({ from: 20_000, percent: 200 })
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

describe('checks', () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects a step at %s ms', (atMs) => {
    expect(() =>
      difficultyWith([
        { from: 0, percent: 5 },
        { from: atMs, percent: 10 },
      ]),
    ).toThrow(new RangeError(`Difficulty steps[1].from must be a finite number ≥ 0, got ${atMs}`))
  })

  it.each([-10, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an increase of %s %',
    (increasePercent) => {
      expect(() => difficultyWith([{ from: 10_000, percent: increasePercent }])).toThrow(
        new RangeError(
          `Difficulty steps[0].percent must be a finite number ≥ 0, got ${increasePercent}`,
        ),
      )
    },
  )

  it.each<[string, DifficultyStep[], string]>([
    [
      'out of order',
      [
        { from: 20_000, percent: 10 },
        { from: 10_000, percent: 20 },
      ],
      '10000 after 20000',
    ],
    [
      'at the same time',
      [
        { from: 10_000, percent: 10 },
        { from: 10_000, percent: 20 },
      ],
      '10000 after 10000',
    ],
    [
      'out of order further down',
      [
        { from: 5_000, percent: 5 },
        { from: 30_000, percent: 10 },
        { from: 20_000, percent: 20 },
      ],
      '20000 after 30000',
    ],
  ])('rejects steps %s', (_name, steps, got) => {
    expect(() => difficultyWith(steps)).toThrow(
      new RangeError(`Difficulty steps must be in order of "from", got ${got}`),
    )
  })

  it('checks steps as a game reads them, naming them', () => {
    expect(() => checkDifficultySteps([{ from: -1, percent: 5 }], 'game.harderByTimeMs')).toThrow(
      new RangeError('game.harderByTimeMs[0].from must be a finite number ≥ 0, got -1'),
    )
    expect(() =>
      checkDifficultySteps([{ from: 0, percent: 5 }], 'game.harderByTimeMs'),
    ).not.toThrow()
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

describe('settings that change in steps', () => {
  it('go up by a step every so many, up to a limit', () => {
    const steps = { start: 2, change: 1, every: 2, limit: 6 }

    expect([0, 1, 2, 3, 4, 7, 8, 9, 50].map((count) => steppedAfter(steps, count))).toEqual([
      2, 2, 3, 3, 4, 5, 6, 6, 6,
    ])
  })

  it('go down by a step every so many, down to a limit', () => {
    const steps = { start: 10_000, change: -500, every: 10, limit: 5_000 }

    expect([0, 9, 10, 19, 20, 90, 100, 200].map((count) => steppedAfter(steps, count))).toEqual([
      10_000, 10_000, 9_500, 9_500, 9_000, 5_500, 5_000, 5_000,
    ])
  })
})

describe('checking settings that change in steps', () => {
  const delay: Steps = { start: 3_000, change: -100, every: 10, limit: 2_000 }
  const check = (steps: Steps) => () => {
    checkSteps(steps, 'game.delayMs', checkPositive)
  }

  it('accepts steps up or down towards their limit, or none', () => {
    expect(check(delay)).not.toThrow()
    expect(check({ start: 40, change: 10, every: 10, limit: 140 })).not.toThrow()
    expect(check({ start: 40, change: 0, every: 1, limit: 40 })).not.toThrow()
  })

  it('checks the start and the limit with the check given, naming them', () => {
    expect(check({ ...delay, start: 0 })).toThrow(
      new RangeError('game.delayMs.start must be a finite number > 0, got 0'),
    )
    expect(check({ ...delay, limit: -5 })).toThrow(
      new RangeError('game.delayMs.limit must be a finite number > 0, got -5'),
    )
  })

  it.each([0, 1.5, Number.NaN])('rejects changing every %s', (every) => {
    expect(check({ ...delay, every })).toThrow(
      new RangeError(`game.delayMs.every must be a whole number ≥ 1, got ${every}`),
    )
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects a change of %s', (change) => {
    expect(check({ ...delay, change })).toThrow(
      new RangeError(`game.delayMs.change must be a finite number, got ${change}`),
    )
  })

  it('rejects a limit the other way from where it goes', () => {
    expect(check({ ...delay, limit: 4_000 })).toThrow(
      new RangeError(
        'game.delayMs goes down (change -100), so its limit must be ≤ its start (3000), got 4000',
      ),
    )
    expect(check({ start: 40, change: 10, every: 10, limit: 30 })).toThrow(
      new RangeError(
        'game.delayMs goes up (change 10), so its limit must be ≥ its start (40), got 30',
      ),
    )
    expect(check({ start: 40, change: 0, every: 10, limit: 30 })).toThrow(
      new RangeError(
        'game.delayMs goes up (change 0), so its limit must be ≥ its start (40), got 30',
      ),
    )
  })
})

describe('settings that change to values from a list', () => {
  const speed: StepTable = {
    start: 60,
    steps: [
      { from: 3, value: 80 },
      { from: 6, value: 50 },
    ],
  }

  it('take each value from its step on, the start before any', () => {
    expect([0, 2, 3, 5, 6, 1_000].map((at) => valueAt(speed, at))).toEqual([60, 60, 80, 80, 50, 50])
    expect(valueAt({ start: 7, steps: [] }, 100)).toBe(7)
  })

  it('know their largest value, the start included', () => {
    expect(largestIn(speed)).toBe(80)
    expect(largestIn({ start: 90, steps: speed.steps })).toBe(90)
    expect(largestIn({ start: 2, steps: [] })).toBe(2)
  })

  it('are checked: every value with the check given, each step from 0 on, in order', () => {
    const check = (table: StepTable) => () => {
      checkStepTable(table, 'game.speed', checkPositive)
    }

    expect(check(speed)).not.toThrow()
    expect(check({ ...speed, start: 0 })).toThrow(
      new RangeError('game.speed.start must be a finite number > 0, got 0'),
    )
    expect(check({ start: 60, steps: [{ from: 3, value: -1 }] })).toThrow(
      new RangeError('game.speed.steps[0].value must be a finite number > 0, got -1'),
    )
    expect(check({ start: 60, steps: [{ from: -3, value: 1 }] })).toThrow(
      new RangeError('game.speed.steps[0].from must be a finite number ≥ 0, got -3'),
    )
    expect(check({ start: 60, steps: [...speed.steps].reverse() })).toThrow(
      new RangeError('game.speed.steps must be in order of "from", got 3 after 6'),
    )
  })
})
