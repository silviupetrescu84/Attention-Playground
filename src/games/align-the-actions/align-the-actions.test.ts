import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../test/random'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { createGameLifecycle } from '../shared/game-lifecycle'
import { createScore } from '../shared/score'
import {
  ACTION_SIZE,
  CHECK_Y,
  CIRCLE_RADIUS,
  createAlignTheActions,
  GOAL_HEIGHT,
  GOAL_TOP,
  LANE_COUNT,
  LANE_WIDTH,
  laneAt,
  laneCentre,
  LANES_TOP,
  POINTS,
  SPAWN_STEPS,
  SPAWN_Y,
  SPEED_STEPS,
  START_LANE,
  START_SPAWN_INTERVAL_MS,
  START_SPEED,
  type AlignTheActionsOptions,
  type Mistake,
  type Row,
} from './align-the-actions'
import data from './data/align_the_actions_goals.json'
import { goalsFrom, type Action, type ActionKind, type Goal } from './goals'

const goals = goalsFrom(data)

type ExtraOptions = Pick<AlignTheActionsOptions, 'speedSteps' | 'spawnSteps' | 'onMistake'>

function setup(seed = 1, options: ExtraOptions = {}) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createAlignTheActions({ goals, score, random: seededRandom(seed), ...options })
  return { score, game }
}

/** Long enough to play through every difficulty step, then a while at the hardest. */
const WHOLE_RAMP_MS = Math.max(SPEED_STEPS.at(-1)![0], SPAWN_STEPS.at(-1)![0]) + 50_000

/** Neither faster nor more often: the starting values all round. */
const steady: ExtraOptions = { speedSteps: [], spawnSteps: [] }

/** Plays until `untilMs` in small steps; returns every row that came out, in order. */
function playAndRecord(game: ReturnType<typeof setup>['game'], untilMs: number) {
  const seen = new Set<Row>()
  for (let t = 0; t <= untilMs; t += 50) {
    game.update(t)
    game.rows.forEach((row) => seen.add(row))
  }
  return [...seen]
}

/** The lane of the first row's action of `kind`. */
function laneOf(row: Row, kind: ActionKind) {
  return row.actions.findIndex((action) => action.kind === kind)
}

/** The time a row that came out at 0 reaches the circle at the starting speed. */
const firstCheckMs = ((CHECK_Y - SPAWN_Y) / START_SPEED) * 1_000

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect([LANE_COUNT, LANE_WIDTH]).toEqual([4, 100])
    expect(START_SPEED).toBe(80)
    expect(SPEED_STEPS).toEqual([
      [20_000, 15],
      [40_000, 35],
      [60_000, 60],
      [80_000, 90],
      [100_000, 125],
    ])
    expect(SPAWN_STEPS).toEqual([
      [20_000, 28],
      [40_000, 80],
      [60_000, 167],
      [80_000, 280],
      [100_000, 350],
    ])
    expect(POINTS).toEqual({ aligned: 1, notAligned: 1 })
    expect(START_LANE).toBe(0)
  })

  it('shows the goal below the score bar and starts the lanes right under it', () => {
    expect(GOAL_TOP).toBe(GAME_BAR_HEIGHT)
    expect(LANES_TOP).toBe(GOAL_TOP + GOAL_HEIGHT)
  })

  it('brings new rows out from under the goal', () => {
    // The square's bottom edge is exactly where the lanes start.
    expect(SPAWN_Y + ACTION_SIZE / 2).toBe(LANES_TOP)
  })

  it('fits the squares and the circle in a lane, and the circle on the canvas', () => {
    expect(ACTION_SIZE).toBeLessThan(LANE_WIDTH)
    expect(CIRCLE_RADIUS * 2).toBeLessThan(LANE_WIDTH)
    expect(CHECK_Y + CIRCLE_RADIUS).toBeLessThanOrEqual(800)
  })

  it('starts with a new row every 8 s, just before the one before reaches the circle', () => {
    expect(START_SPAWN_INTERVAL_MS).toBe(8_000)
    // From 98 px down to 740 px at 80 px/s.
    expect(firstCheckMs).toBe(8_025)
  })
})

describe('lanes', () => {
  it('splits the canvas into 4 lanes of 100 px', () => {
    expect([0, 99.9, 100, 199.9, 200, 300, 399.9].map(laneAt)).toEqual([0, 0, 1, 1, 2, 3, 3])
  })

  it('counts a tap just outside the canvas for the nearest lane', () => {
    expect(laneAt(-5)).toBe(0)
    expect(laneAt(400)).toBe(3)
    expect(laneAt(420)).toBe(3)
  })

  it('finds the middle of each lane', () => {
    expect([0, 1, 2, 3].map(laneCentre)).toEqual([50, 150, 250, 350])
  })
})

