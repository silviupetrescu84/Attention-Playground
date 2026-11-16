import { DIFFICULTY } from '../../config/difficulty'
import { checkPositive, checkWholeNumber } from '../shared/checks'
import {
  checkSteps,
  checkStepTable,
  steppedAfter,
  valueAt,
  type Steps,
  type StepTable,
} from '../shared/difficulty'
import type { GamePoint } from '../shared/game-canvas'
import { AS_SET, checkPaces, pacingFor, type Pace, type PacePercents } from '../shared/pace'
import { randomIndex, type Random } from '../shared/random'
import type { Score } from '../shared/score'
import { FADE_MS, fadeAt, passDeadlines, type Due, type TimedTurn } from '../shared/timed-turns'
import { goesThrough, layOutRound, MOST_DOTS, TAP_RADIUS, type Layout } from './layout'

/**
 * The rules of Make Good Connections.
 *
 * Each round, dots appear, with walls between some of them (see layout.ts),
 * and a ring around one of them that runs out with the time to connect them
 * all. The player taps a dot, then another: a line joins them, and both
 * light up green; each dot tapped after that is joined to the one before,
 * one path through them all. Tapping the last dot of the path again takes it
 * off (then the one before can be, and so on); tapping any other dot already
 * on it does nothing.
 *
 * - A line that would go through a wall: a mistake. It shows in red for
 *   WALL_HIT_SHOW_MS, and the path is taken away: the player starts again,
 *   the time still running.
 * - Every dot on the path: +1. Everything stays CONNECTED_SHOW_MS, then
 *   fades out over FADE_MS, and the next round appears NEXT_ROUND_GAP_MS
 *   after that.
 * - The time is up first: a mistake, and everything fades out at once; the
 *   next round appears as after one connected.
 *
 * Taps do nothing once the round is over, until the next one appears. As
 * more rounds are played, rounds have more dots (DOTS), up to MOST_DOTS, and
 * less time (TIME_TO_CONNECT), both set in config/difficulty.json (the time
 * longer or shorter at the pace chosen, see the shared pace).
 *
 * When a mistake ends the round, everything stops as it is.
 */

/** How much slower each pace is than the settings here (see config/difficulty.json and the shared pace). */
export const PACE_PERCENTS: PacePercents = DIFFICULTY.makeGoodConnections.paces
checkPaces(PACE_PERCENTS, 'makeGoodConnections.paces')

const { dotsByRounds, timeToConnectMsByRounds } = DIFFICULTY.makeGoodConnections

/** How many dots a round has, by how many rounds were played before it (see config/difficulty.json). */
export const DOTS: StepTable = dotsByRounds
checkStepTable(DOTS, 'makeGoodConnections.dotsByRounds', (value, name) => {
  checkWholeNumber(value, name, 2, MOST_DOTS)
})

/** The time to connect them all, by how many rounds were played before. */
export const TIME_TO_CONNECT: Steps = timeToConnectMsByRounds
checkSteps(TIME_TO_CONNECT, 'makeGoodConnections.timeToConnectMsByRounds', checkPositive)

/** How long everything stays once connected, before it fades out. */
export const CONNECTED_SHOW_MS = 1_500
/** The time between a round having faded out and the next appearing. */
export const NEXT_ROUND_GAP_MS = 500
/** How long a line that went through a wall shows. */
export const WALL_HIT_SHOW_MS = 500

export const POINTS = {
  connected: 1,
} as const

/** A mistake the player can make: a line through a wall, or not connecting them all in time. */
export type Mistake = 'wall' | 'tooSlow'

/** A line that went through a wall, when it did. */
export interface WallHit {
  readonly from: GamePoint
  readonly to: GamePoint
  readonly atMs: number
}

/** One round, from when its dots appear until the next round's do. */
export interface Round extends TimedTurn {
  readonly layout: Layout
  /** The dot the ring showing the time left goes around. */
  readonly ringDot: number
  /** When the dots start to fade in: the time starts then. */
  readonly shownAtMs: number
  readonly timeLimitMs: number
  /** When the time is up. */
  readonly deadlineMs: number
  /** The dots tapped so far (their indexes), in order: the path. */
  path: readonly number[]
  /** The last line that went through a wall, if any. */
  wallHit: WallHit | undefined
  /** When every dot was connected, or the time was up; undefined until then. */
  endedAtMs: number | undefined
  /** When everything starts to fade out; undefined until the round is over. */
  goneAtMs: number | undefined
}

/** How visible `round` is at the round's time `timeMs`: 0 to 1. */
export function roundOpacityAt({ shownAtMs, goneAtMs }: Round, timeMs: number): number {
  return fadeAt({ fromMs: shownAtMs, endedAtMs: goneAtMs }, timeMs)
}

/** The line that went through a wall, while it shows at `timeMs`. */
export function wallHitShownAt({ wallHit }: Round, timeMs: number): WallHit | undefined {
  return wallHit && timeMs < wallHit.atMs + WALL_HIT_SHOW_MS ? wallHit : undefined
}

/** Whether every dot of `round` is on its path. */
export function isConnected({ path, layout }: Round): boolean {
  return path.length === layout.dots.length
}

