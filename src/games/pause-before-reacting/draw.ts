import { LARGE_OVAL } from '../shared/artwork'
import { hueFor, type BubbleColors } from '../shared/feedback'
import { clearGameCanvas } from '../shared/game-canvas'
import { drawLabelledBubble } from '../shared/labelled-bubble'
import { remember } from '../shared/remember'
import { layOutText, type CanvasFont, type TextBlock, type TextStyle } from '../shared/text'
import { situationOpacityAt, type Situation } from './pause-before-reacting'

/**
 * Drawing for Pause Before Reacting: each situation in an oval (the one from
 * Emotions Rise, 20% bigger), with its text inside, all at one size. Every
 * situation looks the same, so players must read it to know whether to react.
 * One tapped fades out with a green hue (good) or a red one (bad).
 */

/** How the scene looks. */
export interface SceneLook {
  /** Each situation's text, laid out in lines. */
  textOf(situation: Situation): TextBlock
  readonly font: CanvasFont
  readonly colors: BubbleColors
  /** The oval artwork; plain ovals are drawn if it did not load. */
  readonly ovalImage?: CanvasImageSource
}

/** Lays out each situation's text in `style` once, the first time it is drawn. */
export function createSituationText(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  { fontSize, fit }: TextStyle,
): (situation: Situation) => TextBlock {
  return remember((situation: Situation) =>
    layOutText(context, font, situation.word.text, fontSize, fit.maxWidth),
  )
}

/** What the drawing shows: the game's current state. */
export interface PauseBeforeReactingScene {
  readonly situations: readonly Situation[]
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { situations, timeMs }: PauseBeforeReactingScene,
  look: SceneLook,
): void {
  clearGameCanvas(context)

  for (const situation of situations) {
    const opacity = situationOpacityAt(situation, timeMs)

    if (opacity === 0) {
      continue
    }

    // Only one tapped takes a hue: green if good, red if bad.
    const right = situation.word.type === 'good'
    const hue = situation.end === 'tapped' ? hueFor(right, look.colors) : undefined
    const bubble = { centre: situation, size: LARGE_OVAL, text: look.textOf(situation), hue }
    context.globalAlpha = opacity
    drawLabelledBubble(context, look.ovalImage, bubble, look.font, look.colors)
  }

  context.globalAlpha = 1
}
