import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { steppedAfter } from '../shared/difficulty'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { createGameLifecycle } from '../shared/game-lifecycle'
import type { GoodOrBadMistake } from '../shared/good-or-bad'
import type { Random } from '../shared/random'
import { createScore } from '../shared/score'
import { MAX_SAME_TYPE_IN_A_ROW } from '../shared/word-picker'
import data from './data/improve-inner-voice.json'
import {
  COLUMNS,
  columnsAfter,
  createImproveInnerVoice,
  FADE_MS,
  FALL_SPEED,
  MIN_COLUMN_GAP,
  padTouches,
  POINTS,
  RECENT_TO_AVOID,
  SPAWN_DELAY,
  START_Y,
  STEP_MS,
  WORD_OVAL,
  wordOpacityAt,
  type FallingWord,
  type ImproveInnerVoiceOptions,
} from './improve-inner-voice'
import { createPad } from './pad'
import { wordsFrom } from './words'

const words = wordsFrom(data)

function setup(
  random: Random = seededRandom(1),
  options: Pick<ImproveInnerVoiceOptions, 'onMistake'> = {},
) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createImproveInnerVoice({ words, score, random, ...options })
  return { score, game }
}

type Game = ReturnType<typeof setup>['game']

/** Sets up a game that records its mistakes, and starts it. */
function started(random?: Random) {
  const mistakes: { mistake: GoodOrBadMistake; word: string }[] = []
  const played = setup(random, {
    onMistake: (mistake, falling) => mistakes.push({ mistake, word: falling.word.text }),
  })
  played.game.start()
  return { ...played, mistakes }
}

/** Every word that has come by now, in order, playing in 50 ms frames (the pad left as it is). */
function playAndRecord(game: Game, untilMs: number) {
  const seen = new Set<FallingWord>()
  for (let t = 0; t <= untilMs; t += 50) {
    game.update(t)
    for (const falling of game.words) seen.add(falling)
  }
  return [...seen]
}

/** A made-up word for the pure helpers: shown at 1 s. */
function wordAt(changes: Partial<FallingWord> = {}): FallingWord {
  return {
    word: { text: 'capable', type: 'good' },
    column: 3,
    x: 200,
    y: 300,
    speed: 40,
    shownAtMs: 1_000,
    endedAtMs: undefined,
    end: undefined,
    ...changes,
  }
}

describe('the words', () => {
  it('are 100 helpful (good) and 100 unhelpful (bad), all different', () => {
    expect(words.good).toHaveLength(100)
    expect(words.bad).toHaveLength(100)
    expect(new Set([...words.good, ...words.bad]).size).toBe(200)
    expect([words.good[0], words.bad[0]]).toEqual(['capable', 'worthless'])
  })

  it('are read from the data as they are', () => {
    expect(wordsFrom({ helpfulWords: ['calm'], unhelpfulWords: ['weak', 'lost'] })).toEqual({
      good: ['calm'],
      bad: ['weak', 'lost'],
    })
  })
})

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect(SPAWN_DELAY).toEqual({ start: 3_000, change: -100, every: 10, limit: 2_000 })
    expect(FALL_SPEED).toEqual({ start: 40, change: 10, every: 10, limit: 140 })
    expect([FADE_MS, STEP_MS, RECENT_TO_AVOID, MIN_COLUMN_GAP]).toEqual([100, 10, 10, 2])
    expect(POINTS).toEqual({ goodTapped: 1 })
  })

  it('puts words in ovals a quarter of the canvas wide, starting just below the score bar', () => {
    expect(WORD_OVAL.width).toBe(100)
    expect(WORD_OVAL.height).toBeCloseTo(55, 9)
    expect(START_Y - WORD_OVAL.height / 2).toBeCloseTo(GAME_BAR_HEIGHT, 9)
  })

  it('brings words down in 7 columns, 1/8 to 7/8 of the way across, all on the canvas', () => {
    expect(COLUMNS).toEqual([50, 100, 150, 200, 250, 300, 350])
    expect(COLUMNS[0] - WORD_OVAL.width / 2).toBe(0)
    expect(COLUMNS[6] + WORD_OVAL.width / 2).toBe(400)
  })

  it('lets each word come at least 2 columns from the one before', () => {
    expect(columnsAfter(undefined)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(columnsAfter(0)).toEqual([2, 3, 4, 5, 6])
    expect(columnsAfter(3)).toEqual([0, 1, 5, 6])
    expect(columnsAfter(6)).toEqual([0, 1, 2, 3, 4])
  })

  it('makes words fall faster by 10 px/s every 10, up to 140', () => {
    const before = [0, 9, 10, 19, 20, 99, 100, 500]
    expect(before.map((count) => steppedAfter(FALL_SPEED, count))).toEqual([
      40, 40, 50, 50, 60, 130, 140, 140,
    ])
  })
})