/** The dot of `round` (its index) a tap at `point` is on, if any: the closest within TAP_RADIUS. */
export function dotAt({ layout }: Round, point: GamePoint): number | undefined {
  const distances = layout.dots.map((dot) => Math.hypot(point.x - dot.x, point.y - dot.y))
  const closest = distances.indexOf(Math.min(...distances))
  return distances[closest] <= TAP_RADIUS ? closest : undefined
}

/** How the rounds went. */
export interface MakeGoodConnectionsStats {
  readonly connected: number
  readonly tooSlow: number
  readonly wallsHit: number
}

export interface MakeGoodConnectionsOptions {
  score: Score
  random?: Random
  /** Called for every mistake. */
  onMistake?: (mistake: Mistake, round: Round) => void
}

export interface MakeGoodConnections {
  /** The round shown; once over, it stays (fading out, then gone) until the next appears. */
  readonly round: Round | undefined
  /** The round's time at the last update. */
  readonly timeMs: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: MakeGoodConnectionsStats
  /** Removes everything. */
  clear(): void
  /** Starts a round at `pace` (Normal if none): the first dots appear straight away. */
  start(pace?: Pace): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** Taps the dot under `point`, if any, at the time of the last update. */
  tap(point: GamePoint): void
  /** Stops the round at once: nothing changes until the next start. */
  stop(): void
}

export function createMakeGoodConnections({
  score,
  random = Math.random,
  onMistake,
}: MakeGoodConnectionsOptions): MakeGoodConnections {
  let round: Round | undefined
  /** When the next round appears; undefined while one is being played. */
  let next: Due | undefined
  let rounds = 0
  let pacing = AS_SET
  let timeMs = 0
  const noStats: MakeGoodConnectionsStats = { connected: 0, tooSlow: 0, wallsHit: 0 }
  let stats = noStats
  /** Set when the round is stopped, even in the middle of a tap. */
  let stopped = false

  function show(atMs: number) {
    const layout = layOutRound(valueAt(DOTS, rounds), random)
    const timeLimitMs = pacing.time(steppedAfter(TIME_TO_CONNECT, rounds))
    round = {
      layout,
      ringDot: randomIndex(random, layout.dots.length),
      shownAtMs: atMs,
      timeLimitMs,
      deadlineMs: atMs + timeLimitMs,
      path: [],
      wallHit: undefined,
      endedAtMs: undefined,
      goneAtMs: undefined,
    }
    rounds++
    next = undefined
  }

  /** `over` is over at `atMs`, to fade out at `goneAtMs`: the next round comes after it. */
  function end(over: Round, atMs: number, goneAtMs: number) {
    over.endedAtMs = atMs
    over.goneAtMs = goneAtMs
    next = { deadlineMs: goneAtMs + FADE_MS + NEXT_ROUND_GAP_MS }
  }

  /** The time is up for `late`. */
  function tooSlow(late: Round) {
    end(late, late.deadlineMs, late.deadlineMs)
    stats = { ...stats, tooSlow: stats.tooSlow + 1 }
    onMistake?.('tooSlow', late)
  }

  /** `current`'s path goes on from its last dot to `dot`, unless a wall is in the way. */
  function connect(current: Round, dot: number) {
    const { dots, walls } = current.layout
    const last = current.path.at(-1)

    if (last !== undefined && walls.some((wall) => goesThrough(dots[last], dots[dot], wall))) {
      current.wallHit = { from: dots[last], to: dots[dot], atMs: timeMs }
      current.path = []
      stats = { ...stats, wallsHit: stats.wallsHit + 1 }
      onMistake?.('wall', current)
      return
    }

    current.path = [...current.path, dot]

    if (isConnected(current)) {
      end(current, timeMs, timeMs + CONNECTED_SHOW_MS)
      stats = { ...stats, connected: stats.connected + 1 }
      score.add(POINTS.connected)
    }
  }

  function clear() {
    round = undefined
    next = undefined
    rounds = 0
    timeMs = 0
    stats = noStats
    stopped = false
  }

  return {
    get round() {
      return round
    },
    get timeMs() {
      return timeMs
    },
    get stats() {
      return stats
    },
    clear,
    start(pace: Pace = 'normal') {
      clear()
      pacing = pacingFor(pace, PACE_PERCENTS)
      show(0)
    },
    update(elapsedMs) {
      if (stopped || !round) {
        return
      }

      timeMs = passDeadlines(elapsedMs, {
        // The time to connect while a round is played, or else when the next one comes.
        current: () => (round?.endedAtMs === undefined ? round : next),
        expire: (due) => {
          if (due === round) {
            tooSlow(round)
          } else {
            show(due.deadlineMs)
          }
        },
        stopped: () => stopped,
      })
    },
    tap(point) {
      if (stopped || !round || round.endedAtMs !== undefined) {
        return
      }

      const dot = dotAt(round, point)

      if (dot === undefined) {
        return
      }

      if (round.path.at(-1) === dot) {
        round.path = round.path.slice(0, -1)
      } else if (!round.path.includes(dot)) {
        connect(round, dot)
      }
    },
    stop() {
      stopped = true
    },
  }
}
