import { LARGE_OVAL_TEXT, loadGreenBubbleImage, loadOvalImage } from '../shared/artwork'
import { readCssVariables } from '../shared/canvas-style'
import type { GameDefinition } from '../shared/game-shell'
import type { StatusTone } from '../shared/game-status'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import { CANVAS_FONT, chooseTextStyle, loadCanvasFont } from '../shared/text'
import {
  createBreakItDown,
  type GoalOutcome,
  type Mistake,
  type ShownGoal,
  type Turn,
} from './break-it-down'
import data from './data/break-it-down.json'
import { BREAK_COLORS, createTextLayout, DEFAULT_STYLES, drawScene, GOAL_TEXT } from './draw'
import { distractionsFrom, goalsFrom } from './goals'

const goals = goalsFrom(data)
const distractions = distractionsFrom(data)
const allGoals = goals.map((goal) => goal.title)
const allOptions = [...goals.flatMap((goal) => goal.actions), ...distractions]

/**
 * The status bar message for each kind of mistake. Adding a new kind of
 * mistake without a message here is a type error.
 */
const mistakeMessages: Record<Mistake, (turn: Turn) => string> = {
  distraction: ({ chosen }) => `Tapped a distraction: ${chosen?.text}`,
  tooSlow: () => 'Too slow: No action chosen',
}

export function mistakeMessage(mistake: Mistake, turn: Turn): string {
  return mistakeMessages[mistake](turn)
}

/** The status bar message when a goal is over, and its colour. */
const goalMessages: Record<GoalOutcome, { text: (goal: ShownGoal) => string; tone: StatusTone }> = {
  reached: { text: ({ goal }) => `Goal reached: ${goal.title}`, tone: 'good' },
  failed: { text: ({ goal }) => `Goal failed: ${goal.title}`, tone: 'bad' },
}

export function goalMessage(outcome: GoalOutcome, goal: ShownGoal): string {
  return goalMessages[outcome].text(goal)
}

export interface BreakItDownGameOptions {
  random?: Random
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
}

/**
 * Loads what Break It Down needs: the goal's bubble, the actions' oval and
 * the font, each settling on its own. Loading twice does not download twice.
 */
function loadAll(fonts?: FontLoader) {
  return Promise.allSettled([loadGreenBubbleImage(), loadOvalImage(), loadCanvasFont({ fonts })])
}

/** Throws why the first of `results` that failed did, if any did. */
function throwFirstFailure(results: readonly PromiseSettledResult<unknown>[]): void {
  const failed = results.find((result) => result.status === 'rejected')

  if (failed) {
    throw failed.reason
  }
}

/**
 * Loads what Break It Down needs, when the app starts, so it is usually
 * ready before the game is opened (the game loads it again in case it is
 * not). Fails if any of it does.
 */
export async function preloadBreakItDown(fonts?: FontLoader): Promise<void> {
  throwFirstFailure(await loadAll(fonts))
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'Big goals are reached through small correct actions.',
  'Distractions make the goals seem bigger.',
]

export function breakItDownGame({
  random = Math.random,
  fonts,
}: BreakItDownGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status, pace }) => {
    const game = createBreakItDown({
      goals,
      distractions,
      score,
      random,
      onMistake: (mistake, turn) => {
        status.show(mistakeMessage(mistake, turn), 'bad')
        mistakes.add()
      },
      onGoalOver: (outcome, goal) => {
        status.show(goalMessage(outcome, goal), goalMessages[outcome].tone)
      },
    })
    const colors = readCssVariables(canvas.element, BREAK_COLORS)
    const font = readCssVariables(canvas.element, CANVAS_FONT)
    const images: { goalImage?: HTMLImageElement; optionImage?: HTMLImageElement } = {}
    let text = createTextLayout(canvas.context, font, DEFAULT_STYLES)
    const draw = () => drawScene(canvas.context, game, { text, font, colors, ...images })

    return {
      instructions: INSTRUCTIONS,
      async load() {
        const loaded = await loadAll(fonts)
        const [goalImage, optionImage] = loaded

        // Each image that loaded is used, even if the other did not…
        if (goalImage.status === 'fulfilled') images.goalImage = goalImage.value
        if (optionImage.status === 'fulfilled') images.optionImage = optionImage.value

        // …and what did not load is still reported.
        throwFirstFailure(loaded)
      },
      reset() {
        game.clear()
        draw()
      },
      start() {
        // Measured now, with the font that actually loaded.
        text = createTextLayout(canvas.context, font, {
          goal: chooseTextStyle(canvas.context, font, allGoals, GOAL_TEXT),
          option: chooseTextStyle(canvas.context, font, allOptions, LARGE_OVAL_TEXT),
        })
        // At the pace chosen for this round.
        game.start(pace.pace)
        draw()
      },
      frame({ elapsedMs }) {
        game.update(elapsedMs)
        draw()
      },
      tap(point) {
        game.tap(point)
        draw()
      },
      end() {
        game.stop()
      },
      summary() {
        const { goalsReached, goalsFailed, good, distractions: distracted, tooSlow } = game.stats
        return [
          { label: 'Goals completed', value: goalsReached },
          { label: 'Goals failed', value: goalsFailed },
          { label: 'Good actions tapped', value: good },
          { label: 'Distractions tapped', value: distracted },
          { label: 'Too slow', value: tooSlow },
        ]
      },
    }
  }
}
