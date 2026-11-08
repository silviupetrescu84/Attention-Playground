import { describe, expect, it } from 'vitest'
import { createGameLifecycle } from '../shared/game-lifecycle'
import { createScore } from '../shared/score'
import { bubblesAt, findPoint } from '../../test/bubbles'
import { constantRandom, seededRandom } from '../../test/random'
import emotions from './data/emotions.json'
import type { Emotion } from './emotion-generator'
import {
  BUBBLE_HEIGHT,
  BUBBLE_WIDTH,
  createEmotionsRise,
  MAX_SPAWN_DELAY_MS,
  MAX_SPEED,
  MIN_SPAWN_DELAY_MS,
  heightAt,
  MIN_CENTRE_DISTANCE,
  MIN_SIDEWAYS_DISTANCE,
  MIN_SPEED,
  isInBubble,
  minSidewaysGap,
  pickSpawnX,
  SPAWN_Y,
  type Bubble,
} from './emotions-rise'

function setup(random: () => number = seededRandom(1)) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createEmotionsRise({
    emotions: { good: emotions.positive, bad: emotions.negative },
    score,
    random,
  })
  return { score, game }
}

/** Plays `untilMs` in small steps; returns every bubble ever spawned, in order. */
function playAndRecord(game: ReturnType<typeof setup>['game'], untilMs: number) {
  const spawned = new Set<Bubble>()
  for (let t = 0; t <= untilMs; t += 50) {
    game.update(t)
    game.bubbles.forEach((bubble) => spawned.add(bubble))
  }
  return [...spawned].sort((a, b) => a.spawnedAtMs - b.spawnedAtMs)
}

/** Points a tap of this bubble set is worth: +1 per good, −1 per bad. */
function tapValue(bubbles: readonly Bubble[]) {
  return bubbles.reduce((sum, b) => sum + (b.emotion.type === 'good' ? 1 : -1), 0)
}

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect([BUBBLE_WIDTH, BUBBLE_HEIGHT]).toEqual([140, 88])
    expect([MIN_SPEED, MAX_SPEED]).toEqual([40, 80])
    expect([MIN_SPAWN_DELAY_MS, MAX_SPAWN_DELAY_MS]).toEqual([700, 1_500])
    expect(MIN_SIDEWAYS_DISTANCE).toBe(25)
    expect(MIN_CENTRE_DISTANCE).toBe(50)
  })

  it('starts bubbles just under the canvas', () => {
    // The oval's top touches the canvas's bottom edge (y = 800).
    expect(SPAWN_Y - BUBBLE_HEIGHT / 2).toBe(800)
  })
})

describe('spacing rules', () => {
  it('needs 25 px sideways once the previous bubble is 50 px or more higher', () => {
    for (const heightGap of [50, 60, 100, 500]) {
      expect(minSidewaysGap(heightGap)).toBe(25)
    }
  })

  it('needs more sideways when the previous bubble is closer in height, for 50 px centre to centre', () => {
    expect(minSidewaysGap(0)).toBe(50)
    expect(minSidewaysGap(30)).toBe(40) // 30² + 40² = 50²
    expect(minSidewaysGap(40)).toBe(30) // 40² + 30² = 50²
    // 45 px higher needs only ≈ 21.8 px for the straight line, so 25 px wins.
    expect(minSidewaysGap(45)).toBe(25)
  })
})

