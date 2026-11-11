import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { createGameLifecycle } from '../shared/game-lifecycle'
import { createScore } from '../shared/score'
import type { Word, WordType } from '../shared/word-picker'
import data from './data/focus-attention.json'
import {
  BUBBLE_RADIUS,
  BUBBLE_SIZE,
  buttonAt,
  BUTTONS,
  BUTTONS_TOP,
  CENTRE,
  createFocusAttention,
  distanceBetween,
  distanceToView,
  MIN_SPAWN_DISTANCE,
  pickSpawnPoint,
  POINTS,
  positionAt,
  PROJECTOR_RADIUS,
  RECENT_WORDS_TO_AVOID,
  SPAWN_INTERVAL_STEPS,
  SPAWN_POINTS,
  SPAWN_SPACING_COUNT,
  spawnIntervalAt,
  SPEED_STEPS,
  speedAt,
  START_SPAWN_INTERVAL_MS,
  START_SPEED,
  TOUCH_DISTANCE,
  VIEW,
  whenMoved,
  type Answer,
  type Bubble,
  type FocusAttentionOptions,
  type Mistake,
} from './focus-attention'

function setup(seed = 1, options: Pick<FocusAttentionOptions, 'onMistake'> = {}) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createFocusAttention({
    values: data.values,
    antiValues: data.antiValues,
    score,
    random: seededRandom(seed),
    ...options,
  })
  return { score, game }
}

type Game = ReturnType<typeof setup>['game']

/** Sets up a game that records its mistakes, and starts it. */
function started(seed = 1) {
  const mistakes: { mistake: Mistake; word: Word }[] = []
  const played = setup(seed, { onMistake: (mistake, word) => mistakes.push({ mistake, word }) })
  played.game.start()
  return { ...played, mistakes }
}

/** The middle of the button for `answer`. */
function buttonFor(answer: Answer) {
  const button = BUTTONS.find((candidate) => candidate.answer === answer)!
  return { x: button.x + button.width / 2, y: button.y + button.height / 2 }
}

const distanceFromCentre = ({ x, y }: { x: number; y: number }) =>
  Math.hypot(x - CENTRE.x, y - CENTRE.y)

/**
 * Plays in 10 ms steps until `untilMs` (or until `stop` says so), calling
 * `each` after every update; returns every bubble that came, in order.
 */
function play(
  game: Game,
  untilMs: number,
  { from = 0, each = () => {}, stop = () => false }: {
    from?: number
    each?: (t: number) => void
    stop?: () => boolean
  } = {},
) {
  const seen = new Set<Bubble>()
  for (let t = from; t <= untilMs && !stop(); t += 10) {
    game.update(t)
    game.bubbles.forEach((bubble) => seen.add(bubble))
    each(t)
  }
  return [...seen]
}

/**
 * Plays until the target is a word of `type`, answering every other target
 * right straight away (so nothing reaches the projector on the way).
 */
function untilTargetIs(game: Game, type: WordType) {
  play(game, 60_000, {
    each: () => {
      const target = game.target
      if (target && target.type !== type) {
        game.tap(buttonFor(target.type === 'good' ? 'focus' : 'change'))
      }
    },
    stop: () => game.target?.type === type,
  })
  expect(game.target?.type).toBe(type)
}

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect(START_SPEED).toBe(15)
    expect(SPEED_STEPS).toEqual([
      [10_000, 17.5],
      [20_000, 22.5],
      [30_000, 30],
      [40_000, 40],
      [50_000, 52.5],
      [60_000, 65],
    ])
    expect(START_SPAWN_INTERVAL_MS).toBe(3_000)
    expect(SPAWN_INTERVAL_STEPS).toEqual([
      [70_000, 2_800],
      [80_000, 2_600],
      [90_000, 2_400],
      [100_000, 2_000],
    ])
    expect([MIN_SPAWN_DISTANCE, SPAWN_SPACING_COUNT, RECENT_WORDS_TO_AVOID]).toEqual([130, 3, 10])
    expect(POINTS).toEqual({ focusValue: 1, leaveAntiValue: 1 })
  })

  it('moves at 15 px/s, then 17.5 from 10 s, 22.5, 30, 40, 52.5 and 65 from 60 s on', () => {
    const times = [0, 9_999, 10_000, 19_999, 20_000, 30_000, 40_000, 50_000, 60_000, 1e6]

    expect(times.map(speedAt)).toEqual([15, 15, 17.5, 17.5, 22.5, 30, 40, 52.5, 65, 65])
  })

  it('brings bubbles every 3 s, then every 2.8, 2.6, 2.4 s from 70 s, and 2 s from 100 s', () => {
    const times = [0, 69_999, 70_000, 80_000, 90_000, 99_999, 100_000, 1e6]

    expect(times.map(spawnIntervalAt)).toEqual([
      3_000, 3_000, 2_800, 2_600, 2_400, 2_400, 2_000, 2_000,
    ])
  })

  it('has more than enough values and anti-values never to repeat one of the last 10', () => {
    expect(new Set(data.values).size).toBe(323)
    expect(new Set(data.antiValues).size).toBe(236)
  })
})

