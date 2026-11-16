import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { repeatUntil } from '../../test/repeat'
import { steppedAfter } from '../shared/difficulty'
import { createGameLifecycle } from '../shared/game-lifecycle'
import type { Pace } from '../shared/pace'
import type { Random } from '../shared/random'
import { createScore } from '../shared/score'
import { FADE_MS, timeLeftAt } from '../shared/timed-turns'
import { BALL_REACH, createBall, HIGHEST_Y, LOWEST_Y } from './ball'
import {
  createStayInTheZone,
  FIRST_ZONE_MS,
  isBallInZone,
  POINTS,
  STEP_MS,
  TIME_IN_ZONE,
  timeInZoneLeft,
  ZONE_AREA,
  ZONE_GAP_MS,
  ZONE_HEIGHT,
  ZONE_RING_RADIUS,
  ZONE_RING_REACH,
  ZONE_SPACING,
  ZONE_TIME,
  zoneCentre,
  zoneOpacityAt,
  type StayInTheZone,
  type Zone,
} from './stay-in-the-zone'

/**
 * A started game that records its mistakes. Zones are halfway down the space
 * they can be in unless `random` says otherwise. `onMistake` runs after each
 * is recorded (e.g. to stop the round, as the shell does).
 */
function started(random: Random = constantRandom(0.5), onMistake?: (game: StayInTheZone) => void) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const mistakes: Zone[] = []
  const game = createStayInTheZone({
    score,
    random,
    onMistake: (zone) => {
      mistakes.push(zone)
      onMistake?.(game)
    },
  })
  game.start()
  return { game, score, mistakes }
}

/**
 * Plays on to `untilMs` in frames of `frameMs`. While a zone is on, the
 * player keeps the ball in it if `hover` (holding while the ball is below its
 * middle, letting go while above), or does nothing.
 */
function play(game: StayInTheZone, untilMs: number, { hover = false, frameMs = 50 } = {}) {
  for (let t = game.timeMs + frameMs; t <= untilMs; t += frameMs) {
    const zone = game.zone
    if (hover && zone?.endedAtMs === undefined) {
      game.hold(zone !== undefined && game.ball.y > zoneCentre(zone).y)
    }
    game.update(t)
  }
}

/** Plays on in 100 ms frames (the ball left as it is) until `count` zones have come: returns them. */
function zonesShown(game: StayInTheZone, count: number): Zone[] {
  const zones: Zone[] = []
  repeatUntil(
    () => zones.length === count,
    () => {
      game.update(game.timeMs + 100)
      if (game.zone && !zones.includes(game.zone)) zones.push(game.zone)
    },
  )
  return zones
}

/** A made-up zone for the pure helpers: 200 px tall from y = 300, shown at 1 s. */
function zoneAt(changes: Partial<Zone> = {}): Zone {
  return {
    top: 300,
    height: 200,
    shownAtMs: 1_000,
    timeLimitMs: 5_000,
    deadlineMs: 6_000,
    timeInZoneMs: 1_000,
    inZoneMs: 0,
    endedAtMs: undefined,
    outcome: undefined,
    ...changes,
  }
}

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect([FIRST_ZONE_MS, ZONE_GAP_MS, FADE_MS, STEP_MS]).toEqual([1_000, 500, 100, 10])
    expect(POINTS).toEqual({ held: 1 })
  })

  it('makes zones 200 px tall at first, 10 px less every 3 zones, down to 100 px', () => {
    expect(ZONE_HEIGHT).toEqual({ start: 200, change: -10, every: 3, limit: 100 })
    const heights = [0, 2, 3, 5, 6, 29, 30, 500].map((shown) => steppedAfter(ZONE_HEIGHT, shown))
    expect(heights).toEqual([200, 200, 190, 190, 180, 110, 100, 100])
  })

  it('keeps zones for 10 s at first, 0.5 s less every 10 zones, down to 5 s', () => {
    expect(ZONE_TIME).toEqual({ start: 10_000, change: -500, every: 10, limit: 5_000 })
    const times = [0, 9, 10, 19, 20, 99, 100, 500].map((shown) => steppedAfter(ZONE_TIME, shown))
    expect(times).toEqual([10_000, 10_000, 9_500, 9_500, 9_000, 5_500, 5_000, 5_000])
  })

  it('needs the ball in a zone for 1 s at first, 0.1 s more every 10 zones, up to 2 s', () => {
    expect(TIME_IN_ZONE).toEqual({ start: 1_000, change: 100, every: 10, limit: 2_000 })
    const times = [0, 9, 10, 19, 20, 99, 100, 500].map((shown) => steppedAfter(TIME_IN_ZONE, shown))
    expect(times).toEqual([1_000, 1_000, 1_100, 1_100, 1_200, 1_900, 2_000, 2_000])
  })

  it('puts a ring in the middle of each zone, around the ball and its ring, within the shortest zone', () => {
    expect([ZONE_RING_RADIUS, ZONE_RING_REACH]).toEqual([44, 46])
    // Its inside edge clear of the ball's ring…
    expect(ZONE_RING_RADIUS - 2).toBeGreaterThan(BALL_REACH)
    // …and all of it inside a zone of 100 px.
    expect(2 * ZONE_RING_REACH).toBeLessThanOrEqual(100)
  })

  it('keeps zones clear of the ball resting at the top (60 px) and at the bottom (60 px)', () => {
    expect(ZONE_AREA).toEqual({ top: HIGHEST_Y + 30, bottom: LOWEST_Y - 30 })
    expect(ZONE_AREA).toEqual({ top: 132, bottom: 732 })
  })
})

