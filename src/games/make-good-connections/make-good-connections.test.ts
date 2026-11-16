import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../test/random'
import { steppedAfter, valueAt } from '../shared/difficulty'
import { createGameLifecycle } from '../shared/game-lifecycle'
import type { Pace } from '../shared/pace'
import type { Random } from '../shared/random'
import { createScore } from '../shared/score'
import { FADE_MS, timeLeftAt } from '../shared/timed-turns'
import { goesThrough, linesOf, TAP_RADIUS } from './layout'
import {
  CONNECTED_SHOW_MS,
  createMakeGoodConnections,
  dotAt,
  DOTS,
  isConnected,
  NEXT_ROUND_GAP_MS,
  POINTS,
  roundOpacityAt,
  TIME_TO_CONNECT,
  WALL_HIT_SHOW_MS,
  wallHitShownAt,
  type MakeGoodConnections,
  type Mistake,
  type Round,
} from './make-good-connections'

/**
 * A started game that records its mistakes. `onMistake` runs after each is
 * recorded (e.g. to stop the round, as the shell does).
 */
function started(
  random: Random = seededRandom(1),
  onMistake?: (game: MakeGoodConnections) => void,
) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const mistakes: Mistake[] = []
  const game = createMakeGoodConnections({
    score,
    random,
    onMistake: (mistake) => {
      mistakes.push(mistake)
      onMistake?.(game)
    },
  })
  game.start()
  return { game, score, mistakes }
}

/** The round being played (there is one from the start on). */
const roundOf = (game: MakeGoodConnections): Round => game.round!

/** Taps the dots of the round being played, by their indexes, in order. */
function tapDots(game: MakeGoodConnections, dots: readonly number[]) {
  for (const dot of dots) game.tap(roundOf(game).layout.dots[dot])
}

/** Connects every dot along the hidden solution, then moves on to the next round. */
function connectRound(game: MakeGoodConnections) {
  const round = roundOf(game)
  tapDots(game, round.layout.solution)
  game.update(round.goneAtMs! + FADE_MS + NEXT_ROUND_GAP_MS)
  return round
}

/** Moves on to the first round with walls (3 dots). */
function toRoundWithWall(game: MakeGoodConnections) {
  connectRound(game)
  const round = roundOf(game)
  expect(round.layout.walls).toHaveLength(1)
  return round
}

/** A made-up round for the pure helpers: two dots, shown at 1 s, with 7 s to connect them. */
function roundAt(changes: Partial<Round> = {}): Round {
  return {
    layout: {
      dots: [
        { x: 100, y: 200 },
        { x: 300, y: 400 },
      ],
      walls: [],
      solution: [0, 1],
    },
    ringDot: 0,
    shownAtMs: 1_000,
    timeLimitMs: 7_000,
    deadlineMs: 8_000,
    path: [],
    wallHit: undefined,
    endedAtMs: undefined,
    goneAtMs: undefined,
    ...changes,
  }
}

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect([CONNECTED_SHOW_MS, NEXT_ROUND_GAP_MS, WALL_HIT_SHOW_MS, FADE_MS]).toEqual([
      1_500, 500, 500, 100,
    ])
    expect(POINTS).toEqual({ connected: 1 })
  })

  it('has 2 dots in the first round, 3 for the next 5, then 1 more every 5 rounds, up to 8', () => {
    const counts = [0, 1, 5, 6, 10, 11, 15, 16, 21, 25, 26, 500].map((rounds) =>
      valueAt(DOTS, rounds),
    )
    expect(counts).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8])
  })

  it('gives 10 s to connect at first, 0.1 s less every 5 rounds, down to 7 s', () => {
    expect(TIME_TO_CONNECT).toEqual({ start: 10_000, change: -100, every: 5, limit: 7_000 })
    const times = [0, 4, 5, 149, 150, 500].map((rounds) => steppedAfter(TIME_TO_CONNECT, rounds))
    expect(times).toEqual([10_000, 10_000, 9_900, 7_100, 7_000, 7_000])
  })
})

