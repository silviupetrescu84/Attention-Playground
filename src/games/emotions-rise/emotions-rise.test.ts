import { describe, expect, it } from 'vitest'
import { createGameLifecycle } from '../shared/game-lifecycle'
import { createScore } from '../shared/score'
import { bubblesAt, findPoint } from '../../test/emotions-rise/bubbles'
import { constantRandom, seededRandom } from '../../test/random'
import emotions from './data/emotions.json'
import type { Emotion } from './emotion-generator'
import {
  BUBBLE_HEIGHT,
  BUBBLE_HIT_HEIGHT,
  BUBBLE_HIT_WIDTH,
  BUBBLE_WIDTH,
  createEmotionsRise,
  DIFFICULTY_SETTINGS,
  DIFFICULTY_STEPS,
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
  positionAt,
  SPAWN_Y,
  startSway,
  SWAY_AMPLITUDE,
  SWAY_WAVELENGTH,
  swayX,
  type Bubble,
  type EmotionsRiseOptions,
} from './emotions-rise'

type ExtraOptions = Pick<EmotionsRiseOptions, 'difficultySteps' | 'onMistake'>

function setup(random: () => number = seededRandom(1), options: ExtraOptions = {}) {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const game = createEmotionsRise({
    emotions: { good: emotions.positive, bad: emotions.negative },
    score,
    random,
    ...options,
  })
  return { score, game }
}

/** Long enough to play through every difficulty step, then a while at the hardest. */
const WHOLE_RAMP_MS = DIFFICULTY_STEPS.at(-1)![0] + 50_000

/** Never gets harder: the game keeps its starting values. */
const noRamp: ExtraOptions = { difficultySteps: [] }

/** Plays `untilMs` in small steps; returns every bubble ever spawned, in order. */
function playAndRecord(game: ReturnType<typeof setup>['game'], untilMs: number) {
  const spawned = new Set<Bubble>()
  for (let t = 0; t <= untilMs; t += 50) {
    game.update(t)
    game.bubbles.forEach((bubble) => spawned.add(bubble))
  }
  return [...spawned].sort((a, b) => a.spawnedAtMs - b.spawnedAtMs)
}

/** Points a tap of this bubble set is worth: +1 per good, nothing for bad ones. */
function tapValue(bubbles: readonly Bubble[]) {
  return bubbles.filter((b) => b.emotion.type === 'good').length
}

