import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../test/random'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { createGameLifecycle } from '../shared/game-lifecycle'
import { createScore } from '../shared/score'
import data from './data/shift-perspective.json'
import {
  CENTRE,
  CHOICE_DISTANCE,
  CHOICE_RADIUS,
  CHOICE_SIZE,
  CHOICE_STEPS,
  choicePositions,
  choicesAfter,
  choicesOpacityAt,
  createShiftPerspective,
  FADE_MS,
  MIN_TIME_LIMIT_MS,
  MOST_CHOICES,
  POINTS,
  READING_MS,
  START_CHOICES,
  START_TIME_LIMIT_MS,
  THOUGHT_RADIUS,
  THOUGHT_SIZE,
  thoughtOpacityAt,
  THOUGHTS_PER_TIME_STEP,
  TIME_LIMIT_STEP_MS,
  timeLeftAt,
  timeLimitAfter,
  type Mistake,
  type ShiftPerspectiveOptions,
  type Turn,
} from './shift-perspective'
import { thoughtsFrom, type Thought } from './thoughts'

const thoughts = thoughtsFrom(data)

function setup(seed = 1, options: Pick<ShiftPerspectiveOptions, 'onMistake'> = {}) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createShiftPerspective({ thoughts, score, random: seededRandom(seed), ...options })
  return { score, game }
}

type Game = ReturnType<typeof setup>['game']

/** Sets up a game that records its mistakes, and starts it. */
function started(seed = 1) {
  const mistakes: { mistake: Mistake; turn: Turn }[] = []
  const played = setup(seed, { onMistake: (mistake, turn) => mistakes.push({ mistake, turn }) })
  played.game.start()
  return { ...played, mistakes }
}

const goodOf = (turn: Turn) => turn.choices.find((choice) => choice.good)!
const badOf = (turn: Turn) => turn.choices.find((choice) => !choice.good)!

/**
 * Plays until `untilMs` in 10 ms steps, calling `each` after every update;
 * returns every thought shown, in order.
 */
function playAndRecord(game: Game, untilMs: number, each: (game: Game) => void = () => {}) {
  const seen = new Set<Turn>()
  for (let t = 0; t <= untilMs; t += 10) {
    game.update(t)
    each(game)
    if (game.turn) seen.add(game.turn)
  }
  return [...seen]
}

/** Taps the good choice as soon as the thought is fully shown. */
const tapGoodWhenReady = (game: Game) => {
  const turn = game.turn!
  if (game.timeMs >= turn.readyAtMs) game.tap(goodOf(turn))
}

