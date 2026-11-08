import {
  createDifficulty,
  type DifficultySettings,
  type DifficultyStep,
} from '../shared/difficulty'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import type { Random } from '../shared/random'
import type { Score } from '../shared/score'
import {
  createActionSetGenerator,
  type Action,
  type ActionKind,
  type ActionSet,
  type ActionSetGenerator,
  type Goal,
} from './goals'

/**
 * The rules of Align the Actions.
 *
 * The canvas has 4 lanes. From the moment the round starts, rows of 4
 * actions (one per lane, see `goals.ts`) come out from under the goal at the
 * top and move down, all at the same speed. At the bottom is a circle, which
 * the player moves to a lane by tapping anywhere in it.
 *
 * When a row's centre reaches the circle's centre, the action in the
 * circle's lane is chosen: +1 if it is aligned with the row's goal, −1 if it
 * is not (against the goal, or aligned with another goal). The row then
 * moves on and leaves at the bottom.
 *
 * The goal at the top is always the goal of the lowest row not chosen from
 * yet, or, when none is on its way, of the next row to come.
 *
 * At the start, rows move at 80 px/s and a new row comes out every 8 s, just
 * before the one before reaches the circle. Both get faster during the round (SPEED_STEPS
 * and SPAWN_STEPS), rows coming out more often even faster than they speed
 * up, so they get closer together: by 100 s, as one row comes out at the
 * top, one is halfway down and one is at the circle. The speed changes for every
 * row on screen at once, so rows keep their distance from each other.
 */

export const LANE_COUNT = 4
export const LANE_WIDTH = GAME_WIDTH / LANE_COUNT
/** The goal is shown just below the score and time bar. */
export const GOAL_TOP = GAME_BAR_HEIGHT
export const GOAL_HEIGHT = 80
/** Where the lanes start, right under the goal. Actions are only seen below it. */
export const LANES_TOP = GOAL_TOP + GOAL_HEIGHT
/** Each action is in a square of this size, centred in its lane. */
export const ACTION_SIZE = 92
/** Centre height of a new row: just hidden under the goal. */
export const SPAWN_Y = LANES_TOP - ACTION_SIZE / 2
export const CIRCLE_RADIUS = 42
/** Centre height of the circle: rows are chosen from when their centre gets here. */
export const CHECK_Y = GAME_HEIGHT - 60
/** The lane the circle starts a round in: the leftmost. */
export const START_LANE = 0

/** Rows' speed at the start, in px/s. */
export const START_SPEED = 80
/** How much faster rows move than at the start: +15% from 20 s, … +125% from 100 s on. */
export const SPEED_STEPS: readonly DifficultyStep[] = [
  [20_000, 15],
  [40_000, 35],
  [60_000, 60],
  [80_000, 90],
  [100_000, 125],
]
/**
 * At the start, a new row comes out every 8 s: just before the one before
 * reaches the circle, which takes 8.025 s (642 px at 80 px/s).
 */
export const START_SPAWN_INTERVAL_MS = 8_000
/**
 * How much more often rows come out than at the start. Chosen so that rows
 * get closer together at each step: the space between one row and the next
 * is the whole way from the goal to the circle at the start, then 0.9, 0.75
 * and 0.6 of it, and half of it from 80 s (speed ÷ space between rows).
 */
export const SPAWN_STEPS: readonly DifficultyStep[] = [
  [20_000, 28],
  [40_000, 80],
  [60_000, 167],
  [80_000, 280],
  [100_000, 350],
]

const SPEED_SETTINGS = {
  speed: { start: START_SPEED, harder: 'higher' },
} as const satisfies DifficultySettings
const SPAWN_SETTINGS = {
  spawnIntervalMs: { start: START_SPAWN_INTERVAL_MS, harder: 'lower' },
} as const satisfies DifficultySettings

export const POINTS = {
  aligned: 1,
  notAligned: 1,
} as const

/** The lane at `x` (a tap just outside the canvas counts for the nearest lane). */
export function laneAt(x: number): number {
  return Math.min(LANE_COUNT - 1, Math.max(0, Math.floor(x / LANE_WIDTH)))
}

/** The horizontal centre of `lane`. */
export function laneCentre(lane: number): number {
  return (lane + 0.5) * LANE_WIDTH
}

export interface Row extends ActionSet {
  readonly spawnedAtMs: number
  /** Current centre height, updated every frame. */
  y: number
  /** The lane the circle was in when the row reached it; undefined until then. */
  chosenLane: number | undefined
}

