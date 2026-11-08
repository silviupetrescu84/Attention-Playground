import type { GameDefinition } from '../shared/game-shell'
import { loadFont, type FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import emotions from './data/emotions.json'
import {
  drawScene,
  fitFontSize,
  font,
  loadBubbleImage,
  MAX_FONT_SIZE,
} from './draw'
import type { Emotion } from './emotion-generator'
import { createEmotionsRise, POINTS, type Mistake } from './emotions-rise'

/**
 * The status bar message for each kind of mistake. Adding a new kind of
 * mistake without a message here is a type error.
 */
const mistakeMessages: Record<Mistake, (emotion: Emotion) => string> = {
  badTapped: ({ text }) => `Tapped a bad emotion: ${text} (−${POINTS.tapBad})`,
  goodMissed: ({ text }) => `Missed a good emotion: ${text} (−${POINTS.goodEscaped})`,
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
    loadFont(font(MAX_FONT_SIZE), { fonts }),
    loadBubbleImage(),
  ])
  return bubbleImage
}

export function emotionsRiseGame({
  random = Math.random,
  fonts,
}: EmotionsRiseGameOptions = {}): GameDefinition {
  return ({ canvas, score, status }) => {
    const game = createEmotionsRise({
      emotions: { good: emotions.positive, bad: emotions.negative },
      score,
      random,
      onMistake: (mistake, emotion) => status.show(mistakeMessage(mistake, emotion), 'bad'),
    })
    let fontSize = MAX_FONT_SIZE
    let bubbleImage: HTMLImageElement | undefined
    const draw = () => drawScene(canvas.context, game.bubbles, fontSize, bubbleImage)

    return {
      async load() {
        bubbleImage = await preloadEmotionsRise(fonts)
      },
      reset() {
        game.clear()
        draw()
      },
      start() {
        // Measured now, with the font that actually loaded.
        fontSize = fitFontSize(canvas.context, allEmotions)
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