/** A made-up turn for the pure helpers: shown at 1 s, choices at 4 s, 2 s to choose. */
function turnAt(endedAtMs?: number): Turn {
  return {
    thought: 'They did not reply',
    choices: [],
    shownAtMs: 1_000,
    choicesAtMs: 4_000,
    readyAtMs: 4_100,
    timeLimitMs: 2_000,
    deadlineMs: 6_100,
    endedAtMs,
    chosen: undefined,
  }
}

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect(START_CHOICES).toBe(2)
    expect(CHOICE_STEPS).toEqual([
      [3, 3],
      [7, 4],
      [15, 5],
      [25, 6],
    ])
    expect(MOST_CHOICES).toBe(6)
    expect(START_TIME_LIMIT_MS).toBe(10_000)
    expect([TIME_LIMIT_STEP_MS, THOUGHTS_PER_TIME_STEP, MIN_TIME_LIMIT_MS]).toEqual([
      500, 10, 5_000,
    ])
    expect(FADE_MS).toBe(100)
    expect(READING_MS).toBe(3_000)
    expect(POINTS).toEqual({ good: 1 })
  })

  it('has 2 choices, then 3 after 3 thoughts, 4 after 7, 5 after 15 and 6 after 25', () => {
    const counts = Array.from({ length: 27 }, (_, shown) => choicesAfter(shown))

    expect(counts).toEqual([
      ...[2, 2, 2],
      ...[3, 3, 3, 3],
      ...Array(8).fill(4),
      ...Array(10).fill(5),
      ...[6, 6],
    ])
    expect(choicesAfter(1_000)).toBe(6)
  })

  it('gives 10 s to choose, 0.5 s less after every 10 thoughts, down to 5 s', () => {
    expect([0, 9, 10, 19, 20, 30].map(timeLimitAfter)).toEqual([
      10_000, 10_000, 9_500, 9_500, 9_000, 8_500,
    ])
    // 10 steps of 0.5 s: 5 s after 100 thoughts, and never less.
    expect([90, 99, 100, 110, 1_000].map(timeLimitAfter)).toEqual([
      5_500, 5_500, 5_000, 5_000, 5_000,
    ])
  })

  it('can always show one good choice and the rest bad, all different', () => {
    for (const { text, good, bad } of thoughts) {
      expect(good.length, text).toBeGreaterThanOrEqual(1)
      expect(bad.length, text).toBeGreaterThanOrEqual(MOST_CHOICES - 1)
    }
  })

  it('refuses thoughts without enough ways to see them', () => {
    const score = createScore({
      lifecycle: createGameLifecycle({ signal: new AbortController().signal }),
    })
    const fewBad: Thought = { text: 'I made a mistake', good: ['I can learn'], bad: ['a', 'b'] }
    const noGood: Thought = { ...fewBad, good: [], bad: ['a', 'b', 'c', 'd', 'e'] }

    for (const thought of [fewBad, noGood]) {
      expect(() => createShiftPerspective({ thoughts: [thought, thoughts[0]], score })).toThrow(
        new RangeError('"I made a mistake" needs at least 1 good and 5 bad ways to see it'),
      )
    }
  })
})

describe('layout', () => {
  /** The direction from the thought to `point`, in degrees clockwise from straight up. */
  const bearing = ({ x, y }: { x: number; y: number }) =>
    Math.round(((Math.atan2(x - CENTRE.x, -(y - CENTRE.y)) * 180) / Math.PI + 360) % 360)

  it('puts the thought in the middle of the canvas below the score bar', () => {
    expect(CENTRE).toEqual({ x: 200, y: (GAME_BAR_HEIGHT + 800) / 2 })
  })

  it('makes the choices 10% smaller than the thought', () => {
    expect(CHOICE_SIZE).toBeCloseTo(THOUGHT_SIZE * 0.9, 9)
    expect(CHOICE_RADIUS).toBeCloseTo(THOUGHT_RADIUS * 0.9, 9)
  })

  it.each([
    [2, [0, 180]],
    [3, [0, 120, 240]],
    [4, [0, 90, 180, 270]],
    [5, [0, 72, 144, 216, 288]],
    [6, [0, 60, 120, 180, 240, 300]],
  ])('puts %i choices at the corners of a regular shape, one straight up', (count, bearings) => {
    const positions = choicePositions(count)

    expect(positions.map(bearing)).toEqual(bearings)
    for (const position of positions) {
      expect(Math.hypot(position.x - CENTRE.x, position.y - CENTRE.y)).toBeCloseTo(
        CHOICE_DISTANCE,
        9,
      )
    }
  })

  it('puts 2 choices above and below, 3 above, bottom right and bottom left, 4 N E S W', () => {
    const rounded = (count: number) =>
      choicePositions(count).map(({ x, y }) => [Math.round(x), Math.round(y)])
    const [up, right, down, left] = [432 - 134, 200 + 134, 432 + 134, 200 - 134]

    expect(rounded(2)).toEqual([
      [200, up],
      [200, down],
    ])
    expect(rounded(3)).toEqual([
      [200, up],
      [316, 499],
      [84, 499],
    ])
    expect(rounded(4)).toEqual([
      [200, up],
      [right, 432],
      [200, down],
      [left, 432],
    ])
  })

  it.each([2, 3, 4, 5, 6])('keeps %i choices on the canvas, below the bar, apart', (count) => {
    const positions = choicePositions(count)

    for (const { x, y } of positions) {
      // The whole image, glow included.
      expect(x - CHOICE_SIZE / 2).toBeGreaterThanOrEqual(0)
      expect(x + CHOICE_SIZE / 2).toBeLessThanOrEqual(400)
      expect(y - CHOICE_SIZE / 2).toBeGreaterThanOrEqual(GAME_BAR_HEIGHT)
      expect(y + CHOICE_SIZE / 2).toBeLessThanOrEqual(800)
      // Clear of the thought's bubble…
      expect(Math.hypot(x - CENTRE.x, y - CENTRE.y)).toBeGreaterThan(
        THOUGHT_RADIUS + CHOICE_RADIUS + 10,
      )
    }
    // …and of each other.
    positions.forEach((a, i) =>
      positions.slice(i + 1).forEach((b) => {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * CHOICE_RADIUS + 10)
      }),
    )
  })
})

