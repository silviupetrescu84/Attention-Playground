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
 * The canvas has 4 lanes. Rows of 4 actions (one per lane, see `goals.ts`)
 * come out from under the goal at the top and move down. At the bottom is a
 * circle, which the player moves to a lane by tapping anywhere in it.
 *
 * The first row comes out the moment the round starts. When a row's centre
 * reaches the circle's centre, the action in the circle's lane is chosen: +1
 * if it is aligned with the row's goal. If it is not (against the goal, or
 * aligned with another goal) it scores nothing and is a mistake (see
 * onMistake). At that moment the next row comes out, and the goal at the top
 * becomes its goal, so only one row at a time is on its way to the circle.
 * The row chosen from moves on and leaves at the bottom.
 *
 * When a mistake ends the round, everything stops where it is: the row chosen
 * from at the circle, its goal still at the top, and no next row.
 *
 * The game gets harder as more goals are shown (one per row): rows move at
 * 60 px/s, then 80 px/s after 3 goals, 105 after 6, 135 after 9, 170 after
 * 12 and 210 from 15 on (SPEED_STEPS). A row keeps its speed until it
 * leaves.
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

/** The speed of the first rows, in px/s. */
export const START_SPEED = 60

/** Once `goalsShown` goals have been shown, the next rows move at `speed` px/s. */
export type SpeedStep = readonly [goalsShown: number, speed: number]

export const SPEED_STEPS: readonly SpeedStep[] = [
  [3, 80],
  [6, 105],
  [9, 135],
  [12, 170],
  [15, 210],
]

/** The speed of a row that comes out after `goalsShown` goals have been shown. */
export function speedAfter(goalsShown: number): number {
  let speed = START_SPEED

  for (const [after, stepSpeed] of SPEED_STEPS) {
    if (goalsShown >= after) {
      speed = stepSpeed
    }
  }

  return speed
}

export const POINTS = {
  aligned: 1,
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
  /** Pixels per second, downwards. */
  readonly speed: number
  /** Current centre height, updated every frame. */
  y: number
  /** The lane the circle was in when the row reached it; undefined until then. */
  chosenLane: number | undefined
}

/** When `row`'s centre reaches the circle's, in the round's time. */
function arrivalMs({ spawnedAtMs, speed }: Row): number {
  return spawnedAtMs + ((CHECK_Y - SPAWN_Y) / speed) * 1_000
}

/** Choosing an action that is not aligned with the row's goal. */
export type Mistake = Exclude<ActionKind, 'aligned'>

/** How many actions of each kind were chosen in a round. */
export type AlignTheActionsStats = Readonly<Record<ActionKind, number>>

export interface AlignTheActionsOptions {
  goals: readonly Goal[]
  score: Score
  random?: Random
  /** Called for every mistake. */
  onMistake?: (mistake: Mistake, action: Action, goal: Goal) => void
}

export interface AlignTheActions {
  /**
   * Rows on screen, in the order they came out (the lowest first). Only the
   * newest may not have been chosen from yet.
   */
  readonly rows: readonly Row[]
  /** The goal shown at the top: the newest row's. None before the round starts. */
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
  /** Stops the round at once: nothing moves, comes out or is chosen until the next start. */
  stop(): void
}

export function createAlignTheActions({
  goals,
  score,
  random = Math.random,
  onMistake,
}: AlignTheActionsOptions): AlignTheActions {
  let rows: Row[] = []
  let generator: ActionSetGenerator
  let goalsShown = 0
  let circleLane = START_LANE
  const noStats: AlignTheActionsStats = { aligned: 0, against: 0, otherGoal: 0 }
  let stats = noStats
  /** Set when the round is stopped, even in the middle of an update. */
  let stopped = false

  function spawn(atMs: number) {
    const speed = speedAfter(goalsShown)
    rows.push({ ...generator.next(), spawnedAtMs: atMs, speed, y: SPAWN_Y, chosenLane: undefined })
    goalsShown++
  }

  function choose(row: Row) {
    row.chosenLane = circleLane
    const action = row.actions[circleLane]
    stats = { ...stats, [action.kind]: stats[action.kind] + 1 }

    if (action.kind === 'aligned') {
      score.add(POINTS.aligned)
    } else {
      onMistake?.(action.kind, action, row.goal)
    }
  }

  function moveTo(timeMs: number) {
    for (const row of rows) {
      row.y = SPAWN_Y + (row.speed * (timeMs - row.spawnedAtMs)) / 1_000
    }
  }

  function clear() {
    rows = []
    goalsShown = 0
    circleLane = START_LANE
    stats = noStats
    stopped = false
  }

  return {
    get rows() {
      return rows
    },
    get goal() {
      return rows.at(-1)?.goal
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
      spawn(0)
    },
    update(elapsedMs) {
      if (stopped) {
        return
      }

      // The newest row is the one on its way to the circle. Rows are chosen
      // from at the exact moment they reach it, and the next ones come out
      // then, even if a frame took long.
      for (let row = rows.at(-1); row && arrivalMs(row) <= elapsedMs; row = rows.at(-1)) {
        const arrivedAtMs = arrivalMs(row)
        choose(row)

        if (stopped) {
          moveTo(arrivedAtMs)
          return
        }

        spawn(arrivedAtMs)
      }

      moveTo(elapsedMs)
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
