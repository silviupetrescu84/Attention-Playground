import { LARGE_OVAL_TEXT, loadOvalImage } from '../shared/artwork'
import { readCssVariables } from '../shared/canvas-style'
import { BUBBLE_COLORS } from '../shared/feedback'
import type { GameDefinition } from '../shared/game-shell'
import { mistakeMessageFor, summaryOf, type GoodOrBadWords } from '../shared/good-or-bad'
import type { FontLoader } from '../shared/load-font'
import type { Random } from '../shared/random'
import { CANVAS_FONT, chooseTextStyle, defaultTextStyle, loadWithCanvasFont } from '../shared/text'
import data from './data/pause-before-reacting.json'
import { createSituationText, drawScene } from './draw'
import { createPauseBeforeReacting } from './pause-before-reacting'
import { situationsFrom } from './situations'

const situations = situationsFrom(data)
const allSituations = [...situations.good, ...situations.bad]

/** How situations are named in the status bar and the summary. */
export const SITUATION_WORDS: GoodOrBadWords = {
  one: 'situation',
  many: 'situations',
  tapped: 'tapped',
  letGo: 'let pass',
}

export interface PauseBeforeReactingGameOptions {
  random?: Random
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
}

/**
 * Loads what Pause Before Reacting needs (its font and the oval). Called
 * when the app starts, so it is usually ready before the game is opened, and
 * again by the game itself in case it is not. Loading twice does not
 * download twice.
 */
export function preloadPauseBeforeReacting(fonts?: FontLoader): Promise<HTMLImageElement> {
  return loadWithCanvasFont(loadOvalImage, { fonts })
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'Pausing before reacting is the most important skill in life.',
  'It doesn’t matter what happens, it matters if you react to it',
]

export function pauseBeforeReactingGame({
  random = Math.random,
  fonts,
}: PauseBeforeReactingGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status, pace }) => {
    const game = createPauseBeforeReacting({
      situations,
      score,
      random,
      onMistake: (mistake, situation) => {
        status.show(mistakeMessageFor(mistake, situation.word.text, SITUATION_WORDS), 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, BUBBLE_COLORS)
    const font = readCssVariables(canvas.element, CANVAS_FONT)
    let ovalImage: HTMLImageElement | undefined
    let textOf = createSituationText(canvas.context, font, defaultTextStyle(LARGE_OVAL_TEXT))
    const draw = () => drawScene(canvas.context, game, { textOf, font, colors, ovalImage })

    return {
      instructions: INSTRUCTIONS,
      async load() {
        ovalImage = await preloadPauseBeforeReacting(fonts)
      },
      reset() {
        game.clear()
        draw()
      },
      start() {
        // Measured now, with the font that actually loaded.
        const style = chooseTextStyle(canvas.context, font, allSituations, LARGE_OVAL_TEXT)
        textOf = createSituationText(canvas.context, font, style)
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
        return summaryOf(game.stats, SITUATION_WORDS)
      },
    }
  }
}