describe('moving', () => {
  it('adds up the distance at each speed along the way', () => {
    expect(distanceBetween(1_000, 4_000)).toBe(45)
    // 5 s at 15, 10 s at 17.5, 5 s at 22.5.
    expect(distanceBetween(5_000, 25_000)).toBe(75 + 175 + 112.5)
    expect(distanceBetween(10_000, 20_000)).toBe(175)
    expect(distanceBetween(60_000, 62_000)).toBe(130)
    expect(distanceBetween(7_000, 7_000)).toBe(0)
  })

  it('finds when a distance has been moved, following the speed changes', () => {
    expect(whenMoved(0, 45)).toBe(3_000)
    expect(whenMoved(0, 150)).toBe(10_000)
    expect(whenMoved(5_000, 362.5)).toBe(25_000)
    expect(whenMoved(70_000, 130)).toBe(72_000)
    expect(whenMoved(4_000, 0)).toBe(4_000)
  })

  it('agrees with itself: moving for a while, then asking when that was done', () => {
    const random = seededRandom(3)
    for (let i = 0; i < 200; i++) {
      const from = random() * 80_000
      const to = from + random() * 40_000
      expect(whenMoved(from, distanceBetween(from, to))).toBeCloseTo(to, 6)
    }
  })
})

describe('layout', () => {
  it('puts the projector in the middle of the canvas below the score bar', () => {
    expect(CENTRE).toEqual({ x: 200, y: (GAME_BAR_HEIGHT + 800) / 2 })
    expect(PROJECTOR_RADIUS).toBeCloseTo(49.5, 9)
  })

  it('counts a bubble as reaching the projector when its edge touches the orb', () => {
    expect(BUBBLE_SIZE).toBe(130)
    expect(BUBBLE_RADIUS).toBeCloseTo(58.5, 9)
    expect(TOUCH_DISTANCE).toBeCloseTo(PROJECTOR_RADIUS + BUBBLE_RADIUS, 9)
  })

  it('puts Focus and Change attention side by side along the bottom of the canvas', () => {
    const [focus, change] = BUTTONS

    expect([focus.answer, focus.label, change.answer, change.label]).toEqual([
      'focus',
      'Focus',
      'change',
      'Change attention',
    ])
    expect(focus.y).toBe(change.y)
    expect(focus.width).toBe(change.width)
    expect(focus.x).toBeGreaterThan(0)
    expect(focus.x + focus.width).toBeLessThan(change.x)
    expect(change.x + change.width).toBeLessThan(400)
    expect(focus.y + focus.height).toBeLessThan(800)
    expect(BUTTONS_TOP).toBe(focus.y)
  })

  it('finds the button at a point, edges included, and none between or above them', () => {
    const [focus, change] = BUTTONS

    expect(buttonAt(buttonFor('focus'))).toBe(focus)
    expect(buttonAt({ x: change.x, y: change.y })).toBe(change)
    expect(buttonAt({ x: change.x + change.width, y: change.y + change.height })).toBe(change)
    expect(buttonAt({ x: focus.x + focus.width + 1, y: focus.y + 10 })).toBeUndefined()
    expect(buttonAt({ x: focus.x + 10, y: focus.y - 1 })).toBeUndefined()
    expect(buttonAt(CENTRE)).toBeUndefined()
  })

  it('lets a bubble be the target between the score bar and the buttons', () => {
    expect(VIEW).toEqual({ left: 0, right: 400, top: GAME_BAR_HEIGHT, bottom: BUTTONS_TOP })
  })
})

