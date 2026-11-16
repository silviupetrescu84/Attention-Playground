import { DIFFICULTY } from '../../config/difficulty'
import { checkNotNegative, checkPositive, checkWholeNumber } from '../shared/checks'
import { createDeck, type Deck } from '../shared/deck'
import { checkSteps, steppedAfter, type Steps } from '../shared/difficulty'
import type { GamePoint } from '../shared/game-canvas'
import { isInEllipse } from '../shared/geometry'
import { clamp } from '../shared/numbers'
import { AS_SET, checkPaces, pacingFor, type Pace, type PacePercents } from '../shared/pace'
import { shuffled, type Random } from '../shared/random'
import type { Score } from '../shared/score'
import { FADE_MS, fadeAt, passDeadlines, type TimedTurn } from '../shared/timed-turns'
import type { Goal } from './goals'
import {
  GOAL_STEPS,
  goalSizeFor,
  MOST_ACTIONS_THAT_FIT,
  OPTION_HIT_HEIGHT,
  OPTION_HIT_WIDTH,
  placeOptions,
  ringOuterRadiusFor,
} from './layout'

/**
 * The rules of Make It Happen.
 *
 * A goal appears in a bubble in the middle of the canvas. It fades in over
 * 0.1 s and is shown alone at first, so the player can read it.
 * Then actions fade in over 0.1 s around it, in ovals at random places (see
 * layout.ts): one that leads to the goal and the rest distractions. Only
 * once they have faded in does the time to choose start (a ring around the
 * goal shows what is left; it stays full until then).
 *
 * - Tapping the good action: +1, and the goal gets a step bigger.
 * - Tapping a distraction, or choosing nothing in time: a mistake (see
 *   onMistake), and the goal gets a step smaller.
 *
 * Either way the actions fade out over 0.1 s, then the next ones fade in
 * over 0.1 s, and the goal's bubble changes size over RESIZE_MS. The steps
 * add up: a good action after a bad one only brings the goal back to its
 * size before. Once the goal is GOAL_STEPS steps bigger than it started it
 * is reached; GOAL_STEPS smaller and it is failed (no extra mistake: each
 * step was one already). Either way it fades out over RESIZE_MS as it gets to
 * that size, and the next goal fades in.
 *
 * Taps on actions that are fading out do nothing; taps on actions that are
 * fading in count.
 *
 * The game gets harder as more goals are shown, whether reached or failed:
 * more actions (OPTIONS) and less time to choose (TIME_LIMIT). Each goal
 * keeps what it starts with until it is over. The goal is shown alone for
 * READING_MS first. All three are set in config/difficulty.json; both times
 * are longer or shorter at the pace chosen (see the shared pace).
 *
 * Each goal is shown once, in random order, before any comes again; so is
 * each of a goal's actions, and each distraction. When a mistake ends the
 * round, everything stops as it is: the goal and its actions stay on screen.
 */

/** How much slower each pace is than the settings here (see config/difficulty.json and the shared pace). */
export const PACE_PERCENTS: PacePercents = DIFFICULTY.makeItHappen.paces
checkPaces(PACE_PERCENTS, 'makeItHappen.paces')

const { actionsByGoals, timeToChooseMsByGoals, readingMs } = DIFFICULTY.makeItHappen

/** How many actions each goal comes with, by how many goals came before it. */
export const OPTIONS: Steps = actionsByGoals
checkSteps(OPTIONS, 'makeItHappen.actionsByGoals', (value, name) => {
  checkWholeNumber(value, name, 2, MOST_ACTIONS_THAT_FIT)
})
checkWholeNumber(OPTIONS.change, 'makeItHappen.actionsByGoals.change')

/** The time to choose, for each goal, by how many goals came before it. */
export const TIME_LIMIT: Steps = timeToChooseMsByGoals
checkSteps(TIME_LIMIT, 'makeItHappen.timeToChooseMsByGoals', checkPositive)

/** The most actions ever shown at once: one good and the rest distractions. */
export const MOST_OPTIONS = Math.max(OPTIONS.start, OPTIONS.limit)

