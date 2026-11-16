import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { LARGE_OVAL } from '../shared/artwork'
import { steppedAfter } from '../shared/difficulty'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { createGameLifecycle } from '../shared/game-lifecycle'
import type { GoodOrBadMistake } from '../shared/good-or-bad'
import type { Pace } from '../shared/pace'
import { gapBetweenOvals, playAreaFor } from '../shared/placing'
import { createScore } from '../shared/score'
import { FADE_MS } from '../shared/timed-turns'
import { MAX_SAME_TYPE_IN_A_ROW } from '../shared/word-picker'
import data from './data/pause-before-reacting.json'
import {
  createPauseBeforeReacting,
  EDGE_GAP,
  isOnSituation,
  MOST_ON_SCREEN,
  PLACE_TRIES,
  placeSituation,
  POINTS,
  RECENT_TO_AVOID,
  SITUATION_GAP,
  situationOpacityAt,
  SPAWN_DELAY,
  type PauseBeforeReactingOptions,
  type Situation,
} from './pause-before-reacting'
import { situationsFrom } from './situations'

const situations = situationsFrom(data)

function setup(seed = 1, options: Pick<PauseBeforeReactingOptions, 'onMistake'> = {}) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createPauseBeforeReacting({
    situations,
    score,
    random: seededRandom(seed),
    ...options,
  })
  return { score, game }
}

type Game = ReturnType<typeof setup>['game']

/** Sets up a game that records its mistakes, and starts it. */
function started(seed = 1) {
  const mistakes: { mistake: GoodOrBadMistake; situation: Situation }[] = []
  const played = setup(seed, {
    onMistake: (mistake, situation) => mistakes.push({ mistake, situation }),
  })
  played.game.start()
  return { ...played, mistakes }
}

/** The situations still on screen (not tapped, nor gone). */
const onScreen = (game: Game) => game.situations.filter((s) => s.endedAtMs === undefined)

/** When each situation shown in the first `ms` came: plays in 50 ms steps, tapping nothing. */
function shownTimes(game: Game, ms: number) {
  const seen = new Set<Situation>()
  for (let t = 0; t <= ms; t += 50) {
    game.update(t)
    for (const situation of game.situations) seen.add(situation)
  }
  return [...seen].map((situation) => situation.shownAtMs)
}

/** A made-up situation for the pure helpers: shown at 1 s. */
function situationAt(changes: Partial<Situation> = {}): Situation {
  return {
    word: { text: 'A friend needs a hand', type: 'good' },
    x: 200,
    y: 300,
    shownAtMs: 1_000,
    endedAtMs: undefined,
    end: undefined,
    ...changes,
  }
}

describe('the data', () => {
  it('has 100 good situations and 400 bad ones, all different', () => {
    expect(situations.good).toHaveLength(100)
    expect(situations.bad).toHaveLength(400)
    expect(new Set([...situations.good, ...situations.bad]).size).toBe(500)
    expect(situations.good[0]).toBe('A friend needs a hand')
    expect(situations.bad[0]).toBe('Replay an awkward moment')
  })

  it('reads only the texts', () => {
    expect(
      situationsFrom({
        goodSituations: [{ text: 'Help' }],
        badSituations: [{ text: 'Scroll' }, { text: 'Sulk' }],
      }),
    ).toEqual({ good: ['Help'], bad: ['Scroll', 'Sulk'] })
  })
})

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect(SPAWN_DELAY).toEqual({ start: 3_000, change: -100, every: 10, limit: 2_000 })
    expect([MOST_ON_SCREEN, FADE_MS, RECENT_TO_AVOID]).toEqual([5, 100, 10])
    expect(POINTS).toEqual({ goodTapped: 1 })
    expect([SITUATION_GAP, EDGE_GAP, PLACE_TRIES]).toEqual([15, 4, 500])
  })

  it('brings situations every 3 s, 0.1 s sooner every 10, down to 2 s', () => {
    // The time before the next one, once so many have been shown.
    expect(
      [1, 9, 10, 19, 20, 90, 99, 100, 500].map((shown) => steppedAfter(SPAWN_DELAY, shown)),
    ).toEqual([3_000, 3_000, 2_900, 2_900, 2_800, 2_100, 2_100, 2_000, 2_000])
  })
})

