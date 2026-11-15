import { loadOvalImage } from '../shared/artwork'
import { readCssVariables } from '../shared/canvas-style'
import type { GameDefinition } from '../shared/game-shell'
import { mistakeMessageFor, summaryOf, type GoodOrBadWords } from '../shared/good-or-bad'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import {
  CANVAS_FONT,
  fitFontSize,
  largestTextStyle,
  loadWithCanvasFont,
  textStyleAt,
} from '../shared/text'
import data from './data/improve-inner-voice.json'
import {
  createWordText,
  drawScene,
  INNER_VOICE_COLORS,
  PAD_LABEL,
  PAD_TEXT_FIT,
  WORD_TEXT,
} from './draw'
import { createImproveInnerVoice } from './improve-inner-voice'
import { wordsFrom } from './words'

const words = wordsFrom(data)
const allWords = [...words.good, ...words.bad]

/** How words are named in the status bar and the summary. */
export const INNER_VOICE_WORDS: GoodOrBadWords = {
  one: 'word',
  many: 'words',
  tapped: 'caught',
  letGo: 'let fall',
}

export interface ImproveInnerVoiceGameOptions {
  random?: Random
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
}

/**
 * Loads what Improve Inner Voice needs (its font and the oval). Called when
 * the app starts, so it is usually ready before the game is opened, and
 * again by the game itself in case it is not. Loading twice does not
 * download twice.
 */
export function preloadImproveInnerVoice(fonts?: FontLoader): Promise<HTMLImageElement> {
  return loadWithCanvasFont(loadOvalImage, { fonts })
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = ['Internalize only what helps you']

export function improveInnerVoiceGame({
  random = Math.random,
  fonts,
}: ImproveInnerVoiceGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status }) => {
    const game = createImproveInnerVoice({
      words,
      score,
      random,
      onMistake: (mistake, falling) => {
        status.show(mistakeMessageFor(mistake, falling.word.text, INNER_VOICE_WORDS), 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, INNER_VOICE_COLORS)
    const font = readCssVariables(canvas.element, CANVAS_FONT)
    let ovalImage: HTMLImageElement | undefined
    let textOf = createWordText(canvas.context, font, textStyleAt(WORD_TEXT, 1, WORD_TEXT.maxSize))
    let padFontSize = PAD_TEXT_FIT.maxSize
    const draw = () =>
      drawScene(canvas.context, game, { textOf, padFontSize, font, colors, ovalImage })

    return {
      instructions: INSTRUCTIONS,
      async load() {
        try {
          ovalImage = await preloadImproveInnerVoice(fonts)
        } finally {
          // The pad was drawn before its font loaded: again, now it has.
          draw()
        }
      },
      reset() {
        game.clear()
        draw()
      },
      start() {
        // Measured now, with the font that actually loaded: each on one line.
        const style = largestTextStyle(canvas.context, font, allWords, WORD_TEXT, 1)
        textOf = createWordText(canvas.context, font, style)
        padFontSize = fitFontSize(canvas.context, font, [PAD_LABEL], PAD_TEXT_FIT)
        game.start()
        draw()
      },
      frame({ elapsedMs }) {
        game.update(elapsedMs)
        draw()
      },
      drag(point) {
        game.drag(point)
      },
      end() {
        game.stop()
      },
      summary() {
        return summaryOf(game.stats, INNER_VOICE_WORDS)
      },
    }
  }
}