/** Choosing an action that is not aligned with the row's goal. */
export type Mistake = Exclude<ActionKind, 'aligned'>

/** How many actions of each kind were chosen in a round. */
export type AlignTheActionsStats = Readonly<Record<ActionKind, number>>

export interface AlignTheActionsOptions {
  goals: readonly Goal[]
  score: Score
  random?: Random
  /** How much faster rows move during a round. Defaults to SPEED_STEPS. */
  speedSteps?: readonly DifficultyStep[]
  /** How much more often rows come out during a round. Defaults to SPAWN_STEPS. */
  spawnSteps?: readonly DifficultyStep[]
  /** Called for every mistake, after the score has changed. */
  onMistake?: (mistake: Mistake, action: Action, goal: Goal) => void
}

export interface AlignTheActions {
  /** Rows on screen, in the order they came out (the lowest first). */
  readonly rows: readonly Row[]
  /** The goal shown at the top; none before the round starts. */
  readonly goal: Goal | undefined
  /** The lane the circle is in. */
  readonly circleLane: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: AlignTheActionsStats
  /** Removes all rows and puts the circle back. */
  clear(): void
  /** Starts a round: the first row comes out straight away. */
  start(): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** Moves the circle to the lane tapped. */
  tap(point: GamePoint): void
  /** Stops the round at once: no row moves, comes out or is chosen until the next start. */
  stop(): void
}

export function createAlignTheActions({
  goals,
  score,
  random = Math.random,
  speedSteps = SPEED_STEPS,
  spawnSteps = SPAWN_STEPS,
  onMistake,
}: AlignTheActionsOptions): AlignTheActions {
  const speed = createDifficulty({ steps: speedSteps, settings: SPEED_SETTINGS })
  const spawning = createDifficulty({ steps: spawnSteps, settings: SPAWN_SETTINGS })
  let rows: Row[] = []
  let generator: ActionSetGenerator
  /** The next row to come out, picked in advance so its goal can be shown. */
  let upcoming: ActionSet | undefined
  let nextSpawnAtMs = 0
  let circleLane = START_LANE
  const noStats: AlignTheActionsStats = { aligned: 0, against: 0, otherGoal: 0 }
  let stats = noStats
  /** Set when the round is stopped, even in the middle of an update. */
  let stopped = false

  function spawn(set: ActionSet, atMs: number) {
    rows.push({ ...set, spawnedAtMs: atMs, y: SPAWN_Y, chosenLane: undefined })
    upcoming = generator.next()
    nextSpawnAtMs = atMs + spawning.valuesAt(atMs).spawnIntervalMs
  }

  function choose(row: Row) {
    row.chosenLane = circleLane
    const action = row.actions[circleLane]
    stats = { ...stats, [action.kind]: stats[action.kind] + 1 }

    if (action.kind === 'aligned') {
      score.add(POINTS.aligned)
    } else {
      score.subtract(POINTS.notAligned)
      onMistake?.(action.kind, action, row.goal)
    }
  }

  function clear() {
    rows = []
    upcoming = undefined
    circleLane = START_LANE
    stats = noStats
    stopped = false
  }

  return {
    get rows() {
      return rows
    },
    get goal() {
      return rows.find((row) => row.chosenLane === undefined)?.goal ?? upcoming?.goal
    },
    get circleLane() {
      return circleLane
    },
    get stats() {
      return stats
    },
    clear,
    start() {
      clear()
      generator = createActionSetGenerator({ goals, random })
      spawn(generator.next(), 0)
    },
    update(elapsedMs) {
      if (stopped) {
        return
      }

      // Rows come out at the exact moments due, even if a frame took long.
      // (Nothing comes out before the round starts.)
      while (upcoming && nextSpawnAtMs <= elapsedMs) {
        spawn(upcoming, nextSpawnAtMs)
      }

      for (const row of rows) {
        row.y = SPAWN_Y + speed.totalBetween('speed', row.spawnedAtMs, elapsedMs)
      }

      for (const row of rows) {
        if (stopped) {
          return
        }

        if (row.chosenLane === undefined && row.y >= CHECK_Y) {
          choose(row)
        }
      }

      rows = rows.filter((row) => row.y - ACTION_SIZE / 2 <= GAME_HEIGHT)
    },
    tap({ x }) {
      circleLane = laneAt(x)
    },
    stop() {
      stopped = true
    },
  }
}