describe('settings', () => {
  it('uses the agreed numbers', () => {
    expect([BUBBLE_WIDTH, BUBBLE_HEIGHT]).toEqual([140, 77])
    expect([BUBBLE_HIT_WIDTH, BUBBLE_HIT_HEIGHT]).toEqual([137, 74])
    expect([MIN_SPEED, MAX_SPEED]).toEqual([40, 80])
    expect([MIN_SPAWN_DELAY_MS, MAX_SPAWN_DELAY_MS]).toEqual([700, 1_500])
    expect(MIN_SIDEWAYS_DISTANCE).toBe(25)
    expect(MIN_CENTRE_DISTANCE).toBe(50)
    expect([SWAY_AMPLITUDE, SWAY_WAVELENGTH]).toEqual([5, 100])
    expect(DIFFICULTY_STEPS).toEqual([
      [20_000, 10],
      [40_000, 25],
      [60_000, 45],
      [80_000, 70],
      [100_000, 110],
    ])
  })

  it('gets harder by making bubbles faster and bringing them sooner', () => {
    expect(DIFFICULTY_SETTINGS).toEqual({
      minSpeed: { start: 40, harder: 'higher' },
      maxSpeed: { start: 80, harder: 'higher' },
      minSpawnDelayMs: { start: 700, harder: 'lower' },
      maxSpawnDelayMs: { start: 1_500, harder: 'lower' },
    })
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

describe('swaying', () => {
  /** Where a bubble that appeared at `spawnX` is, sideways, after rising each of `heights` px. */
  const xsAt = (spawnX: number, heights: readonly number[]) =>
    heights.map((risen) => swayX(startSway(spawnX), risen))
  /** Every spawn x the game can pick, every 0.5 px. */
  const everySpawnX = Array.from({ length: 521 }, (_, i) => 70 + i / 2)
  /** 0, 1, 2 … `to` px risen. */
  const heightsTo = (to: number) => Array.from({ length: to + 1 }, (_, i) => i)

  it('starts exactly where the bubble appears', () => {
    for (const spawnX of everySpawnX) {
      expect(swayX(startSway(spawnX), 0), `spawn ${spawnX}`).toBeCloseTo(spawnX, 9)
    }
  })

  it('sways 5 px either side, once there and back for every 100 px risen, like a snake', () => {
    // From the left half, it heads right first: a quarter wave (25 px) to the
    // right-most point, back through its path, to the left-most, and back.
    const xs = xsAt(150, [0, 12.5, 25, 50, 75, 100, 125, 150, 175, 200])
    const expected = [150, 150 + 5 * Math.SQRT1_2, 155, 150, 145, 150, 155, 150, 145, 150]
    xs.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 9))
  })

  it('heads towards the middle first from the right half too', () => {
    const xs = xsAt(250, [0, 25, 50, 75, 100])
    ;[250, 245, 250, 255, 250].forEach((x, i) => expect(xs[i]).toBeCloseTo(x, 9))
  })

  it('turns only at its widest points, twice per 100 px, never drifting away', () => {
    for (const spawnX of [70, 80, 150, 200, 260, 330]) {
      const xs = xsAt(spawnX, heightsTo(1_000))
      const turns = xs.filter(
        (x, i) => i > 0 && i < xs.length - 1 && (x - xs[i - 1]) * (xs[i + 1] - x) < 0,
      )
      // 10 waves: 20 turns (the start at an edge is not counted as a turn).
      expect(turns.length, `spawn ${spawnX}`).toBeGreaterThanOrEqual(19)
      expect(turns.length, `spawn ${spawnX}`).toBeLessThanOrEqual(20)
      // Sampled every 1 px, so the widest points may be missed by a hair.
      const [min, max] = [Math.min(...xs), Math.max(...xs)]
      expect(max - min, `spawn ${spawnX}`).toBeCloseTo(10, 1)
    }
  })

  it('sways around where it appears when there is room', () => {
    for (const spawnX of [75, 100, 199.5, 200, 200.5, 300, 325]) {
      expect(startSway(spawnX).centre).toBe(spawnX)
    }
  })

  it('goes right first from the left edge, staying fully inside the canvas', () => {
    // Its path is moved in to 75, so it sways between 70 and 80.
    expect(startSway(70).centre).toBe(75)
    const xs = xsAt(70, [0, 10, 25, 50, 75, 100])
    expect(xs[1]).toBeGreaterThan(70)
    ;[70, 75 - 5 * Math.cos(Math.PI / 5), 75, 80, 75, 70].forEach((x, i) =>
      expect(xs[i]).toBeCloseTo(x, 9),
    )
  })

  it('goes left first from the right edge, staying fully inside the canvas', () => {
    expect(startSway(330).centre).toBe(325)
    const xs = xsAt(330, [0, 10, 25, 50, 75, 100])
    expect(xs[1]).toBeLessThan(330)
    ;[330, 325 + 5 * Math.cos(Math.PI / 5), 325, 320, 325, 330].forEach((x, i) =>
      expect(xs[i]).toBeCloseTo(x, 9),
    )
  })

  it('heads inwards first from close to a side, before reaching it', () => {
    // 72 is 2 px from the left-most place (70): its path is moved in to 75.
    expect(startSway(72).centre).toBe(75)
    expect(swayX(startSway(72), 1)).toBeGreaterThan(72)
    expect(startSway(328).centre).toBe(325)
    expect(swayX(startSway(328), 1)).toBeLessThan(328)
  })

  it('keeps the bubble fully inside the canvas wherever it appears, all the way up', () => {
    const heights = heightsTo(900)
    for (const spawnX of everySpawnX) {
      const xs = xsAt(spawnX, heights)
      expect(Math.min(...xs) - BUBBLE_WIDTH / 2, `spawn ${spawnX}`).toBeGreaterThanOrEqual(-1e-9)
      expect(Math.max(...xs) + BUBBLE_WIDTH / 2, `spawn ${spawnX}`).toBeLessThanOrEqual(400 + 1e-9)
    }
  })

  it('places a bubble by the time: rising at its speed, swaying by how far it has risen', () => {
    const bubble: Bubble = {
      emotion: { text: 'Joy', type: 'good' },
      x: 150,
      y: SPAWN_Y,
      speed: 50,
      spawnedAtMs: 1_000,
      sway: startSway(150),
    }

    // 0.5 s at 50 px/s: 25 px up, a quarter wave: at its right-most point.
    expect(positionAt(bubble, 1_500)).toEqual({ x: 155, y: SPAWN_Y - 25 })
    // 1 s: 50 px up, half a wave: back on its path.
    const later = positionAt(bubble, 2_000)
    expect(later.y).toBe(SPAWN_Y - 50)
    expect(later.x).toBeCloseTo(150, 9)
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

  it('keeps delays of 0.7–1.5 s and speeds of 40–80 px/s when there is no ramp', () => {
    const { game } = setup(seededRandom(3), noRamp)
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

    const spawned = playAndRecord(game, WHOLE_RAMP_MS)
    expect(spawned.length).toBeGreaterThan(40)
    for (let i = 1; i < spawned.length; i++) {
      const [before, bubble] = [spawned[i - 1], spawned[i]]
      // Where the previous bubble was (swayed) when this one appeared.
      const then = positionAt(before, bubble.spawnedAtMs)
      const spawnX = swayX(bubble.sway, 0)
      expect(Math.abs(spawnX - then.x)).toBeGreaterThanOrEqual(25 - 1e-9)
      expect(Math.hypot(spawnX - then.x, SPAWN_Y - then.y)).toBeGreaterThanOrEqual(50 - 1e-9)
    }
  })

  it('does not space the first bubble of a new round from the last round', () => {
    // Random 0 always picks the leftmost allowed place: 70 when nothing is in
    // the way. 0.7 s later the first is only 28 px higher, and has swayed
    // right to 75 − 5 cos(2π × 28 / 100) ≈ 75.9, so the second bubble must be
    // √(50² − 28²) ≈ 41.4 px to the side of that: 117.4.
    const { game } = setup(constantRandom(0))
    game.start()
    game.update(700)
    expect(game.bubbles.at(-1)!.x).toBeCloseTo(117.4, 1)

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

  it('removes everything on clear, tapped bubbles too', () => {
    const { game } = setup()
    game.start()
    game.update(2_000)
    game.tap({ x: game.bubbles[0].x, y: game.bubbles[0].y })
    expect(game.tapped).toHaveLength(1)

    game.clear()

    expect([game.bubbles, game.tapped, game.timeMs]).toEqual([[], [], 0])
  })
})

describe('getting harder', () => {
  /** Emotions Rise's schedule, written out as multipliers, latest first. */
  const schedule = [
    [100_000, 2.1],
    [80_000, 1.7],
    [60_000, 1.45],
    [40_000, 1.25],
    [20_000, 1.1],
  ] as const
  const expectedMultiplierAt = (timeMs: number) =>
    schedule.find(([atMs]) => atMs <= timeMs)?.[1] ?? 1

  it('by default speeds bubbles up and brings them sooner, following its schedule', () => {
    const { game } = setup(seededRandom(3))
    game.start()

    const bubbles = playAndRecord(game, WHOLE_RAMP_MS)

    for (let i = 0; i < bubbles.length; i++) {
      const { speed, spawnedAtMs } = bubbles[i]
      const multiplier = expectedMultiplierAt(spawnedAtMs)
      const where = `bubble ${i}, at ${spawnedAtMs} ms`
      expect(speed, where).toBeGreaterThanOrEqual(40 * multiplier - 1e-9)
      expect(speed, where).toBeLessThanOrEqual(80 * multiplier + 1e-9)
      const next = bubbles[i + 1]
      if (!next) continue
      // The delay is chosen when this bubble appears, with the difficulty then.
      const delay = next.spawnedAtMs - spawnedAtMs
      expect(delay, where).toBeGreaterThanOrEqual(700 / multiplier - 1e-9)
      expect(delay, where).toBeLessThanOrEqual(1_500 / multiplier + 1e-9)
    }
    // It really reached the last step: faster and closer together than at ×1.7.
    expect(Math.max(...bubbles.map((b) => b.speed))).toBeGreaterThan(80 * 1.7)
    const delays = bubbles.slice(1).map((b, i) => b.spawnedAtMs - bubbles[i].spawnedAtMs)
    expect(Math.min(...delays)).toBeLessThan(700 / 1.7)
  })

  it('changes nothing before the first step, then applies it to the next bubble', () => {
    // Random 0: the slowest speed and the shortest delay every time.
    const { game } = setup(constantRandom(0))
    game.start()

    game.update(21_200)

    // 0, 0.7, … 19.6 s at ×1. The delay after 19.6 s was chosen at ×1 too: 20.3 s.
    // From 20.3 s it is ×1.1: 44 px/s, and the next one 700 / 1.1 ms later.
    const spawned = game.bubbles.map(({ spawnedAtMs, speed }) => ({ spawnedAtMs, speed }))
    expect(spawned.slice(0, 29)).toEqual(
      Array.from({ length: 29 }, (_, i) => ({ spawnedAtMs: i * 700, speed: 40 })),
    )
    expect(spawned.slice(29)).toEqual([
      { spawnedAtMs: 20_300, speed: expect.closeTo(44, 9) },
      { spawnedAtMs: expect.closeTo(20_300 + 700 / 1.1, 9), speed: expect.closeTo(44, 9) },
    ])
  })

  it('keeps the speed of bubbles already rising when the game gets harder', () => {
    const { game } = setup(constantRandom(0))
    game.start()
    const first = game.bubbles[0]

    game.update(21_000)

    expect(first.speed).toBe(40)
    expect(first.y).toBeCloseTo(SPAWN_Y - 40 * 21, 9)
  })

  it('uses the difficulty of the moment each bubble is due, even after a long frame', () => {
    const stepByStep = setup(seededRandom(15))
    const oneLongFrame = setup(seededRandom(15))
    for (const { game } of [stepByStep, oneLongFrame]) game.start()

    playAndRecord(stepByStep.game, 25_000)
    oneLongFrame.game.update(25_000)

    expect(oneLongFrame.game.bubbles.length).toBeGreaterThan(10)
    expect(oneLongFrame.game.bubbles).toEqual(stepByStep.game.bubbles)
  })

  it('follows the steps it is given', () => {
    // ×2 from 1 s and ×3 from 2 s: 40, 80, 120 px/s; delays 700, 350, 233 ms.
    const { game } = setup(constantRandom(0), {
      difficultySteps: [
        [1_000, 100],
        [2_000, 200],
      ],
    })
    game.start()

    game.update(2_100)

    expect(game.bubbles.map(({ spawnedAtMs, speed }) => [spawnedAtMs, speed])).toEqual([
      [0, 40],
      [700, 40],
      [1_400, 80],
      [1_750, 80],
      [2_100, 120],
    ])
  })

  it('keeps about as many bubbles on screen late in the round as without a ramp', () => {
    /** Average number of bubbles on screen from `fromMs` to the end of the ramp, over 8 rounds. */
    function averageOnScreen(options: ExtraOptions, fromMs: number) {
      let total = 0
      let samples = 0
      for (const seed of [31, 32, 33, 34, 35, 36, 37, 38]) {
        const { game } = setup(seededRandom(seed), options)
        game.start()
        for (let t = 0; t <= WHOLE_RAMP_MS; t += 100) {
          game.update(t)
          if (t >= fromMs) {
            total += game.bubbles.length
            samples++
          }
        }
      }
      return total / samples
    }

    const withRamp = averageOnScreen({}, 80_000)
    const withoutRamp = averageOnScreen(noRamp, 80_000)

    // Bubbles come 1.7–2.1× as often but also leave 1.7–2.1× as fast.
    expect(withRamp / withoutRamp).toBeGreaterThan(0.9)
    expect(withRamp / withoutRamp).toBeLessThan(1.2)
  })

  it('starts every new round at the starting values again', () => {
    const { game } = setup(constantRandom(0))
    game.start()
    game.update(90_000)

    game.start()
    game.update(700)

    expect(game.bubbles.map(({ spawnedAtMs, speed }) => [spawnedAtMs, speed])).toEqual([
      [0, 40],
      [700, 40],
    ])
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

describe('swaying in the game', () => {
  it('sways every bubble on its own path, by how far it has risen, every frame', () => {
    const { game } = setup(seededRandom(16))
    game.start()
    let checked = 0

    for (let t = 0; t <= 30_000; t += 50) {
      game.update(t)
      for (const bubble of game.bubbles) {
        const risen = (bubble.speed * (t - bubble.spawnedAtMs)) / 1000
        const { centre, phase } = bubble.sway
        const expected = centre + 5 * Math.sin(phase + (2 * Math.PI * risen) / 100)
        expect(bubble.x).toBeCloseTo(expected, 9)
        checked++
      }
    }

    expect(checked).toBeGreaterThan(1_000)
  })

  it('appears where it was placed, then sways from there', () => {
    // Random 0 places the first bubble at the left-most place, 70.
    const { game } = setup(constantRandom(0))
    game.start()
    const [first] = game.bubbles
    expect(first.x).toBe(70)
    expect(first.sway).toEqual(startSway(70))

    game.update(0)
    expect(first.x).toBeCloseTo(70, 9)
    game.update(250)
    // 10 px up: it has started to the right, towards the middle.
    expect(first.x).toBeCloseTo(75 - 5 * Math.cos(Math.PI / 5), 9)
  })

  it('keeps every bubble fully inside the canvas sideways, all round long', () => {
    for (const seed of [41, 42, 43]) {
      const { game } = setup(seededRandom(seed))
      game.start()
      let leftMost = 400
      let rightMost = 0

      for (let t = 0; t <= WHOLE_RAMP_MS; t += 50) {
        game.update(t)
        for (const { x } of game.bubbles) {
          leftMost = Math.min(leftMost, x - BUBBLE_WIDTH / 2)
          rightMost = Math.max(rightMost, x + BUBBLE_WIDTH / 2)
        }
      }

      expect(leftMost).toBeGreaterThanOrEqual(-1e-9)
      expect(rightMost).toBeLessThanOrEqual(400 + 1e-9)
      // It really got close to both sides.
      expect(leftMost).toBeLessThan(1)
      expect(rightMost).toBeGreaterThan(399)
    }
  })

  it('hits a bubble where it is now, after swaying', () => {
    // Random 0: the first bubble appears at 70, rising 40 px/s, and has swayed
    // right to ≈ 75.9 after 0.699 s, just before the next one appears.
    const { game } = setup(constantRandom(0))
    game.start()
    const [first] = game.bubbles
    game.update(699)
    expect(first.x).toBeCloseTo(75 - 5 * Math.cos((2 * Math.PI * 27.96) / 100), 9)

    // Just inside its right edge.
    game.tap({ x: first.x + BUBBLE_HIT_WIDTH / 2 - 0.5, y: first.y })

    expect(game.bubbles).not.toContain(first)
  })
})

describe('the oval', () => {
  const bubble = { x: 200, y: 400 }
  const side = BUBBLE_HIT_WIDTH / 2
  const top = BUBBLE_HIT_HEIGHT / 2

  it('includes its centre and its edges', () => {
    expect(isInBubble(bubble, { x: 200, y: 400 })).toBe(true)
    expect(isInBubble(bubble, { x: 200 + side, y: 400 })).toBe(true)
    expect(isInBubble(bubble, { x: 200 - side, y: 400 })).toBe(true)
    expect(isInBubble(bubble, { x: 200, y: 400 + top })).toBe(true)
    expect(isInBubble(bubble, { x: 200, y: 400 - top })).toBe(true)
  })

  it('excludes points just outside its edges', () => {
    expect(isInBubble(bubble, { x: 200 + side + 0.5, y: 400 })).toBe(false)
    expect(isInBubble(bubble, { x: 200, y: 400 + top + 0.5 })).toBe(false)
  })

  it('is an oval, not a circle: wider than it is tall', () => {
    // 50 px from the centre: inside sideways, outside up or down.
    expect(isInBubble(bubble, { x: 250, y: 400 })).toBe(true)
    expect(isInBubble(bubble, { x: 200, y: 450 })).toBe(false)
    // Inside the PNG rectangle but in a transparent corner outside the oval.
    expect(
      isInBubble(bubble, {
        x: 200 + BUBBLE_WIDTH * 0.4,
        y: 400 + BUBBLE_HEIGHT * 0.4,
      }),
    ).toBe(false)
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

  it('gives +1 for a good emotion and nothing for a bad one, and removes it', () => {
    const { game, score } = playedFor(6, 10_000)

    const good = pointOnlyOn(game.bubbles, 'good')
    game.tap(good)
    expect(score.value).toBe(1)
    expect(game.bubbles).not.toContain(good.bubble)

    const bad = pointOnlyOn(game.bubbles, 'bad')
    game.tap(bad)
    expect(score.value).toBe(1)
    expect(game.stats.badTapped).toBe(1)
    expect(game.bubbles).not.toContain(bad.bubble)
  })

  it('stops a tapped bubble where it is and fades it out: right if good, wrong if bad', () => {
    const { game } = playedFor(6, 10_000)
    const good = pointOnlyOn(game.bubbles, 'good')
    const { x, y } = good.bubble
    game.tap(good)
    const bad = pointOnlyOn(game.bubbles, 'bad')
    game.tap(bad)

    expect(game.tapped).toEqual([
      { item: good.bubble, right: true, atMs: 10_000 },
      { item: bad.bubble, right: false, atMs: 10_000 },
    ])

    game.update(10_099)
    expect(game.tapped.map((tapped) => tapped.item)).toEqual([good.bubble, bad.bubble])
    // Tapped, it stays where it was: it neither rises nor sways.
    expect([good.bubble.x, good.bubble.y]).toEqual([x, y])

    game.update(10_100)
    expect(game.tapped).toEqual([])
  })

  it('can tap a bubble only once, and a tapped one never escapes', () => {
    const missed: Emotion[] = []
    const { game, score } = setup(seededRandom(6), {
      onMistake: (mistake, emotion) => {
        if (mistake === 'goodMissed') missed.push(emotion)
      },
    })
    game.start()
    game.update(10_000)
    const good = pointOnlyOn(game.bubbles, 'good')

    game.tap(good)
    game.tap(good)
    expect(score.value).toBe(1)
    expect(game.stats.goodTapped).toBe(1)

    // Long after it would have risen out of the top.
    for (let t = 10_000; t <= 40_000; t += 100) game.update(t)
    expect(missed.length).toBeGreaterThan(0)
    expect(missed).not.toContain(good.bubble.emotion)
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
    const side = BUBBLE_HIT_WIDTH / 2
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
    const mistakes: { mistake: string; emotion: Emotion }[] = []
    const played = setup(seededRandom(seed), {
      onMistake: (mistake, emotion) => mistakes.push({ mistake, emotion }),
    })
    return { ...played, mistakes }
  }

  it('reports every bad emotion tapped and every good one missed, and nothing else', () => {
    const { game, mistakes } = setupWithMistakes(21)
    game.start()

    for (let t = 0; t <= WHOLE_RAMP_MS; t += 100) {
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

  it('reports the good emotion that escaped', () => {
    const { game, mistakes } = setupWithMistakes(22)
    game.start()
    const escaping = new Set<Bubble>()

    for (let t = 0; t <= 60_000 && mistakes.length === 0; t += 100) {
      game.bubbles.forEach((bubble) => escaping.add(bubble))
      game.update(t)
    }

    const escaped = [...escaping].filter(
      (b) => b.emotion.type === 'good' && !game.bubbles.includes(b),
    )
    expect(escaped.length).toBeGreaterThan(0)
    expect(mistakes).toEqual(escaped.map((b) => ({ mistake: 'goodMissed', emotion: b.emotion })))
  })

  it('reports the bad emotion tapped', () => {
    const { game, mistakes } = setupWithMistakes(6)
    game.start()
    game.update(10_000)
    const bad = findPoint(
      game.bubbles,
      (under) => under.length === 1 && under[0].emotion.type === 'bad',
    )!

    game.tap(bad)

    expect(mistakes).toEqual([{ mistake: 'badTapped', emotion: bad.under[0].emotion }])
  })

  it('works without anyone listening', () => {
    const { game } = setup(seededRandom(23))
    game.start()

    expect(() => {
      for (let t = 0; t <= WHOLE_RAMP_MS; t += 500) {
        game.update(t)
        game.tap({ x: 200, y: 400 })
      }
    }).not.toThrow()
  })
})

describe('stopping', () => {
  /** A game that stops itself at its first mistake, as one too many would. */
  function stoppingAtFirstMistake(random: () => number) {
    const played = setup(random, { onMistake: () => played.game.stop() })
    played.game.start()
    return played
  }

  it('counts only the first of two bad bubbles under a tap if its mistake stops the round', () => {
    const { game } = stoppingAtFirstMistake(seededRandom(8))
    let point: ReturnType<typeof findPoint<Bubble>>
    for (let t = 0; t <= 120_000 && !point; t += 250) {
      game.update(t)
      point = findPoint(
        game.bubbles,
        (under) => under.length >= 2 && under.every((b) => b.emotion.type === 'bad'),
        { step: 10 },
      )
    }
    const [first, ...rest] = point!.under

    game.tap(point!)

    expect(game.stats.badTapped).toBe(1)
    expect(game.bubbles).not.toContain(first)
    for (const bubble of rest) expect(game.bubbles).toContain(bubble)
  })

  it('counts only the first good bubble escaping if that mistake stops the round', () => {
    const { game, score } = stoppingAtFirstMistake(seededRandom(12))

    // One long frame: many bubbles escape at once.
    game.update(60_000)

    expect(game.stats.goodMissed).toBe(1)
    expect(score.value).toBe(game.stats.badLetGo)
  })

  it('moves nothing and brings nothing new once stopped', () => {
    const { game } = setup(seededRandom(2))
    game.start()
    game.update(5_000)
    const before = game.bubbles.map((bubble) => ({ ...bubble }))

    game.stop()
    game.update(10_000)
    game.tap({ x: before[0].x, y: before[0].y })

    expect(game.bubbles.map((bubble) => ({ ...bubble }))).toEqual(before)
  })

  it('plays normally again from the next start', () => {
    const { game } = setup(constantRandom(0))
    game.start()
    game.stop()

    game.start()
    game.update(700)

    expect(game.bubbles.map((b) => b.spawnedAtMs)).toEqual([0, 700])
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

  it('always matches the score: tapped good + let-go bad', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const random = seededRandom(seed)
      const { game, score } = setup(seededRandom(seed + 100))
      game.start()

      for (let t = 0; t <= WHOLE_RAMP_MS; t += 100) {
        game.update(t)
        if (random() < 0.1) game.tap({ x: random() * 400, y: random() * 800 })
      }

      const { goodTapped, badTapped, goodMissed, badLetGo } = game.stats
      expect(goodTapped + badLetGo).toBeGreaterThan(10)
      // Mistakes were made too: a round with all four outcomes.
      expect(badTapped).toBeGreaterThan(0)
      expect(goodMissed).toBeGreaterThan(0)
      expect(score.value).toBe(goodTapped + badLetGo)
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
  it('gives a point for each bad emotion that escapes, and none for good ones', () => {
    const { game, score } = setup(seededRandom(12))
    game.start()
    const yAt = (b: Bubble, t: number) => SPAWN_Y - (b.speed * (t - b.spawnedAtMs)) / 1000
    let previous: Bubble[] = []
    let goodEscaped = 0
    let badEscaped = 0

    for (let t = 0; t <= WHOLE_RAMP_MS; t += 50) {
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
    expect(score.value).toBe(badEscaped)
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
    // Speed 40 px/s: the bottom reaches y = 0 after (838.5 + 38.5) / 40 = 21.925 s.
    game.update(21_924)
    expect(game.bubbles).toContain(first)
    game.update(21_925)
    expect(game.bubbles).toContain(first)
    game.update(21_926)
    expect(game.bubbles).not.toContain(first)
  })
})