describe('before the round', () => {
  it('has no rows and no goal, and the circle in its starting lane', () => {
    const { game } = setup()

    expect(game.rows).toEqual([])
    expect(game.goal).toBeUndefined()
    expect(game.circleLane).toBe(START_LANE)
    expect(game.stats).toEqual({ aligned: 0, against: 0, otherGoal: 0 })
  })

  it('brings nothing out if time passes before the round starts', () => {
    const { game } = setup()

    game.update(20_000)

    expect(game.rows).toEqual([])
  })
})

describe('rows', () => {
  it('brings the first row out the moment the round starts, under the goal', () => {
    const { game } = setup()

    game.start()

    expect(game.rows).toHaveLength(1)
    const [row] = game.rows
    expect(row).toMatchObject({ spawnedAtMs: 0, y: SPAWN_Y, chosenLane: undefined })
    expect(row.actions).toHaveLength(4)
    expect(game.goal).toBe(row.goal)
  })

  it('moves rows down at the starting speed', () => {
    const { game } = setup()
    game.start()

    game.update(5_000)

    expect(game.rows[0].y).toBe(SPAWN_Y + START_SPEED * 5)
  })

  it('speeds up every row on screen at each step, including rows already moving', () => {
    const { game } = setup()
    game.start()
    const thirdOutAt = 2 * START_SPAWN_INTERVAL_MS
    game.update(thirdOutAt)
    const third = game.rows.find((row) => row.spawnedAtMs === thirdOutAt)!

    game.update(22_000)

    // Until 20 s at the starting speed, then 2 s 15% faster.
    const beforeStep = (20_000 - thirdOutAt) / 1_000
    expect(third.y).toBeCloseTo(SPAWN_Y + START_SPEED * beforeStep + START_SPEED * 1.15 * 2, 9)
  })

  it('follows every speed step: +15, +35, +60, +90 and +125%', () => {
    const { game } = setup()
    game.start()
    let late: Row | undefined
    for (let t = 0; !late; t += 50) {
      game.update(t)
      late = game.rows.find((row) => row.spawnedAtMs > 100_000)
    }

    game.update(late.spawnedAtMs + 1_000)

    // 1 s at 2.25 × the starting speed.
    expect(late.y).toBeCloseTo(SPAWN_Y + START_SPEED * 2.25, 9)
  })

  it('brings the next row out 8 s later, just before the previous one reaches the circle', () => {
    const { game } = setup(1, steady)
    game.start()
    const first = game.rows[0]

    game.update(7_999)
    expect(game.rows).toHaveLength(1)

    game.update(8_000)
    expect(game.rows).toHaveLength(2)
    expect(game.rows[1].spawnedAtMs).toBe(8_000)
    expect(first.chosenLane).toBeUndefined()

    game.update(firstCheckMs)
    expect(first.y).toBeCloseTo(CHECK_Y, 9)
    expect(first.chosenLane).toBe(START_LANE)
  })

  it('brings rows out 28, 80, 167, 280 and 350% more often as the round goes on', () => {
    const { game } = setup()
    game.start()

    const spawnTimes = playAndRecord(game, WHOLE_RAMP_MS).map((row) => row.spawnedAtMs)

    // Each wait is chosen when the row before comes out.
    const expected = [0]
    const multipliers = [1, 1.28, 1.8, 2.67, 3.8, 4.5]
    const multiplierAt = (ms: number) => multipliers[Math.min(5, Math.floor(ms / 20_000))]
    while (expected.length < spawnTimes.length) {
      const last = expected.at(-1)!
      expected.push(last + START_SPAWN_INTERVAL_MS / multiplierAt(last))
    }
    expect(spawnTimes.length).toBeGreaterThan(3)
    spawnTimes.forEach((time, i) => expect(time).toBeCloseTo(expected[i], 6))
  })

  it('brings rows closer, until one comes out as one is halfway and one at the circle', () => {
    const { game } = setup()
    game.start()
    const way = CHECK_Y - SPAWN_Y
    /** For each row that came out after 90 s: how far ahead the two rows before it were. */
    const ahead = new Map<number, { previous: number; beforeThat: number }>()

    for (let t = 0; t <= WHOLE_RAMP_MS; t += 10) {
      game.update(t)
      const [beforeThat, previous, newest] = game.rows.slice(-3)
      if (newest && newest.spawnedAtMs > 90_000 && !ahead.has(newest.spawnedAtMs)) {
        // Every row moves at the same speed, so the distance between rows stays the same.
        ahead.set(newest.spawnedAtMs, {
          previous: previous.y - newest.y,
          beforeThat: beforeThat.y - newest.y,
        })
      }
    }

    expect(ahead.size).toBeGreaterThan(4)
    for (const { previous, beforeThat } of ahead.values()) {
      expect(Math.abs(previous - way / 2)).toBeLessThan(30)
      expect(Math.abs(beforeThat - way)).toBeLessThan(30)
    }
  })

  it('lets rows leave once they are fully below the canvas', () => {
    const { game } = setup(1, steady)
    game.start()
    const first = game.rows[0]
    // Its top edge reaches 800 px when its centre is at 846 px.
    const leavesAtMs = ((800 + ACTION_SIZE / 2 - SPAWN_Y) / START_SPEED) * 1_000

    game.update(leavesAtMs)
    expect(game.rows).toContain(first)

    game.update(leavesAtMs + 1)
    expect(game.rows).not.toContain(first)
  })

  it('brings out every row due, at its own time, even after a long frame', () => {
    const stepByStep = setup(5)
    const oneLongFrame = setup(5)
    for (const { game } of [stepByStep, oneLongFrame]) game.start()

    playAndRecord(stepByStep.game, 45_000)
    oneLongFrame.game.update(45_000)

    expect(oneLongFrame.game.rows.length).toBeGreaterThan(0)
    expect(oneLongFrame.game.rows).toEqual(stepByStep.game.rows)
    expect(oneLongFrame.game.stats).toEqual(stepByStep.game.stats)
  })
})

