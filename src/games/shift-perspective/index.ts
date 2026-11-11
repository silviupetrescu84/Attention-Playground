import { readCssVariables } from '../shared/canvas-style'
import type { GameDefinition } from '../shared/game-shell'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import { CANVAS_FONT, fitFontSize, loadCanvasFont } from '../shared/text'
import data from './data/shift-perspective.json'
import {
  CHOICE_TEXT_FIT,
  createTurnText,
  drawScene,
  loadBubbleImage,
  SHIFT_COLORS,
  THOUGHT_TEXT_FIT,
  type SceneLook,
} from './draw'
import { createShiftPerspective, type Mistake, type Turn } from './shift-perspective'
import { thoughtsFrom } from './thoughts'

const thoughts = thoughtsFrom(data)
const allThoughts = thoughts.map((thought) => thought.text)
const allChoices = thoughts.flatMap((thought) => [...thought.good, ...thought.bad])

/**
 * The status bar message for each kind of mistake. Adding a new kind of
 * mistake without a message here is a type error.
 */
const mistakeMessages: Record<Mistake, (turn: Turn) => string> = {
  badChosen: ({ chosen }) => `Chose a bad thought: ${chosen?.text}`,
  tooSlow: () => 'Too slow: No choice selected',
}

export function mistakeMessage(mistake: Mistake, turn: Turn): string {
  return mistakeMessages[mistake](turn)
}

export interface ShiftPerspectiveGameOptions {
  random?: Random
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
}

/**
 * Loads what Shift Perspective needs (its font and bubble image). Called
 * when the app starts, so it is usually ready before the game is opened, and
 * again by the game itself in case it is not. Loading twice does not
 * download twice.
 */
export async function preloadShiftPerspective(fonts?: FontLoader): Promise<HTMLImageElement> {
  const [, bubbleImage] = await Promise.all([loadCanvasFont({ fonts }), loadBubbleImage()])
  return bubbleImage
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'It doesn’t matter what happens, it matters how you react to it',
  'Read what happened, choose the reaction that does you good',
]

export function shiftPerspectiveGame({
  random = Math.random,
  fonts,
}: ShiftPerspectiveGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status }) => {
    const game = createShiftPerspective({
      thoughts,
      score,
      random,
      onMistake: (mistake, turn) => {
        status.show(mistakeMessage(mistake, turn), 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, SHIFT_COLORS)
    const font = readCssVariables(canvas.element, CANVAS_FONT)
    let bubbleImage: HTMLImageElement | undefined
    let textOf: SceneLook['textOf'] = createTurnText(canvas.context, font, {
      thoughtFontSize: THOUGHT_TEXT_FIT.maxSize,
      choiceFontSize: CHOICE_TEXT_FIT.maxSize,
    })
    const draw = () => drawScene(canvas.context, game, { textOf, font, colors, bubbleImage })

    return {
      instructions: INSTRUCTIONS,
      async load() {
        bubbleImage = await preloadShiftPerspective(fonts)
      },
      reset() {
        game.clear()
        draw()
      },
      start() {
        // Measured now, with the font that actually loaded.
        textOf = createTurnText(canvas.context, font, {
          thoughtFontSize: fitFontSize(canvas.context, font, allThoughts, THOUGHT_TEXT_FIT),
          choiceFontSize: fitFontSize(canvas.context, font, allChoices, CHOICE_TEXT_FIT),
        })
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
        const { good, bad, tooSlow } = game.stats
        return [
          { label: 'Good thoughts chosen', value: good },
          { label: 'Bad thoughts chosen', value: bad },
          { label: 'Too slow', value: tooSlow },
        ]
      },
    }
  }
}