describe('the helpers', () => {
  it('find the middle of a zone, across and down', () => {
    expect(zoneCentre(zoneAt())).toEqual({ x: 200, y: 400 })
  })

  it('count the ball in a zone when any part of it is, but not when it only touches', () => {
    const zone = zoneAt()
    const inZone = (y: number) => isBallInZone(y, zone)

    // Its bottom edge just inside the top of the zone, or its top just inside the bottom.
    expect([inZone(271), inZone(400), inZone(529)]).toEqual([true, true, true])
    // Touching from above or below, or further away.
    expect([inZone(270), inZone(530), inZone(102), inZone(762)]).toEqual([
      false,
      false,
      false,
      false,
    ])
  })

  it('tell how much of the time in the zone is still to go', () => {
    const left = (inZoneMs: number) => timeInZoneLeft(zoneAt({ inZoneMs, timeInZoneMs: 2_000 }))

    expect([left(0), left(500), left(2_000), left(2_500)]).toEqual([1, 0.75, 0, 0])
  })

  it('show a zone fully until it ends, then fade it out over 0.1 s', () => {
    expect(zoneOpacityAt(zoneAt(), 9_000)).toBe(1)
    const ended = zoneAt({ endedAtMs: 3_000 })
    expect([3_000, 3_050, 3_100, 4_000].map((t) => zoneOpacityAt(ended, t))).toEqual([1, 0.5, 0, 0])
  })
})

describe('before a round', () => {
  it('has the ball still at the bottom, and no zone', () => {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const game = createStayInTheZone({ score: createScore({ lifecycle }) })

    game.update(5_000)

    expect([game.ball.y, game.zone, game.timeMs]).toEqual([LOWEST_Y, undefined, 0])
    expect(game.stats).toEqual({ held: 0, missed: 0 })
  })
})