describe('the helpers', () => {
  it('fade a round in over 0.1 s as it appears, and out over 0.1 s once gone', () => {
    expect([1_000, 1_050, 1_100].map((t) => roundOpacityAt(roundAt(), t))).toEqual([0, 0.5, 1])
    const over = roundAt({ endedAtMs: 4_000, goneAtMs: 5_500 })
    expect([5_500, 5_550, 5_600].map((t) => roundOpacityAt(over, t))).toEqual([1, 0.5, 0])
  })

  it('show a line that went through a wall for 0.5 s', () => {
    const hit = { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, atMs: 2_000 }
    const round = roundAt({ wallHit: hit })

    expect([2_000, 2_499, 2_500].map((t) => wallHitShownAt(round, t))).toEqual([
      hit,
      hit,
      undefined,
    ])
    expect(wallHitShownAt(roundAt(), 2_000)).toBeUndefined()
  })

  it('find the dot tapped, within 30 px of its centre', () => {
    const round = roundAt()

    expect(dotAt(round, { x: 100, y: 200 })).toBe(0)
    expect(dotAt(round, { x: 100 + TAP_RADIUS, y: 200 })).toBe(0)
    expect(dotAt(round, { x: 100 + TAP_RADIUS + 1, y: 200 })).toBeUndefined()
    expect(dotAt(round, { x: 290, y: 410 })).toBe(1)
  })

  it('tell when every dot is on the path', () => {
    expect([isConnected(roundAt({ path: [0] })), isConnected(roundAt({ path: [1, 0] }))]).toEqual([
      false,
      true,
    ])
  })
})

describe('before a round', () => {
  it('has nothing to show, and taps do nothing', () => {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const game = createMakeGoodConnections({ score: createScore({ lifecycle }) })

    game.update(10_000)
    game.tap({ x: 200, y: 400 })

    expect([game.round, game.timeMs]).toEqual([undefined, 0])
  })
})

describe('the first round', () => {
  it('has 2 dots, no walls, 10 s to connect them, and the ring around one of them', () => {
    const { game } = started()
    const round = roundOf(game)

    expect(round.layout.dots).toHaveLength(2)
    expect(round.layout.walls).toEqual([])
    expect(round).toMatchObject({ shownAtMs: 0, timeLimitMs: 10_000, deadlineMs: 10_000, path: [] })
    expect([0, 1]).toContain(round.ringDot)
  })

  it('starts a path at the first dot tapped, and connects the second to it: +1', () => {
    const { game, score } = started()
    game.update(1_000)

    tapDots(game, [1])
    expect([roundOf(game).path, score.value]).toEqual([[1], 0])
    tapDots(game, [0])

    const round = roundOf(game)
    expect(round.path).toEqual([1, 0])
    expect(round).toMatchObject({ endedAtMs: 1_000, goneAtMs: 1_000 + CONNECTED_SHOW_MS })
    expect(score.value).toBe(1)
    expect(game.stats).toEqual({ connected: 1, tooSlow: 0, wallsHit: 0 })
  })

  it('stops the ring once connected', () => {
    const { game } = started()
    game.update(5_000)
    tapDots(game, [0, 1])

    game.update(6_000)

    expect(timeLeftAt(roundOf(game), 6_000)).toBeCloseTo(0.5, 9)
  })

  it('stays 1.5 s once connected, ignoring taps, and brings the next round 0.6 s after', () => {
    const { game } = started()
    const first = roundOf(game)
    game.update(1_000)
    tapDots(game, [0, 1])

    tapDots(game, [1])
    game.update(1_000 + CONNECTED_SHOW_MS + FADE_MS + NEXT_ROUND_GAP_MS - 1)
    expect(game.round).toBe(first)
    expect(first.path).toEqual([0, 1])

    game.update(3_100)
    expect(game.round).not.toBe(first)
    expect(roundOf(game)).toMatchObject({ shownAtMs: 3_100, deadlineMs: 13_100 })
    expect(roundOf(game).layout.dots).toHaveLength(3)
  })

  it('ignores taps on nothing', () => {
    const { game } = started()

    game.tap({ x: 0, y: 0 })

    expect(roundOf(game).path).toEqual([])
  })
})

describe('taking dots back', () => {
  it('takes the last dot off the path when tapped again, then the one before, and so on', () => {
    const { game } = started(seededRandom(4))
    const round = toRoundWithWall(game)
    const [a, b] = round.layout.solution
    tapDots(game, [a, b])

    tapDots(game, [b])
    expect(round.path).toEqual([a])
    tapDots(game, [a])
    expect(round.path).toEqual([])
  })

  it('does nothing when a dot on the path but not the last is tapped', () => {
    const { game } = started(seededRandom(4))
    const round = toRoundWithWall(game)
    const [a, b] = round.layout.solution
    tapDots(game, [a, b])

    tapDots(game, [a])

    expect(round.path).toEqual([a, b])
  })
})

