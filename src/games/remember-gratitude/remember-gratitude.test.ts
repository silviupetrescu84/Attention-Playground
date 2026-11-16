import { describe, expect, it, vi } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { repeatUntil } from '../../test/repeat'
import { steppedAfter } from '../shared/difficulty'
import type { GamePoint } from '../shared/game-canvas'
import { createGameLifecycle } from '../shared/game-lifecycle'
import type { GoodOrBadMistake } from '../shared/good-or-bad'
import type { Pace } from '../shared/pace'
import { gapBetweenOvals } from '../shared/placing'
import type { Random } from '../shared/random'
import { createScore } from '../shared/score'
import { FADE_MS } from '../shared/timed-turns'
import data from './data/remember-gratitude.json'
import { DONE_BUTTON, ovalFor, THING_GAP } from './layout'
import {
  createRememberGratitude,
  doneOpacityAt,
  goodOnesFor,
  hasMistakes,
  isChoosingAt,
  isTextShownAt,
  markOf,
  NEXT_TURN_GAP_MS,
  POINTS,
  REMEMBER_TIME,
  rememberTimeLeftAt,
  REVIEW_MS,
  thingAt,
  THINGS,
  thingsOpacityAt,
  type RememberGratitude,
  type Thing,
  type Turn,
} from './remember-gratitude'
import { thingsFrom } from './things'

const things = thingsFrom(data)
/** The middle of the Done button. */
const DONE: GamePoint = { x: 200, y: DONE_BUTTON.y + DONE_BUTTON.height / 2 }

/**
 * A started game that records its mistakes. `onMistake` runs after each is
 * recorded (e.g. to stop the round, as the shell does).
 */
function started(random: Random = seededRandom(1), onMistake?: (game: RememberGratitude) => void) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const mistakes: { mistake: GoodOrBadMistake; thing: Thing }[] = []
  const game = createRememberGratitude({
    things,
    score,
    random,
    onMistake: (mistake, thing) => {
      mistakes.push({ mistake, thing })
      onMistake?.(game)
    },
  })
  game.start()
  return { game, score, mistakes }
}

/** The turn being played (there is one from the start on). */
const turnOf = (game: RememberGratitude): Turn => game.turn!

const goodOnes = (turn: Turn) => turn.things.filter((thing) => thing.word.type === 'good')
const badOnes = (turn: Turn) => turn.things.filter((thing) => thing.word.type === 'bad')

/** Moves on to when the turn's things turn around. */
function turnAround(game: RememberGratitude) {
  game.update(turnOf(game).choosingAtMs)
}

/**
 * Plays the turn: waits for the things to turn around, taps those `tapping`
 * picks, is done (unless every thing was tapped), and moves on to the next
 * turn. Returns the turn played.
 */
function playTurn(game: RememberGratitude, tapping: (thing: Thing) => boolean = () => false) {
  const turn = turnOf(game)
  turnAround(game)
  for (const thing of turn.things.filter(tapping)) game.tap(thing)
  game.tap(DONE)
  game.update(turn.goneAtMs! + FADE_MS + NEXT_TURN_GAP_MS)
  return turn
}

/** A made-up turn for the pure helpers: shown at 1 s, turned around at 6 s. */
function turnAt(changes: Partial<Turn> = {}): Turn {
  return {
    things: [
      { word: { text: 'A warm hug', type: 'good' }, x: 100, y: 200, end: undefined },
      { word: { text: 'Being insulted', type: 'bad' }, x: 300, y: 500, end: 'tapped' },
    ],
    size: ovalFor(2),
    shownAtMs: 1_000,
    choosingAtMs: 6_000,
    endedAtMs: undefined,
    goneAtMs: undefined,
    ...changes,
  }
}

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect([REVIEW_MS, NEXT_TURN_GAP_MS, FADE_MS]).toEqual([2_000, 500, 100])
    expect(POINTS).toEqual({ goodTapped: 1 })
  })

  it('has 2 things a turn at first, 1 more every 3 turns, up to 8', () => {
    expect(THINGS).toEqual({ start: 2, change: 1, every: 3, limit: 8 })
    const counts = [0, 2, 3, 5, 6, 8, 9, 17, 18, 100].map((turns) => steppedAfter(THINGS, turns))
    expect(counts).toEqual([2, 2, 3, 3, 4, 4, 5, 7, 8, 8])
  })

  it('shows things for 5 s at first, 0.1 s less every 15 turns, down to 4 s', () => {
    expect(REMEMBER_TIME).toEqual({ start: 5_000, change: -100, every: 15, limit: 4_000 })
    const times = [0, 14, 15, 29, 30, 149, 150, 500].map((turns) =>
      steppedAfter(REMEMBER_TIME, turns),
    )
    expect(times).toEqual([5_000, 5_000, 4_900, 4_900, 4_800, 4_100, 4_000, 4_000])
  })
})