export const POINTS = {
  good: 1,
} as const

/** How long a goal is shown alone, from when it starts to fade in, before its first actions. */
export const READING_MS = readingMs
checkNotNegative(READING_MS, 'makeItHappen.readingMs')

/** How long the goal takes to change size (and, once over, to fade out). */
export const RESIZE_MS = 300

/** A goal reached (GOAL_STEPS bigger) or failed (GOAL_STEPS smaller). */
export type GoalOutcome = 'reached' | 'failed'

/** A goal from when it starts to fade in until it has faded out. */
export interface ShownGoal {
  readonly goal: Goal
  /** When it starts to fade in. */
  readonly shownAtMs: number
  /** How many actions each of its sets has. */
  readonly options: number
  /** The time to choose, for each of its sets. */
  readonly timeLimitMs: number
  /** Steps bigger than at the start (smaller if negative). */
  level: number
  /** The size it changes from, at `resizedAtMs`, to the size for `level`. */
  fromSize: number
  resizedAtMs: number
  /** When it was reached or failed, and starts to fade out; undefined until then. */
  endedAtMs: number | undefined
  outcome: GoalOutcome | undefined
}

export interface Option extends GamePoint {
  readonly text: string
  readonly good: boolean
}

/** One set of actions, from when it starts to fade in until it has faded out. */
export interface Turn extends TimedTurn {
  readonly goal: ShownGoal
  readonly options: readonly Option[]
  /** When the actions start to fade in: they can be tapped from then. */
  readonly shownAtMs: number
  /** When they have faded in, and the time to choose starts. */
  readonly readyAtMs: number
  endedAtMs: number | undefined
  /** What the player chose; undefined if nothing (yet). */
  chosen: Option | undefined
}

/** How visible `goal` is at the round's time `timeMs`: 0 to 1. */
export function goalOpacityAt({ shownAtMs, endedAtMs }: ShownGoal, timeMs: number): number {
  return fadeAt({ fromMs: shownAtMs, endedAtMs, outMs: RESIZE_MS }, timeMs)
}

/** The size of `goal`'s bubble image at `timeMs`, easing from its last size to its new one. */
export function goalSizeAt(goal: ShownGoal, timeMs: number): number {
  const progress = clamp((timeMs - goal.resizedAtMs) / RESIZE_MS, 0, 1)
  // Fast at first, slowing down as it gets there.
  const eased = 1 - (1 - progress) ** 3
  return goal.fromSize + (goalSizeFor(goal.level) - goal.fromSize) * eased
}

/** How visible `turn`'s actions are at `timeMs`: 0 to 1. They stop fading in when the turn ends. */
export function optionsOpacityAt({ shownAtMs, endedAtMs }: Turn, timeMs: number): number {
  return fadeAt({ fromMs: shownAtMs, endedAtMs }, timeMs)
}

/** Whether `point` is on `option`'s oval, as seen. */
export function isOnOption(point: GamePoint, option: GamePoint): boolean {
  return isInEllipse(point, option, OPTION_HIT_WIDTH / 2, OPTION_HIT_HEIGHT / 2)
}

/** A mistake the player can make: tapping a distraction, or nothing in time. */
export type Mistake = 'distraction' | 'tooSlow'

/** What happened in a round. */
export interface MakeItHappenStats {
  readonly goalsReached: number
  readonly goalsFailed: number
  readonly good: number
  readonly distractions: number
  readonly tooSlow: number
}

const NO_STATS: MakeItHappenStats = {
  goalsReached: 0,
  goalsFailed: 0,
  good: 0,
  distractions: 0,
  tooSlow: 0,
}

export interface MakeItHappenOptions {
  goals: readonly Goal[]
  distractions: readonly string[]
  score: Score
  random?: Random
  /** Called for every mistake. */
  onMistake?: (mistake: Mistake, turn: Turn) => void
  /** Called when a goal is reached or failed. */
  onGoalOver?: (outcome: GoalOutcome, goal: ShownGoal) => void
}

