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
  SPAWN_Y,
  SPEED_STEPS,
  speedAfter,
  START_LANE,
  START_SPEED,
  type AlignTheActionsOptions,
  type Mistake,
  type Row,
} from './align-the-actions'
import data from './data/align_the_actions_goals.json'
import { goalsFrom, type Action, type ActionKind, type Goal } from './goals'

const goals = goalsFrom(data)

function setup(seed = 1, options: Pick<AlignTheActionsOptions, 'onMistake'> = {}) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createAlignTheActions({ goals, score, random: seededRandom(seed), ...options })
  return { score, game }
}

type Game = ReturnType<typeof setup>['game']

/** Plays until `untilMs` in small steps; returns every row that came out, in order. */
function playAndRecord(game: Game, untilMs: number) {
  const seen = new Set<Row>()
  for (let t = 0; t <= untilMs; t += 50) {
    game.update(t)
    game.rows.forEach((row) => seen.add(row))
  }
  return [...seen]
}

/** The rows not chosen from yet. */
const unread = (game: Game) => game.rows.filter((row) => row.chosenLane === undefined)

/** The lane of the row's action of `kind`. */
function laneOf(row: Row, kind: ActionKind) {
  return row.actions.findIndex((action) => action.kind === kind)
}

/** From under the goal (98 px) down to the circle (740 px). */
const WAY = 642
/** The time the first row reaches the circle: 642 px at 60 px/s. */
const firstCheckMs = (WAY / 60) * 1_000
/** Long enough for the fastest speed to be reached, and a while after. */
const PAST_LAST_STEP_MS = 150_000

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect([LANE_COUNT, LANE_WIDTH]).toEqual([4, 100])
    expect(START_SPEED).toBe(60)
    expect(SPEED_STEPS).toEqual([
      [3, 80],
      [6, 105],
      [9, 135],
      [12, 170],
      [15, 210],
    ])
    expect(POINTS).toEqual({ aligned: 1 })
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

  it('has rows move 642 px from under the goal to the circle', () => {
    expect([SPAWN_Y, CHECK_Y]).toEqual([98, 740])
    expect(CHECK_Y - SPAWN_Y).toBe(WAY)
  })
})