describe('walls', () => {
  it('make a line through one a mistake: shown in red, the path taken away, the time still running', () => {
    const { game, mistakes } = started(seededRandom(4))
    const round = toRoundWithWall(game)
    const { dots, walls, solution } = round.layout
    const [start, , end] = solution
    expect(goesThrough(dots[start], dots[end], walls[0])).toBe(true)
    game.update(round.shownAtMs + 2_000)

    tapDots(game, [start, end])

    expect(mistakes).toEqual(['wall'])
    expect(round.path).toEqual([])
    expect(round.wallHit).toEqual({ from: dots[start], to: dots[end], atMs: game.timeMs })
    expect(round).toMatchObject({ endedAtMs: undefined, deadlineMs: round.shownAtMs + 10_000 })
    expect(game.stats.wallsHit).toBe(1)
  })

  it('let the round be done afterwards, through the dot between', () => {
    const { game, score } = started(seededRandom(4))
    const round = toRoundWithWall(game)
    const [start, middle, end] = round.layout.solution
    tapDots(game, [start, end])

    tapDots(game, [start, middle, end])

    expect(isConnected(round)).toBe(true)
    expect(score.value).toBe(2)
  })

  it('never stop the hidden solution, either way round', () => {
    const { game, mistakes } = started(seededRandom(5))

    for (let i = 0; i < 30; i++) {
      const round = roundOf(game)
      const order = i % 2 === 0 ? round.layout.solution : [...round.layout.solution].reverse()
      tapDots(game, order)
      expect(isConnected(round), `round ${i}`).toBe(true)
      game.update(round.goneAtMs! + FADE_MS + NEXT_ROUND_GAP_MS)
    }

    expect(mistakes).toEqual([])
    expect(game.stats.connected).toBe(30)
  })
})

describe('running out of time', () => {
  it('is a mistake, at that very moment: the round fades out at once, the next comes 0.6 s later', () => {
    const { game, mistakes, score } = started()
    const first = roundOf(game)
    tapDots(game, [0])

    game.update(10_000)

    expect(mistakes).toEqual(['tooSlow'])
    expect(first).toMatchObject({ endedAtMs: 10_000, goneAtMs: 10_000 })
    expect(score.value).toBe(0)
    expect(game.stats.tooSlow).toBe(1)
    game.update(10_599)
    expect(game.round).toBe(first)
    game.update(10_600)
    expect(game.round).not.toBe(first)
  })

  it('counts the round as played: the next has the next number of dots', () => {
    const { game } = started()

    game.update(10_600)

    expect(roundOf(game).layout.dots).toHaveLength(3)
  })
})

describe('rounds', () => {
  it('get more dots, 2 fewer walls each, and less time, as they are played', () => {
    const { game } = started(seededRandom(6))

    const rounds = Array.from({ length: 32 }, () => connectRound(game))

    rounds.forEach((round, played) => {
      const count = valueAt(DOTS, played)
      expect(round.layout.dots, `round ${played}`).toHaveLength(count)
      expect(round.layout.walls, `round ${played}`).toHaveLength(count - 2)
      expect(round.timeLimitMs).toBe(steppedAfter(TIME_TO_CONNECT, played))
      expect(round.ringDot).toBeLessThan(count)
      expect(linesOf(round.path)).toHaveLength(count - 1)
    })
    expect(new Set(rounds.map((round) => round.ringDot)).size).toBeGreaterThan(3)
  })
})

describe('stopping', () => {
  it('stops everything as it is on the mistake that ends the round', () => {
    const { game, mistakes } = started(seededRandom(4), (stopping) => stopping.stop())
    const round = toRoundWithWall(game)
    const [start, middle, end] = round.layout.solution
    tapDots(game, [start, end])

    game.update(60_000)
    tapDots(game, [start, middle])

    expect(mistakes).toEqual(['wall'])
    expect(game.round).toBe(round)
    expect(round.path).toEqual([])
    expect(round.endedAtMs).toBeUndefined()
  })

  it('starts afresh: 2 dots again, no counts', () => {
    const { game, score } = started()
    connectRound(game)
    expect(score.value).toBe(1)

    game.start()

    expect(roundOf(game).layout.dots).toHaveLength(2)
    expect([game.timeMs, game.stats]).toEqual([0, { connected: 0, tooSlow: 0, wallsHit: 0 }])
  })

  it('clears everything', () => {
    const { game } = started()
    game.stop()

    game.clear()
    game.update(10_000)

    expect([game.round, game.timeMs]).toEqual([undefined, 0])
  })
})

describe('pace', () => {
  it('gives 15% longer to connect at Slow, and 15% less at Fast', () => {
    const times = (['normal', 'slow', 'fast'] as const).map((pace: Pace) => {
      const { game } = started()
      game.start(pace)
      return roundOf(game).timeLimitMs
    })

    expect(times).toEqual([10_000, expect.closeTo(11_500, 9), expect.closeTo(8_500, 9)])
  })
})
