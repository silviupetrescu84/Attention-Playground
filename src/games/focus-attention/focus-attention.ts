import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { stillFading, type Chosen } from '../shared/feedback'
import type { Random } from '../shared/random'
import type { Score } from '../shared/score'
import { createWordPicker, type Word, type WordPicker } from '../shared/word-picker'

/**
 * The rules of Focus Attention.
 *
 * A projector sits in the middle of the canvas. Values and anti-values, in
 * bubbles, come in from random places just outside the edges of the canvas
 * and move straight towards it. The projector's beam points at one of them,
 * the target: the player answers for it with one of two buttons at the
 * bottom. Focusing on a value, or changing attention from an anti-value:
 * +1. Changing attention from a value, or focusing on an anti-value, is a
 * mistake (see onMistake) and scores nothing. Either way the target stops
 * where it is, takes a green hue (right) or a red one (a mistake) and fades
 * out over 0.1 s (see the shared feedback), and the beam moves at once to the
 * bubble closest to the projector.
 *
 * The target stays the same until it is answered for or reaches the
 * projector, even if another bubble gets closer. Only a bubble whose centre
 * is in view (between the score bar and the buttons) can be the target.
 * Every bubble that reaches the projector (its edge touches the projector's
 * glowing orb) disappears and is a mistake, target or not.
 *
 * The first bubble comes the moment the round starts, then one every 3 s.
 * Each comes at least 130 px from where the last 3 that came (and are still
 * on screen) are then; if nowhere is, as far from them as possible. Words
 * are picked like emotions in Emotions Rise (see the shared word picker),
 * never repeating one of the last 10 of their kind.
 *
 * The game gets harder with time (round time, in seconds):
 *
 * - every bubble on screen moves at 15 px/s, then 17.5 from 10 s, 22.5 from
 *   20 s, 30 from 30 s, 40 from 40 s, 52.5 from 50 s and 65 from 60 s on;
 * - bubbles come every 3 s, then every 2.8 s from 70 s, 2.6 s from 80 s,
 *   2.4 s from 90 s and 2 s from 100 s on.
 *
 * When a mistake ends the round, everything stops where it is.
 */

/** From `atMs` into the round, the value is `value`. */
export type TimeStep = readonly [atMs: number, value: number]

/** The value of a setting that starts at `start` and follows `steps`, at `timeMs`. */
export function valueAt(start: number, steps: readonly TimeStep[], timeMs: number): number {
  let value = start

  for (const [atMs, stepValue] of steps) {
    if (timeMs >= atMs) {
      value = stepValue
    }
  }

  return value
}

/** How fast every bubble moves at first, in px/s. */
export const START_SPEED = 15
export const SPEED_STEPS: readonly TimeStep[] = [
  [10_000, 17.5],
  [20_000, 22.5],
  [30_000, 30],
  [40_000, 40],
  [50_000, 52.5],
  [60_000, 65],
]

/** How often a bubble comes at first. */
export const START_SPAWN_INTERVAL_MS = 3_000
export const SPAWN_INTERVAL_STEPS: readonly TimeStep[] = [
  [70_000, 2_800],
  [80_000, 2_600],
  [90_000, 2_400],
  [100_000, 2_000],
]

/** The speed of every bubble at `timeMs`. */
export function speedAt(timeMs: number): number {
  return valueAt(START_SPEED, SPEED_STEPS, timeMs)
}

/** The time between a bubble that comes at `timeMs` and the next. */
export function spawnIntervalAt(timeMs: number): number {
  return valueAt(START_SPAWN_INTERVAL_MS, SPAWN_INTERVAL_STEPS, timeMs)
}

/** How far a bubble moves from `fromMs` to `toMs`, following every speed change. */
export function distanceBetween(fromMs: number, toMs: number): number {
  let distance = 0
  let at = fromMs

  for (const [stepAtMs] of SPEED_STEPS) {
    if (stepAtMs > at && stepAtMs < toMs) {
      distance += (speedAt(at) * (stepAtMs - at)) / 1_000
      at = stepAtMs
    }
  }

  return distance + (speedAt(at) * (toMs - at)) / 1_000
}

/** When a bubble that starts moving at `fromMs` has moved `distance` px. */
export function whenMoved(fromMs: number, distance: number): number {
  let left = distance
  let at = fromMs

  for (const [stepAtMs] of SPEED_STEPS) {
    if (stepAtMs > at) {
      const canMove = (speedAt(at) * (stepAtMs - at)) / 1_000
      if (left <= canMove) {
        break
      }
      left -= canMove
      at = stepAtMs
    }
  }

  return at + (left / speedAt(at)) * 1_000
}