describe('moving the circle', () => {
  it('moves to the lane tapped, wherever in the lane', () => {
    const { game } = setup()
    game.start()

    game.tap({ x: 399, y: 780 })
    expect(game.circleLane).toBe(3)

    game.tap({ x: 10, y: 200 })
    expect(game.circleLane).toBe(0)

    game.tap({ x: 250, y: 500 })
    expect(game.circleLane).toBe(2)
  })
})

describe('choosing', () => {
  function setupWithMistakes(seed = 1) {
    const mistakes: { mistake: Mistake; action: Action; goal: Goal; scoreThen: number }[] = []
    const played = setup(seed, {
      ...steady,
      onMistake: (mistake, action, goal) =>
        mistakes.push({ mistake, action, goal, scoreThen: played.score.value }),
    })
    played.game.start()
    return { ...played, mistakes }
  }

  it.each<[ActionKind, number]>([
    ['aligned', 1],
    ['against', -1],
    ['otherGoal', -1],
  ])('chooses the %s action in the circle’s lane when the row reaches it: %i', (kind, points) => {
    const { game, score } = setupWithMistakes()
    const row = game.rows[0]
    game.tap({ x: laneCentre(laneOf(row, kind)), y: 700 })

    game.update(firstCheckMs - 1)
    expect(score.value).toBe(0)
    expect(row.chosenLane).toBeUndefined()

    game.update(firstCheckMs)
    expect(row.chosenLane).toBe(laneOf(row, kind))
    expect(score.value).toBe(points)
    expect(game.stats).toEqual({ aligned: 0, against: 0, otherGoal: 0, [kind]: 1 })
  })

  it('reports choosing an action against the goal, after its point is taken', () => {
    const { game, mistakes } = setupWithMistakes()
    const row = game.rows[0]
    const lane = laneOf(row, 'against')
    game.tap({ x: laneCentre(lane), y: 700 })

    game.update(firstCheckMs)

    expect(mistakes).toEqual([
      { mistake: 'against', action: row.actions[lane], goal: row.goal, scoreThen: -1 },
    ])
  })

  it('reports choosing an action for another goal, naming both goals', () => {
    const { game, mistakes } = setupWithMistakes()
    const row = game.rows[0]
    const lane = laneOf(row, 'otherGoal')
    game.tap({ x: laneCentre(lane), y: 700 })

    game.update(firstCheckMs)

    expect(mistakes).toHaveLength(1)
    expect(mistakes[0]).toMatchObject({ mistake: 'otherGoal', goal: row.goal })
    expect(mistakes[0].action.goal).not.toBe(row.goal)
  })

  it('reports nothing for an aligned action', () => {
    const { game, mistakes } = setupWithMistakes()
    game.tap({ x: laneCentre(laneOf(game.rows[0], 'aligned')), y: 700 })

    game.update(firstCheckMs)

    expect(mistakes).toEqual([])
  })

  it('chooses each row once, and a later tap does not change it', () => {
    const { game, score } = setupWithMistakes()
    const row = game.rows[0]
    game.tap({ x: laneCentre(laneOf(row, 'aligned')), y: 700 })
    game.update(firstCheckMs)

    game.tap({ x: laneCentre(laneOf(row, 'against')), y: 700 })
    game.update(firstCheckMs + 1_000)

    expect(row.chosenLane).toBe(laneOf(row, 'aligned'))
    expect(score.value).toBe(1)
  })

  it('chooses from the lane the circle is in when the row arrives, not before', () => {
    const { game, score } = setupWithMistakes()
    const row = game.rows[0]
    game.tap({ x: laneCentre(laneOf(row, 'against')), y: 700 })
    game.update(firstCheckMs - 500)

    game.tap({ x: laneCentre(laneOf(row, 'aligned')), y: 700 })
    game.update(firstCheckMs)

    expect(score.value).toBe(1)
  })

  it('always matches the score: aligned − against − other goal', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const random = seededRandom(seed + 100)
      const { game, score } = setup(seed)
      game.start()

      for (let t = 0; t <= WHOLE_RAMP_MS; t += 100) {
        game.update(t)
        if (random() < 0.05) game.tap({ x: random() * 400, y: random() * 800 })
      }

      const { aligned, against, otherGoal } = game.stats
      expect(aligned + against + otherGoal).toBeGreaterThan(2)
      expect(score.value).toBe(aligned - against - otherGoal)
    }
  })
})