describe('fading, and taps on a situation', () => {
  it('fades a situation in over 0.1 s, and out over 0.1 s once it ends', () => {
    const shown = situationAt()
    const ended = situationAt({ endedAtMs: 5_000, end: 'gone' })

    expect([900, 1_000, 1_050, 1_100, 4_000].map((t) => situationOpacityAt(shown, t))).toEqual([
      0, 0, 0.5, 1, 1,
    ])
    expect([5_000, 5_050, 5_100].map((t) => situationOpacityAt(ended, t))).toEqual([1, 0.5, 0])
  })

  it('counts a tap anywhere on the oval as seen', () => {
    const at = { x: 200, y: 300 }

    expect(isOnSituation(at, at)).toBe(true)
    expect(isOnSituation({ x: 200 + LARGE_OVAL.radiusX * 0.99, y: 300 }, at)).toBe(true)
    expect(isOnSituation({ x: 200 + LARGE_OVAL.radiusX + 1, y: 300 }, at)).toBe(false)
    expect(isOnSituation({ x: 200, y: 300 - LARGE_OVAL.radiusY - 1 }, at)).toBe(false)
  })
})

describe('before the round', () => {
  it('shows nothing, counts nothing, and ignores time and taps', () => {
    const { game, score } = setup()

    game.update(60_000)
    game.tap({ x: 200, y: 400 })

    expect(game.situations).toEqual([])
    expect(game.timeMs).toBe(0)
    expect(game.stats).toEqual({ goodTapped: 0, goodMissed: 0, badTapped: 0, badLetGo: 0 })
    expect(score.value).toBe(0)
  })
})

describe('situations coming', () => {
  it('starts with the first at once, then one every 3 s', () => {
    const { game } = started()

    expect(game.situations).toHaveLength(1)
    expect(game.situations[0]).toMatchObject({ shownAtMs: 0, endedAtMs: undefined })
    expect(shownTimes(game, 12_000)).toEqual([0, 3_000, 6_000, 9_000, 12_000])
  })

  it('comes 0.1 s sooner after every 10 shown', () => {
    const { game } = started()
    const times = shownTimes(game, 60_000)
    const gaps = times.slice(1).map((time, i) => time - times[i])

    expect(gaps.slice(0, 9)).toEqual(Array(9).fill(3_000))
    expect(gaps.slice(9, 19)).toEqual(Array(10).fill(2_900))
    expect(gaps[19]).toBe(2_800)
  })

  it('comes down to every 2 s, and no sooner', () => {
    const { game } = started()
    const times = shownTimes(game, 330_000)
    const gaps = times.slice(1).map((time, i) => time - times[i])

    expect(gaps.slice(99, 110)).toEqual(Array(11).fill(2_000))
    expect(Math.min(...gaps)).toBe(2_000)
  })

  it('comes at its exact time, even over one long frame', () => {
    const { game } = started()

    game.update(10_000)

    expect(game.situations.map((situation) => situation.shownAtMs)).toEqual([
      0, 3_000, 6_000, 9_000,
    ])
    expect(game.timeMs).toBe(10_000)
  })

  it('is good or bad, from the data, 50/50, never more than 4 of a kind in a row', () => {
    const { game } = started(3)
    const words: Situation['word'][] = []
    for (let t = 0; t <= 600_000; t += 1_000) {
      game.update(t)
      for (const situation of game.situations) {
        if (!words.includes(situation.word)) words.push(situation.word)
      }
    }

    const goodShare = words.filter((word) => word.type === 'good').length / words.length
    expect(goodShare).toBeGreaterThan(0.4)
    expect(goodShare).toBeLessThan(0.6)
    let run = 1
    words.forEach((word, i) => {
      run = i > 0 && word.type === words[i - 1].type ? run + 1 : 1
      expect(run).toBeLessThanOrEqual(MAX_SAME_TYPE_IN_A_ROW)
      expect(situations[word.type]).toContain(word.text)
    })
  })

  it('keeps 15 px between situations, border to border, and 4 px from the edges', () => {
    const { game } = started(5)

    for (let t = 0; t <= 120_000; t += 50) {
      game.update(t)
      // Tap one now and then, so some fade out as others come.
      if (t % 7_000 === 0) game.tap(onScreen(game)[0])
      const shown = game.situations.filter((situation) => situationOpacityAt(situation, t) > 0)
      shown.forEach((situation, i) => {
        const { x, y } = situation
        const [halfWidth, halfHeight] = [LARGE_OVAL.width / 2, LARGE_OVAL.height / 2]
        expect(x - halfWidth).toBeGreaterThanOrEqual(EDGE_GAP)
        expect(x + halfWidth).toBeLessThanOrEqual(GAME_WIDTH - EDGE_GAP)
        expect(y - halfHeight).toBeGreaterThanOrEqual(GAME_BAR_HEIGHT + EDGE_GAP)
        expect(y + halfHeight).toBeLessThanOrEqual(GAME_HEIGHT - EDGE_GAP)
        for (const other of shown.slice(i + 1)) {
          const gap = gapBetweenOvals(situation, other, LARGE_OVAL)
          expect(gap).toBeGreaterThanOrEqual(SITUATION_GAP)
        }
      })
    }
  })
})

