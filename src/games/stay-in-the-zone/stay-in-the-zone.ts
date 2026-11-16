import { DIFFICULTY } from '../../config/difficulty'
import { checkAtLeast, checkAtMost, checkPositive } from '../shared/checks'
import { checkSteps, steppedAfter, type Steps } from '../shared/difficulty'
import { fadedOutAt } from '../shared/feedback'
import { GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { clamp } from '../shared/numbers'
import { AS_SET, checkPaces, pacingFor, type Pace, type PacePercents } from '../shared/pace'
import { randomBetween, randomBetweenAvoiding, type Random } from '../shared/random'
import type { Score } from '../shared/score'
import { TIME_RING_WIDTH } from '../shared/time-ring'
import { FADE_MS, type TimedTurn } from '../shared/timed-turns'
import { BALL_RADIUS, BALL_REACH, createBall, HIGHEST_Y, LOWEST_Y, type Ball } from './ball'

/**
 * The rules of Stay in the Zone.
 *
 * The player moves a ball up and down (see ball.ts): holding anywhere on the
 * game makes it rise, letting go makes it fall.
 *
 * FIRST_ZONE_MS into the round, a green zone appears across the canvas at a
 * random height (each at least ZONE_SPACING from the one before, middle to
 * middle), with a ring in its middle that runs out with the zone's time
 * (ZONE_TIME). A white ring around the ball shows the time the ball must
 * spend in the zone (TIME_IN_ZONE): it runs out while any part of the ball is
 * in the zone, and stands still while none is. That time need not be in one
 * go. Zones are never where the ball is when it rests at the top or at the
 * bottom, so it cannot be kept in one by resting there.
 *
 * - The white ring runs out first: the zone is held, +1.
 * - The zone's ring runs out first: a mistake (see onMistake).
 *
 * Either way the zone and both rings fade out over FADE_MS, and the next
 * zone appears ZONE_GAP_MS after that. As more are shown, zones get shorter
 * (ZONE_HEIGHT), stay for less time, and need the ball in them for longer,
 * all set in config/difficulty.json. At a slower pace (see the shared pace)
 * zones stay longer and need the ball in them for less time; at a faster
 * one, the other way round. The ball moves the same at every pace.
 *
 * Everything moves on in steps of at most STEP_MS, and a zone ends at the
 * exact moment one of its rings runs out, even in the middle of a long
 * frame. When a mistake ends the round, everything stops as it is.
 */

/** When the first zone appears, into the round. */
export const FIRST_ZONE_MS = 1_000

/** The time between a zone having faded out and the next appearing. */
export const ZONE_GAP_MS = 500

/** Everything moves on in steps of at most this much. */
export const STEP_MS = 10

/** How far a zone's middle is at least from the middle of the one before. */
export const ZONE_SPACING = 100

export const POINTS = {
  held: 1,
} as const

/** The middle of the ring in the zone's middle: around the ball and its ring, clear of them… */
export const ZONE_RING_RADIUS = BALL_REACH + 6
/** …so the ring reaches this far from the zone's middle. */
export const ZONE_RING_REACH = ZONE_RING_RADIUS + TIME_RING_WIDTH / 2

/**
 * Where zones can be, top to bottom: below where the ball's bottom is when it
 * rests at the top, and above where its top is when it rests at the bottom.
 */
export const ZONE_AREA = {
  top: HIGHEST_Y + BALL_RADIUS,
  bottom: LOWEST_Y - BALL_RADIUS,
} as const

/** How much slower each pace is than the settings here (see config/difficulty.json and the shared pace). */
export const PACE_PERCENTS: PacePercents = DIFFICULTY.stayInTheZone.paces
checkPaces(PACE_PERCENTS, 'stayInTheZone.paces')

const { zoneHeightByZones, zoneTimeMsByZones, timeInZoneMsByZones } = DIFFICULTY.stayInTheZone

/** How tall a zone is, by how many were shown before it (see config/difficulty.json). */
export const ZONE_HEIGHT: Steps = zoneHeightByZones
checkSteps(ZONE_HEIGHT, 'stayInTheZone.zoneHeightByZones', (value, name) => {
  checkAtLeast(value, name, 2 * ZONE_RING_REACH, 'the ring in its middle')
  // Room for the next one's middle ZONE_SPACING from this one's, wherever this one is.
  const room = ZONE_AREA.bottom - ZONE_AREA.top - 2 * ZONE_SPACING
  checkAtMost(value, name, room, 'the space zones can be in, less ZONE_SPACING each way')
})

/** How long a zone stays, by how many were shown before it. */
export const ZONE_TIME: Steps = zoneTimeMsByZones
checkSteps(ZONE_TIME, 'stayInTheZone.zoneTimeMsByZones', checkPositive)

/** How long the ball must be in a zone, by how many were shown before it. */
export const TIME_IN_ZONE: Steps = timeInZoneMsByZones
checkSteps(TIME_IN_ZONE, 'stayInTheZone.timeInZoneMsByZones', checkPositive)

// Steps only go one way, so their shortest and longest are at their ends.
checkAtLeast(
  Math.min(ZONE_TIME.start, ZONE_TIME.limit),
  'stayInTheZone.zoneTimeMsByZones at its shortest',
  Math.max(TIME_IN_ZONE.start, TIME_IN_ZONE.limit),
  'the longest stayInTheZone.timeInZoneMsByZones',
)

/** How a zone ended: the ball was in it long enough (held) or not (missed). */
export type ZoneOutcome = 'held' | 'missed'

/** One zone, from when it appears until the next one does. */
export interface Zone extends TimedTurn {
  /** Where its top is… */
  readonly top: number
  /** …and how tall it is. It goes all the way across. */
  readonly height: number
  /** When it appears: its time starts then. */
  readonly shownAtMs: number
  readonly timeLimitMs: number
  /** When its time is up. */
  readonly deadlineMs: number
  /** How long the ball must be in it. */
  readonly timeInZoneMs: number
  /** How long the ball has been in it so far. */
  inZoneMs: number
  /** When it was held or missed, and starts to fade out; undefined until then. */
  endedAtMs: number | undefined
  outcome: ZoneOutcome | undefined
}

/** The middle of `zone`, where its ring is. */
export function zoneCentre({ top, height }: Zone): GamePoint {
  return { x: GAME_WIDTH / 2, y: top + height / 2 }
}

/** Whether any part of a ball with its centre at `ballY` is in `zone` (only touching is not). */
export function isBallInZone(ballY: number, { top, height }: Zone): boolean {
  return ballY + BALL_RADIUS > top && ballY - BALL_RADIUS < top + height
}

/** How much of the time the ball must spend in `zone` is still to go: 1 (all) to 0 (none). */
export function timeInZoneLeft({ inZoneMs, timeInZoneMs }: Zone): number {
  return clamp(1 - inZoneMs / timeInZoneMs, 0, 1)
}

/** How visible `zone` (and both rings) is at `timeMs`: fully until it ends, then fading out. */
export function zoneOpacityAt({ endedAtMs }: Zone, timeMs: number): number {
  return endedAtMs === undefined ? 1 : fadedOutAt(endedAtMs, timeMs)
}

/** How the zones went in a round. */
export interface StayInTheZoneStats {
  readonly held: number
  readonly missed: number
}

export interface StayInTheZoneOptions {
  score: Score
  random?: Random
  /** Called for every zone missed. */
  onMistake?: (zone: Zone) => void
}

export interface StayInTheZone {
  readonly ball: Ball
  /** The zone shown; once over, it stays (fading out, then gone) until the next appears. */
  readonly zone: Zone | undefined
  /** The round's time at the last update. */
  readonly timeMs: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: StayInTheZoneStats
  /** Removes the zone, and puts the ball back at the bottom. */
  clear(): void
  /** Starts a round at `pace` (Normal if none): the first zone appears FIRST_ZONE_MS later. */
  start(pace?: Pace): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** The player holds a finger down (the ball rises), or lets go (it falls). */
  hold(held: boolean): void
  /** Stops the round at once: nothing changes until the next start. */
  stop(): void
}

export function createStayInTheZone({
  score,
  random = Math.random,
  onMistake,
}: StayInTheZoneOptions): StayInTheZone {
  let ball = createBall()
  let zone: Zone | undefined
  /** When the next zone appears; undefined while one is on, and before the round starts. */
  let nextAtMs: number | undefined
  let shown = 0
  let pacing = AS_SET
  let timeMs = 0
  const noStats: StayInTheZoneStats = { held: 0, missed: 0 }
  let stats = noStats
  let started = false
  /** Set when the round is stopped, even in the middle of an update. */
  let stopped = false

  function show(atMs: number) {
    const height = steppedAfter(ZONE_HEIGHT, shown)
    const timeLimitMs = pacing.time(steppedAfter(ZONE_TIME, shown))
    // Where its middle can be, for all of it to be in ZONE_AREA…
    const highest = ZONE_AREA.top + height / 2
    const lowest = ZONE_AREA.bottom - height / 2
    // …and ZONE_SPACING from the one before's, if any.
    const middle = zone
      ? randomBetweenAvoiding(random, highest, lowest, zoneCentre(zone).y, ZONE_SPACING)
      : randomBetween(random, highest, lowest)
    zone = {
      top: middle - height / 2,
      height,
      shownAtMs: atMs,
      timeLimitMs,
      deadlineMs: atMs + timeLimitMs,
      timeInZoneMs: pacing.timeNeeded(steppedAfter(TIME_IN_ZONE, shown)),
      inZoneMs: 0,
      endedAtMs: undefined,
      outcome: undefined,
    }
    shown++
    nextAtMs = undefined
  }

  /** Ends `over` at `atMs`, held or missed, and sets when the next zone appears. */
  function end(over: Zone, outcome: ZoneOutcome, atMs: number) {
    over.endedAtMs = atMs
    over.outcome = outcome
    nextAtMs = atMs + FADE_MS + ZONE_GAP_MS

    if (outcome === 'held') {
      stats = { ...stats, held: stats.held + 1 }
      score.add(POINTS.held)
    } else {
      stats = { ...stats, missed: stats.missed + 1 }
      onMistake?.(over)
    }
  }

  /**
   * Moves everything on by one step, up to `elapsedMs`: no further than
   * STEP_MS, nor past the moment anything happens (a zone appears, its time
   * is up, or the ball has been in it long enough). Whether the ball is in
   * the zone is judged where it is as the step starts.
   */
  function step(elapsedMs: number) {
    const active = zone?.endedAtMs === undefined ? zone : undefined
    const inZone = active !== undefined && isBallInZone(ball.y, active)
    const longEnoughAtMs =
      active && inZone ? timeMs + active.timeInZoneMs - active.inZoneMs : Infinity
    const toMs = Math.min(
      elapsedMs,
      timeMs + STEP_MS,
      nextAtMs ?? Infinity,
      active?.deadlineMs ?? Infinity,
      longEnoughAtMs,
    )

    ball.move(toMs - timeMs)
    if (active && inZone) {
      // Exactly all of it when the step ends there: rounding must never leave it a
      // hair short, or the next step would be too short to count, and the game stuck.
      active.inZoneMs =
        toMs === longEnoughAtMs ? active.timeInZoneMs : active.inZoneMs + (toMs - timeMs)
    }
    timeMs = toMs

    // Long enough in it just as its time is up: held.
    if (active && active.inZoneMs >= active.timeInZoneMs) {
      end(active, 'held', timeMs)
    } else if (active && timeMs >= active.deadlineMs) {
      end(active, 'missed', timeMs)
    } else if (timeMs === nextAtMs) {
      show(timeMs)
    }
  }

  function clear() {
    ball = createBall()
    zone = undefined
    nextAtMs = undefined
    shown = 0
    timeMs = 0
    stats = noStats
    started = false
    stopped = false
  }

  return {
    get ball() {
      return ball
    },
    get zone() {
      return zone
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
      started = true
      nextAtMs = FIRST_ZONE_MS
    },
    update(elapsedMs) {
      while (started && !stopped && timeMs < elapsedMs) {
        step(elapsedMs)
      }
    },
    hold(held) {
      if (!stopped) {
        ball.hold(held)
      }
    },
    stop() {
      stopped = true
    },
  }
}