describe('zones coming', () => {
  it('brings the first zone 1 s into the round, not before', () => {
    const { game } = started()

    game.update(FIRST_ZONE_MS - 1)
    expect(game.zone).toBeUndefined()

    game.update(FIRST_ZONE_MS)
    expect(game.zone).toMatchObject({
      shownAtMs: 1_000,
      height: 200,
      timeLimitMs: 10_000,
      deadlineMs: 11_000,
      timeInZoneMs: 1_000,
      inZoneMs: 0,
      endedAtMs: undefined,
      outcome: undefined,
    })
  })

  it('puts each zone at a random height, anywhere in the space zones can be in', () => {
    const topFor = (value: number) => {
      const { game } = started(constantRandom(value))
      game.update(FIRST_ZONE_MS)
      return game.zone!.top
    }

    expect([topFor(0), topFor(0.5), topFor(0.999_999)]).toEqual([132, 332, expect.closeTo(532, 3)])
  })

  it('never puts a zone where the ball is when it rests at the top or at the bottom', () => {
    const { game } = started(seededRandom(7))

    // Every zone missed: 20 of them, shorter and shorter.
    const zones = zonesShown(game, 20)

    for (const zone of zones) {
      expect(zone.top).toBeGreaterThanOrEqual(ZONE_AREA.top)
      expect(zone.top + zone.height).toBeLessThanOrEqual(ZONE_AREA.bottom)
      expect(isBallInZone(HIGHEST_Y, zone), `zone at ${zone.top}`).toBe(false)
      expect(isBallInZone(LOWEST_Y, zone), `zone at ${zone.top}`).toBe(false)
    }
    expect(new Set(zones.map((zone) => zone.top)).size).toBe(20)
  })

  it('puts each zone’s middle at least 100 px from the one before’s, above or below it', () => {
    const { game } = started(seededRandom(11))

    const middles = zonesShown(game, 40).map((zone) => zoneCentre(zone).y)

    expect(ZONE_SPACING).toBe(100)
    const moves = middles.slice(1).map((middle, i) => middle - middles[i])
    for (const move of moves) {
      expect(Math.abs(move)).toBeGreaterThanOrEqual(ZONE_SPACING)
    }
    expect(moves.some((move) => move > 0)).toBe(true)
    expect(moves.some((move) => move < 0)).toBe(true)
  })

  it('brings the next zone 0.5 s after the one before has faded out', () => {
    const { game, mistakes } = started()
    play(game, 11_000)
    const [first] = mistakes

    game.update(11_000 + FADE_MS + ZONE_GAP_MS - 1)
    expect(game.zone).toBe(first)

    game.update(11_600)
    expect(game.zone).not.toBe(first)
    expect(game.zone).toMatchObject({ shownAtMs: 11_600, endedAtMs: undefined })
  })

  it('makes zones shorter, briefer and needing more time in them, by zones shown before', () => {
    const { game } = started(seededRandom(3))

    // Every zone missed, one after another: about 10 s each.
    const zones = zonesShown(game, 31)

    zones.forEach((zone, shown) => {
      expect(zone.height, `zone ${shown}`).toBe(steppedAfter(ZONE_HEIGHT, shown))
      expect(zone.timeLimitMs, `zone ${shown}`).toBe(steppedAfter(ZONE_TIME, shown))
      expect(zone.timeInZoneMs, `zone ${shown}`).toBe(steppedAfter(TIME_IN_ZONE, shown))
    })
    expect(zones.at(-1)).toMatchObject({ height: 100, timeLimitMs: 8_500, timeInZoneMs: 1_300 })
  })
})

describe('keeping the ball in a zone', () => {
  it('holds the zone once the ball has been in it long enough: +1, no mistake', () => {
    const { game, score, mistakes } = started()
    game.update(FIRST_ZONE_MS)
    const zone = game.zone!

    repeatUntil(
      () => zone.outcome !== undefined,
      () => play(game, game.timeMs + 1_000, { hover: true }),
    )

    expect(zone.outcome).toBe('held')
    expect(zone.inZoneMs).toBe(zone.timeInZoneMs)
    expect(zone.endedAtMs! - zone.shownAtMs).toBeGreaterThanOrEqual(1_000)
    expect(zone.endedAtMs).toBeLessThan(zone.deadlineMs)
    expect(score.value).toBe(POINTS.held)
    expect(game.stats).toEqual({ held: 1, missed: 0 })
    expect(mistakes).toEqual([])
  })

  it('ends the zone the moment the ball has been in it long enough, even in the middle of a long frame', () => {
    // The zone is at the very top of its space: 132 to 332. Held from the
    // start, the ball rises into it, and out of it at the top after a while.
    const { game } = started(constantRandom(0))
    const place = { top: 132, height: 200 }
    game.hold(true)
    game.update(FIRST_ZONE_MS)
    const zone = game.zone!
    expect(zone).toMatchObject(place)
    // The same ball, moved in the game's own steps, on its own: when it is first in the zone.
    const ball = createBall()
    ball.hold(true)
    let timeMs = 0
    const moveOn = () => {
      ball.move(STEP_MS)
      timeMs += STEP_MS
    }
    repeatUntil(() => timeMs >= FIRST_ZONE_MS && isBallInZone(ball.y, zoneAt(place)), moveOn)
    const inFromMs = timeMs
    repeatUntil(() => !isBallInZone(ball.y, zoneAt(place)), moveOn)
    const inUntilMs = timeMs
    expect(inUntilMs - inFromMs).toBeGreaterThan(1_000)

    // One long frame into the zone, ending 3 ms into a step…
    game.update(inFromMs + 503)
    expect(zone.inZoneMs).toBe(503)
    // …and one more, in which the time left (497 ms) runs out in the middle of a step.
    game.update(inFromMs + 1_500)

    expect(zone).toMatchObject({
      outcome: 'held',
      inZoneMs: 1_000,
      endedAtMs: inFromMs + 1_000,
    })
  })
})

/**
 * A started game with the ball at the top, above the second zone, out of it:
 * held from the start, it rose through the first zone (at the very top of
 * the space zones can be in), holding it, and stays up. The second zone is
 * as high as it can be, ZONE_SPACING below the first.
 */
