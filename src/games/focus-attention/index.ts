import { readCssVariables } from '../shared/canvas-style'
import { clearGameCanvas } from '../shared/game-canvas'
import type { GameDefinition } from '../shared/game-shell'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import { CANVAS_FONT, fitFontSize, loadCanvasFont } from '../shared/text'
import type { Word } from '../shared/word-picker'
import data from './data/focus-attention.json'
import {
  BUTTON_TEXT_FIT,
  drawScene,
  FOCUS_COLORS,
  loadBubbleImage,
  loadProjectorImage,
  WORD_TEXT_FIT,
  type SceneLook,
} from './draw'
import { BUTTONS, createFocusAttention, type Mistake } from './focus-attention'

const allWords = [...data.values, ...data.antiValues]
const buttonLabels = BUTTONS.map((button) => button.label)

/**
 * The status bar message for each kind of mistake. Adding a new kind of
 * mistake without a message here is a type error.
 */
const mistakeMessages: Record<Mistake, (word: Word) => string> = {
  focusedAntiValue: ({ text }) => `Focused on an anti-value: ${text}`,
  leftValue: ({ text }) => `Changed attention from a value: ${text}`,
  reachedProjector: ({ text }) => `Too slow: ${text} reached the projector`,
}

export function mistakeMessage(mistake: Mistake, word: Word): string {
  return mistakeMessages[mistake](word)
}

export interface FocusAttentionGameOptions {
  random?: Random
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
}

/**
 * Loads what Focus Attention needs (its font, bubble and projector). Called
 * when the app starts, so it is usually ready before the game is opened,
 * and again by the game itself in case it is not. Loading twice does not
 * download twice.
 */
export async function preloadFocusAttention(
  fonts?: FontLoader,
): Promise<{ bubbleImage: HTMLImageElement; projectorImage: HTMLImageElement }> {
  const [, bubbleImage, projectorImage] = await Promise.all([
    loadCanvasFont({ fonts }),
    loadBubbleImage(),
    loadProjectorImage(),
  ])
  return { bubbleImage, projectorImage }
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'The more you focus on your values, the more they benefit you',
  'Every moment you make choices to follow your values or not',
  'Choose the right values, change your attention from the ones that don’t serve you',
]

export function focusAttentionGame({
  random = Math.random,
  fonts,
}: FocusAttentionGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status }) => {
    const game = createFocusAttention({
      values: data.values,
      antiValues: data.antiValues,
      score,
      random,
      onMistake: (mistake, word) => {
        status.show(mistakeMessage(mistake, word), 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, FOCUS_COLORS)
    const font = readCssVariables(canvas.element, CANVAS_FONT)
    let look: SceneLook = {
      wordFontSize: WORD_TEXT_FIT.maxSize,
      buttonFontSize: BUTTON_TEXT_FIT.maxSize,
      font,
      colors,
    }
    const draw = () => drawScene(canvas.context, game, look)

    return {
      instructions: INSTRUCTIONS,
      async load() {
        look = { ...look, ...(await preloadFocusAttention(fonts)) }
      },
      reset() {
        game.clear()
        // Nothing of the game shows with the Start button: it appears when the round starts.
        clearGameCanvas(canvas.context)
      },
      start() {
        // Measured now, with the font that actually loaded.
        look = {
          ...look,
          wordFontSize: fitFontSize(canvas.context, font, allWords, WORD_TEXT_FIT),
          buttonFontSize: fitFontSize(canvas.context, font, buttonLabels, BUTTON_TEXT_FIT),
        }
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
        const { valuesFocused, valuesLeft, antiValuesLeft, antiValuesFocused, reached } =
          game.stats
        return [
          { label: 'Values focused on', value: valuesFocused },
          { label: 'Values changed attention from', value: valuesLeft },
          { label: 'Anti-values changed attention from', value: antiValuesLeft },
          { label: 'Anti-values focused on', value: antiValuesFocused },
          { label: 'Reached the projector', value: reached },
        ]
      },
    }
  }
}