describe('fading, and touching the pad', () => {
  it('fades a word in over 0.1 s, and out over 0.1 s once caught', () => {
    const falling = wordAt()
    const caught = wordAt({ endedAtMs: 5_000, end: 'tapped' })

    expect([1_000, 1_050, 1_100].map((t) => wordOpacityAt(falling, t))).toEqual([0, 0.5, 1])
    expect([5_000, 5_050, 5_100].map((t) => wordOpacityAt(caught, t))).toEqual([1, 0.5, 0])
  })

  it('counts any overlap of the pad and the oval as seen', () => {
    const pad = createPad()
    const { radiusX, radiusY } = WORD_OVAL

    // Just above the pad, then just into it.
    expect(padTouches(pad, { x: 200, y: 748 - radiusY - 0.5 })).toBe(false)
    expect(padTouches(pad, { x: 200, y: 748 - radiusY + 0.5 })).toBe(true)
    // Beside the pad, level with it.
    expect(padTouches(pad, { x: 250 + radiusX - 0.5, y: 762 })).toBe(true)
    expect(padTouches(pad, { x: 250 + radiusX + 0.5, y: 762 })).toBe(false)
  })
})

describe('before the round', () => {
  it('shows only the pad, counts nothing, and ignores time', () => {
    const { game, score } = setup()

    game.update(60_000)

    expect(game.words).toEqual([])
    expect(game.pad.x).toBe(200)
    expect(game.timeMs).toBe(0)
    expect(game.stats).toEqual({ goodTapped: 0, goodMissed: 0, badTapped: 0, badLetGo: 0 })
    expect(score.value).toBe(0)
  })
})

describe('words coming', () => {
  it('starts with the first at once, just below the score bar, then one every 3 s', () => {
    const { game } = started()

    expect(game.words).toHaveLength(1)
    expect(game.words[0]).toMatchObject({ y: START_Y, shownAtMs: 0, speed: 40 })
    expect(COLUMNS).toContain(game.words[0].x)
    const times = playAndRecord(game, 12_000).map((falling) => falling.shownAtMs)
    expect(times).toEqual([0, 3_000, 6_000, 9_000, 12_000])
  })

  it('comes 0.1 s sooner every 10, down to every 2 s', () => {
    const { game } = started()
    const times = playAndRecord(game, 330_000).map((falling) => falling.shownAtMs)
    const gaps = times.slice(1).map((time, i) => time - times[i])

    expect(gaps.slice(0, 9)).toEqual(Array<number>(9).fill(3_000))
    expect(gaps.slice(9, 19)).toEqual(Array<number>(10).fill(2_900))
    expect(gaps.slice(99, 110)).toEqual(Array<number>(11).fill(2_000))
  })

  it('falls 10 px/s faster every 10, up to 140, each keeping its own speed', () => {
    const { game } = started()
    const all = playAndRecord(game, 330_000)

    expect(all.slice(0, 10).map((falling) => falling.speed)).toEqual(Array<number>(10).fill(40))
    expect(all[10].speed).toBe(50)
    expect(all[100].speed).toBe(140)
    expect(Math.max(...all.map((falling) => falling.speed))).toBe(140)
  })

  it('falls at its own speed', () => {
    const { game } = started()

    game.update(1_000)

    expect(game.words[0].y).toBeCloseTo(START_Y + 40, 9)
  })

  it('comes down at least 2 columns from the one before, in every column over time', () => {
    const { game } = started(seededRandom(3))
    const columns = playAndRecord(game, 200_000).map((falling) => falling.column)

    columns.slice(1).forEach((column, i) => {
      expect(Math.abs(column - columns[i])).toBeGreaterThanOrEqual(2)
    })
    expect(new Set(columns).size).toBe(7)
  })

  it('is good or bad, 50/50, never more than 4 of a kind in a row', () => {
    const { game } = started(seededRandom(4))
    const all = playAndRecord(game, 400_000).map((falling) => falling.word)

    const goodShare = all.filter((word) => word.type === 'good').length / all.length
    expect(goodShare).toBeGreaterThan(0.4)
    expect(goodShare).toBeLessThan(0.6)
    let run = 1
    all.forEach((word, i) => {
      run = i > 0 && word.type === all[i - 1].type ? run + 1 : 1
      expect(run).toBeLessThanOrEqual(MAX_SAME_TYPE_IN_A_ROW)
      expect(words[word.type]).toContain(word.text)
    })
  })
})