describe('good ones', () => {
  it('are one for sure, and each of the others good when chance is under a half', () => {
    const goodFor = (count: number, chance: number) => goodOnesFor(count, constantRandom(chance))

    expect([goodFor(2, 0), goodFor(2, 0.49), goodFor(2, 0.5), goodFor(2, 0.99)]).toEqual([
      2, 2, 1, 1,
    ])
    expect([goodFor(8, 0), goodFor(8, 0.99)]).toEqual([8, 1])
  })

  it('take one chance for each thing but the one good for sure', () => {
    const random = vi.fn(() => 0.3)

    goodOnesFor(5, random)

    expect(random).toHaveBeenCalledTimes(4)
  })

  it('come out 50/50 for each of the others: all good half the time with 2, a quarter with 3', () => {
    const random = seededRandom(3)
    const share = (count: number, good: number) => {
      const turns = 20_000
      const times = Array.from({ length: turns }, () => goodOnesFor(count, random))
      return times.filter((goodOnes) => goodOnes === good).length / turns
    }

    expect(share(2, 2)).toBeCloseTo(0.5, 1)
    expect([share(3, 1), share(3, 2), share(3, 3)].map((s) => Math.round(s * 20) / 20)).toEqual([
      0.25, 0.5, 0.25,
    ])
    expect(share(8, 0)).toBe(0)
  })
})