describe('fading', () => {
  it('fades the thought in over 0.1 s, and shows it alone until 3 s after it started', () => {
    const turn = turnAt()
    const times = [900, 1_000, 1_050, 1_100, 3_999]

    expect(times.map((t) => thoughtOpacityAt(turn, t))).toEqual([0, 0, 0.5, 1, 1])
    expect(times.map((t) => choicesOpacityAt(turn, t))).toEqual([0, 0, 0, 0, 0])
  })

  it('then fades the choices in over 0.1 s', () => {
    const turn = turnAt()

    expect([4_000, 4_025, 4_050, 4_100, 5_000].map((t) => choicesOpacityAt(turn, t))).toEqual([
      0, 0.25, 0.5, 1, 1,
    ])
  })

  it('fades the thought and its choices out together over 0.1 s from when it ended', () => {
    const turn = turnAt(5_000)
    const times = [4_500, 5_000, 5_050, 5_100, 6_000]

    expect(times.map((t) => thoughtOpacityAt(turn, t))).toEqual([1, 1, 0.5, 0, 0])
    expect(times.map((t) => choicesOpacityAt(turn, t))).toEqual([1, 1, 0.5, 0, 0])
  })

  it('fades choices that were still fading in out from as far as they got', () => {
    // Chosen when they were 40% in.
    const turn = turnAt(4_040)

    const expected = [0.4, 0.4, 0.4, 0.2, 0]
    ;[4_040, 4_060, 4_090, 4_120, 4_140].forEach((t, i) =>
      expect(choicesOpacityAt(turn, t), `at ${t} ms`).toBeCloseTo(expected[i], 9),
    )
    expect(thoughtOpacityAt(turn, 4_060)).toBeCloseTo(0.8, 9)
  })
})

describe('time left', () => {
  it('is all of it until the choices have faded in, then runs out until the deadline', () => {
    const turn = turnAt()
    const times = [1_000, 4_000, 4_100, 4_600, 5_100, 6_100, 7_000]

    expect(times.map((t) => timeLeftAt(turn, t))).toEqual([1, 1, 1, 0.75, 0.5, 0, 0])
  })

  it('stops running out when the player chooses', () => {
    const turn = turnAt(5_100)

    expect(timeLeftAt(turn, 5_100)).toBe(0.5)
    expect(timeLeftAt(turn, 5_150)).toBe(0.5)
  })
})

describe('before the round', () => {
  it('shows nothing and counts nothing', () => {
    const { game } = setup()

    expect([game.turn, game.previous, game.timeMs]).toEqual([undefined, undefined, 0])
    expect(game.stats).toEqual({ good: 0, bad: 0, tooSlow: 0 })
  })

  it('does nothing if time passes or the canvas is tapped', () => {
    const { game, score } = setup()

    game.update(5_000)
    game.tap(CENTRE)

    expect([game.turn, game.timeMs, score.value]).toEqual([undefined, 0, 0])
  })
})