describe('pickSpawnX', () => {
  /** The previous bubble's centre, `heightGap` px above where new bubbles appear. */
  const previousAt = (x: number, heightGap: number) => ({ x, y: SPAWN_Y - heightGap })

  it('keeps the first oval fully inside the canvas', () => {
    expect(pickSpawnX(undefined, constantRandom(0))).toBe(70)
    expect(pickSpawnX(undefined, constantRandom(0.5))).toBe(200)
    expect(pickSpawnX(undefined, constantRandom(0.999999))).toBeCloseTo(330, 3)
  })

  it('always keeps both rules and stays inside the canvas', () => {
    const random = seededRandom(2)

    for (const previousX of [70, 71, 100, 120, 150, 200, 250, 280, 300, 329, 330]) {
      for (const heightGap of [0, 10, 28, 35, 49, 50, 80, 120]) {
        for (let i = 0; i < 100; i++) {
          const x = pickSpawnX(previousAt(previousX, heightGap), random)
          const where = `previous ${previousX}, ${heightGap} px higher: ${x}`
          expect(Math.abs(x - previousX), where).toBeGreaterThanOrEqual(25)
          expect(Math.hypot(x - previousX, heightGap), where).toBeGreaterThanOrEqual(50 - 1e-9)
          expect(x, where).toBeGreaterThanOrEqual(70)
          expect(x, where).toBeLessThanOrEqual(330)
        }
      }
    }
  })

  it('can go anywhere except 25 px either side when the previous bubble is well above', () => {
    const previous = previousAt(200, 100)
    // Allowed: [70, 175] and [225, 330], equally long.
    expect(pickSpawnX(previous, constantRandom(0))).toBe(70)
    expect(pickSpawnX(previous, constantRandom(0.4999))).toBeCloseTo(175, 1)
    expect(pickSpawnX(previous, constantRandom(0.5))).toBe(225)
    expect(pickSpawnX(previous, constantRandom(0.999999))).toBeCloseTo(330, 3)
  })

  it('keeps 50 px away sideways from a previous bubble at the same height', () => {
    const previous = previousAt(200, 0)
    // Allowed: [70, 150] and [250, 330].
    expect(pickSpawnX(previous, constantRandom(0.4999))).toBeCloseTo(150, 1)
    expect(pickSpawnX(previous, constantRandom(0.5))).toBe(250)
  })

  it('uses the only side left when the previous bubble is at an edge', () => {
    expect(pickSpawnX(previousAt(70, 0), constantRandom(0))).toBe(120)
    expect(pickSpawnX(previousAt(330, 100), constantRandom(0.999999))).toBeCloseTo(305, 3)
  })

  it('spreads bubbles evenly across the canvas over time', () => {
    const random = seededRandom(3)
    const strips = Array.from({ length: 13 }, () => 0)
    let previous: { x: number; y: number } | undefined
    for (let i = 0; i < 50_000; i++) {
      const x = pickSpawnX(previous, random)
      strips[Math.min(12, Math.floor((x - 70) / 20))]++
      // A typical height gap: 60 px/s × 1.1 s.
      previous = previousAt(x, 66)
    }

    // Each 20 px strip of the 260 px range gets 7.7% if perfectly even.
    for (const count of strips) {
      expect(count / 50_000).toBeGreaterThan(0.06)
      expect(count / 50_000).toBeLessThan(0.095)
    }
  })
})

describe('spawning', () => {
  it('has no bubbles before the round starts', () => {
    expect(setup().game.bubbles).toEqual([])
  })

  it('makes the first emotion the moment the round starts, just under the canvas', () => {
    const { game } = setup()

    game.start()

    expect(game.bubbles).toHaveLength(1)
    const [bubble] = game.bubbles
    expect(bubble.y).toBe(SPAWN_Y)
    expect(bubble.spawnedAtMs).toBe(0)
    expect(bubble.speed).toBeGreaterThanOrEqual(MIN_SPEED)
    expect(bubble.speed).toBeLessThanOrEqual(MAX_SPEED)
    expect(emotions.positive.concat(emotions.negative)).toContain(bubble.emotion.text)
  })

  it('makes the next emotion 0.7–1.5 s after the previous one', () => {
    for (const [random, delay] of [
      [constantRandom(0), 700],
      [constantRandom(0.5), 1_100],
    ] as const) {
      const { game } = setup(random)
      game.start()

      game.update(delay - 1)
      expect(game.bubbles).toHaveLength(1)
      game.update(delay)
      expect(game.bubbles).toHaveLength(2)
      expect(game.bubbles[1].spawnedAtMs).toBe(delay)
    }
  })

  it('keeps every delay between 0.7 and 1.5 s and every speed between 40 and 80', () => {
    const { game } = setup(seededRandom(3))
    game.start()

    const bubbles = playAndRecord(game, 60_000)

    expect(bubbles.length).toBeGreaterThan(40)
    for (let i = 1; i < bubbles.length; i++) {
      const delay = bubbles[i].spawnedAtMs - bubbles[i - 1].spawnedAtMs
      expect(delay).toBeGreaterThanOrEqual(700)
      expect(delay).toBeLessThanOrEqual(1_500)
    }
    for (const bubble of bubbles) {
      expect(bubble.speed).toBeGreaterThanOrEqual(40)
      expect(bubble.speed).toBeLessThanOrEqual(80)
    }
  })

  it('catches up on every emotion due after a long frame', () => {
    const { game } = setup(constantRandom(0))
    game.start()

    game.update(7_000)

    expect(game.bubbles.map((b) => b.spawnedAtMs)).toEqual([
      0, 700, 1_400, 2_100, 2_800, 3_500, 4_200, 4_900, 5_600, 6_300, 7_000,
    ])
  })

  it('starts each bubble 25 px sideways and 50 px centre to centre from the previous one', () => {
    const { game } = setup(seededRandom(4))
    game.start()

    const spawned = playAndRecord(game, 60_000)
    expect(spawned.length).toBeGreaterThan(40)
    for (let i = 1; i < spawned.length; i++) {
      const [before, bubble] = [spawned[i - 1], spawned[i]]
      // Where the previous bubble was when this one appeared.
      const heightGap = SPAWN_Y - heightAt(before, bubble.spawnedAtMs)
      expect(Math.abs(bubble.x - before.x)).toBeGreaterThanOrEqual(25)
      expect(Math.hypot(bubble.x - before.x, heightGap)).toBeGreaterThanOrEqual(50 - 1e-9)
    }
  })

  it('does not space the first bubble of a new round from the last round', () => {
    // Random 0 always picks the leftmost allowed place: 70 when nothing is in
    // the way. The second bubble (0.7 s later, the first only 28 px higher)
    // must be √(50² − 28²) ≈ 41.4 px to the side: 111.4.
    const { game } = setup(constantRandom(0))
    game.start()
    game.update(700)
    expect(game.bubbles.at(-1)!.x).toBeCloseTo(111.4, 1)

    game.start()

    // Had it been spaced from that last bubble, it could not be at 70.
    expect(game.bubbles[0].x).toBe(70)
  })

  it('measures from where the previous bubble would be, even if it was tapped', () => {
    // Same random numbers, with and without tapping the first bubble away.
    const untouched = setup(seededRandom(5))
    const tapped = setup(seededRandom(5))
    for (const { game } of [untouched, tapped]) game.start()
    const first = tapped.game.bubbles[0]

    tapped.game.update(50)
    tapped.game.tap({ x: first.x, y: heightAt(first, 50) })
    expect(tapped.game.bubbles).not.toContain(first)
    for (const { game } of [untouched, tapped]) game.update(2_000)

    expect(tapped.game.bubbles[0].x).toBe(untouched.game.bubbles[1].x)
  })

  it('starts again from a single emotion on every new round', () => {
    const { game } = setup()
    game.start()
    game.update(5_000)

    game.start()

    expect(game.bubbles).toHaveLength(1)
    expect(game.bubbles[0].spawnedAtMs).toBe(0)
    game.update(99)
    expect(game.bubbles).toHaveLength(1)
  })

  it('removes everything on clear', () => {
    const { game } = setup()
    game.start()
    game.update(2_000)

    game.clear()

    expect(game.bubbles).toEqual([])
  })
})

