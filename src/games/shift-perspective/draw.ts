import purpleBubbleUrl from '../../assets/shift-perspective/purple-bubble.png'
import { drawBubbleImage, type CssValues, type CssVariables } from '../shared/canvas-style'
import { BUBBLE_COLORS, drawHue, hueFor } from '../shared/feedback'
import { clearGameCanvas } from '../shared/game-canvas'
import { createImageLoader } from '../shared/load-image'
import { remember } from '../shared/remember'
import {
  drawTextBlock,
  fitInCircle,
  layOutText,
  type CanvasFont,
  type TextBlock,
  type TextFit,
} from '../shared/text'
import { drawTimeRing } from '../shared/time-ring'
import { timeLeftAt } from '../shared/timed-turns'
import {
  BUBBLE_BODY,
  CENTRE,
  CHOICE_RADIUS,
  CHOICE_SIZE,
  choicesOpacityAt,
  THOUGHT_RADIUS,
  THOUGHT_SIZE,
  thoughtOpacityAt,
  type Turn,
} from './shift-perspective'
import './shift-perspective.css'

/**
 * Drawing for Shift Perspective: the thought in a purple bubble in the
 * middle, a ring around it that runs out with the time to choose, and the
 * choices in smaller purple bubbles around it, each with its text inside.
 * The choice the player made takes a green hue (good) or a red one (bad) as
 * everything fades out.
 * Every text of a kind is written at one size, so bubbles do not change from
 * one thought to the next.
 */

/** The colours the game is drawn with, from CSS (game.css and shift-perspective.css). */
export const SHIFT_COLORS = {
  ...BUBBLE_COLORS,
  ring: '--shift-ring',
} as const satisfies CssVariables

export type ShiftColors = CssValues<keyof typeof SHIFT_COLORS>

/** The ring is just outside the thought's bubble (its middle; it is TIME_RING_WIDTH thick). */
export const RING_RADIUS = THOUGHT_RADIUS + 6
/** Space kept between a text and its bubble's edge. */
export const TEXT_MARGIN = 4

/** Every thought at one size: the largest, up to 20 px, at which each fits in its bubble. */
export const THOUGHT_TEXT_FIT = fitInCircle(THOUGHT_RADIUS, TEXT_MARGIN, {
  maxLines: 3,
  minSize: 10,
  maxSize: 20,
})

/** Every choice at one size: the largest, up to 16 px, at which each fits in its bubble. */
export const CHOICE_TEXT_FIT = fitInCircle(CHOICE_RADIUS, TEXT_MARGIN, {
  maxLines: 3,
  minSize: 10,
  maxSize: 16,
})

/** Loads (once) the purple bubble every thought and choice is drawn in. */
export const loadBubbleImage = createImageLoader(purpleBubbleUrl, 'purple-bubble.png')

/** How a thought and its choices are written: their text broken into lines. */
export interface TurnText {
  readonly thought: TextBlock
  /** In the order of the turn's choices. */
  readonly choices: readonly TextBlock[]
}

export interface TextSizes {
  readonly thoughtFontSize: number
  readonly choiceFontSize: number
}

/**
 * Lays out a turn's texts at `sizes` the first time they are needed, and
 * remembers them for as long as the turn exists.
 */
export function createTurnText(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  { thoughtFontSize, choiceFontSize }: TextSizes,
): (turn: Turn) => TurnText {
  function layOut(text: string, fontSize: number, { maxWidth }: TextFit): TextBlock {
    return layOutText(context, font, text, fontSize, maxWidth)
  }

  return remember((turn: Turn) => ({
    thought: layOut(turn.thought, thoughtFontSize, THOUGHT_TEXT_FIT),
    choices: turn.choices.map((choice) => layOut(choice.text, choiceFontSize, CHOICE_TEXT_FIT)),
  }))
}

/** How the scene looks. */
export interface SceneLook {
  textOf(turn: Turn): TurnText
  readonly font: CanvasFont
  readonly colors: ShiftColors
  /** The bubble artwork; a plain circle is drawn if it did not load. */
  readonly bubbleImage?: CanvasImageSource
}

/** A bubble of `size` centred on (x, y). */
export function drawBubble(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  { colors, bubbleImage }: Pick<SceneLook, 'colors' | 'bubbleImage'>,
) {
  const radius = (size / 2) * BUBBLE_BODY
  const drawn = { width: size, height: size, radiusX: radius, radiusY: radius }
  drawBubbleImage(context, bubbleImage, { x, y }, drawn, colors)
}

/**
 * The thought, its ring and its choices, as they are at `timeMs`: each faded
 * in or out, the choices only once they have started to appear.
 */
export function drawTurn(
  context: CanvasRenderingContext2D,
  turn: Turn,
  timeMs: number,
  look: SceneLook,
) {
  const thoughtOpacity = thoughtOpacityAt(turn, timeMs)
  const choicesOpacity = choicesOpacityAt(turn, timeMs)

  // The choices come later and go at the same time: never seen without the thought.
  if (thoughtOpacity === 0) {
    return
  }

  const { font, colors } = look
  const text = look.textOf(turn)

  context.globalAlpha = thoughtOpacity
  drawBubble(context, CENTRE.x, CENTRE.y, THOUGHT_SIZE, look)
  drawTextBlock(context, text.thought, CENTRE.x, CENTRE.y, font, colors.text)
  drawTimeRing(context, CENTRE, RING_RADIUS, timeLeftAt(turn, timeMs), colors.ring)

  if (choicesOpacity > 0) {
    context.globalAlpha = choicesOpacity
    turn.choices.forEach((choice, i) => {
      drawBubble(context, choice.x, choice.y, CHOICE_SIZE, look)
      if (choice === turn.chosen) {
        drawHue(context, choice, CHOICE_RADIUS, CHOICE_RADIUS, hueFor(choice.good, colors))
      }
      drawTextBlock(context, text.choices[i], choice.x, choice.y, font, colors.text)
    })
  }

  context.globalAlpha = 1
}

/** What the drawing shows: the game's current state. */
export interface ShiftPerspectiveScene {
  readonly turn: Turn | undefined
  readonly previous: Turn | undefined
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { turn, previous, timeMs }: ShiftPerspectiveScene,
  look: SceneLook,
) {
  clearGameCanvas(context)

  for (const shown of [previous, turn]) {
    if (shown) {
      drawTurn(context, shown, timeMs, look)
    }
  }
}