describe('showing a thought', () => {
  it('starts to show the first thought at once, its 2 choices 3 s later, then 10 s', () => {
    const { game } = started()

    const turn = game.turn!
    expect(thoughts.map((thought) => thought.text)).toContain(turn.thought)
    expect(turn).toMatchObject({
      shownAtMs: 0,
      choicesAtMs: 3_000,
      readyAtMs: 3_100,
      timeLimitMs: 10_000,
      deadlineMs: 13_100,
      endedAtMs: undefined,
      chosen: undefined,
    })
    expect(turn.choices).toHaveLength(2)
    expect(game.previous).toBeUndefined()
  })

  it('offers one good way to see the thought and the rest bad, all different, all its own', () => {
    const { game } = started(2)

    const turns = playAndRecord(game, 200_000, tapGoodWhenReady)

    expect(turns.length).toBeGreaterThan(40)
    for (const turn of turns) {
      const thought = thoughts.find((candidate) => candidate.text === turn.thought)!
      const good = turn.choices.filter((choice) => choice.good).map((choice) => choice.text)
      const bad = turn.choices.filter((choice) => !choice.good).map((choice) => choice.text)
      expect(good).toHaveLength(1)
      expect(thought.good).toContain(good[0])
      expect(bad).toHaveLength(turn.choices.length - 1)
      for (const text of bad) expect(thought.bad).toContain(text)
      expect(new Set(bad).size).toBe(bad.length)
    }
  })

  it('puts the choices at the corners of the shape for their number, the good one anywhere', () => {
    const { game } = started(3)
    const goodPlaces = new Map<number, Set<number>>()

    for (const turn of playAndRecord(game, 300_000, tapGoodWhenReady)) {
      const count = turn.choices.length
      expect(turn.choices.map(({ x, y }) => ({ x, y }))).toEqual(choicePositions(count))
      const places = goodPlaces.get(count) ?? new Set<number>()
      places.add(turn.choices.findIndex((choice) => choice.good))
      goodPlaces.set(count, places)
    }

    // Over many thoughts, the good one has been in every place.
    expect(goodPlaces.get(2)!.size + goodPlaces.get(6)!.size).toBe(2 + 6)
  })

  it('picks the good and bad ways at random from the thought’s', () => {
    const { game } = started(4)
    const used = new Map<string, Set<string>>()

    for (const turn of playAndRecord(game, 1_500_000, tapGoodWhenReady)) {
      const texts = used.get(turn.thought) ?? new Set<string>()
      turn.choices.forEach((choice) => texts.add(choice.text))
      used.set(turn.thought, texts)
    }

    // Thoughts shown again with 6 choices: over all of them, every way was used.
    const allUsed = [...used.values()].filter((texts) => texts.size === 8)
    expect(allUsed.length).toBeGreaterThan(0)
  })

  it('shows every thought once before any comes again', () => {
    const { game } = started(5)

    const shown = playAndRecord(game, 400_000, tapGoodWhenReady).map((turn) => turn.thought)

    expect(shown.length).toBeGreaterThan(100)
    expect(new Set(shown.slice(0, 100)).size).toBe(100)
  })
})