describe('rising', () => {
  it('rises at its own constant speed from the moment it appears', () => {
    const { game } = setup()
    game.start()
    const bubble = game.bubbles[0]

    for (const t of [16, 500, 1_000, 2_500]) {
      game.update(t)
      expect(bubble.y).toBeCloseTo(SPAWN_Y - (bubble.speed * t) / 1000, 9)
    }
  })

  it('moves later bubbles from their own start time', () => {
    const { game } = setup(constantRandom(0.5))
    game.start()

    game.update(2_000)

    const second = game.bubbles[1]
    expect(second.spawnedAtMs).toBe(1_100)
    expect(second.y).toBeCloseTo(SPAWN_Y - second.speed * 0.9, 9)
  })
})

describe('the oval', () => {
  const bubble = { x: 200, y: 400 }

  it('includes its centre and its edges', () => {
    expect(isInBubble(bubble, { x: 200, y: 400 })).toBe(true)
    expect(isInBubble(bubble, { x: 270, y: 400 })).toBe(true)
    expect(isInBubble(bubble, { x: 130, y: 400 })).toBe(true)
    expect(isInBubble(bubble, { x: 200, y: 444 })).toBe(true)
    expect(isInBubble(bubble, { x: 200, y: 356 })).toBe(true)
  })

  it('excludes points just outside its edges', () => {
    expect(isInBubble(bubble, { x: 270.5, y: 400 })).toBe(false)
    expect(isInBubble(bubble, { x: 200, y: 444.5 })).toBe(false)
  })

  it('is an oval, not a circle: wider than it is tall', () => {
    // 50 px from the centre: inside sideways, outside up or down.
    expect(isInBubble(bubble, { x: 250, y: 400 })).toBe(true)
    expect(isInBubble(bubble, { x: 200, y: 450 })).toBe(false)
    // Near a "corner": inside a 140 × 88 box, but outside the oval.
    expect(isInBubble(bubble, { x: 260, y: 435 })).toBe(false)
  })
})

