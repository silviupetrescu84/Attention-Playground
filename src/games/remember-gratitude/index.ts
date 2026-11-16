import { loadOvalImage, ovalTextShape } from '../shared/artwork'
import { readCssVariables, type BubbleSize } from '../shared/canvas-style'
import type { GameDefinition } from '../shared/game-shell'
import { mistakeMessageFor, summaryOf, type GoodOrBadWords } from '../shared/good-or-bad'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import { remember } from '../shared/remember'
import {
  CANVAS_FONT,
  chooseTextStyle,
  fitFontSize,
  loadWithCanvasFont,
  type TextStyle,
} from '../shared/text'
import data from './data/remember-gratitude.json'
import { createTurnText, DONE_TEXT_FIT, drawScene, GRATITUDE_COLORS } from './draw'
import { DONE_BUTTON } from './layout'
import { createRememberGratitude } from './remember-gratitude'
import { thingsFrom } from './things'

const things = thingsFrom(data)
const allThings = [...things.good, ...things.bad]

/** How things are named in the status bar and the summary. */
export const GRATITUDE_WORDS: GoodOrBadWords = {
  one: 'thing',
  many: 'things',
  tapped: 'tapped',
  letGo: 'left alone',
}

export interface RememberGratitudeGameOptions {
  random?: Random
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
}

/**
 * Loads what Remember Gratitude needs (its font and the oval). Called when
 * the app starts, so it is usually ready before the game is opened, and
 * again by the game itself in case it is not. Loading twice does not
 * download twice.
 */
export function preloadRememberGratitude(fonts?: FontLoader): Promise<HTMLImageElement> {
  return loadWithCanvasFont(loadOvalImage, { fonts })
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'Remember the things to be grateful for',
  'Once they turn around, tap them, then tap Done',
]

export function rememberGratitudeGame({
  random = Math.random,
  fonts,
}: RememberGratitudeGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status, pace }) => {
    const game = createRememberGratitude({
      things,
      score,
      random,
      onMistake: (mistake, thing) => {
        status.show(mistakeMessageFor(mistake, thing.word.text, GRATITUDE_WORDS), 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, GRATITUDE_COLORS)
    const font = readCssVariables(canvas.element, CANVAS_FONT)
    let ovalImage: HTMLImageElement | undefined
    let doneFontSize = DONE_TEXT_FIT.maxSize
    // Nothing is written before a round starts: each size of oval is measured
    // the first time it is drawn, with the font that actually loaded.
    const styleFor = remember((size: BubbleSize): TextStyle =>
      chooseTextStyle(canvas.context, font, allThings, ovalTextShape(size)),
    )
    const textOf = createTurnText(canvas.context, font, styleFor)
    const draw = () =>
      drawScene(canvas.context, game, { textOf, font, doneFontSize, colors, ovalImage })

    return {
      instructions: INSTRUCTIONS,
      async load() {
        ovalImage = await preloadRememberGratitude(fonts)
      },
      reset() {
        game.clear()
        draw()
      },
      start() {
        // Measured now, with the font that actually loaded.
        doneFontSize = fitFontSize(canvas.context, font, [DONE_BUTTON.label], DONE_TEXT_FIT)
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
        return summaryOf(game.stats, GRATITUDE_WORDS)
      },
    }
  }
}