describe('where bubbles come from', () => {
  const half = BUBBLE_SIZE / 2

  it('only from just outside the canvas, out of sight, all the way round', () => {
    for (const { x, y } of SPAWN_POINTS) {
      const outside = x <= -half || x >= 400 + half || y <= -half || y >= 800 + half
      expect(outside, `${x}, ${y}`).toBe(true)
    }
    expect(SPAWN_POINTS.some(({ x }) => x === -half)).toBe(true)
    expect(SPAWN_POINTS.some(({ x }) => x === 400 + half)).toBe(true)
    expect(SPAWN_POINTS.some(({ y }) => y === -half)).toBe(true)
    expect(SPAWN_POINTS.some(({ y }) => y === 800 + half)).toBe(true)
    // Every 2 px round the outside.
    expect(SPAWN_POINTS).toHaveLength(2 * (530 + 930) / 2)
  })

  it('anywhere round the outside when nothing is in the way', () => {
    expect(pickSpawnPoint([], constantRandom(0))).toBe(SPAWN_POINTS[0])
    expect(pickSpawnPoint([], constantRandom(0.999999))).toBe(SPAWN_POINTS.at(-1))
    expect(pickSpawnPoint([], constantRandom(0.5))).toBe(SPAWN_POINTS[SPAWN_POINTS.length / 2])
  })

  it('at least 130 px from every bubble it must keep away from', () => {
    const random = seededRandom(4)
    for (let i = 0; i < 300; i++) {
      const others = Array.from({ length: 3 }, () => SPAWN_POINTS[Math.floor(random() * 1460)])
      const point = pickSpawnPoint(others, random)
      for (const other of others) {
        expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThanOrEqual(130)
      }
    }
  })

  it('as far as it can be from them when everywhere is closer than 130 px', () => {
    // Bubbles every 200 px round the outside leave nowhere 130 px from all of them.
    const others = SPAWN_POINTS.filter((_, i) => i % 100 === 0)
    const furthest = (point: { x: number; y: number }) =>
      Math.min(...others.map((other) => Math.hypot(point.x - other.x, point.y - other.y)))
    const best = Math.max(...SPAWN_POINTS.map(furthest))
    expect(best).toBeLessThan(130)

    const point = pickSpawnPoint(others, seededRandom(5))

    expect(furthest(point)).toBe(best)
  })

  it('can be the target once its centre is on the canvas, below the bar, above the buttons', () => {
    // Straight in from the left: its centre reaches the canvas edge after 65 px.
    expect(distanceToView({ x: -half, y: CENTRE.y })).toBeCloseTo(half, 9)
    // From the top, past the score bar too; from the bottom, past the buttons.
    expect(distanceToView({ x: 200, y: -half })).toBeCloseTo(half + GAME_BAR_HEIGHT, 9)
    expect(distanceToView({ x: 200, y: 800 + half })).toBeCloseTo(800 + half - BUTTONS_TOP, 9)
  })

  it('comes into view on the edge of the view, from any direction', () => {
    const inView = ({ x, y }: { x: number; y: number }) =>
      x >= VIEW.left - 1e-9 &&
      x <= VIEW.right + 1e-9 &&
      y >= VIEW.top - 1e-9 &&
      y <= VIEW.bottom + 1e-9

    for (const start of SPAWN_POINTS.filter((_, i) => i % 37 === 0)) {
      const bubble = { start, spawnedAtMs: 0 } as Bubble
      const at = whenMoved(0, distanceToView(start))
      expect(inView(positionAt(bubble, at)), `${start.x}, ${start.y}`).toBe(true)
      expect(inView(positionAt(bubble, at - 50)), `${start.x}, ${start.y}`).toBe(false)
    }
  })
})

describe('before the round', () => {
  it('shows nothing and counts nothing, whatever happens', () => {
    const { game, score } = setup()

    game.update(10_000)
    game.tap(buttonFor('focus'))

    expect([game.bubbles, game.target, game.press, game.timeMs]).toEqual([
      [],
      undefined,
      undefined,
      0,
    ])
    expect(score.value).toBe(0)
  })
})