export interface MakeItHappen {
  /** The goal being shown, or about to be (while the one before fades out). */
  readonly goal: ShownGoal | undefined
  /** The goal before, while it fades out. */
  readonly previousGoal: ShownGoal | undefined
  /** The actions being shown, or about to be. */
  readonly turn: Turn | undefined
  /** The actions before, while they fade out. */
  readonly previousTurn: Turn | undefined
  /** The round's time at the last update. */
  readonly timeMs: number
  /** Counts for the current round (all 0 before it starts). */
  readonly stats: MakeItHappenStats
  /** Removes everything. */
  clear(): void
  /** Starts a round at `pace` (Normal if none): the first goal starts to fade in straight away. */
  start(pace?: Pace): void
  /** Moves everything to the round's time `elapsedMs`. */
  update(elapsedMs: number): void
  /** Chooses the action tapped, if any, at the time of the last update. */
  tap(point: GamePoint): void
  /** Stops the round at once: nothing changes until the next start. */
  stop(): void
}

/** What a round deals out, and how far it has got. */
interface Dealing {
  readonly goals: Deck<Goal>
  readonly distractions: Deck<string>
  /** Each goal's actions, dealt in turn; made when the goal first comes. */
  readonly actions: Map<Goal, Deck<string>>
  goalsShown: number
  /** The good action last shown, not to be shown again straight away. */
  lastAction: string | undefined
}