export const POINTS = {
  focusValue: 1,
  leaveAntiValue: 1,
} as const

/** Where the projector is: the middle of the canvas below the score bar. */
export const CENTRE: GamePoint = { x: GAME_WIDTH / 2, y: (GAME_BAR_HEIGHT + GAME_HEIGHT) / 2 }
/** The projector image is drawn at this size… */
export const PROJECTOR_SIZE = 180
/** …and its glowing orb reaches this share of the way from its centre to its edge (measured). */
export const PROJECTOR_ORB = 0.55
/** The radius of the projector's orb: bubbles that touch it reach the projector. */
export const PROJECTOR_RADIUS = (PROJECTOR_SIZE / 2) * PROJECTOR_ORB

/** Bubbles are drawn at this size (the image, glow included)… */
export const BUBBLE_SIZE = 130
/** …and the bubble itself, without its glow, is at least this share of it (measured). */
export const BUBBLE_BODY = 0.9
/** The radius of a bubble as seen. */
export const BUBBLE_RADIUS = (BUBBLE_SIZE / 2) * BUBBLE_BODY
/** A bubble reaches the projector when its centre is this close to the projector's. */
export const TOUCH_DISTANCE = PROJECTOR_RADIUS + BUBBLE_RADIUS

/** A new bubble comes at least this far from the last few that came… */
export const MIN_SPAWN_DISTANCE = 130
/** …counting this many. */
export const SPAWN_SPACING_COUNT = 3

export type Answer = 'focus' | 'change'

