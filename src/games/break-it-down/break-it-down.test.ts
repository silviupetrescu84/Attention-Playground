import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../test/random'
import { LARGE_OVAL } from '../shared/artwork'
import { steppedAfter } from '../shared/difficulty'
import { createGameLifecycle } from '../shared/game-lifecycle'
import { gapBetweenOvals } from '../shared/placing'
import { createScore } from '../shared/score'
import {
  createBreakItDown,
  FADE_MS,
  goalOpacityAt,
  goalSizeAt,
  isOnOption,
  MOST_OPTIONS,
  OPTIONS,
  optionsOpacityAt,
  POINTS,
  READING_MS,
  RESIZE_MS,
  TIME_LIMIT,
  type BreakItDownOptions,
  type GoalOutcome,
  type Mistake,
  type ShownGoal,
  type Turn,
} from './break-it-down'
import data from './data/break-it-down.json'
import { distractionsFrom, goalsFrom, type Goal } from './goals'
import {
  CENTRE,
  gapToGoal,
  GOAL_GAP,
  goalSizeFor,
  OPTION_GAP,
  OPTION_HIT_HEIGHT,
  OPTION_HIT_WIDTH,
  ringOuterRadiusFor,
} from './layout'

const goals = goalsFrom(data)
const distractions = distractionsFrom(data)

function setup(
  seed = 1,
  options: Partial<Pick<BreakItDownOptions, 'onMistake' | 'onGoalOver' | 'goals'>> = {},
) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createBreakItDown({
    goals,
    distractions,
    score,
    random: seededRandom(seed),
    ...options,
  })
  return { score, game }
}

type Game = ReturnType<typeof setup>['game']

/** Sets up a game that records its mistakes and goals over, and starts it. */
function started(seed = 1) {
  const mistakes: { mistake: Mistake; turn: Turn }[] = []
  const goalsOver: { outcome: GoalOutcome; goal: ShownGoal }[] = []
  const played = setup(seed, {
    onMistake: (mistake, turn) => mistakes.push({ mistake, turn }),
    onGoalOver: (outcome, goal) => goalsOver.push({ outcome, goal }),
  })
  played.game.start()
  return { ...played, mistakes, goalsOver }
}

const goodOf = (turn: Turn) => turn.options.find((option) => option.good)!
const badOf = (turn: Turn) => turn.options.find((option) => !option.good)!

/** Waits until the current actions have faded in, then taps the good one or a distraction. */
function choose(game: Game, kind: 'good' | 'bad') {
  const turn = game.turn!
  game.update(turn.readyAtMs)
  game.tap(kind === 'good' ? goodOf(turn) : badOf(turn))
  return turn
}

/** A made-up goal for the pure helpers: shown at 1 s, 10 s to choose. */
function goalAt(changes: Partial<ShownGoal> = {}): ShownGoal {
  return {
    goal: goals[0],
    shownAtMs: 1_000,
    options: 2,
    timeLimitMs: 10_000,
    level: 0,
    fromSize: goalSizeFor(0),
    resizedAtMs: 1_000,
    endedAtMs: undefined,
    outcome: undefined,
    ...changes,
  }
}