describe('a full screen', () => {
  it('has at most 5 situations: the oldest goes when another comes', () => {
    const { game } = started()

    game.update(12_000)
    expect(onScreen(game)).toHaveLength(5)
    const oldest = game.situations[0]

    game.update(15_000)

    expect(onScreen(game)).toHaveLength(5)
    expect(oldest).toMatchObject({ endedAtMs: 15_000, end: 'gone' })
    // Fading out at first, then forgotten when the next one comes.
    expect(game.situations).toContain(oldest)
    game.update(18_000)
    expect(game.situations).not.toContain(oldest)
  })

  it('keeps the oldest as long as there is room, tapped ones leaving room', () => {
    const { game } = started()
    game.update(12_000)
    const [oldest, second] = game.situations

    game.tap(second)
    game.update(15_000)

    expect(oldest.endedAtMs).toBeUndefined()
    expect(onScreen(game)).toHaveLength(5)
  })

  it('makes a good one gone a mistake, and a bad one gone nothing', () => {
    const { game, mistakes, score } = started(2)
    const gone: Situation[] = []

    for (let t = 0; t <= 60_000; t += 1_000) {
      game.update(t)
      for (const situation of game.situations) {
        if (situation.end === 'gone' && !gone.includes(situation)) gone.push(situation)
      }
    }

    const goodGone = gone.filter((situation) => situation.word.type === 'good')
    const badGone = gone.filter((situation) => situation.word.type === 'bad')
    expect(goodGone.length).toBeGreaterThan(0)
    expect(badGone.length).toBeGreaterThan(0)
    expect(mistakes).toEqual(goodGone.map((situation) => ({ mistake: 'goodMissed', situation })))
    expect(game.stats).toMatchObject({ goodMissed: goodGone.length, badLetGo: badGone.length })
    expect(score.value).toBe(0)
  })
})

describe('tapping', () => {
  /** A game with a good and a bad situation on screen (the seed decides which come first). */
  function withBoth() {
    const played = started(4)
    let t = 0
    while (
      !onScreen(played.game).some((s) => s.word.type === 'good') ||
      !onScreen(played.game).some((s) => s.word.type === 'bad')
    ) {
      t += 3_000
      played.game.update(t)
    }
    const good = onScreen(played.game).find((s) => s.word.type === 'good')!
    const bad = onScreen(played.game).find((s) => s.word.type === 'bad')!
    return { ...played, good, bad, t }
  }

  it('gives +1 for a good one, which fades out with nothing else', () => {
    const { game, good, score, mistakes, t } = withBoth()

    game.tap(good)

    expect(score.value).toBe(1)
    expect(mistakes).toEqual([])
    expect(good).toMatchObject({ endedAtMs: t, end: 'tapped' })
    expect(game.stats.goodTapped).toBe(1)
    expect(situationOpacityAt(good, t + FADE_MS)).toBe(0)
  })

  it('makes a bad one a mistake, scoring nothing', () => {
    const { game, bad, score, mistakes } = withBoth()

    game.tap(bad)

    expect(score.value).toBe(0)
    expect(mistakes).toEqual([{ mistake: 'badTapped', situation: bad }])
    expect(bad.end).toBe('tapped')
    expect(game.stats.badTapped).toBe(1)
  })

  it('counts a situation only once, and not while it fades out', () => {
    const { game, good, score } = withBoth()

    game.tap(good)
    game.tap(good)

    expect(score.value).toBe(1)
  })

  it('counts from the moment a situation starts to fade in', () => {
    const { game, score } = started()

    game.tap(game.situations[0])

    expect(game.situations[0].end).toBe('tapped')
    expect(score.value + game.stats.badTapped).toBe(1)
  })

  it('does nothing on empty space, even with nothing on screen', () => {
    const { game, score, mistakes } = started()
    game.tap(game.situations[0])
    const before = { score: score.value, mistakes: mistakes.length }

    game.update(1_000)
    game.tap({ x: 5, y: 70 })
    game.tap(game.situations[0])

    expect({ score: score.value, mistakes: mistakes.length }).toEqual(before)
  })
})