describe('bubbles', () => {
  it('brings the first bubble the moment the round starts, from just outside', () => {
    const { game } = started()

    expect(game.bubbles).toHaveLength(1)
    const [bubble] = game.bubbles
    expect(SPAWN_POINTS).toContainEqual(bubble.start)
    expect(bubble).toMatchObject({ spawnedAtMs: 0, x: bubble.start.x, y: bubble.start.y })
    expect(data.values.concat(data.antiValues)).toContain(bubble.text)
  })

  it('moves every bubble straight at the projector, at the speed of the moment', () => {
    const { game } = started()
    const [bubble] = game.bubbles
    const direction = {
      x: (CENTRE.x - bubble.start.x) / distanceFromCentre(bubble.start),
      y: (CENTRE.y - bubble.start.y) / distanceFromCentre(bubble.start),
    }

    for (const t of [1_000, 2_500]) {
      game.update(t)
      const moved = (15 * t) / 1_000
      expect(bubble.x).toBeCloseTo(bubble.start.x + direction.x * moved, 9)
      expect(bubble.y).toBeCloseTo(bubble.start.y + direction.y * moved, 9)
    }
  })

  it('speeds up every bubble on screen at once', () => {
    const { game } = started()
    play(game, 9_000)
    const bubble = game.bubbles.at(-1)!
    expect(bubble.spawnedAtMs).toBe(9_000)

    game.update(11_000)

    // 1 s at 15 px/s, then 1 s at 17.5.
    expect(distanceFromCentre(bubble.start) - distanceFromCentre(bubble)).toBeCloseTo(32.5, 9)
  })

  it('brings one every 3 s, then more often from 70 s', () => {
    const { game } = started(2)

    const spawnTimes = play(game, 110_000).map((bubble) => bubble.spawnedAtMs)

    const expected = [0]
    while (expected.at(-1)! + spawnIntervalAt(expected.at(-1)!) <= 110_000) {
      expected.push(expected.at(-1)! + spawnIntervalAt(expected.at(-1)!))
    }
    expect(spawnTimes).toEqual(expected)
    expect(expected.slice(0, 4)).toEqual([0, 3_000, 6_000, 9_000])
  })

  it('brings each one 130 px from where the last 3 still on screen are, unless impossible', () => {
    for (const seed of [3, 4, 5]) {
      const { game } = started(seed)
      const onScreenAt = new Map<Bubble, Bubble[]>()

      const bubbles = play(game, 110_000, {
        each: () => {
          const newest = game.bubbles.at(-1)
          if (newest && !onScreenAt.has(newest)) onScreenAt.set(newest, [...game.bubbles])
        },
      })

      bubbles.forEach((bubble, i) => {
        const others = bubbles
          .slice(Math.max(0, i - 3), i)
          .filter((other) => onScreenAt.get(bubble)!.includes(other))
          .map((other) => positionAt(other, bubble.spawnedAtMs))
        const nearest = Math.min(
          Infinity,
          ...others.map((o) => Math.hypot(o.x - bubble.start.x, o.y - bubble.start.y)),
        )
        const possible = SPAWN_POINTS.some((point) =>
          others.every((o) => Math.hypot(o.x - point.x, o.y - point.y) >= 130),
        )
        if (possible) expect(nearest).toBeGreaterThanOrEqual(130)
      })
    }
  })

  it('does not keep away from bubbles already answered for or gone', () => {
    let nearGone = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { game } = started(seed)
      const goneAt = new Map<Bubble, number>()
      let onScreen: Bubble[] = []

      const bubbles = play(game, 90_000, {
        each: (t) => {
          for (const bubble of onScreen) {
            if (!game.bubbles.includes(bubble)) goneAt.set(bubble, t)
          }
          onScreen = [...game.bubbles]
          // Answer every target right away, so bubbles go soon after coming into view.
          if (game.target) game.tap(buttonFor(game.target.type === 'good' ? 'focus' : 'change'))
        },
      })

      bubbles.forEach((bubble, i) => {
        for (const other of bubbles.slice(Math.max(0, i - 3), i)) {
          const gone = goneAt.get(other)
          if (gone === undefined || gone >= bubble.spawnedAtMs - 10) continue
          const where = positionAt(other, bubble.spawnedAtMs)
          if (Math.hypot(where.x - bubble.start.x, where.y - bubble.start.y) < 130) nearGone++
        }
      })
    }

    // A new bubble came close to where one of the last 3 would have been, had it not gone.
    expect(nearGone).toBeGreaterThan(0)
  })

  it('picks values and anti-values 50/50, at most 4 in a row, none of the last 10 again', () => {
    const { game } = started(6)

    const words = play(game, 300_000)

    expect(words.length).toBeGreaterThan(100)
    const types = words.map((word) => word.type).join(' ')
    expect(types).not.toMatch(/(good ){4}good|(bad ){4}bad/)
    for (const type of ['good', 'bad'] as const) {
      const texts = words.filter((word) => word.type === type).map((word) => word.text)
      for (let i = 0; i + 11 <= texts.length; i++) {
        expect(new Set(texts.slice(i, i + 11)).size).toBe(11)
      }
      for (const text of texts) {
        expect(type === 'good' ? data.values : data.antiValues).toContain(text)
      }
    }
  })
})