/** A made-up set of actions for the pure helpers: shown at 4 s, 2 s to choose. */
function turnAt(endedAtMs?: number): Turn {
  return {
    goal: goalAt({ timeLimitMs: 2_000 }),
    options: [],
    shownAtMs: 4_000,
    readyAtMs: 4_100,
    timeLimitMs: 2_000,
    deadlineMs: 6_100,
    endedAtMs,
    chosen: undefined,
  }
}

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect(OPTIONS).toEqual({ start: 2, change: 1, every: 2, limit: 6 })
    expect(TIME_LIMIT).toEqual({ start: 10_000, change: -500, every: 2, limit: 5_000 })
    expect(MOST_OPTIONS).toBe(6)
    expect([READING_MS, FADE_MS, RESIZE_MS]).toEqual([3_000, 100, 300])
    expect(POINTS).toEqual({ good: 1 })
  })

  it('gets harder every 2 goals: one more action, up to 6, and 0.5 s less, down to 5 s', () => {
    // Goals 1 to 24: how many came before each.
    const goalsBefore = Array.from({ length: 24 }, (_, i) => i)

    expect(goalsBefore.map((before) => steppedAfter(OPTIONS, before))).toEqual([
      2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    ])
    expect(goalsBefore.map((before) => steppedAfter(TIME_LIMIT, before) / 1_000)).toEqual([
      10, 10, 9.5, 9.5, 9, 9, 8.5, 8.5, 8, 8, 7.5, 7.5, 7, 7, 6.5, 6.5, 6, 6, 5.5, 5.5, 5, 5, 5, 5,
    ])
  })

  it('refuses data it cannot play with', () => {
    const goal: Goal = { title: 'Goal', actions: ['A', 'B'] }

    expect(() => setup(1, { goals: [goal] })).toThrow('Need at least 2 goals, got 1')
    expect(() => setup(1, { goals: [goal, { title: 'Thin', actions: ['A', 'A'] }] })).toThrow(
      '"Thin" needs at least 2 different actions',
    )
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    expect(() =>
      createBreakItDown({
        goals,
        distractions: ['a', 'b', 'c', 'd', 'd'],
        score: createScore({ lifecycle }),
      }),
    ).toThrow('Need at least 5 different distractions')
  })
})

describe('fading and resizing', () => {
  it('fades a goal in over 0.1 s', () => {
    const goal = goalAt()

    expect([900, 1_000, 1_050, 1_100, 5_000].map((t) => goalOpacityAt(goal, t))).toEqual([
      0, 0, 0.5, 1, 1,
    ])
  })

  it('fades a goal that is over out over 0.3 s', () => {
    const goal = goalAt({ endedAtMs: 8_000 })

    expect([8_000, 8_150, 8_300, 9_000].map((t) => goalOpacityAt(goal, t))).toEqual([1, 0.5, 0, 0])
  })

  it('changes the goal’s size over 0.3 s, quickly at first, from the size it had', () => {
    const goal = goalAt({ level: -1, fromSize: 150, resizedAtMs: 2_000 })
    const sizes = [1_900, 2_000, 2_100, 2_200, 2_300, 3_000].map((t) => goalSizeAt(goal, t))

    expect(sizes[0]).toBe(150)
    expect(sizes[1]).toBe(150)
    // A third of the time: more than a third of the way.
    expect(150 - sizes[2]).toBeGreaterThan((150 - 127.5) / 3)
    expect(sizes[3]).toBeLessThan(sizes[2])
    expect(sizes[4]).toBe(127.5)
    expect(sizes[5]).toBe(127.5)
  })

  it('fades actions in over 0.1 s, and out over 0.1 s from when they ended', () => {
    const shown = turnAt()
    const ended = turnAt(5_000)

    expect([3_900, 4_000, 4_050, 4_100, 4_900].map((t) => optionsOpacityAt(shown, t))).toEqual([
      0, 0, 0.5, 1, 1,
    ])
    expect([5_000, 5_050, 5_100].map((t) => optionsOpacityAt(ended, t))).toEqual([1, 0.5, 0])
  })

  it('fades out actions that were still fading in from as far as they got', () => {
    // Chosen when they were halfway in: they stay so until the fade out reaches that.
    const ended = turnAt(4_050)
    const expected = [0.5, 0.5, 0.5, 0.25, 0]

    ;[4_050, 4_075, 4_100, 4_125, 4_150].forEach((t, i) =>
      expect(optionsOpacityAt(ended, t), `at ${t} ms`).toBeCloseTo(expected[i], 9),
    )
  })
})