describe('placing a situation', () => {
  const staying = [{ x: 100, y: 150 }]
  const fading = [{ x: 300, y: 150 }]

  it('keeps clear of those staying and those fading out', () => {
    const random = seededRandom(9)

    for (let i = 0; i < 50; i++) {
      const spot = placeSituation(staying, fading, random)
      for (const other of [...staying, ...fading]) {
        expect(gapBetweenOvals(spot, other, LARGE_OVAL)).toBeGreaterThanOrEqual(SITUATION_GAP)
      }
    }
  })

  it('lets one that is fading out go first if there is no other room', () => {
    // Only one place ever comes up: where one is fading out.
    const spot = placeSituation([], [{ x: 200, y: 432 }], constantRandom(0.5))

    expect(spot.x).toBeCloseTo(200, 9)
    expect(spot.y).toBeCloseTo(432, 9)
  })

  it('makes do with the clearest place tried if there is no room at all', () => {
    // Places come up in turn at the top left, in the middle and bottom right.
    const numbers = [0, 0, 0.5, 0.5, 1, 1]
    let next = 0
    const random = () => numbers[next++ % numbers.length]
    const area = playAreaFor(LARGE_OVAL, EDGE_GAP)
    const topLeft = { x: area.left, y: area.top }
    const bottomRight = { x: area.right, y: area.bottom }
    // The first two are taken; the last is 5 px from one: too close, but the clearest.
    const taken: GamePoint[] = [
      topLeft,
      { x: 200, y: 432 },
      { x: bottomRight.x, y: bottomRight.y - LARGE_OVAL.height - 5 },
    ]

    const spot = placeSituation(taken, [], random)

    expect(spot.x).toBeCloseTo(bottomRight.x, 9)
    expect(spot.y).toBeCloseTo(bottomRight.y, 9)
  })
})

describe('the round ending', () => {
  it('stops everything as it is on the mistake that ends it, no new one coming', () => {
    const played = setup(2, { onMistake: () => played.game.stop() })
    const { game } = played
    game.start()

    let t = 0
    while (game.stats.goodMissed === 0 && t < 120_000) {
      t += 1_000
      game.update(t)
    }

    const stoppedAt = game.timeMs
    const shown = game.situations.length
    game.update(t + 60_000)
    game.tap(onScreen(game)[0])
    expect(game.timeMs).toBe(stoppedAt)
    expect(game.situations).toHaveLength(shown)
    expect(onScreen(game)).toHaveLength(MOST_ON_SCREEN - 1)
    expect(played.score.value).toBe(0)
  })

  it('starts afresh with the next round', () => {
    const { game } = started()
    game.update(20_000)
    game.tap(onScreen(game)[0])
    game.stop()

    game.start()

    expect(game.situations).toHaveLength(1)
    expect(game.situations[0].shownAtMs).toBe(0)
    expect(game.stats).toEqual({ goodTapped: 0, goodMissed: 0, badTapped: 0, badLetGo: 0 })
    game.update(3_000)
    expect(game.situations).toHaveLength(2)
  })

  it('removes everything when cleared', () => {
    const { game } = started()
    game.update(5_000)

    game.clear()

    expect([game.situations, game.timeMs]).toEqual([[], 0])
  })

  it('works without anyone told about mistakes, and with Math.random', () => {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const game = createPauseBeforeReacting({ situations, score: createScore({ lifecycle }) })
    game.start()

    game.update(60_000)

    expect(game.stats.goodMissed + game.stats.badLetGo).toBeGreaterThan(0)
  })
})

describe('pace', () => {
  it('brings situations 15% less often at Slow, and 15% more often at Fast', () => {
    const second = (['normal', 'slow', 'fast'] as const).map((pace: Pace) => {
      const { game } = setup()
      game.start(pace)
      game.update(4_000)
      return game.situations[1].shownAtMs
    })

    expect(second).toEqual([3_000, expect.closeTo(3_450, 9), expect.closeTo(2_550, 9)])
  })
})