describe('choosing', () => {
  it('gives +1 for the good choice, ends the thought and fades in the next 0.1 s later', () => {
    const { game, score, mistakes } = started()
    const first = game.turn!
    game.update(4_234)

    game.tap(goodOf(first))

    expect(score.value).toBe(1)
    expect(game.stats).toEqual({ good: 1, bad: 0, tooSlow: 0 })
    expect(mistakes).toEqual([])
    expect(first).toMatchObject({ endedAtMs: 4_234, chosen: goodOf(first) })
    expect(game.previous).toBe(first)
    expect(game.turn).not.toBe(first)
    expect(game.turn).toMatchObject({ shownAtMs: 4_334, choicesAtMs: 7_334, readyAtMs: 7_434 })
  })

  it('counts a bad choice as a mistake, scoring nothing', () => {
    const { game, score, mistakes } = started()
    const first = game.turn!
    game.update(3_500)

    game.tap(badOf(first))

    expect(score.value).toBe(0)
    expect(game.stats).toEqual({ good: 0, bad: 1, tooSlow: 0 })
    expect(mistakes).toEqual([{ mistake: 'badChosen', turn: first }])
    expect(first.chosen).toBe(badOf(first))
    expect(game.turn).toMatchObject({ shownAtMs: 3_600 })
  })

  it('counts a tap anywhere on a choice’s bubble, up to its edge', () => {
    const { game } = started()
    const good = goodOf(game.turn!)
    game.update(3_500)

    game.tap({ x: good.x + CHOICE_RADIUS + 0.5, y: good.y })
    expect(game.stats.good).toBe(0)

    game.tap({ x: good.x + CHOICE_RADIUS, y: good.y })
    expect(game.stats.good).toBe(1)
  })

  it('does nothing for a tap on the thought or on empty space', () => {
    const { game, score } = started()
    game.update(3_500)

    for (const point of [CENTRE, { x: 20, y: 120 }, { x: 380, y: 780 }]) game.tap(point)

    expect(game.turn!.endedAtMs).toBeUndefined()
    expect(score.value).toBe(0)
  })

  it('ignores taps while only the thought is shown, for the player to read it', () => {
    const { game } = started()
    const turn = game.turn!

    for (const t of [50, 1_000, 2_999]) {
      game.update(t)
      for (const choice of turn.choices) game.tap(choice)
    }

    expect(turn.endedAtMs).toBeUndefined()
    expect(game.stats).toEqual({ good: 0, bad: 0, tooSlow: 0 })
  })

  it('counts a choice tapped from the moment the choices start to fade in', () => {
    const { game } = started()
    game.update(3_000)

    game.tap(goodOf(game.turn!))

    expect(game.stats.good).toBe(1)
  })

  it('ignores taps while the thought before fades out, and until the next choices come', () => {
    const { game } = started()
    const first = game.turn!
    game.update(4_000)
    game.tap(goodOf(first))
    const second = game.turn!
    expect(second).toMatchObject({ shownAtMs: 4_100, choicesAtMs: 7_100 })

    // Every choice of both thoughts, while the first fades out and the second is read.
    for (const t of [4_050, 4_099, 4_100, 7_099]) {
      game.update(t)
      for (const choice of [...first.choices, ...second.choices]) game.tap(choice)
    }
    expect(game.stats).toEqual({ good: 1, bad: 0, tooSlow: 0 })
    expect(second.endedAtMs).toBeUndefined()

    game.update(7_100)
    game.tap(goodOf(second))
    expect(game.stats.good).toBe(2)
    expect(second.endedAtMs).toBe(7_100)
  })

  it('always matches the score: one point per good choice', () => {
    for (const seed of [1, 2, 3]) {
      const random = seededRandom(seed + 50)
      const { game, score } = started(seed)

      playAndRecord(game, 300_000, () => {
        if (random() < 0.02) game.tap(game.turn!.choices[Math.floor(random() * 6)] ?? CENTRE)
      })

      const { good, bad, tooSlow } = game.stats
      expect(good).toBeGreaterThan(5)
      expect(bad + tooSlow).toBeGreaterThan(5)
      expect(score.value).toBe(good)
    }
  })
})

describe('too slow', () => {
  it('is a mistake when the time is up without a choice; the next fades in 0.1 s later', () => {
    const { game, score, mistakes } = started()
    const first = game.turn!

    game.update(13_099)
    expect(first.endedAtMs).toBeUndefined()

    game.update(13_100)
    expect(mistakes).toEqual([{ mistake: 'tooSlow', turn: first }])
    expect(first).toMatchObject({ endedAtMs: 13_100, chosen: undefined })
    expect(game.stats).toEqual({ good: 0, bad: 0, tooSlow: 1 })
    expect(score.value).toBe(0)
    expect(game.turn).toMatchObject({ shownAtMs: 13_200, deadlineMs: 13_200 + 3_100 + 10_000 })
  })

  it('runs out for every thought due, at its own time, even after a long frame', () => {
    const stepByStep = started(6)
    const oneLongFrame = started(6)

    playAndRecord(stepByStep.game, 400_000)
    oneLongFrame.game.update(400_000)

    expect(oneLongFrame.game.stats.tooSlow).toBeGreaterThan(25)
    expect(oneLongFrame.game.stats).toEqual(stepByStep.game.stats)
    expect(oneLongFrame.game.turn).toEqual(stepByStep.game.turn)
    expect(oneLongFrame.game.previous).toEqual(stepByStep.game.previous)
  })
})