describe('catching and missing', () => {
  // Always 0: good words in columns 0, 2, 0, 2…, the fifth one bad (column 0).
  const leftSide = () => constantRandom(0)

  it('gives +1 for a good word caught, which stops where it is and fades out', () => {
    const { game, score, mistakes } = started(leftSide())
    game.drag({ x: 50, y: 700 })
    const first = game.words[0]

    let t = 0
    while (first.end === undefined) game.update((t += 50))

    expect(first).toMatchObject({ end: 'tapped', word: { type: 'good' } })
    expect(score.value).toBe(1)
    expect(mistakes).toEqual([])
    const caughtAt = first.y
    game.update(t + 500)
    expect(first.y).toBe(caughtAt)
    expect(wordOpacityAt(first, first.endedAtMs! + FADE_MS)).toBe(0)
  })

  it('makes a bad word caught, and a good one fallen off, mistakes', () => {
    const { game, score, mistakes } = started(leftSide())
    game.drag({ x: 50, y: 700 })
    // Words 1 to 5: good in columns 0, 2, 0, 2, then bad in column 0.
    const firstFive: FallingWord[] = []
    let t = 0
    while (firstFive.length < 5) {
      game.update((t += 50))
      for (const falling of game.words) if (!firstFive.includes(falling)) firstFive.push(falling)
    }
    const fifth = firstFive[4]

    while (fifth.end === undefined) game.update((t += 50))

    expect(firstFive.map((falling) => [falling.word.type, falling.column, falling.end])).toEqual([
      ['good', 0, 'tapped'],
      ['good', 2, 'gone'],
      ['good', 0, 'tapped'],
      ['good', 2, 'gone'],
      ['bad', 0, 'tapped'],
    ])
    expect(game.stats).toEqual({ goodTapped: 2, goodMissed: 2, badTapped: 1, badLetGo: 0 })
    expect(score.value).toBe(2)
    expect(mistakes.map((mistake) => mistake.mistake)).toEqual([
      'goodMissed',
      'goodMissed',
      'badTapped',
    ])
  })

  it('lets a bad word fall off with nothing counted against it, and catches one with the pad still', () => {
    // Always 0.99: bad words in column 6 (past the pad), then column 4 (over it).
    const { game, score, mistakes } = started(constantRandom(0.99))
    const [first] = game.words
    game.update(3_000)
    const second = game.words[1]

    game.update(25_000)

    expect(first).toMatchObject({ column: 6, end: 'gone', word: { type: 'bad' } })
    expect(second).toMatchObject({ column: 4, end: 'tapped', word: { type: 'bad' } })
    expect(game.stats.badLetGo).toBeGreaterThan(0)
    expect(score.value).toBe(0)
    expect(mistakes.map((mistake) => mistake.mistake)).not.toContain('goodMissed')
  })

  it('catches a word the pad moves into from the side', () => {
    const { game } = started(leftSide())
    const first = game.words[0]
    // Until the word is level with the pad (its bottom below the pad's top), beside it.
    let t = 0
    while (first.y < 740) game.update((t += 50))
    expect(first.end).toBeUndefined()

    game.drag({ x: 50, y: 762 })
    while (first.end === undefined) game.update((t += 16))

    expect(first.end).toBe('tapped')
    expect(first.y).toBeLessThan(748 + 28 + WORD_OVAL.radiusY)
  })

  it('never lets a word fall through the pad, even in one long frame', () => {
    // Words only in columns 0 and 2: a pad at 100 is under both.
    const { game } = started(leftSide())
    game.drag({ x: 100, y: 700 })
    game.update(3_000)

    game.update(200_000)

    expect(game.stats.goodTapped + game.stats.badTapped).toBeGreaterThan(50)
    expect([game.stats.goodMissed, game.stats.badLetGo]).toEqual([0, 0])
  })

  it('stops the pad at once when the finger lifts', () => {
    const { game } = started()
    game.drag({ x: 380, y: 700 })
    game.update(1_000)
    const where = game.pad.x

    game.drag(undefined)
    game.update(2_000)

    expect(game.pad.x).toBe(where)
  })
})