describe('the target', () => {
  it('is nothing until a bubble’s centre is in view, then the one closest to the centre', () => {
    const { game } = started()
    const [first] = game.bubbles

    game.update(first.inViewAtMs - 1)
    expect(game.target).toBeUndefined()

    game.update(first.inViewAtMs)
    expect(game.target).toBe(first)
  })

  it('never is a bubble whose centre is not in view', () => {
    const { game } = started(7)

    play(game, 60_000, {
      each: (t) => {
        if (game.target) expect(game.target.inViewAtMs).toBeLessThanOrEqual(t)
      },
    })
  })

  it('stays the same until answered for or reached, even when another gets closer', () => {
    let overtaken = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { game } = started(seed)
      let target: Bubble | undefined

      play(game, 120_000, {
        each: (t) => {
          if (target && game.bubbles.includes(target)) {
            expect(game.target).toBe(target)
            const closer = game.bubbles.some(
              (b) =>
                b !== target &&
                b.inViewAtMs <= t &&
                distanceFromCentre(b) < distanceFromCentre(target!),
            )
            if (closer) overtaken++
          }
          target = game.target
        },
      })
    }

    // It really happened: a bubble from a near side got closer than the target.
    expect(overtaken).toBeGreaterThan(0)
  })

  it('moves, once answered for, to the bubble in view closest to the projector', () => {
    let checked = 0
    for (const seed of [1, 2, 3, 4]) {
      const { game } = started(seed)
      play(game, 100_000, {
        each: (t) => {
          // Answer when there is more than one bubble in view to choose from next.
          const inView = () => game.bubbles.filter((b) => b.inViewAtMs <= t)
          if (!game.target || inView().length < 3) return
          game.tap(buttonFor('focus'))
          const closest = Math.min(...inView().map(distanceFromCentre))
          expect(distanceFromCentre(game.target!)).toBe(closest)
          checked++
        },
      })
    }

    expect(checked).toBeGreaterThan(10)
  })
})