describe('tapping', () => {
  function playedFor(seed: number, timeMs: number) {
    const setupResult = setup(seededRandom(seed))
    setupResult.game.start()
    setupResult.game.update(timeMs)
    return setupResult
  }

  /** A point covered by exactly one bubble, of the given type. */
  function pointOnlyOn(bubbles: readonly Bubble[], type: 'good' | 'bad') {
    const point = findPoint(bubbles, (under) => under.length === 1 && under[0].emotion.type === type)
    if (!point) throw new Error(`no point covered only by a ${type} bubble`)
    return { x: point.x, y: point.y, bubble: point.under[0] }
  }

  it('gives +1 for a good emotion and −1 for a bad one, and removes it', () => {
    const { game, score } = playedFor(6, 10_000)

    const good = pointOnlyOn(game.bubbles, 'good')
    game.tap(good)
    expect(score.value).toBe(1)
    expect(game.bubbles).not.toContain(good.bubble)

    const bad = pointOnlyOn(game.bubbles, 'bad')
    game.tap(bad)
    expect(score.value).toBe(0)
    expect(game.bubbles).not.toContain(bad.bubble)
  })

  it('counts every bubble under the tap', () => {
    const { game, score } = setup(seededRandom(8))
    game.start()
    // Play until some point is covered by several bubbles.
    let best: ReturnType<typeof findPoint<Bubble>>
    for (let t = 0; t <= 60_000 && !best; t += 250) {
      game.update(t)
      best = findPoint(game.bubbles, (under) => under.length > 1, { step: 10 })
    }
    expect(best!.under.length).toBeGreaterThan(1)
    const countBefore = game.bubbles.length
    const scoreBefore = score.value

    game.tap(best!)

    expect(score.value - scoreBefore).toBe(tapValue(best!.under))
    expect(game.bubbles).toHaveLength(countBefore - best!.under.length)
    for (const bubble of best!.under) {
      expect(game.bubbles).not.toContain(bubble)
    }
  })

  it('counts a tap on the very edge of an oval, but not just outside it', () => {
    const { game } = playedFor(9, 10_000)
    const side = BUBBLE_WIDTH / 2
    const bubble = game.bubbles.find(
      (b) =>
        bubblesAt(game.bubbles, b.x + side, b.y).length === 1 &&
        bubblesAt(game.bubbles, b.x + side + 0.5, b.y).length === 0,
    )!

    game.tap({ x: bubble.x + side + 0.5, y: bubble.y })
    expect(game.bubbles).toContain(bubble)

    game.tap({ x: bubble.x + side, y: bubble.y })
    expect(game.bubbles).not.toContain(bubble)
  })

  it('does nothing when tapping empty space', () => {
    const { game, score } = playedFor(10, 3_000)
    const countBefore = game.bubbles.length

    game.tap({ x: 200, y: 100 })

    expect(game.bubbles).toHaveLength(countBefore)
    expect(score.value).toBe(0)
  })
})

describe('mistakes', () => {
  function setupWithMistakes(seed: number) {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const score = createScore({ lifecycle })
    const mistakes: { mistake: string; emotion: Emotion; scoreThen: number }[] = []
    const game = createEmotionsRise({
      emotions: { good: emotions.positive, bad: emotions.negative },
      score,
      random: seededRandom(seed),
      onMistake: (mistake, emotion) => mistakes.push({ mistake, emotion, scoreThen: score.value }),
    })
    return { game, score, mistakes }
  }

  it('reports every bad emotion tapped and every good one missed, and nothing else', () => {
    const { game, mistakes } = setupWithMistakes(21)
    game.start()

    for (let t = 0; t <= 60_000; t += 100) {
      game.update(t)
      // Tap the oldest bubble every 4 s, so others escape.
      if (t % 4_000 === 0 && game.bubbles[0] && game.bubbles[0].y < 700) {
        game.tap({ x: game.bubbles[0].x, y: game.bubbles[0].y })
      }
    }

    const { badTapped, goodMissed, goodTapped, badLetGo } = game.stats
    expect(badTapped).toBeGreaterThan(0)
    expect(goodMissed).toBeGreaterThan(0)
    expect(goodTapped + badLetGo).toBeGreaterThan(0)
    expect(mistakes.filter((m) => m.mistake === 'badTapped')).toHaveLength(badTapped)
    expect(mistakes.filter((m) => m.mistake === 'goodMissed')).toHaveLength(goodMissed)
    for (const { mistake, emotion } of mistakes) {
      expect(emotion.type).toBe(mistake === 'badTapped' ? 'bad' : 'good')
    }
  })

  it('reports a mistake after its point has been taken', () => {
    const { game, score, mistakes } = setupWithMistakes(22)
    game.start()

    for (let t = 0; t <= 60_000 && mistakes.length === 0; t += 100) {
      game.update(t)
    }

    expect(mistakes[0].mistake).toBe('goodMissed')
    expect(mistakes[0].scoreThen).toBe(score.value)
  })

  it('works without anyone listening', () => {
    const { game } = setup(seededRandom(23))
    game.start()

    expect(() => {
      for (let t = 0; t <= 60_000; t += 500) {
        game.update(t)
        game.tap({ x: 200, y: 400 })
      }
    }).not.toThrow()
  })
})