describe('stopping', () => {
  it('chooses nothing more once a mistake stops the round, even in the same frame', () => {
    const played = setup(6, { onMistake: () => played.game.stop() })
    const { game } = played
    game.start()

    // One long frame: several rows reach the circle at once.
    game.update(40_000)

    const chosen = game.rows.filter((row) => row.chosenLane !== undefined)
    const { aligned, against, otherGoal } = game.stats
    expect(against + otherGoal).toBe(1)
    expect(chosen).toHaveLength(aligned + 1)
    const lastChosen = game.rows.indexOf(chosen.at(-1)!)
    for (const row of game.rows.slice(lastChosen + 1)) {
      expect(row.chosenLane).toBeUndefined()
    }
    // Including rows that did reach the circle.
    expect(game.rows.slice(lastChosen + 1).some((row) => row.y >= CHECK_Y)).toBe(true)
  })

  it('moves nothing and brings nothing new once stopped', () => {
    const { game } = setup()
    game.start()
    game.update(3_000)
    const before = game.rows.map((row) => ({ ...row }))

    game.stop()
    game.update(20_000)

    expect(game.rows.map((row) => ({ ...row }))).toEqual(before)
  })

  it('plays normally again from the next start', () => {
    const { game } = setup()
    game.start()
    game.stop()

    game.start()
    game.update(1_000)

    expect(game.rows[0].y).toBe(SPAWN_Y + START_SPEED)
  })
})

describe('the goal shown', () => {
  it('is the goal of the lowest row not chosen from yet', () => {
    const { game } = setup(2, steady)
    game.start()
    const [first] = game.rows
    expect(game.goal).toBe(first.goal)

    game.update(firstCheckMs)

    const [, second] = game.rows
    expect(first.chosenLane).toBeDefined()
    expect(game.goal).toBe(second.goal)
  })

  it('is the goal of the next row to come when none is on its way', () => {
    // Rows speed up more than they come out more often, so once the game
    // gets faster a row reaches the circle before the next one comes out.
    const { game } = setup(3)
    game.start()
    let t = 0
    const allChosen = () => game.rows.every((row) => row.chosenLane !== undefined)
    for (; !allChosen(); t += 50) game.update(t)
    const shown = game.goal

    for (; game.rows.at(-1)!.chosenLane !== undefined; t += 50) game.update(t)

    expect(shown).toBeDefined()
    expect(game.rows.at(-1)!.goal).toBe(shown)
    expect(game.goal).toBe(shown)
  })
})

describe('a new round', () => {
  it('starts again from one row, no counts, and the circle in its starting lane', () => {
    const { game } = setup()
    game.start()
    game.tap({ x: 390, y: 700 })
    playAndRecord(game, 40_000)
    expect(Object.values(game.stats).some((count) => count > 0)).toBe(true)

    game.start()

    expect(game.rows).toHaveLength(1)
    expect(game.rows[0].spawnedAtMs).toBe(0)
    expect(game.circleLane).toBe(START_LANE)
    expect(game.stats).toEqual({ aligned: 0, against: 0, otherGoal: 0 })
  })

  it('removes everything on clear', () => {
    const { game } = setup()
    game.start()
    game.tap({ x: 390, y: 700 })
    game.update(20_000)

    game.clear()

    expect(game.rows).toEqual([])
    expect(game.goal).toBeUndefined()
    expect(game.circleLane).toBe(START_LANE)
    expect(game.stats).toEqual({ aligned: 0, against: 0, otherGoal: 0 })
  })
})
