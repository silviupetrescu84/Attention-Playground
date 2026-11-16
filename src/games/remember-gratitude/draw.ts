import { BUTTON_COLORS, drawButton } from '../shared/canvas-button'
import type { BubbleSize, CssValues, CssVariables } from '../shared/canvas-style'
import { BUBBLE_COLORS, hueFor } from '../shared/feedback'
import { clearGameCanvas } from '../shared/game-canvas'
import { drawLabelledBubble } from '../shared/labelled-bubble'
import { remember } from '../shared/remember'
import {
  layOutText,
  type CanvasFont,
  type TextBlock,
  type TextFit,
  type TextStyle,
} from '../shared/text'
import { drawTimeRing, TIME_RING_WIDTH } from '../shared/time-ring'
import { DONE_BUTTON } from './layout'
import {
  doneOpacityAt,
  isTextShownAt,
  markOf,
  rememberTimeLeftAt,
  thingsOpacityAt,
  type Turn,
} from './remember-gratitude'
import './remember-gratitude.css'

/**
 * Drawing for Remember Gratitude: each thing in an oval (the one from
 * Emotions Rise, smaller when there are many), with its text inside until
 * they turn around, and a ring at the bottom that runs out with the time to
 * remember them. Then the Done button in its place, like the app's own
 * buttons, pressed once the turn is over. A thing tapped shows its text
 * again, with a green hue (good) or a red one (bad); so does a good one
 * missed, in red, once the turn is over. Every text is written at one size
 * for each size of oval, so none looks bigger than another.
 */

/** The colours the game is drawn with, from CSS (game.css). */
export const GRATITUDE_COLORS = {
  ...BUBBLE_COLORS,
  ...BUTTON_COLORS,
  ring: '--gratitude-ring',
} as const satisfies CssVariables

export type GratitudeColors = CssValues<keyof typeof GRATITUDE_COLORS>

/** The ring's middle, in the middle of where the Done button will be. */
export const RING_CENTRE = {
  x: DONE_BUTTON.x + DONE_BUTTON.width / 2,
  y: DONE_BUTTON.y + DONE_BUTTON.height / 2,
}
/** Its radius: as tall as the button, less 6 px above and below. */
export const RING_RADIUS = DONE_BUTTON.height / 2 - 6 - TIME_RING_WIDTH / 2

/** Done is written up to 20 px, at least 16 px from the button's ends. */
export const DONE_TEXT_FIT: TextFit = {
  maxWidth: DONE_BUTTON.width - 2 * 16,
  minSize: 12,
  maxSize: 20,
}

/**
 * Lays out the texts of a turn's things once, the first time they are drawn,
 * in the style `styleFor` gives for the turn's size of oval.
 */
export function createTurnText(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  styleFor: (size: BubbleSize) => TextStyle,
): (turn: Turn) => readonly TextBlock[] {
  return remember((turn: Turn) => {
    const { fontSize, fit } = styleFor(turn.size)
    return turn.things.map(({ word }) =>
      layOutText(context, font, word.text, fontSize, fit.maxWidth),
    )
  })
}

/** How the scene looks. */
export interface SceneLook {
  /** Each thing's text, laid out, in the order of the turn's things. */
  textOf(turn: Turn): readonly TextBlock[]
  readonly font: CanvasFont
  /** The size Done is written at. */
  readonly doneFontSize: number
  readonly colors: GratitudeColors
  /** The oval artwork; plain ovals are drawn if it did not load. */
  readonly ovalImage?: CanvasImageSource
}

/** What the drawing shows: the game's current state. */
export interface RememberGratitudeScene {
  readonly turn: Turn | undefined
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { turn, timeMs }: RememberGratitudeScene,
  look: SceneLook,
): void {
  clearGameCanvas(context)

  if (!turn) {
    return
  }

  const { font, colors } = look
  const thingsOpacity = thingsOpacityAt(turn, timeMs)
  const doneOpacity = doneOpacityAt(turn, timeMs)

  if (thingsOpacity > 0) {
    const texts = look.textOf(turn)
    context.globalAlpha = thingsOpacity
    turn.things.forEach((thing, i) => {
      const text = isTextShownAt(thing, turn, timeMs) ? texts[i] : undefined
      const mark = markOf(thing)
      const hue = mark ? hueFor(mark === 'right', colors) : undefined
      const bubble = { centre: thing, size: turn.size, text, hue }
      drawLabelledBubble(context, look.ovalImage, bubble, font, colors)
    })
    drawTimeRing(context, RING_CENTRE, RING_RADIUS, rememberTimeLeftAt(turn, timeMs), colors.ring)
  }

  if (doneOpacity > 0) {
    context.globalAlpha = doneOpacity
    const pressed = turn.endedAtMs !== undefined
    drawButton(context, DONE_BUTTON, pressed, font, look.doneFontSize, colors)
  }

  context.globalAlpha = 1
}