describe('speed', () => {
  it('is 60 px/s for the first 3 goals, then 80, 105, 135 and 170 for 3 goals each', () => {
    const speeds = Array.from({ length: 15 }, (_, goalsShown) => speedAfter(goalsShown))

    expect(speeds).toEqual([60, 60, 60, 80, 80, 80, 105, 105, 105, 135, 135, 135, 170, 170, 170])
  })

  it('is 210 px/s from 15 goals on, however many more', () => {
    for (const goalsShown of [15, 16, 30, 1_000]) {
      expect(speedAfter(goalsShown)).toBe(210)
    }
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
  it('brings the first row out the moment the round starts, under its goal, at 60 px/s', () => {
    const { game } = setup()

    game.start()

    expect(game.rows).toHaveLength(1)
    const [row] = game.rows
    expect(row).toMatchObject({ spawnedAtMs: 0, y: SPAWN_Y, speed: 60, chosenLane: undefined })
    expect(row.actions).toHaveLength(4)
    expect(game.goal).toBe(row.goal)
  })

  it('moves a row down at its speed', () => {
    const { game } = setup()
    game.start()
    const [row] = game.rows

    for (const t of [16, 1_000, 5_000, 10_000]) {
      game.update(t)
      expect(row.y).toBeCloseTo(SPAWN_Y + (60 * t) / 1_000, 9)
    }
  })

  it('brings the next row out, with its goal, the moment a row reaches the circle', () => {
    const { game } = setup()
    game.start()
    const [first] = game.rows

    game.update(firstCheckMs - 1)
    expect(game.rows).toEqual([first])
    expect(first.chosenLane).toBeUndefined()

    game.update(firstCheckMs)
    expect(first.chosenLane).toBe(START_LANE)
    expect(first.y).toBeCloseTo(CHECK_Y, 9)
    const [, second] = game.rows
    expect(second).toMatchObject({ spawnedAtMs: firstCheckMs, y: SPAWN_Y, chosenLane: undefined })
    expect(game.goal).toBe(second.goal)
  })

  it('moves the row chosen from on down, at its own speed, until it has left the canvas', () => {
    const { game } = setup()
    game.start()
    const [first] = game.rows
    // Its top passes the bottom of the canvas (800 px) once its centre is past 846 px.
    const leavesAtMs = ((800 + ACTION_SIZE / 2 - SPAWN_Y) / 60) * 1_000

    game.update(leavesAtMs - 1_000)
    expect(first.y).toBeCloseTo(SPAWN_Y + (60 * (leavesAtMs - 1_000)) / 1_000, 9)
    game.update(leavesAtMs)
    expect(game.rows).toContain(first)

    game.update(leavesAtMs + 1)
    expect(game.rows).not.toContain(first)
    expect(game.rows).toHaveLength(1)
  })

  it('only ever has one row on its way to the circle: the newest, above the circle', () => {
    const { game } = setup()
    game.start()
    let bothOnScreen = 0

    for (let t = 0; t <= PAST_LAST_STEP_MS; t += 10) {
      game.update(t)
      const [onItsWay, ...others] = unread(game)
      expect(others).toEqual([])
      expect(onItsWay).toBe(game.rows.at(-1))
      expect(onItsWay.y).toBeLessThan(CHECK_Y)
      // At most the one on its way, and one chosen from that is leaving.
      expect(game.rows.length).toBeLessThanOrEqual(2)
      if (game.rows.length === 2) bothOnScreen++
    }

    expect(bothOnScreen).toBeGreaterThan(0)
  })

  it('speeds up after every 3 goals shown, until 210 px/s after 15', () => {
    const { game } = setup()
    game.start()

    const rows = playAndRecord(game, PAST_LAST_STEP_MS)

    const expected = [60, 80, 105, 135, 170].flatMap((speed) => [speed, speed, speed])
    expect(rows.length).toBeGreaterThan(20)
    expect(rows.map((row) => row.speed)).toEqual([
      ...expected,
      ...Array(rows.length - 15).fill(210),
    ])
  })

  it('brings each row out exactly when the one before reaches the circle', () => {
    const { game } = setup()
    game.start()

    const rows = playAndRecord(game, PAST_LAST_STEP_MS)

    expect(rows[0].spawnedAtMs).toBe(0)
    for (let i = 1; i < rows.length; i++) {
      const before = rows[i - 1]
      expect(rows[i].spawnedAtMs).toBeCloseTo(before.spawnedAtMs + (WAY / before.speed) * 1_000, 6)
    }
  })

  it('chooses from every row due, at its own time, even after a long frame', () => {
    const stepByStep = setup(5)
    const oneLongFrame = setup(5)
    for (const { game } of [stepByStep, oneLongFrame]) game.start()

    playAndRecord(stepByStep.game, PAST_LAST_STEP_MS)
    oneLongFrame.game.update(PAST_LAST_STEP_MS)

    expect(Object.values(oneLongFrame.game.stats).reduce((a, b) => a + b)).toBeGreaterThan(20)
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
    const mistakes: { mistake: Mistake; action: Action; goal: Goal }[] = []
    const played = setup(seed, {
      onMistake: (mistake, action, goal) => mistakes.push({ mistake, action, goal }),
    })
    played.game.start()
    return { ...played, mistakes }
  }

  it.each<[ActionKind, number]>([
    ['aligned', 1],
    ['against', 0],
    ['otherGoal', 0],
  ])('chooses the %s action in the circle’s lane as its row arrives: %i', (kind, points) => {
    const { game, score } = setupWithMistakes()
    game.tap({ x: laneCentre(laneOf(game.rows[0], kind)), y: 700 })

    game.update(firstCheckMs - 1)
    expect(score.value).toBe(0)
    expect(game.stats).toEqual({ aligned: 0, against: 0, otherGoal: 0 })

    game.update(firstCheckMs)
    expect(score.value).toBe(points)
    expect(game.stats).toEqual({ aligned: 0, against: 0, otherGoal: 0, [kind]: 1 })
  })

  it('reports choosing an action against the goal', () => {
    const { game, mistakes } = setupWithMistakes()
    const row = game.rows[0]
    const lane = laneOf(row, 'against')
    game.tap({ x: laneCentre(lane), y: 700 })

    game.update(firstCheckMs)

    expect(mistakes).toEqual([
      { mistake: 'against', action: row.actions[lane], goal: row.goal },
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
    const [row] = game.rows
    game.tap({ x: laneCentre(laneOf(row, 'aligned')), y: 700 })
    game.update(firstCheckMs)

    game.tap({ x: laneCentre(laneOf(row, 'against')), y: 700 })
    game.update(firstCheckMs + 1_000)

    expect(game.rows).toContain(row)
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

  it('always matches the score: one point per aligned action chosen', () => {
    let mistakes = 0
    for (const seed of [1, 2, 3, 4, 5]) {
      const random = seededRandom(seed + 100)
      const { game, score } = setup(seed)
      game.start()

      for (let t = 0; t <= PAST_LAST_STEP_MS; t += 100) {
        game.update(t)
        if (random() < 0.05) game.tap({ x: random() * 400, y: random() * 800 })
      }

      const { aligned, against, otherGoal } = game.stats
      expect(aligned + against + otherGoal).toBeGreaterThan(20)
      expect(score.value).toBe(aligned)
      mistakes += against + otherGoal
    }
    expect(mistakes).toBeGreaterThan(5)
  })
})

describe('stopping', () => {
  it('stops at the mistake: its row at the circle, its goal shown, and no next row', () => {
    const played = setup(6, { onMistake: () => played.game.stop() })
    const { game } = played
    game.start()

    // One long frame: many rows are due in it.
    game.update(PAST_LAST_STEP_MS)

    const { aligned, against, otherGoal } = game.stats
    expect(against + otherGoal).toBe(1)
    // The round went on until that mistake: it was not the first row.
    expect(aligned).toBeGreaterThan(0)
    const last = game.rows.at(-1)!
    expect(last.actions[last.chosenLane!].kind).not.toBe('aligned')
    expect(last.y).toBeCloseTo(CHECK_Y, 9)
    expect(unread(game)).toEqual([])
    expect(game.goal).toBe(last.goal)
  })

  it('moves nothing and brings nothing new once stopped', () => {
    const { game } = setup()
    game.start()
    game.update(12_000)
    const before = game.rows.map((row) => ({ ...row }))
    expect(before).toHaveLength(2)

    game.stop()
    game.update(PAST_LAST_STEP_MS)

    expect(game.rows.map((row) => ({ ...row }))).toEqual(before)
  })

  it('plays normally again from the next start', () => {
    const { game } = setup()
    game.start()
    game.stop()

    game.start()
    game.update(1_000)

    expect(game.rows[0].y).toBe(SPAWN_Y + 60)
  })
})

describe('a new round', () => {
  it('starts again at 60 px/s, with no counts and the circle in its starting lane', () => {
    const { game } = setup()
    game.start()
    game.tap({ x: 390, y: 700 })
    playAndRecord(game, 60_000)
    expect(game.rows.at(-1)!.speed).toBeGreaterThan(60)
    expect(Object.values(game.stats).some((count) => count > 0)).toBe(true)

    game.start()

    expect(game.rows).toHaveLength(1)
    expect(game.rows[0]).toMatchObject({ spawnedAtMs: 0, y: SPAWN_Y, speed: 60 })
    expect(game.circleLane).toBe(START_LANE)
    expect(game.stats).toEqual({ aligned: 0, against: 0, otherGoal: 0 })
    // Counting goals from the start again: 3 more at 60 px/s.
    const speeds = playAndRecord(game, 40_000).map((row) => row.speed)
    expect(speeds.slice(0, 4)).toEqual([60, 60, 60, 80])
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
