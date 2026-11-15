import { DIFFICULTY } from '../../config/difficulty'
import { ovalOfWidth } from '../shared/artwork'
import { checkPositive } from '../shared/checks'
import { checkSteps, steppedAfter, type Steps } from '../shared/difficulty'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { ellipseTouchesBox } from '../shared/geometry'
import {
  createGoodOrBadTally,
  judge,
  type GoodOrBadCount,
  type GoodOrBadEnd,
  type GoodOrBadMistake,
  type GoodOrBadStats,
} from '../shared/good-or-bad'
import { randomItem, type Random } from '../shared/random'
import type { Score } from '../shared/score'
import { fadeAt } from '../shared/timed-turns'
import { createWordPicker, type Word, type WordLists, type WordPicker } from '../shared/word-picker'
import { createEmpowerment } from './empowerment'
import { createPad, type Pad } from './pad'

/**
 * The rules of Improve Inner Voice.
 *
 * Words fall from just below the score bar, each in an oval a quarter of the
 * canvas wide: the first as soon as the round starts, then one every
 * SPAWN_DELAY, shorter as more have come. Each is
 * good (helpful) or bad, at random, but never more than 4 of a kind in a row
 * (see the shared word picker). Each comes down in one of 7 COLUMNS, from
 * 1/8 of the way across to 7/8 (so it is all on the canvas), at least 2
 * columns from the one before. It falls at FALL_SPEED, faster as more have
 * come, keeping the speed it started with.
 *
 * The player moves a pad along the bottom (see pad.ts). The moment the pad
 * touches a word, the word stops and fades out over 0.1 s, with a green or
 * red hue:
 *
 * - catching a good word: +1;
 * - catching a bad word: a mistake;
 * - a good word that falls off the canvas: a mistake;
 * - a bad word that falls off the canvas: nothing (no points).
 *
 * Catching enough good words in a row empowers the player (see empowerment.ts):
 * their next mistake is forgiven instead, without a word, which ends it. A
 * bad word caught then disappears at once. Either way, it still counts in the
 * round's stats as what it was.
 *
 * Everything moves in steps of STEP_MS, so even a long frame cannot let a
 * word fall through the pad. When a mistake ends the round, everything
 * stops as it is.
 */

/** The oval every word is in: a quarter of the canvas wide. */
export const WORD_OVAL = ovalOfWidth(GAME_WIDTH / 4)

/** Where words come down: 1/8, 2/8… 7/8 of the way across. */
export const COLUMNS: readonly number[] = [1, 2, 3, 4, 5, 6, 7].map((k) => (GAME_WIDTH * k) / 8)

/** A word comes down at least this many columns from the one before. */
export const MIN_COLUMN_GAP = 2

/** Where a word's centre starts: the word just below the score bar. */
export const START_Y = GAME_BAR_HEIGHT + WORD_OVAL.height / 2

const { spawnDelayMsByWords, fallSpeedByWords } = DIFFICULTY.improveInnerVoice

/** The time from one word to the next, by how many have come (see config/difficulty.json). */
export const SPAWN_DELAY: Steps = spawnDelayMsByWords
checkSteps(SPAWN_DELAY, 'improveInnerVoice.spawnDelayMsByWords', checkPositive)

/** How fast a word falls, in px per second, by how many came before it. */
export const FALL_SPEED: Steps = fallSpeedByWords
checkSteps(FALL_SPEED, 'improveInnerVoice.fallSpeedByWords', checkPositive)

/** How long a word takes to fade in, and to fade out once caught. */
export const FADE_MS = 100

/** Everything moves on in steps of at most this much. */
export const STEP_MS = 10

/** A word does not come back while among the last this many of its kind. */
export const RECENT_TO_AVOID = 10

/** Points for each way a word can end (none for a bad one let fall). */
export const POINTS: Readonly<Partial<Record<GoodOrBadCount, number>>> = {
  goodTapped: 1,
}

export interface FallingWord extends GamePoint {
  readonly word: Word
  /** Which of COLUMNS it comes down in. */
  readonly column: number
  /** In px per second. */
  readonly speed: number
  /** When it starts to fade in. */
  readonly shownAtMs: number
  /** Falls until caught or off the canvas. */
  y: number
  /** When it was caught, or fell off; undefined until then. */
  endedAtMs: number | undefined
  /** Caught (`tapped`) or fallen off (`gone`); undefined while falling. */
  end: GoodOrBadEnd | undefined
}

/** How visible `falling` is at the round's time `timeMs`: 0 to 1. */
export function wordOpacityAt(falling: FallingWord, timeMs: number): number {
  const { shownAtMs, endedAtMs } = falling
  return fadeAt({ fromMs: shownAtMs, endedAtMs, inMs: FADE_MS, outMs: FADE_MS }, timeMs)
}

/** Whether the pad, where it is, touches `falling`'s oval as seen. */
export function padTouches(pad: Pad, falling: GamePoint): boolean {
  return ellipseTouchesBox(falling, WORD_OVAL.radiusX, WORD_OVAL.radiusY, pad.box)
}