describe('answering', () => {
  it.each([
    ['focus', 'good', 'valuesFocused', 1],
    ['change', 'bad', 'antiValuesLeft', 1],
  ] as const)(
    'gives a point for %s on a %s word, and the beam moves on',
    (answer, type, counted, points) => {
      const { game, score, mistakes } = started(8)
      untilTargetIs(game, type)
      const target = game.target!
      const [scoreBefore, countBefore] = [score.value, game.stats[counted]]

      game.tap(buttonFor(answer))

      expect(score.value - scoreBefore).toBe(points)
      expect(game.stats[counted] - countBefore).toBe(1)
      expect(mistakes).toEqual([])
      expect(game.bubbles).not.toContain(target)
      expect(game.target).not.toBe(target)
    },
  )

  it.each([
    ['change', 'good', 'valuesLeft', 'leftValue'],
    ['focus', 'bad', 'antiValuesFocused', 'focusedAntiValue'],
  ] as const)(
    'counts %s on a %s word as a mistake, scoring nothing',
    (answer, type, counted, mistake) => {
      const { game, score, mistakes } = started(8)
      untilTargetIs(game, type)
      const target = game.target!
      const scoreBefore = score.value

      game.tap(buttonFor(answer))

      expect(score.value).toBe(scoreBefore)
      expect(game.stats[counted]).toBe(1)
      expect(mistakes).toEqual([{ mistake, word: target }])
      expect(game.bubbles).not.toContain(target)
    },
  )

  it.each([
    ['focus', 'good', true],
    ['change', 'bad', true],
    ['change', 'good', false],
    ['focus', 'bad', false],
  ] as const)('fades out the target after %s on a %s word, right: %s', (answer, type, right) => {
    const { game } = started(8)
    untilTargetIs(game, type)
    const target = game.target!

    game.tap(buttonFor(answer))

    expect(game.answered.at(-1)).toEqual({ item: target, right, atMs: game.timeMs })
  })

  it('stops the answered bubble where it is, and it is gone 0.1 s later', () => {
    const { game } = started(8)
    untilTargetIs(game, 'good')
    const target = game.target!
    const where = { x: target.x, y: target.y }
    const at = game.timeMs

    game.tap(buttonFor('focus'))
    game.update(at + 99)

    expect(game.answered.map(({ item }) => item)).toContain(target)
    expect({ x: target.x, y: target.y }).toEqual(where)
    game.update(at + 100)
    expect(game.answered.map(({ item }) => item)).not.toContain(target)
  })

  it('shows which button was pressed, and when', () => {
    const { game } = started()
    game.update(1_234)

    game.tap(buttonFor('change'))

    expect(game.press).toEqual({ answer: 'change', atMs: 1_234 })
  })

  it('does nothing but show the press when there is no target', () => {
    const { game, score } = started()
    game.update(500)
    const before = [...game.bubbles]

    game.tap(buttonFor('focus'))

    expect(game.bubbles).toEqual(before)
    expect(score.value).toBe(0)
    expect(game.press).toEqual({ answer: 'focus', atMs: 500 })
  })

  it('does nothing for a tap anywhere but a button', () => {
    const { game, score } = started(8)
    untilTargetIs(game, 'good')
    const target = game.target!
    const [scoreBefore, pressBefore] = [score.value, game.press]

    for (const point of [CENTRE, target, { x: 200, y: 100 }]) game.tap(point)

    expect(game.target).toBe(target)
    expect(game.press).toBe(pressBefore)
    expect(score.value).toBe(scoreBefore)
  })

  it('always matches the score: values focused on + anti-values changed attention from', () => {
    for (const seed of [1, 2, 3]) {
      const random = seededRandom(seed + 20)
      const { game, score } = started(seed)

      play(game, 150_000, {
        each: () => {
          if (random() < 0.02) game.tap(buttonFor(random() < 0.5 ? 'focus' : 'change'))
        },
      })

      const { valuesFocused, antiValuesLeft, valuesLeft, antiValuesFocused, reached } = game.stats
      expect(valuesFocused + antiValuesLeft).toBeGreaterThan(5)
      expect(valuesLeft + antiValuesFocused + reached).toBeGreaterThan(5)
      expect(score.value).toBe(valuesFocused + antiValuesLeft)
    }
  })
})

describe('reaching the projector', () => {
  it('is a mistake the moment a bubble’s edge touches the orb, and it disappears', () => {
    const { game, mistakes } = started()
    const [first] = game.bubbles

    game.update(first.touchAtMs - 1)
    expect(game.bubbles).toContain(first)
    expect(distanceFromCentre(first)).toBeGreaterThan(TOUCH_DISTANCE)

    game.update(first.touchAtMs)
    expect(game.bubbles).not.toContain(first)
    expect(mistakes).toEqual([{ mistake: 'reachedProjector', word: first }])
    expect(game.stats.reached).toBe(1)
  })

  it('moves the beam to the closest bubble in view when the target reaches it', () => {
    const { game } = started()
    const [first] = game.bubbles
    game.update(first.inViewAtMs)
    expect(game.target).toBe(first)

    play(game, first.touchAtMs + 5_000, {
      from: first.inViewAtMs,
      stop: () => game.target !== first,
    })

    expect(game.bubbles).not.toContain(first)
    if (game.target) {
      const inView = game.bubbles.filter((b) => b.inViewAtMs <= game.timeMs)
      expect(distanceFromCentre(game.target)).toBe(Math.min(...inView.map(distanceFromCentre)))
    }
  })

  it('is a mistake for any bubble, target or not, and leaves the target as it is', () => {
    let others = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { game, mistakes } = started(seed)
      let target: Bubble | undefined

      play(game, 120_000, {
        each: () => {
          const reached = mistakes.at(-1)?.word
          if (reached && reached !== target && target && mistakes.length > others) {
            expect(game.target).toBe(target)
            others = mistakes.length
          }
          target = game.target
        },
      })
    }

    expect(others).toBeGreaterThan(0)
  })

  it('happens for every bubble due, at its own time, even after a long frame', () => {
    const stepByStep = started(9)
    const oneLongFrame = started(9)

    play(stepByStep.game, 90_000)
    oneLongFrame.game.update(90_000)

    expect(oneLongFrame.game.stats.reached).toBeGreaterThan(20)
    expect(oneLongFrame.game.stats).toEqual(stepByStep.game.stats)
    expect(oneLongFrame.game.bubbles).toEqual(stepByStep.game.bubbles)
    expect(oneLongFrame.game.target).toEqual(stepByStep.game.target)
  })
})