describe('tapping an action', () => {
  it('counts anywhere on the oval as seen, up to its edge', () => {
    const option = { x: 100, y: 200 }
    const rx = OPTION_HIT_WIDTH / 2
    const ry = OPTION_HIT_HEIGHT / 2

    // Just inside the edge, all round.
    for (const point of [
      option,
      { x: 100 + rx * 0.999, y: 200 },
      { x: 100 - rx * 0.999, y: 200 },
      { x: 100, y: 200 + ry * 0.999 },
      { x: 100 + rx * 0.7, y: 200 - ry * 0.7 },
    ]) {
      expect(isOnOption(point, option)).toBe(true)
    }
    for (const point of [
      { x: 100 + rx + 1, y: 200 },
      { x: 100, y: 200 - ry - 1 },
      // The corner of the image, outside the oval.
      { x: 100 + rx * 0.8, y: 200 + ry * 0.8 },
    ]) {
      expect(isOnOption(point, option)).toBe(false)
    }
  })
})

describe('before the round', () => {
  it('shows nothing and counts nothing', () => {
    const { game } = setup()

    expect([game.goal, game.previousGoal, game.turn, game.previousTurn]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    expect(game.stats).toEqual({
      goalsReached: 0,
      goalsFailed: 0,
      good: 0,
      distractions: 0,
      tooSlow: 0,
    })
  })

  it('does nothing if time passes or the canvas is tapped', () => {
    const { game, score } = setup()

    game.update(60_000)
    game.tap(CENTRE)

    expect(game.turn).toBeUndefined()
    expect(game.timeMs).toBe(0)
    expect(score.value).toBe(0)
  })
})

describe('showing a goal', () => {
  it('fades the first goal in at once, alone for 3 s, then 2 actions with 10 s to choose', () => {
    const { game } = started()
    const goal = game.goal!
    const turn = game.turn!

    expect(goals).toContain(goal.goal)
    expect(goal).toMatchObject({ shownAtMs: 0, options: 2, timeLimitMs: 10_000, level: 0 })
    expect(turn).toMatchObject({ goal, shownAtMs: 3_000, readyAtMs: 3_100, deadlineMs: 13_100 })
    expect(turn.options).toHaveLength(2)
  })

  it('offers one of the goal’s actions and the rest distractions, all different', () => {
    const { game } = started(4)

    for (let i = 0; i < 40; i++) {
      const turn = game.turn!
      const [good, ...bad] = [...turn.options].sort((a, b) => Number(b.good) - Number(a.good))

      expect(good.good).toBe(true)
      expect(turn.goal.goal.actions).toContain(good.text)
      expect(bad.every((option) => !option.good && distractions.includes(option.text))).toBe(true)
      expect(new Set(turn.options.map((option) => option.text)).size).toBe(turn.options.length)
      choose(game, 'good')
    }
  })

  it('puts the good action anywhere among the others', () => {
    const { game } = started(2)
    const places = new Set<number>()

    for (let i = 0; i < 20; i++) {
      places.add(game.turn!.options.findIndex((option) => option.good))
      choose(game, 'good')
    }

    expect(places.size).toBeGreaterThan(1)
  })

  it('places the actions clear of each other and of the goal at its new size', () => {
    const { game } = started(6)

    for (let i = 0; i < 60; i++) {
      const turn = game.turn!
      const radius = ringOuterRadiusFor(goalSizeFor(turn.goal.level))

      for (const [j, option] of turn.options.entries()) {
        expect(gapToGoal(option, radius)).toBeGreaterThanOrEqual(GOAL_GAP)
        for (const other of turn.options.slice(j + 1)) {
          expect(gapBetweenOvals(option, other, LARGE_OVAL)).toBeGreaterThanOrEqual(OPTION_GAP)
        }
      }
      // Good and bad, so the goal is seen at different sizes.
      choose(game, i % 3 === 2 ? 'bad' : 'good')
    }
  })

  it('keeps the number of actions and the time to choose for the whole of each goal', () => {
    const { game } = started(3)
    const seen = new Map<ShownGoal, { options: Set<number>; limits: Set<number> }>()

    for (let i = 0; i < 80; i++) {
      const turn = game.turn!
      const entry = seen.get(turn.goal) ?? { options: new Set(), limits: new Set() }
      entry.options.add(turn.options.length)
      entry.limits.add(turn.deadlineMs - turn.readyAtMs)
      seen.set(turn.goal, entry)
      choose(game, i % 4 === 3 ? 'bad' : 'good')
    }

    for (const [goal, { options, limits }] of seen) {
      expect([...options]).toEqual([goal.options])
      expect([...limits]).toEqual([goal.timeLimitMs])
    }
  })

  it('gives each goal the actions and time for the goals before it, reached or failed', () => {
    const { game } = started(3)
    const goalsStarted: ShownGoal[] = []

    for (let i = 0; i < 150; i++) {
      const turn = game.turn!
      if (turn.goal !== goalsStarted.at(-1)) goalsStarted.push(turn.goal)
      // Mostly good; every fifth set a distraction, so some goals fail.
      choose(game, i % 5 === 4 ? 'bad' : 'good')
    }

    goalsStarted.forEach((goal, before) => {
      expect(goal.options).toBe(steppedAfter(OPTIONS, before))
      expect(goal.timeLimitMs).toBe(steppedAfter(TIME_LIMIT, before))
    })
    expect(goalsStarted.map((goal) => goal.options).slice(0, 10)).toEqual([
      2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ])
  })

  it('shows every goal once before any comes again, never the same twice in a row', () => {
    const { game } = started(8)
    const shown: Goal[] = []

    while (shown.length < 45) {
      const goal = game.goal!.goal
      if (shown.at(-1) !== goal) shown.push(goal)
      choose(game, 'good')
    }

    expect(new Set(shown.slice(0, 30)).size).toBe(30)
    expect(shown.every((goal, i) => goal !== shown[i - 1])).toBe(true)
  })

  it('never offers the same action for a goal twice in a row', () => {
    const { game } = started(9)
    let last: Turn | undefined

    for (let i = 0; i < 100; i++) {
      const turn = game.turn!
      if (last?.goal === turn.goal) {
        expect(goodOf(turn).text).not.toBe(goodOf(last).text)
      }
      last = turn
      // Back and forth, so each goal gets many sets.
      choose(game, i % 2 === 0 ? 'good' : 'bad')
    }
  })
})

describe('choosing the good action', () => {
  it('gives +1, makes the goal a step smaller, and fades in new actions 0.1 s later', () => {
    const { game, score, mistakes } = started()
    const goal = game.goal!

    const turn = choose(game, 'good')

    expect(score.value).toBe(POINTS.good)
    expect(game.stats.good).toBe(1)
    expect(mistakes).toEqual([])
    expect(turn).toMatchObject({ endedAtMs: 3_100, chosen: goodOf(turn) })
    expect(game.previousTurn).toBe(turn)
    expect(game.turn).not.toBe(turn)
    expect(game.turn).toMatchObject({ goal, shownAtMs: 3_200, readyAtMs: 3_300 })
    expect(goal).toMatchObject({ level: -1, fromSize: 150, resizedAtMs: 3_200 })
    expect(goalSizeAt(goal, 3_500)).toBe(goalSizeFor(-1))
  })

  it('reaches the goal after 3 steps smaller, and brings the next one after it fades out', () => {
    const { game, goalsOver, score } = started()
    const goal = game.goal!

    choose(game, 'good')
    choose(game, 'good')
    const last = choose(game, 'good')

    const overAt = last.endedAtMs! + FADE_MS
    expect(goal).toMatchObject({ level: -3, outcome: 'reached', endedAtMs: overAt })
    expect(goalsOver).toEqual([{ outcome: 'reached', goal }])
    expect(game.stats.goalsReached).toBe(1)
    expect(score.value).toBe(3)
    expect(game.previousGoal).toBe(goal)
    // Shrinking as it fades out, then the next goal, read alone for 3 s.
    expect(goalSizeAt(goal, overAt + RESIZE_MS)).toBe(goalSizeFor(-3))
    expect(game.goal).not.toBe(goal)
    expect(game.goal!.shownAtMs).toBe(overAt + RESIZE_MS)
    expect(game.turn!.shownAtMs).toBe(overAt + RESIZE_MS + READING_MS)
  })
})

describe('choosing a distraction', () => {
  it('is a mistake, scores nothing, makes the goal a step bigger and replaces all actions', () => {
    const { game, score, mistakes } = started()
    const goal = game.goal!

    const turn = choose(game, 'bad')

    expect(score.value).toBe(0)
    expect(game.stats.distractions).toBe(1)
    expect(mistakes).toEqual([{ mistake: 'distraction', turn }])
    expect(turn.chosen).toBe(badOf(turn))
    expect(goal.level).toBe(1)
    expect(game.turn).toMatchObject({ goal, shownAtMs: 3_200 })
    expect(game.turn!.options.some((option) => turn.options.includes(option))).toBe(false)
  })

  it('fails the goal after 3 steps bigger, with no extra mistake', () => {
    const { game, goalsOver, mistakes } = started()
    const goal = game.goal!

    choose(game, 'bad')
    choose(game, 'bad')
    const last = choose(game, 'bad')

    expect(goal).toMatchObject({
      level: 3,
      outcome: 'failed',
      endedAtMs: last.endedAtMs! + FADE_MS,
    })
    expect(goalsOver).toEqual([{ outcome: 'failed', goal }])
    expect(mistakes).toHaveLength(3)
    expect(game.stats).toMatchObject({ goalsFailed: 1, distractions: 3 })
    expect(game.goal).not.toBe(goal)
  })

  it('is undone by a good action: steps add up, so the goal takes one more good action', () => {
    const { game, goalsOver } = started()
    const goal = game.goal!

    for (const kind of ['good', 'bad', 'good', 'good'] as const) choose(game, kind)
    expect(goal.level).toBe(-2)
    expect(goalsOver).toEqual([])

    choose(game, 'good')
    expect(goalsOver).toEqual([{ outcome: 'reached', goal }])
  })

  it('only fails a goal once it is 3 steps bigger than it started', () => {
    const { game, goalsOver } = started()
    const goal = game.goal!

    for (const kind of ['good', 'bad', 'bad', 'bad'] as const) choose(game, kind)
    expect(goal.level).toBe(2)
    expect(goalsOver).toEqual([])

    choose(game, 'bad')
    expect(goalsOver).toEqual([{ outcome: 'failed', goal }])
  })
})

describe('choosing nothing in time', () => {
  it('is a mistake at the deadline, and makes the goal a step bigger', () => {
    const { game, mistakes } = started()
    const turn = game.turn!

    game.update(turn.deadlineMs - 1)
    expect(mistakes).toEqual([])

    game.update(turn.deadlineMs)
    expect(mistakes).toEqual([{ mistake: 'tooSlow', turn }])
    expect(turn).toMatchObject({ endedAtMs: 13_100, chosen: undefined })
    expect(game.stats.tooSlow).toBe(1)
    expect(game.goal!.level).toBe(1)
    expect(game.turn!.shownAtMs).toBe(13_200)
  })

  it('runs out each time at its exact moment, even over one long frame', () => {
    const { game, mistakes, goalsOver } = started()
    const goal = game.goal!

    game.update(60_000)

    // 3 times out (13.1 s, 23.3 s, 33.5 s): the goal fails; the next one
    // comes at 33.9 s, its actions at 36.9 s, out of time at 47 s, then 57.2 s.
    expect(mistakes.map(({ turn }) => turn.endedAtMs)).toEqual([
      13_100, 23_300, 33_500, 47_000, 57_200,
    ])
    expect(goalsOver).toEqual([{ outcome: 'failed', goal }])
    expect(game.timeMs).toBe(60_000)
  })
})

describe('taps', () => {
  it('do nothing on the goal or on empty space', () => {
    const { game, score, mistakes } = started()
    game.update(game.turn!.readyAtMs)

    game.tap(CENTRE)
    game.tap({ x: 2, y: 70 })

    expect(game.turn!.endedAtMs).toBeUndefined()
    expect([score.value, mistakes.length]).toEqual([0, 0])
  })

  it('do nothing while the goal is read alone', () => {
    const { game, score } = started()
    const turn = game.turn!

    game.update(turn.shownAtMs - 1)
    game.tap(goodOf(turn))

    expect(turn.endedAtMs).toBeUndefined()
    expect(score.value).toBe(0)
  })

  it('count from the moment the actions start to fade in', () => {
    const { game, score } = started()
    const turn = game.turn!

    game.update(turn.shownAtMs)
    game.tap(goodOf(turn))

    expect(score.value).toBe(1)
  })

  it('do nothing while the actions before fade out, before the next come', () => {
    const { game, score } = started()
    const turn = choose(game, 'good')

    game.update(turn.endedAtMs! + FADE_MS / 2)
    game.tap(goodOf(turn))
    game.tap(goodOf(game.turn!))

    expect(score.value).toBe(1)
  })
})

describe('the round ending', () => {
  it('stops everything as it is on the mistake that ends it', () => {
    const played = setup(1, {
      onMistake: () => played.game.stop(),
    })
    const { game } = played
    game.start()
    const goal = game.goal!

    const turn = choose(game, 'bad')

    expect(game.turn).toBe(turn)
    expect(game.previousTurn).toBeUndefined()
    expect(goal.level).toBe(0)

    game.update(60_000)
    game.tap(goodOf(turn))
    expect(game.timeMs).toBe(turn.readyAtMs)
    expect(played.score.value).toBe(0)
  })

  it('stops at the time that ran out, when that was the mistake', () => {
    const played = setup(1, { onMistake: () => played.game.stop() })
    played.game.start()
    const turn = played.game.turn!

    played.game.update(60_000)

    expect(played.game.timeMs).toBe(turn.deadlineMs)
    expect(played.game.turn).toBe(turn)
  })

  it('starts afresh with the next round', () => {
    const { game } = started()
    choose(game, 'good')
    choose(game, 'bad')
    game.stop()

    game.start()

    expect(game.stats).toEqual({
      goalsReached: 0,
      goalsFailed: 0,
      good: 0,
      distractions: 0,
      tooSlow: 0,
    })
    expect(game.goal).toMatchObject({ shownAtMs: 0, level: 0, options: 2 })
    expect(game.previousTurn).toBeUndefined()
    choose(game, 'good')
    expect(game.stats.good).toBe(1)
  })

  it('removes everything when cleared', () => {
    const { game } = started()
    choose(game, 'good')

    game.clear()

    expect([game.goal, game.turn, game.previousTurn, game.timeMs]).toEqual([
      undefined,
      undefined,
      undefined,
      0,
    ])
  })

  it('works without anyone told about mistakes or goals', () => {
    const { game, score } = setup()
    game.start()

    for (const kind of ['bad', 'bad', 'bad', 'good', 'good', 'good'] as const) choose(game, kind)
    game.update(game.turn!.deadlineMs)

    expect(game.stats).toEqual({
      goalsReached: 1,
      goalsFailed: 1,
      good: 3,
      distractions: 3,
      tooSlow: 1,
    })
    expect(score.value).toBe(3)
  })
})

describe('randomness', () => {
  it('uses Math.random by default', () => {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const game = createBreakItDown({ goals, distractions, score: createScore({ lifecycle }) })

    game.start()

    expect(game.turn!.options).toHaveLength(2)
  })
})