/** The columns a word may come down in after one in `previous` (any, for the first). */
export function columnsAfter(previous: number | undefined): number[] {
  const all = COLUMNS.map((_, column) => column)
  return previous === undefined
    ? all
    : all.filter((column) => Math.abs(column - previous) >= MIN_COLUMN_GAP)
}

export interface ImproveInnerVoiceOptions {
  words: WordLists
  score: Score
  random?: Random
  /** Called for every mistake (not those forgiven). */
  onMistake?: (mistake: GoodOrBadMistake, falling: FallingWord) => void
}

export interface ImproveInnerVoice {
  /** The words falling, and those caught fading out, oldest first. */
  readonly words: readonly FallingWord[]
  readonly pad: Pad
  /** Whether the player's next mistake will be forgiven (see empowerment.ts). */
  readonly empowered: boolean
  /** The round's time at the last update. */
  readonly timeMs: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: GoodOrBadStats
  /** Removes everything, and puts the pad back in the middle. */
  clear(): void
  /** Starts a round: the first word starts to fall straight away. */
  start(): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** The player's finger is at `point` (`undefined`: lifted): the pad heads there. */
  drag(point: GamePoint | undefined): void
  /** Stops the round at once: nothing changes until the next start. */
  stop(): void
}

export function createImproveInnerVoice({
  words: { good, bad },
  score,
  random = Math.random,
  onMistake,
}: ImproveInnerVoiceOptions): ImproveInnerVoice {
  function newPicker(): WordPicker {
    return createWordPicker({ good, bad, recentToAvoid: RECENT_TO_AVOID, random, name: 'words' })
  }

  let picker = newPicker()
  let pad = createPad()
  let falling: FallingWord[] = []
  /** When the next word comes; undefined before the round starts. */
  let nextAtMs: number | undefined
  let shown = 0
  let lastColumn: number | undefined
  let timeMs = 0
  const empowerment = createEmpowerment()
  const tally = createGoodOrBadTally<FallingWord>({
    score,
    points: POINTS,
    onMistake(mistake, word) {
      if (!empowerment.forgive()) {
        onMistake?.(mistake, word)
      } else if (mistake === 'badTapped') {
        // Forgiven: it disappears at once, with no red hue.
        falling = falling.filter((other) => other !== word)
      }
    },
  })
  /** Set when the round is stopped, even in the middle of an update. */
  let stopped = false

  function show(atMs: number) {
    // Those that have faded out (or fallen off) are gone for good.
    falling = falling.filter(
      (word) => word.endedAtMs === undefined || atMs < word.endedAtMs + FADE_MS,
    )

    const column = randomItem(random, columnsAfter(lastColumn))
    lastColumn = column
    falling.push({
      word: picker.next(),
      column,
      x: COLUMNS[column],
      y: START_Y,
      speed: steppedAfter(FALL_SPEED, shown),
      shownAtMs: atMs,
      endedAtMs: undefined,
      end: undefined,
    })
    shown++
    nextAtMs = atMs + steppedAfter(SPAWN_DELAY, shown)
  }

  /** Ends `word` at `atMs`, caught or fallen off, and counts it. */
  function end(word: FallingWord, how: GoodOrBadEnd, atMs: number) {
    word.endedAtMs = atMs
    word.end = how

    if (judge(word.word.type, how).counted === 'goodTapped') {
      empowerment.caughtGood()
    }
    tally.count(word, word.word.type, how)
  }

  /** Moves everything on by `deltaMs`, to `atMs`: the pad, then the words. */
  function step(deltaMs: number, atMs: number) {
    pad.move(deltaMs)

    for (const word of falling.filter(({ endedAtMs }) => endedAtMs === undefined)) {
      word.y += (word.speed * deltaMs) / 1_000

      if (padTouches(pad, word)) {
        end(word, 'tapped', atMs)
      } else if (word.y - WORD_OVAL.height / 2 > GAME_HEIGHT) {
        end(word, 'gone', atMs)
      }

      // That was one mistake too many: everything stays as it is.
      if (stopped) {
        return
      }
    }
  }

  function clear() {
    pad = createPad()
    falling = []
    nextAtMs = undefined
    shown = 0
    lastColumn = undefined
    timeMs = 0
    tally.reset()
    empowerment.reset()
    stopped = false
  }

  return {
    get words() {
      return falling
    },
    get pad() {
      return pad
    },
    get empowered() {
      return empowerment.empowered
    },
    get timeMs() {
      return timeMs
    },
    get stats() {
      return tally.stats
    },
    clear,
    start() {
      clear()
      picker = newPicker()
      show(0)
    },
    update(elapsedMs) {
      while (!stopped && nextAtMs !== undefined && timeMs < elapsedMs) {
        const toMs = Math.min(elapsedMs, timeMs + STEP_MS, nextAtMs)
        step(toMs - timeMs, toMs)
        timeMs = toMs

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- step() can stop it
        if (!stopped && timeMs === nextAtMs) {
          show(timeMs)
        }
      }
    },
    drag(point) {
      if (!stopped) {
        pad.aim(point?.x)
      }
    },
    stop() {
      stopped = true
    },
  }
}