function atTheTopAboveAZone() {
  const played = started(constantRandom(0))
  const { game } = played
  game.hold(true)
  play(game, FIRST_ZONE_MS)
  const first = game.zone
  repeatUntil(
    () => game.zone !== first,
    () => play(game, game.timeMs + 50),
  )
  expect(game.stats.held).toBe(1)
  expect(game.ball.y).toBe(HIGHEST_Y)
  expect(isBallInZone(game.ball.y, game.zone!)).toBe(false)
  return { ...played, zone: game.zone! }
}

/** Lets the ball fall into the zone below it, and on for `ms`, then holds it back up to the top. */
function dip(game: StayInTheZone, ms: number) {
  const zone = game.zone!
  game.hold(false)
  repeatUntil(
    () => isBallInZone(game.ball.y, zone),
    () => play(game, game.timeMs + 10, { frameMs: 10 }),
  )
  play(game, game.timeMs + ms)
  game.hold(true)
  repeatUntil(
    () => game.ball.y <= HIGHEST_Y,
    () => play(game, game.timeMs + 50),
  )
}

describe('the time in the zone', () => {
  it('ends a zone at exactly its time in it, with frames of any length, as a browser’s 60 a second', () => {
    const { game } = started()
    const zones = new Set<Zone>()

    repeatUntil(
      () => game.stats.held === 5,
      () => {
        play(game, game.timeMs + 1_000 / 60, { hover: true, frameMs: 1_000 / 60 })
        if (game.zone) zones.add(game.zone)
      },
      60 * 60,
    )

    const ended = [...zones].filter((zone) => zone.outcome !== undefined)
    expect(ended).toHaveLength(5)
    for (const zone of ended) {
      expect(zone.outcome).toBe('held')
      expect(zone.inZoneMs).toBe(zone.timeInZoneMs)
    }
  })

  it('runs out only while the ball is in the zone, and stands still while it is out', () => {
    const { game, zone } = atTheTopAboveAZone()

    dip(game, 200)
    const inZoneMs = zone.inZoneMs
    const ringLeft = timeInZoneLeft(zone)
    const zoneLeft = timeLeftAt(zone, game.timeMs)
    play(game, game.timeMs + 1_000)

    expect(inZoneMs).toBeGreaterThan(0)
    expect(zone.inZoneMs).toBe(inZoneMs)
    expect(timeInZoneLeft(zone)).toBe(ringLeft)
    expect(ringLeft).toBeGreaterThan(0)
    expect(ringLeft).toBeLessThan(1)
    // The zone's own time runs out all the while.
    expect(timeLeftAt(zone, game.timeMs)).toBeCloseTo(zoneLeft - 1_000 / zone.timeLimitMs, 9)
  })

  it('adds up over several goes, until it is long enough', () => {
    const { game, zone } = atTheTopAboveAZone()

    const after = [200, 200].map(() => {
      dip(game, 200)
      return zone.inZoneMs
    })
    repeatUntil(
      () => zone.outcome !== undefined,
      () => dip(game, 200),
      20,
    )

    expect(after[0]).toBeGreaterThan(0)
    expect(after[1]).toBeGreaterThan(after[0])
    expect(zone.outcome).toBe('held')
    expect(zone.inZoneMs).toBe(zone.timeInZoneMs)
  })

  it('holds a zone when the ball has been in it long enough just as its time is up', () => {
    const { game, mistakes } = started(constantRandom(0))
    game.update(FIRST_ZONE_MS)
    // At the very top of the space zones can be in: 132 to 332.
    const zone = game.zone!
    // The same ball on its own, held from the bottom: the steps it takes to be in the zone, and it stays.
    const ball = createBall()
    ball.hold(true)
    let stepsToZone = 0
    repeatUntil(
      () => isBallInZone(ball.y, zone),
      () => {
        ball.move(STEP_MS)
        stepsToZone++
      },
    )
    let stepsIn = 0
    repeatUntil(
      () => !isBallInZone(ball.y, zone),
      () => {
        ball.move(STEP_MS)
        stepsIn++
      },
    )
    expect(stepsIn * STEP_MS).toBeGreaterThan(1_000)
    // Held from when it gets there 1 s before the zone's time is up.
    game.update(zone.deadlineMs - 1_000 - stepsToZone * STEP_MS)
    game.hold(true)

    game.update(zone.deadlineMs)

    expect(zone).toMatchObject({ outcome: 'held', inZoneMs: 1_000, endedAtMs: zone.deadlineMs })
    expect(mistakes).toEqual([])
  })
})