describe('the helpers', () => {
  it('fade the things in over 0.1 s as they appear, and out over 0.1 s once gone', () => {
    expect([1_000, 1_050, 1_100].map((t) => thingsOpacityAt(turnAt(), t))).toEqual([0, 0.5, 1])
    const over = turnAt({ endedAtMs: 9_000, goneAtMs: 11_000 })
    expect([9_000, 11_000, 11_050, 11_100].map((t) => thingsOpacityAt(over, t))).toEqual([
      1, 1, 0.5, 0,
    ])
  })

  it('run the time to remember out from when the things appear to when they turn around', () => {
    const turn = turnAt()

    expect([0, 1_000, 3_500, 6_000, 9_000].map((t) => rememberTimeLeftAt(turn, t))).toEqual([
      1, 1, 0.5, 0, 0,
    ])
  })

  it('mark good things tapped right, and bad ones tapped or good ones missed wrong', () => {
    const mark = (type: 'good' | 'bad', end: Thing['end']) =>
      markOf({ word: { text: 'x', type }, x: 0, y: 0, end })

    expect([mark('good', 'tapped'), mark('bad', 'tapped'), mark('good', 'gone')]).toEqual([
      'right',
      'wrong',
      'wrong',
    ])
    expect([mark('bad', 'gone'), mark('good', undefined), mark('bad', undefined)]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('tell whether any thing was a mistake', () => {
    const [good, bad] = turnAt().things

    expect(
      hasMistakes([
        { ...good, end: 'tapped' },
        { ...bad, end: 'gone' },
      ]),
    ).toBe(false)
    expect(hasMistakes([{ ...good, end: 'gone' }])).toBe(true)
    expect(hasMistakes([{ ...bad, end: 'tapped' }])).toBe(true)
  })

  it('show the Done button only once the things turn around, fading it in, and out once done', () => {
    expect([1_000, 5_999, 6_000, 6_050, 6_100].map((t) => doneOpacityAt(turnAt(), t))).toEqual([
      0, 0, 0, 0.5, 1,
    ])
    expect(doneOpacityAt(turnAt({ endedAtMs: 9_000 }), 9_100)).toBe(0)
  })

  it('show the texts until the things turn around, and again on those marked', () => {
    const turn = turnAt()
    const [untapped, tapped] = turn.things

    expect([5_999, 6_000].map((t) => isTextShownAt(untapped, turn, t))).toEqual([true, false])
    expect(isTextShownAt(tapped, turn, 9_000)).toBe(true)
    expect(isTextShownAt({ ...untapped, end: 'gone' }, turn, 9_000)).toBe(true)
    expect(isTextShownAt({ ...tapped, end: 'gone' }, turn, 9_000)).toBe(false)
  })

  it('let the player choose from when the things turn around until done', () => {
    expect([5_999, 6_000, 60_000].map((t) => isChoosingAt(turnAt(), t))).toEqual([
      false,
      true,
      true,
    ])
    expect(isChoosingAt(turnAt({ endedAtMs: 9_000 }), 9_000)).toBe(false)
  })

  it('find the thing at a point, on its oval as seen', () => {
    const turn = turnAt()
    const { radiusX } = turn.size

    expect(thingAt(turn, { x: 100, y: 200 })).toBe(turn.things[0])
    expect(thingAt(turn, { x: 100 + radiusX - 1, y: 200 })).toBe(turn.things[0])
    expect(thingAt(turn, { x: 100 + radiusX + 1, y: 200 })).toBeUndefined()
    expect(thingAt(turn, { x: 300, y: 500 })).toBe(turn.things[1])
  })
})

describe('before a round', () => {
  it('has nothing to show, and taps do nothing', () => {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const game = createRememberGratitude({ things, score: createScore({ lifecycle }) })

    game.update(10_000)
    game.tap(DONE)

    expect([game.turn, game.timeMs]).toEqual([undefined, 0])
  })
})

describe('the first turn', () => {
  it('shows one good thing for sure and another at once, apart, for 5 s', () => {
    // Chance says the other is bad.
    const { game } = started()
    const turn = turnOf(game)

    expect(turn).toMatchObject({ shownAtMs: 0, choosingAtMs: 5_000, endedAtMs: undefined })
    expect(turn.size).toBe(ovalFor(2))
    expect(turn.things.map((thing) => thing.word.type).sort()).toEqual(['bad', 'good'])
    expect(things.good).toContain(goodOnes(turn)[0].word.text)
    expect(things.bad).toContain(badOnes(turn)[0].word.text)
    const [a, b] = turn.things
    expect(gapBetweenOvals(a, b, turn.size)).toBeGreaterThanOrEqual(THING_GAP)
  })

  it('can show two good things, if chance says so', () => {
    const { game } = started(constantRandom(0))

    expect(goodOnes(turnOf(game))).toHaveLength(2)
  })

  it('ignores taps on the things and on Done until they turn around', () => {
    const { game, score, mistakes } = started()
    const turn = turnOf(game)
    game.update(REMEMBER_TIME.start - 1)

    for (const thing of turn.things) game.tap(thing)
    game.tap(DONE)

    expect(turn.things.map((thing) => thing.end)).toEqual([undefined, undefined])
    expect(turn.endedAtMs).toBeUndefined()
    expect([score.value, mistakes.length]).toEqual([0, 0])
  })
})

describe('choosing', () => {
  it('gives a point for a good thing tapped', () => {
    const { game, score, mistakes } = started()
    turnAround(game)
    const [good] = goodOnes(turnOf(game))

    game.tap(good)

    expect(good.end).toBe('tapped')
    expect(score.value).toBe(1)
    expect(game.stats).toMatchObject({ goodTapped: 1 })
    expect(mistakes).toEqual([])
  })

  it('counts a bad thing tapped as a mistake', () => {
    const { game, score, mistakes } = started()
    turnAround(game)
    const [bad] = badOnes(turnOf(game))

    game.tap(bad)

    expect(bad.end).toBe('tapped')
    expect(mistakes).toEqual([{ mistake: 'badTapped', thing: bad }])
    expect(score.value).toBe(0)
  })

  it('counts each thing once, however often it is tapped', () => {
    const { game, score, mistakes } = started()
    turnAround(game)
    const turn = turnOf(game)

    for (let i = 0; i < 3; i++) for (const thing of turn.things) game.tap(thing)

    expect([score.value, mistakes.length]).toEqual([1, 1])
  })

  it('does nothing for a tap on nothing', () => {
    const { game, score, mistakes } = started()
    turnAround(game)

    game.tap({ x: 0, y: 0 })

    expect([score.value, mistakes.length, turnOf(game).endedAtMs]).toEqual([0, 0, undefined])
  })
})

describe('being done', () => {
  it('counts every good thing not tapped as a mistake, and bad ones not tapped as fine', () => {
    const { game, mistakes } = started()
    turnAround(game)
    const turn = turnOf(game)

    game.tap(DONE)

    expect(turn.endedAtMs).toBe(REMEMBER_TIME.start)
    expect(markOf(goodOnes(turn)[0])).toBe('wrong')
    expect(mistakes).toEqual([{ mistake: 'goodMissed', thing: goodOnes(turn)[0] }])
    expect(turn.things.map((thing) => thing.end)).toEqual(['gone', 'gone'])
    expect(game.stats).toEqual({ goodTapped: 0, goodMissed: 1, badTapped: 0, badLetGo: 1 })
  })

  it('makes no mistake when every good thing was tapped, and no bad one', () => {
    const { game, score, mistakes } = started()

    playTurn(game, (thing) => thing.word.type === 'good')

    expect([score.value, mistakes.length]).toEqual([1, 0])
  })

  it('ignores taps once done', () => {
    const { game, score } = started()
    turnAround(game)
    const turn = turnOf(game)
    game.tap(DONE)

    for (const thing of goodOnes(turn)) game.tap(thing)

    expect(score.value).toBe(0)
  })

  it('brings the next turn 0.5 s after the things have faded out, at once if all went right', () => {
    const { game } = started()
    turnAround(game)
    const first = turnOf(game)
    game.update(7_000)
    game.tap(goodOnes(first)[0])
    game.tap(DONE)
    expect(first.goneAtMs).toBe(7_000)

    game.update(7_000 + FADE_MS + NEXT_TURN_GAP_MS - 1)
    expect(game.turn).toBe(first)

    game.update(7_600)
    expect(game.turn).not.toBe(first)
    expect(turnOf(game)).toMatchObject({ shownAtMs: 7_600, choosingAtMs: 12_600 })
  })
})

describe('a turn with mistakes', () => {
  it('stays 2 s once over, the good things missed marked, before it fades out', () => {
    const { game } = started()
    turnAround(game)
    const turn = turnOf(game)
    game.update(7_000)

    game.tap(DONE)
    game.update(8_000)

    expect(turn).toMatchObject({ endedAtMs: 7_000, goneAtMs: 9_000 })
    expect(thingsOpacityAt(turn, 9_000)).toBe(1)
    expect(isChoosingAt(turn, 8_000)).toBe(false)
    game.update(9_599)
    expect(game.turn).toBe(turn)
    game.update(9_600)
    expect(game.turn).not.toBe(turn)
  })

  it('stays 2 s too when a bad thing was tapped, and no good one missed', () => {
    const { game } = started()
    turnAround(game)
    const turn = turnOf(game)

    game.tap(badOnes(turn)[0])
    game.tap(goodOnes(turn)[0])

    expect(turn).toMatchObject({
      endedAtMs: REMEMBER_TIME.start,
      goneAtMs: REMEMBER_TIME.start + REVIEW_MS,
    })
  })
})

describe('every thing tapped', () => {
  it('ends the turn without Done, going on at once if all were good', () => {
    // All good: every thing is good once turns have 3 or more things.
    const { game, score, mistakes } = started(constantRandom(0))
    for (let i = 0; i < THINGS.every; i++) playTurn(game, (thing) => thing.word.type === 'good')
    const turn = turnOf(game)
    turnAround(game)

    for (const thing of turn.things) game.tap(thing)

    expect(turn).toMatchObject({ endedAtMs: turn.choosingAtMs, goneAtMs: turn.choosingAtMs })
    expect(mistakes).toEqual([])
    // Both good in each turn of 2 before (chance always says good), then these 3.
    expect(score.value).toBe(2 * THINGS.every + 3)
  })

  it('does not end the turn while any thing is still to tap', () => {
    const { game } = started(constantRandom(0))
    for (let i = 0; i < THINGS.every; i++) playTurn(game, (thing) => thing.word.type === 'good')
    const turn = turnOf(game)
    turnAround(game)

    for (const thing of turn.things.slice(1)) game.tap(thing)

    expect(turn.endedAtMs).toBeUndefined()
  })
})

describe('turns', () => {
  it('get more things as they are played, each turn with at least one good thing', () => {
    const { game } = started(seededRandom(5))

    const turns = Array.from({ length: 35 }, () => playTurn(game))

    turns.forEach((turn, played) => {
      const count = steppedAfter(THINGS, played)
      expect(turn.things, `turn ${played}`).toHaveLength(count)
      expect(turn.size).toBe(ovalFor(count))
      expect(turn.choosingAtMs - turn.shownAtMs).toBe(steppedAfter(REMEMBER_TIME, played))
      expect(goodOnes(turn).length, `turn ${played}`).toBeGreaterThanOrEqual(1)
      const texts = turn.things.map((thing) => thing.word.text)
      expect(new Set(texts).size).toBe(count)
    })
    // Some turns of more than 2 with bad things, some with none.
    const later = turns.slice(THINGS.every)
    expect(later.some((turn) => badOnes(turn).length === 0)).toBe(true)
    expect(later.some((turn) => badOnes(turn).length > 1)).toBe(true)
  })

  it('shows every thing of a kind before any comes back', () => {
    const { game } = started(seededRandom(6))
    const shown: string[] = []

    repeatUntil(
      () => shown.length >= 100,
      () => shown.push(...goodOnes(playTurn(game)).map((thing) => thing.word.text)),
      100,
    )

    expect(new Set(shown.slice(0, 100)).size).toBe(100)
  })
})

describe('stopping', () => {
  it('stops everything as it is on the mistake that ends the round: nothing else counted, no next turn', () => {
    const stopOnMistake = (stopping: RememberGratitude) => stopping.stop()
    // All good: every thing is good once turns have 3 or more things.
    const { game, mistakes } = started(constantRandom(0), stopOnMistake)
    for (let i = 0; i < THINGS.every; i++) playTurn(game, (thing) => thing.word.type === 'good')
    const turn = turnOf(game)
    expect(goodOnes(turn)).toHaveLength(3)
    turnAround(game)

    game.tap(DONE)
    game.update(60_000)
    game.tap(turn.things[2])

    expect(mistakes).toHaveLength(1)
    expect(turn.things.map((thing) => thing.end)).toEqual(['gone', undefined, undefined])
    expect(game.turn).toBe(turn)
    expect(game.timeMs).toBe(turn.choosingAtMs)
  })

  it('ignores taps after a bad thing tapped ends the round', () => {
    const { game, score } = started(seededRandom(1), (stopping) => stopping.stop())
    turnAround(game)
    const turn = turnOf(game)

    game.tap(badOnes(turn)[0])
    game.tap(goodOnes(turn)[0])
    game.tap(DONE)

    expect(score.value).toBe(0)
    expect(turn.endedAtMs).toBeUndefined()
  })

  it('starts afresh: the first turn again, no counts', () => {
    const { game, score } = started()
    for (let i = 0; i < 6; i++) playTurn(game, (thing) => thing.word.type === 'good')
    expect(score.value).toBeGreaterThan(5)

    game.start()

    expect(turnOf(game).things).toHaveLength(2)
    expect(turnOf(game).shownAtMs).toBe(0)
    expect(game.timeMs).toBe(0)
    expect(game.stats).toEqual({ goodTapped: 0, goodMissed: 0, badTapped: 0, badLetGo: 0 })
  })

  it('clears everything', () => {
    const { game } = started()
    game.stop()

    game.clear()
    game.update(10_000)

    expect([game.turn, game.timeMs]).toEqual([undefined, 0])
  })
})

describe('pace', () => {
  it('shows things 15% longer before they turn around at Slow, and 15% less at Fast', () => {
    const turned = (['normal', 'slow', 'fast'] as const).map((pace: Pace) => {
      const { game } = started()
      game.start(pace)
      return turnOf(game).choosingAtMs
    })

    expect(turned).toEqual([5_000, expect.closeTo(5_750, 9), expect.closeTo(4_250, 9)])
  })
})