describe('round record', () => {
  it('starts at zero', () => {
    const { game } = setup()
    const zero = { goodTapped: 0, badTapped: 0, goodMissed: 0, badLetGo: 0 }

    expect(game.stats).toEqual(zero)
    game.start()
    expect(game.stats).toEqual(zero)
  })

  it('counts good and bad emotions tapped, including several in one tap', () => {
    const { game } = setup(seededRandom(14))
    game.start()
    let expected = { goodTapped: 0, badTapped: 0 }

    for (let t = 0; t <= 30_000; t += 500) {
      game.update(t)
      const target = game.bubbles.find((b) => b.y < 700)
      if (!target) continue
      const under = bubblesAt(game.bubbles, target.x, target.y)
      expected = {
        goodTapped: expected.goodTapped + under.filter((b) => b.emotion.type === 'good').length,
        badTapped: expected.badTapped + under.filter((b) => b.emotion.type === 'bad').length,
      }
      game.tap({ x: target.x, y: target.y })
    }

    expect(expected.goodTapped).toBeGreaterThan(3)
    expect(expected.badTapped).toBeGreaterThan(3)
    expect(game.stats).toMatchObject(expected)
  })

  it('always matches the score: tapped good − tapped bad − missed good + let-go bad', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const random = seededRandom(seed)
      const { game, score } = setup(seededRandom(seed + 100))
      game.start()

      for (let t = 0; t <= 60_000; t += 100) {
        game.update(t)
        if (random() < 0.1) game.tap({ x: random() * 400, y: random() * 800 })
      }

      const { goodTapped, badTapped, goodMissed, badLetGo } = game.stats
      expect(goodTapped + badTapped + goodMissed + badLetGo).toBeGreaterThan(20)
      expect(score.value).toBe(goodTapped - badTapped - goodMissed + badLetGo)
    }
  })

  it('starts again from zero on every new round and on clear', () => {
    const { game } = setup()
    game.start()
    game.update(30_000)
    game.tap({ x: game.bubbles[0].x, y: game.bubbles[0].y })
    expect(Object.values(game.stats).some((n) => n > 0)).toBe(true)

    game.start()
    expect(Object.values(game.stats).every((n) => n === 0)).toBe(true)

    game.update(30_000)
    game.clear()
    expect(Object.values(game.stats).every((n) => n === 0)).toBe(true)
  })
})

describe('escaping', () => {
  it('costs a point for each good emotion that escapes and gives one for each bad one', () => {
    const { game, score } = setup(seededRandom(12))
    game.start()
    const yAt = (b: Bubble, t: number) => SPAWN_Y - (b.speed * (t - b.spawnedAtMs)) / 1000
    let previous: Bubble[] = []
    let goodEscaped = 0
    let badEscaped = 0

    for (let t = 0; t <= 60_000; t += 50) {
      game.update(t)
      for (const bubble of previous.filter((b) => !game.bubbles.includes(b))) {
        // It left in exactly the step where it became fully hidden above.
        expect(yAt(bubble, t) + BUBBLE_HEIGHT / 2).toBeLessThan(0)
        expect(yAt(bubble, t - 50) + BUBBLE_HEIGHT / 2).toBeGreaterThanOrEqual(0)
        if (bubble.emotion.type === 'good') goodEscaped++
        else badEscaped++
      }
      previous = [...game.bubbles]
    }

    expect(goodEscaped).toBeGreaterThan(5)
    expect(badEscaped).toBeGreaterThan(5)
    expect(score.value).toBe(badEscaped - goodEscaped)
    expect(game.stats).toEqual({
      goodTapped: 0,
      badTapped: 0,
      goodMissed: goodEscaped,
      badLetGo: badEscaped,
    })
  })

  it('only escapes once fully above the canvas', () => {
    const { game } = setup(constantRandom(0))
    game.start()
    const first = game.bubbles[0]
    // Speed 40 px/s: the bottom reaches y = 0 after (844 + 44) / 40 = 22.2 s.
    game.update(22_199)
    expect(game.bubbles).toContain(first)
    game.update(22_200)
    expect(game.bubbles).toContain(first)
    game.update(22_201)
    expect(game.bubbles).not.toContain(first)
  })
})
