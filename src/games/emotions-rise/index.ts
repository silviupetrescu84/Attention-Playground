import { readCssVariables } from '../shared/canvas-style'
import type { GameDefinition } from '../shared/game-shell'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import { CANVAS_FONT, fitFontSize, fontAt, loadCanvasFont } from '../shared/text'
import emotions from './data/emotions.json'
import {
  drawScene,
  EMOTION_COLORS,
  EMOTION_TEXT_FIT,
  loadBubbleImage,
  type BubbleLook,
} from './draw'
import type { Emotion } from './emotion-generator'
import { createEmotionsRise, type Mistake } from './emotions-rise'

/**
 * The status bar message for each kind of mistake. Adding a new kind of
 * mistake without a message here is a type error.
 */
const mistakeMessages: Record<Mistake, (emotion: Emotion) => string> = {
  badTapped: ({ text }) => `Tapped a bad emotion: ${text}`,
  goodMissed: ({ text }) => `Missed a good emotion: ${text}`,
}

export function mistakeMessage(mistake: Mistake, emotion: Emotion): string {
  return mistakeMessages[mistake](emotion)
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
export async function preloadEmotionsRise(fonts?: FontLoader): Promise<HTMLImageElement> {
  const [, bubbleImage] = await Promise.all([
    loadCanvasFont({ fonts }),
    loadBubbleImage(),
  ])
  return bubbleImage
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
  return ({ canvas, score, mistakes, status }) => {
    const game = createEmotionsRise({
      emotions: { good: emotions.positive, bad: emotions.negative },
      score,
      random,
      onMistake: (mistake, emotion) => {
        status.show(mistakeMessage(mistake, emotion), 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, EMOTION_COLORS)
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
        const { goodTapped, goodMissed, badTapped, badLetGo } = game.stats
        return [
          { label: 'Good emotions tapped', value: goodTapped },
          { label: 'Good emotions missed', value: goodMissed },
          { label: 'Bad emotions tapped', value: badTapped },
          { label: 'Bad emotions let go', value: badLetGo },
        ]
      },
    }
  }
}