export interface Button {
  readonly answer: Answer
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const BUTTON_MARGIN = 12
const BUTTON_HEIGHT = 60
const BUTTON_WIDTH = (GAME_WIDTH - 3 * BUTTON_MARGIN) / 2
/** Where the buttons start, at the bottom of the canvas. */
export const BUTTONS_TOP = GAME_HEIGHT - BUTTON_MARGIN - BUTTON_HEIGHT

const BUTTON_LABELS: readonly (readonly [Answer, string])[] = [
  ['focus', 'Focus'],
  ['change', 'Change attention'],
]

/** Side by side along the bottom of the canvas. */
export const BUTTONS: readonly Button[] = BUTTON_LABELS.map(([answer, label], i) => ({
  answer,
  label,
  x: BUTTON_MARGIN + i * (BUTTON_WIDTH + BUTTON_MARGIN),
  y: BUTTONS_TOP,
  width: BUTTON_WIDTH,
  height: BUTTON_HEIGHT,
}))

/** The button at `point`, if any. */
export function buttonAt({ x, y }: GamePoint): Button | undefined {
  return BUTTONS.find(
    (button) =>
      x >= button.x &&
      x <= button.x + button.width &&
      y >= button.y &&
      y <= button.y + button.height,
  )
}

/** Where a bubble's centre must be for it to be the target: between the bar and the buttons. */
export const VIEW = { left: 0, right: GAME_WIDTH, top: GAME_BAR_HEIGHT, bottom: BUTTONS_TOP }

/**
 * Where new bubbles can come from, every 2 px: just outside the canvas, all
 * the way round (so they come in from out of sight).
 */
export const SPAWN_POINTS: readonly GamePoint[] = (() => {
  const outside = BUBBLE_SIZE / 2
  const [left, top] = [-outside, -outside]
  const [right, bottom] = [GAME_WIDTH + outside, GAME_HEIGHT + outside]
  const points: GamePoint[] = []
  for (let x = left; x < right; x += 2) points.push({ x, y: top })
  for (let y = top; y < bottom; y += 2) points.push({ x: right, y })
  for (let x = right; x > left; x -= 2) points.push({ x, y: bottom })
  for (let y = bottom; y > top; y -= 2) points.push({ x: left, y })
  return points
})()

/**
 * Where a new bubble comes from: a random one of SPAWN_POINTS at least
 * MIN_SPAWN_DISTANCE from every one of `others` (where they are now); if
 * there is none, the one furthest from the closest of them.
 */
export function pickSpawnPoint(others: readonly GamePoint[], random: Random): GamePoint {
  const distances = SPAWN_POINTS.map((point) =>
    Math.min(Infinity, ...others.map((other) => Math.hypot(point.x - other.x, point.y - other.y))),
  )
  const allowed = SPAWN_POINTS.filter((_, i) => distances[i] >= MIN_SPAWN_DISTANCE)

  if (allowed.length > 0) {
    return allowed[Math.min(allowed.length - 1, Math.floor(random() * allowed.length))]
  }

  return SPAWN_POINTS[distances.indexOf(Math.max(...distances))]
}

export interface Bubble extends Word {
  /** Where it came from. */
  readonly start: GamePoint
  readonly spawnedAtMs: number
  /** When its centre comes into view: it can be the target from then. */
  readonly inViewAtMs: number
  /** When it reaches the projector. */
  readonly touchAtMs: number
  /** Current centre, updated every frame. */
  x: number
  y: number
}

/** Where `bubble`'s centre is at `timeMs`: on its way from where it came from to the projector. */
export function positionAt({ start, spawnedAtMs }: Bubble, timeMs: number): GamePoint {
  const length = Math.hypot(CENTRE.x - start.x, CENTRE.y - start.y)
  const moved = Math.min(length, distanceBetween(spawnedAtMs, timeMs))
  return {
    x: start.x + ((CENTRE.x - start.x) * moved) / length,
    y: start.y + ((CENTRE.y - start.y) * moved) / length,
  }
}

/** How far a bubble coming from `start` moves before its centre is in VIEW. */
export function distanceToView(start: GamePoint): number {
  const length = Math.hypot(CENTRE.x - start.x, CENTRE.y - start.y)
  // How far along, as a share of the way, each side of VIEW is crossed.
  const across = (from: number, to: number, low: number, high: number) =>
    from < low ? (low - from) / (to - from) : from > high ? (high - from) / (to - from) : 0
  const share = Math.max(
    across(start.x, CENTRE.x, VIEW.left, VIEW.right),
    across(start.y, CENTRE.y, VIEW.top, VIEW.bottom),
  )
  return share * length
}

/** A mistake: focusing on an anti-value, leaving a value, or letting one reach the projector. */
export type Mistake = 'focusedAntiValue' | 'leftValue' | 'reachedProjector'

/** What happened to the values and anti-values of a round. */
export interface FocusAttentionStats {
  readonly valuesFocused: number
  readonly valuesLeft: number
  readonly antiValuesLeft: number
  readonly antiValuesFocused: number
  /** Bubbles that reached the projector. */
  readonly reached: number
}

export interface FocusAttentionOptions {
  values: readonly string[]
  antiValues: readonly string[]
  score: Score
  random?: Random
  /** Called for every mistake, with the word it was about. */
  onMistake?: (mistake: Mistake, word: Word) => void
}

/** A button press, remembered briefly so it can be shown. */
export interface Press {
  readonly answer: Answer
  readonly atMs: number
}

export interface FocusAttention {
  /** Bubbles on screen, in the order they came. */
  readonly bubbles: readonly Bubble[]
  /** The bubble the beam points at, to answer for; none while none is in view. */
  readonly target: Bubble | undefined
  /** Bubbles answered for, fading out where they were. */
  readonly answered: readonly Chosen<Bubble>[]
  /** The last button pressed this round, if any. */
  readonly press: Press | undefined
  /** The round's time at the last update. */
  readonly timeMs: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: FocusAttentionStats
  /** Removes everything. */
  clear(): void
  /** Starts a round: the first bubble comes straight away. */
  start(): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** Presses the button tapped, if any, at the time of the last update. */
  tap(point: GamePoint): void
  /** Stops the round at once: nothing changes until the next start. */
  stop(): void
}

export const RECENT_WORDS_TO_AVOID = 10

export function createFocusAttention({
  values,
  antiValues,
  score,
  random = Math.random,
  onMistake,
}: FocusAttentionOptions): FocusAttention {
  let picker: WordPicker
  let bubbles: Bubble[] = []
  /** The last few bubbles that came, newest last (for spacing new ones). */
  let spawned: Bubble[] = []
  let target: Bubble | undefined
  let answered: Chosen<Bubble>[] = []
  let press: Press | undefined
  let nextSpawnAtMs = 0
  let timeMs = 0
  let started = false
  const noStats: FocusAttentionStats = {
    valuesFocused: 0,
    valuesLeft: 0,
    antiValuesLeft: 0,
    antiValuesFocused: 0,
    reached: 0,
  }
  let stats = noStats
  /** Set when the round is stopped, even in the middle of an update or tap. */
  let stopped = false

  function count(key: keyof FocusAttentionStats) {
    stats = { ...stats, [key]: stats[key] + 1 }
  }

  function spawn(atMs: number) {
    const lastOnScreen = spawned
      .filter((bubble) => bubbles.includes(bubble))
      .map((bubble) => positionAt(bubble, atMs))
    const start = pickSpawnPoint(lastOnScreen, random)
    const length = Math.hypot(CENTRE.x - start.x, CENTRE.y - start.y)
    const bubble: Bubble = {
      ...picker.next(),
      start,
      spawnedAtMs: atMs,
      inViewAtMs: whenMoved(atMs, distanceToView(start)),
      touchAtMs: whenMoved(atMs, length - TOUCH_DISTANCE),
      ...start,
    }
    bubbles.push(bubble)
    spawned = [...spawned, bubble].slice(-SPAWN_SPACING_COUNT)
    nextSpawnAtMs = atMs + spawnIntervalAt(atMs)
  }

  function remove(bubble: Bubble) {
    bubbles = bubbles.filter((other) => other !== bubble)
    if (bubble === target) {
      target = undefined
    }
  }

  /** With no target, the bubble in view closest to the projector becomes it. */
  function retarget(atMs: number) {
    if (target) {
      return
    }

    let closest = Infinity
    for (const bubble of bubbles.filter((candidate) => candidate.inViewAtMs <= atMs)) {
      const { x, y } = positionAt(bubble, atMs)
      const distance = Math.hypot(x - CENTRE.x, y - CENTRE.y)
      if (distance < closest) {
        closest = distance
        target = bubble
      }
    }
  }

  function moveTo(atMs: number) {
    timeMs = atMs
    answered = stillFading(answered, atMs)
    for (const bubble of bubbles) {
      Object.assign(bubble, positionAt(bubble, atMs))
    }
  }

  function reach(bubble: Bubble) {
    remove(bubble)
    count('reached')
    onMistake?.('reachedProjector', bubble)
  }

  function answer(bubble: Bubble, given: Answer) {
    remove(bubble)
    const isValue = bubble.type === 'good'
    const right = (given === 'focus') === isValue
    answered = [...answered, { item: bubble, right, atMs: timeMs }]

    if (given === 'focus' && isValue) {
      count('valuesFocused')
      score.add(POINTS.focusValue)
    } else if (given === 'change' && !isValue) {
      count('antiValuesLeft')
      score.add(POINTS.leaveAntiValue)
    } else if (given === 'change') {
      count('valuesLeft')
      onMistake?.('leftValue', bubble)
    } else {
      count('antiValuesFocused')
      onMistake?.('focusedAntiValue', bubble)
    }
  }

  /** The next moment something happens by itself, and what. */
  function nextEvent(): { atMs: number; run: () => void } {
    let next = { atMs: nextSpawnAtMs, run: () => spawn(nextSpawnAtMs) }

    for (const bubble of bubbles) {
      if (bubble.touchAtMs < next.atMs) {
        next = { atMs: bubble.touchAtMs, run: () => reach(bubble) }
      }
      // Coming into view only matters when there is no target.
      if (!target && bubble.inViewAtMs > timeMs && bubble.inViewAtMs < next.atMs) {
        next = { atMs: bubble.inViewAtMs, run: () => {} }
      }
    }

    return next
  }

  function update(elapsedMs: number) {
    if (stopped || !started) {
      return
    }

    // Everything happens at its exact moment, in order, even if a frame took long.
    for (let event = nextEvent(); event.atMs <= elapsedMs; event = nextEvent()) {
      moveTo(event.atMs)
      event.run()

      if (stopped) {
        return
      }

      retarget(event.atMs)
    }

    moveTo(elapsedMs)
  }

  function clear() {
    bubbles = []
    spawned = []
    target = undefined
    answered = []
    press = undefined
    nextSpawnAtMs = 0
    timeMs = 0
    stats = noStats
    started = false
    stopped = false
  }

  return {
    get bubbles() {
      return bubbles
    },
    get target() {
      return target
    },
    get answered() {
      return answered
    },
    get press() {
      return press
    },
    get timeMs() {
      return timeMs
    },
    get stats() {
      return stats
    },
    clear,
    start() {
      clear()
      picker = createWordPicker({
        good: values,
        bad: antiValues,
        recentToAvoid: RECENT_WORDS_TO_AVOID,
        random,
        name: 'values',
      })
      started = true
      update(0)
    },
    update,
    tap(point) {
      const button = buttonAt(point)

      if (stopped || !started || !button) {
        return
      }

      press = { answer: button.answer, atMs: timeMs }

      if (target) {
        answer(target, button.answer)

        if (!stopped) {
          retarget(timeMs)
        }
      }
    },
    stop() {
      stopped = true
    },
  }
}