describe('being empowered', () => {
  // Always 0: good words in columns 0, 2, 0, 2, then a bad one in column 0, and so
  // on; a pad at 100 is under both columns.

  /** Started, the pad under columns 0 and 2, with a way to play on (50 ms frames) and watch. */
  function catchingAll() {
    const played = started(constantRandom(0))
    const { game } = played
    game.drag({ x: 100, y: 700 })
    const seen: FallingWord[] = []
    let t = 0
    /** Plays on until `done`. */
    const playUntil = (done: () => boolean) => {
      while (!done()) {
        game.update((t += 50))
        for (const falling of game.words) if (!seen.includes(falling)) seen.push(falling)
      }
    }
    /** The `n`th word (from 1), once it has come. */
    const nth = (n: number) => {
      playUntil(() => seen.length >= n)
      return seen[n - 1]
    }
    /** Plays on until the `n`th word has been caught or fallen off. */
    const untilEnded = (n: number) => {
      const falling = nth(n)
      playUntil(() => falling.end !== undefined)
      return falling
    }
    return { ...played, nth, untilEnded }
  }

  it('comes with 3 good words caught in a row', () => {
    const { game, untilEnded } = catchingAll()

    untilEnded(2)
    expect(game.empowered).toBe(false)
    untilEnded(3)
    expect(game.empowered).toBe(true)
    untilEnded(4)
    expect(game.empowered).toBe(true)
  })

  it('forgives a bad word caught then, without a word: it disappears at once, and it ends', () => {
    const { game, score, mistakes, untilEnded } = catchingAll()

    const bad = untilEnded(5)

    expect(bad).toMatchObject({ end: 'tapped', word: { type: 'bad' } })
    expect(mistakes).toEqual([])
    expect(game.words).not.toContain(bad)
    expect(game.empowered).toBe(false)
    expect(score.value).toBe(4)
    // It still counts as what it was.
    expect(game.stats).toEqual({ goodTapped: 4, goodMissed: 0, badTapped: 1, badLetGo: 0 })
  })

  it('forgives a good word missed then, instead of a mistake, and it ends', () => {
    const { game, mistakes, untilEnded } = catchingAll()
    untilEnded(3)

    game.drag({ x: 350, y: 700 })
    const missed = untilEnded(4)

    expect(missed).toMatchObject({ end: 'gone', word: { type: 'good' } })
    expect(mistakes).toEqual([])
    expect(game.empowered).toBe(false)
    expect(game.stats.goodMissed).toBe(1)
  })

  it('forgives only one mistake: the next counts, until 3 more good words in a row', () => {
    const { game, mistakes, untilEnded } = catchingAll()
    untilEnded(5)

    game.drag({ x: 350, y: 700 })
    const missed = untilEnded(6)

    expect(missed.word.type).toBe('good')
    expect(mistakes).toEqual([{ mistake: 'goodMissed', word: missed.word.text }])
  })

  it('is never forgiving before then', () => {
    const { game, mistakes, untilEnded } = catchingAll()
    untilEnded(2)

    game.drag({ x: 350, y: 700 })
    untilEnded(3)

    expect(mistakes.map(({ mistake }) => mistake)).toEqual(['goodMissed'])
    expect(game.empowered).toBe(false)
  })

  it('starts afresh with the next round', () => {
    const { game, untilEnded } = catchingAll()
    untilEnded(3)

    game.start()

    expect(game.empowered).toBe(false)
  })
})

describe('the round ending', () => {
  it('stops everything as it is on the mistake that ends it', () => {
    const played = setup(constantRandom(0), { onMistake: () => played.game.stop() })
    const { game } = played
    game.start()

    game.update(60_000)
    const stoppedAt = game.timeMs
    const positions = game.words.map((falling) => falling.y)
    game.drag({ x: 350, y: 700 })
    game.update(90_000)

    expect(game.timeMs).toBe(stoppedAt)
    expect(game.words.map((falling) => falling.y)).toEqual(positions)
    expect(game.pad.speed).toBe(0)
  })

  it('starts afresh with the next round, the pad back in the middle', () => {
    const { game } = started()
    game.drag({ x: 380, y: 700 })
    game.update(20_000)
    game.stop()

    game.start()

    expect(game.words).toHaveLength(1)
    expect(game.pad.x).toBe(200)
    expect(game.stats).toEqual({ goodTapped: 0, goodMissed: 0, badTapped: 0, badLetGo: 0 })
    game.update(3_000)
    expect(game.words).toHaveLength(2)
  })

  it('removes everything when cleared', () => {
    const { game } = started()
    game.update(5_000)

    game.clear()

    expect([game.words, game.timeMs]).toEqual([[], 0])
  })

  it('forgets words that have faded out or fallen off as new ones come', () => {
    const { game } = started()

    game.update(120_000)

    expect(game.words.length).toBeLessThan(12)
    expect(
      game.words.every(
        (falling) => falling.end === undefined || falling.endedAtMs! + FADE_MS > 117_000,
      ),
    ).toBe(true)
  })

  it('works without anyone told about mistakes, and with Math.random', () => {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const game = createImproveInnerVoice({ words, score: createScore({ lifecycle }) })
    game.start()

    game.update(60_000)

    expect(
      game.stats.goodMissed + game.stats.badLetGo + game.stats.goodTapped + game.stats.badTapped,
    ).toBeGreaterThan(0)
  })
})
