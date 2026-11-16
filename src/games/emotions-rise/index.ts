import { loadOvalImage } from '../shared/artwork'
import { readCssVariables } from '../shared/canvas-style'
import { BUBBLE_COLORS } from '../shared/feedback'
import type { GameDefinition } from '../shared/game-shell'
import { mistakeMessageFor, summaryOf, type GoodOrBadWords } from '../shared/good-or-bad'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import { CANVAS_FONT, fitFontSize, fontAt, loadWithCanvasFont } from '../shared/text'
import emotions from './data/emotions.json'
import { drawScene, EMOTION_TEXT_FIT, type BubbleLook } from './draw'
import { createEmotionsRise } from './emotions-rise'

/** How emotions are named in the status bar and the summary. */
export const EMOTION_WORDS: GoodOrBadWords = {
  one: 'emotion',
  many: 'emotions',
  tapped: 'tapped',
  letGo: 'let go',
}

export interface EmotionsRiseGameOptions {
  random?: Random
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
}

const allEmotions = [...emotions.positive, ...emotions.negative]

/**
 * Loads what Emotions Rise needs (its font and bubble image). Called when the app starts, so
 * it is usually ready before the game is opened, and again by the game
 * itself in case it is not. Loading twice does not download twice.
 */
export function preloadEmotionsRise(fonts?: FontLoader): Promise<HTMLImageElement> {
  return loadWithCanvasFont(loadOvalImage, { fonts })
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'Emotions rise but sometimes they are good, sometimes they are bad but all the same',
  'Choose the good ones, let the bad ones fade away',
  'Don’t let good emotions fade away',
]

export function emotionsRiseGame({
  random = Math.random,
  fonts,
}: EmotionsRiseGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status, pace }) => {
    const game = createEmotionsRise({
      emotions: { good: emotions.positive, bad: emotions.negative },
      score,
      random,
      onMistake: (mistake, emotion) => {
        status.show(mistakeMessageFor(mistake, emotion.text, EMOTION_WORDS), 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, BUBBLE_COLORS)
    const font = readCssVariables(canvas.element, CANVAS_FONT)
    let look: BubbleLook = { font: fontAt(font, EMOTION_TEXT_FIT.maxSize), colors }
    let bubbleImage: HTMLImageElement | undefined
    const draw = () => drawScene(canvas.context, game, look, bubbleImage)

    return {
      instructions: INSTRUCTIONS,
      async load() {
        bubbleImage = await preloadEmotionsRise(fonts)
      },
      reset() {
        game.clear()
        draw()
      },
      start() {
        // Measured now, with the font that actually loaded.
        const fontSize = fitFontSize(canvas.context, font, allEmotions, EMOTION_TEXT_FIT)
        look = { font: fontAt(font, fontSize), colors }
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
        return summaryOf(game.stats, EMOTION_WORDS)
      },
    }
  }
}