describe('stopping', () => {
  function stoppingAtFirstMistake(seed = 1) {
    const played = setup(seed, { onMistake: () => played.game.stop() })
    played.game.start()
    return played
  }

  it('stops everything where it was when a bubble reached the projector, even mid-frame', () => {
    const { game } = stoppingAtFirstMistake()
    const [first] = game.bubbles

    game.update(60_000)

    expect(game.timeMs).toBe(first.touchAtMs)
    expect(game.stats.reached).toBe(1)
    for (const bubble of game.bubbles) {
      expect({ x: bubble.x, y: bubble.y }).toEqual(positionAt(bubble, first.touchAtMs))
    }
    expect(game.bubbles.every((bubble) => bubble.spawnedAtMs < first.touchAtMs)).toBe(true)
  })

  it('stops at a wrong answer: the beam points at nothing new, even with others in view', () => {
    /** A round that stops at its first mistake, played until a value is the target and
     * another bubble is in view (or undefined if a bubble reached the projector first). */
    function withOthersInView(seed: number) {
      const { game } = stoppingAtFirstMistake(seed)
      const othersInView = () =>
        game.bubbles.filter((b) => b !== game.target && b.inViewAtMs <= game.timeMs)
      play(game, 120_000, {
        // Leave anti-values at once; keep a value as the target until another comes into view.
        each: () => {
          if (game.target?.type === 'bad') game.tap(buttonFor('change'))
        },
        stop: () =>
          game.stats.reached > 0 || (game.target?.type === 'good' && othersInView().length > 0),
      })
      return game.stats.reached === 0 ? game : undefined
    }
    const game = [1, 2, 3, 4, 5, 6, 7, 8].map(withOthersInView).find(Boolean)!
    expect(game).toBeDefined()
    const left = game.bubbles.filter((bubble) => bubble !== game.target)

    game.tap(buttonFor('change'))

    expect(game.stats.valuesLeft).toBe(1)
    expect(game.target).toBeUndefined()
    expect(game.bubbles).toEqual(left)
  })

  it('changes nothing once stopped', () => {
    const { game, score } = started(8)
    untilTargetIs(game, 'good')
    const before = game.bubbles.map((bubble) => ({ ...bubble }))
    const unchanged = [game.timeMs, score.value, game.press]

    game.stop()
    game.update(100_000)
    game.tap(buttonFor('focus'))

    expect(game.bubbles.map((bubble) => ({ ...bubble }))).toEqual(before)
    expect([game.timeMs, score.value, game.press]).toEqual(unchanged)
  })

  it('plays normally again from the next start', () => {
    const { game } = started()
    game.stop()

    game.start()
    game.update(3_000)

    expect(game.bubbles).toHaveLength(2)
  })
})

describe('a new round', () => {
  it('starts again from one slow bubble, with no counts', () => {
    const { game } = started()
    play(game, 70_000, { each: () => game.tap(buttonFor('focus')) })
    expect(Object.values(game.stats).some((count) => count > 0)).toBe(true)

    game.start()

    expect(game.bubbles).toHaveLength(1)
    expect(game.bubbles[0].spawnedAtMs).toBe(0)
    expect([game.target, game.press, game.timeMs]).toEqual([undefined, undefined, 0])
    expect(Object.values(game.stats).every((count) => count === 0)).toBe(true)
  })

  it('removes everything on clear, answered bubbles too', () => {
    const { game } = started(8)
    untilTargetIs(game, 'good')
    game.tap(buttonFor('focus'))
    expect(game.answered).toHaveLength(1)

    game.clear()

    expect(game.answered).toEqual([])
    expect([game.bubbles, game.target, game.press, game.timeMs]).toEqual([
      [],
      undefined,
      undefined,
      0,
    ])
    expect(Object.values(game.stats).every((count) => count === 0)).toBe(true)
  })
})