describe('missing a zone', () => {
  it('is a mistake when the zone’s time runs out first, at that very moment', () => {
    const { game, score, mistakes } = started()

    game.update(35_000)

    const [first] = mistakes
    expect(first).toMatchObject({ shownAtMs: 1_000, outcome: 'missed', endedAtMs: 11_000 })
    expect(first.inZoneMs).toBe(0)
    expect(score.value).toBe(0)
    expect(game.stats.missed).toBe(mistakes.length)
    expect(mistakes.map((zone) => zone.endedAtMs)).toEqual([11_000, 21_600, 32_200])
  })

  it('is a mistake even when the ball was in the zone, for too little time', () => {
    const { game, mistakes, zone } = atTheTopAboveAZone()
    dip(game, 200)

    play(game, zone.deadlineMs)
    game.update(zone.deadlineMs)

    expect(mistakes).toEqual([zone])
    expect(zone.outcome).toBe('missed')
    expect(zone.inZoneMs).toBeGreaterThan(0)
    expect(zone.inZoneMs).toBeLessThan(zone.timeInZoneMs)
    expect(game.stats).toEqual({ held: 1, missed: 1 })
  })
})

describe('stopping', () => {
  it('stops everything as it is on the mistake that ends the round: no next zone, the ball held', () => {
    const stopOnMistake = (game: StayInTheZone) => game.stop()
    const played = started(constantRandom(0), stopOnMistake)
    const { game, mistakes } = played
    game.hold(true)

    game.update(60_000)

    // The first zone held on the way up, the second missed with the ball at the top.
    expect(mistakes).toHaveLength(1)
    expect(game.timeMs).toBe(mistakes[0].deadlineMs)
    game.hold(false)
    game.update(90_000)
    expect(game.zone).toBe(mistakes[0])
    expect([game.ball.y, game.ball.held]).toEqual([HIGHEST_Y, true])
  })

  it('starts afresh: the ball at the bottom, no zone, no counts', () => {
    const { game, score } = atTheTopAboveAZone()
    expect(score.value).toBe(1)

    game.start()

    expect([game.ball.y, game.ball.held, game.zone, game.timeMs]).toEqual([
      LOWEST_Y,
      false,
      undefined,
      0,
    ])
    expect(game.stats).toEqual({ held: 0, missed: 0 })
    game.update(FIRST_ZONE_MS)
    expect(game.zone?.height).toBe(200)
  })

  it('clears everything, and waits for the next start', () => {
    const { game } = started()
    game.stop()

    game.clear()
    game.update(5_000)

    expect([game.ball.y, game.zone, game.timeMs]).toEqual([LOWEST_Y, undefined, 0])
    // Holding works again once cleared (nothing is stopped).
    game.hold(true)
    expect(game.ball.held).toBe(true)
  })
})

describe('the ball in the round', () => {
  it('rises while held, and once let go goes on up for a moment before falling back', () => {
    const { game } = started()
    game.hold(true)
    game.update(500)
    const letGoAt = game.ball.y

    game.hold(false)
    game.update(550)
    const justAfter = game.ball.y
    game.update(1_000)

    expect(LOWEST_Y - letGoAt).toBeGreaterThan(30)
    expect(justAfter).toBeLessThan(letGoAt)
    expect(game.ball.y).toBeGreaterThan(letGoAt)
  })
})

describe('pace', () => {
  /** The first zone of a round at `pace`, and where the ball is 1 s in, held from the start. */
  function firstAt(pace: Pace) {
    const { game } = started()
    game.start(pace)
    game.hold(true)
    game.update(FIRST_ZONE_MS)
    return { zone: game.zone!, ballY: game.ball.y }
  }

  it('keeps zones 15% longer and needs the ball in them 15% less at Slow, the other way at Fast', () => {
    const [normal, slow, fast] = (['normal', 'slow', 'fast'] as const).map(firstAt)

    expect([normal.zone.timeLimitMs, slow.zone.timeLimitMs, fast.zone.timeLimitMs]).toEqual([
      10_000,
      expect.closeTo(11_500, 9),
      expect.closeTo(8_500, 9),
    ])
    expect([normal.zone.timeInZoneMs, slow.zone.timeInZoneMs, fast.zone.timeInZoneMs]).toEqual([
      1_000,
      expect.closeTo(850, 9),
      expect.closeTo(1_150, 9),
    ])
  })

  it('moves the ball the same at every pace', () => {
    const [normal, slow, fast] = (['normal', 'slow', 'fast'] as const).map(firstAt)

    expect([slow.ballY, fast.ballY]).toEqual([normal.ballY, normal.ballY])
  })
})