describe('getting harder', () => {
  it('adds choices and takes time away as more thoughts are shown, however they go', () => {
    const { game } = started(7)
    const random = seededRandom(70)
    /** What happens to each thought, decided when it is shown: good, bad or too slow. */
    const fates = new Map<Turn, number>()

    const turns = playAndRecord(game, 1_000_000, () => {
      const turn = game.turn!
      if (!fates.has(turn)) fates.set(turn, Math.floor(random() * 3))
      if (game.timeMs < turn.readyAtMs) return
      if (fates.get(turn) === 0) game.tap(goodOf(turn))
      else if (fates.get(turn) === 1) game.tap(badOf(turn))
    })

    expect(turns.length).toBeGreaterThan(110)
    expect(Object.values(game.stats).every((count) => count > 20)).toBe(true)
    turns.forEach((turn, shownBefore) => {
      expect(turn.choices, `thought ${shownBefore + 1}`).toHaveLength(choicesAfter(shownBefore))
      expect(turn.timeLimitMs, `thought ${shownBefore + 1}`).toBe(timeLimitAfter(shownBefore))
      expect(turn.deadlineMs - turn.readyAtMs).toBe(turn.timeLimitMs)
    })
    expect(turns.at(-1)!.timeLimitMs).toBe(5_000)
  })
})

describe('stopping', () => {
  function stoppingAtFirstMistake(seed = 1) {
    const played = setup(seed, { onMistake: () => played.game.stop() })
    played.game.start()
    return played
  }

  it('keeps the thought of the mistake on screen, fully shown, and brings no next one', () => {
    const { game } = stoppingAtFirstMistake()
    const first = game.turn!
    game.update(3_700)

    game.tap(badOf(first))

    expect(game.turn).toBe(first)
    expect(game.previous).toBeUndefined()
    expect(game.timeMs).toBe(3_700)
    expect(thoughtOpacityAt(first, game.timeMs)).toBe(1)
    expect(choicesOpacityAt(first, game.timeMs)).toBe(1)
  })

  it('stops at the exact moment the time ran out, even in a long frame', () => {
    const { game } = stoppingAtFirstMistake()
    const first = game.turn!

    game.update(60_000)

    expect(game.turn).toBe(first)
    expect(game.timeMs).toBe(first.deadlineMs)
    expect(game.stats).toEqual({ good: 0, bad: 0, tooSlow: 1 })
  })

  it('changes nothing once stopped', () => {
    const { game, score } = started()
    game.update(3_500)
    const before = { ...game.turn! }

    game.stop()
    game.update(60_000)
    game.tap(goodOf(game.turn!))

    expect(game.turn).toEqual(before)
    expect(game.timeMs).toBe(3_500)
    expect(score.value).toBe(0)
  })

  it('plays normally again from the next start', () => {
    const { game } = started()
    game.stop()

    game.start()
    game.update(13_100)

    expect(game.stats.tooSlow).toBe(1)
  })
})

describe('a new round', () => {
  it('starts again from 2 choices and 10 s, with no counts', () => {
    const { game } = started()
    playAndRecord(game, 60_000, tapGoodWhenReady)
    expect(game.turn!.choices.length).toBeGreaterThan(2)

    game.start()

    expect(game.turn).toMatchObject({ shownAtMs: 0, timeLimitMs: 10_000 })
    expect(game.turn!.choices).toHaveLength(2)
    expect(game.previous).toBeUndefined()
    expect(game.timeMs).toBe(0)
    expect(game.stats).toEqual({ good: 0, bad: 0, tooSlow: 0 })
  })

  it('removes everything on clear', () => {
    const { game } = started()
    game.update(5_000)

    game.clear()

    expect([game.turn, game.previous, game.timeMs]).toEqual([undefined, undefined, 0])
    expect(game.stats).toEqual({ good: 0, bad: 0, tooSlow: 0 })
  })
})