export function createMakeItHappen({
  goals,
  distractions,
  score,
  random = Math.random,
  onMistake,
  onGoalOver,
}: MakeItHappenOptions): MakeItHappen {
  if (goals.length < 2) {
    throw new RangeError(`Need at least 2 goals, got ${goals.length}`)
  }

  for (const { title, actions } of goals) {
    if (new Set(actions).size < 2) {
      throw new RangeError(`"${title}" needs at least 2 different actions`)
    }
  }

  if (new Set(distractions).size < MOST_OPTIONS - 1) {
    throw new RangeError(`Need at least ${MOST_OPTIONS - 1} different distractions`)
  }

  function newDealing(): Dealing {
    return {
      goals: createDeck(goals, random),
      distractions: createDeck(distractions, random),
      actions: new Map(),
      goalsShown: 0,
      lastAction: undefined,
    }
  }

  let dealing = newDealing()
  let pacing = AS_SET
  let goal: ShownGoal | undefined
  let previousGoal: ShownGoal | undefined
  let turn: Turn | undefined
  let previousTurn: Turn | undefined
  let timeMs = 0
  let stats = NO_STATS
  /** Set when the round is stopped, even in the middle of an update or tap. */
  let stopped = false

  function showGoal(atMs: number) {
    const [next] = dealing.goals.take(1, goal ? [goal.goal] : [])
    const shown: ShownGoal = {
      goal: next,
      shownAtMs: atMs,
      options: steppedAfter(OPTIONS, dealing.goalsShown),
      timeLimitMs: pacing.time(steppedAfter(TIME_LIMIT, dealing.goalsShown)),
      level: 0,
      fromSize: goalSizeFor(0),
      resizedAtMs: atMs,
      endedAtMs: undefined,
      outcome: undefined,
    }
    goal = shown
    dealing.goalsShown++
    dealing.lastAction = undefined
    showTurn(shown, atMs + pacing.time(READING_MS))
  }

  function actionsOf(shown: Goal): Deck<string> {
    const dealt = dealing.actions.get(shown) ?? createDeck(shown.actions, random)
    dealing.actions.set(shown, dealt)
    return dealt
  }

  function showTurn(shown: ShownGoal, atMs: number) {
    const { lastAction } = dealing
    const [action] = actionsOf(shown.goal).take(1, lastAction ? [lastAction] : [])
    dealing.lastAction = action
    const texts = [
      { text: action, good: true },
      ...dealing.distractions.take(shown.options - 1).map((text) => ({ text, good: false })),
    ]
    // Placed around the goal at the size it is changing to.
    const radius = ringOuterRadiusFor(goalSizeFor(shown.level))
    const positions = placeOptions(shown.options, radius, random)
    const readyAtMs = atMs + FADE_MS

    turn = {
      goal: shown,
      options: shuffled(random, texts).map((option, i) => ({ ...option, ...positions[i] })),
      shownAtMs: atMs,
      readyAtMs,
      timeLimitMs: shown.timeLimitMs,
      deadlineMs: readyAtMs + shown.timeLimitMs,
      endedAtMs: undefined,
      chosen: undefined,
    }
  }

  /** Counts what was chosen in `ended` (nothing if too slow), and tells of any mistake. */
  function count(ended: Turn, chosen: Option | undefined) {
    if (chosen?.good) {
      stats = { ...stats, good: stats.good + 1 }
      score.add(POINTS.good)
    } else if (chosen) {
      stats = { ...stats, distractions: stats.distractions + 1 }
      onMistake?.('distraction', ended)
    } else {
      stats = { ...stats, tooSlow: stats.tooSlow + 1 }
      onMistake?.('tooSlow', ended)
    }
  }

  /** Ends `over` at `atMs`, reached or failed, and brings the next goal once it has faded out. */
  function endGoal(over: ShownGoal, outcome: GoalOutcome, atMs: number) {
    over.outcome = outcome
    over.endedAtMs = atMs
    stats =
      outcome === 'reached'
        ? { ...stats, goalsReached: stats.goalsReached + 1 }
        : { ...stats, goalsFailed: stats.goalsFailed + 1 }
    previousGoal = over
    onGoalOver?.(outcome, over)
    showGoal(atMs + RESIZE_MS)
  }

  /** Ends `ended` at `atMs` with `chosen` (nothing if too slow), then brings what comes next. */
  function end(ended: Turn, chosen: Option | undefined, atMs: number) {
    ended.endedAtMs = atMs
    ended.chosen = chosen
    count(ended, chosen)

    // The mistake ended the round: everything stays as it is.
    if (stopped) {
      return
    }

    previousTurn = ended
    const shown = ended.goal
    // Once the actions have faded out.
    const changeAtMs = atMs + FADE_MS
    shown.fromSize = goalSizeAt(shown, changeAtMs)
    shown.resizedAtMs = changeAtMs
    shown.level += chosen?.good ? 1 : -1

    if (Math.abs(shown.level) < GOAL_STEPS) {
      showTurn(shown, changeAtMs)
    } else {
      endGoal(shown, shown.level > 0 ? 'reached' : 'failed', changeAtMs)
    }
  }

  function clear() {
    goal = undefined
    previousGoal = undefined
    turn = undefined
    previousTurn = undefined
    timeMs = 0
    stats = NO_STATS
    stopped = false
  }

  return {
    get goal() {
      return goal
    },
    get previousGoal() {
      return previousGoal
    },
    get turn() {
      return turn
    },
    get previousTurn() {
      return previousTurn
    },
    get timeMs() {
      return timeMs
    },
    get stats() {
      return stats
    },
    clear,
    start(pace: Pace = 'normal') {
      clear()
      pacing = pacingFor(pace, PACE_PERCENTS)
      dealing = newDealing()
      showGoal(0)
    },
    update(elapsedMs) {
      if (stopped || !turn) {
        return
      }

      timeMs = passDeadlines(elapsedMs, {
        current: () => turn,
        expire: (expired) => end(expired, undefined, expired.deadlineMs),
        stopped: () => stopped,
      })
    },
    tap(point) {
      // Nothing to choose until the actions start to fade in (nor while the
      // ones before fade out).
      if (stopped || !turn || timeMs < turn.shownAtMs) {
        return
      }

      // Ovals never overlap, so a tap is on one at most.
      const tapped = turn.options.find((option) => isOnOption(point, option))

      if (tapped) {
        end(turn, tapped, timeMs)
      }
    },
    stop() {
      stopped = true
    },
  }
}
