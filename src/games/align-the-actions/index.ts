import { readCssVariables } from '../shared/canvas-style'
import { clearGameCanvas } from '../shared/game-canvas'
import type { GameDefinition } from '../shared/game-shell'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import { CANVAS_FONT, fitFontSize, loadCanvasFont } from '../shared/text'
import { createAlignTheActions, type Mistake } from './align-the-actions'
import data from './data/align_the_actions_goals.json'
import { ALIGN_COLORS, createActionText, drawScene, GOAL_TEXT_FIT } from './draw'
import { goalsFrom, type Action, type Goal } from './goals'

const goals = goalsFrom(data)
const goalTitles = goals.map((goal) => goal.title)

/**
 * The status bar message for each kind of mistake. Adding a new kind of
 * mistake without a message here is a type error.
 */
const mistakeMessages: Record<Mistake, (action: Action, goal: Goal) => string> = {
  against: (action, goal) =>
    `Works against “${goal.title}”: ${action.text}`,
  otherGoal: (action) =>
    `Belongs to “${action.goal.title}”: ${action.text}`,
}

export function mistakeMessage(mistake: Mistake, action: Action, goal: Goal): string {
  return mistakeMessages[mistake](action, goal)
}

export interface AlignTheActionsGameOptions {
  random?: Random
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
}

/**
 * Loads what Align the Actions needs (its font). Called when the app starts,
 * so it is usually ready before the game is opened, and again by the game
 * itself in case it is not. Loading twice does not download twice.
 */
export function preloadAlignTheActions(fonts?: FontLoader): Promise<boolean> {
  return loadCanvasFont({ fonts })
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'Big goals or ways of living are defined by the actions we do',
  'Choose the action that aligns with the stated goal. Stay the course until it’s fulfilled',
]

export function alignTheActionsGame({
  random = Math.random,
  fonts,
}: AlignTheActionsGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status }) => {
    const game = createAlignTheActions({
      goals,
      score,
      random,
      onMistake: (mistake, action, goal) => {
        status.show(mistakeMessage(mistake, action, goal), 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, ALIGN_COLORS)
    const font = readCssVariables(canvas.element, CANVAS_FONT)
    const textOf = createActionText(canvas.context, font)
    let goalFontSize = GOAL_TEXT_FIT.maxSize
    const draw = () => drawScene(canvas.context, game, { goalFontSize, textOf, colors, font })

    return {
      instructions: INSTRUCTIONS,
      async load() {
        await preloadAlignTheActions(fonts)
      },
      reset() {
        game.clear()
        // Nothing of the game shows with the Start button: it appears when the round starts.
        clearGameCanvas(canvas.context)
      },
      start() {
        // Measured now, with the font that actually loaded.
        goalFontSize = fitFontSize(canvas.context, font, goalTitles, GOAL_TEXT_FIT)
        game.start()
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
        const { aligned, against, otherGoal } = game.stats
        return [
          { label: 'Aligned actions chosen', value: aligned },
          { label: 'Actions against the goal chosen', value: against },
          { label: 'Actions for another goal chosen', value: otherGoal },
        ]
      },
    }
  }
}
