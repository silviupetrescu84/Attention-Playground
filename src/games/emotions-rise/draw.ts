import { drawBubbleImage, type BubbleSize } from '../shared/canvas-style'
import { drawHue, fadedOutAt, hueFor, type BubbleColors, type Chosen } from '../shared/feedback'
import { clearGameCanvas } from '../shared/game-canvas'
import type { TextFit } from '../shared/text'
import {
  BUBBLE_HEIGHT,
  BUBBLE_HIT_HEIGHT,
  BUBBLE_HIT_WIDTH,
  BUBBLE_WIDTH,
  type Bubble,
} from './emotions-rise'

/**
 * Drawing for Emotions Rise. Every emotion looks the same (text colour and
 * size, bubble), so players must read the word to know whether it is good or
 * bad. The word is drawn over the bubble. A tapped bubble fades out with a
 * green or red hue over it (see the shared feedback).
 */

/** How every bubble looks: its text's font (one size for all) and its colours. */
export interface BubbleLook {
  /** A canvas font shorthand, e.g. "600 19px …" (see `fontAt`). */
  readonly font: string
  readonly colors: BubbleColors
}

/**
 * Every emotion is drawn at one size: the largest, up to 22 px, at which the
 * longest fits on one line inside the bubble, with a margin on each side.
 */
export const EMOTION_TEXT_FIT: TextFit = {
  maxWidth: BUBBLE_WIDTH - 20,
  minSize: 10,
  maxSize: 22,
}

/** A bubble's image, or a plain oval as big if it did not load. */
const BUBBLE_SIZE: BubbleSize = {
  width: BUBBLE_WIDTH,
  height: BUBBLE_HEIGHT,
  radiusX: BUBBLE_WIDTH / 2,
  radiusY: BUBBLE_HEIGHT / 2,
}

/** A bubble with its word; `hue` (if any) tints the oval itself, under the word. */
export function drawBubble(
  context: CanvasRenderingContext2D,
  bubble: Bubble,
  { font, colors }: BubbleLook,
  bubbleImage?: CanvasImageSource,
  hue?: string,
) {
  const { x, y, emotion } = bubble
  drawBubbleImage(context, bubbleImage, bubble, BUBBLE_SIZE, colors)

  if (hue) {
    drawHue(context, bubble, BUBBLE_HIT_WIDTH / 2, BUBBLE_HIT_HEIGHT / 2, hue)
  }

  context.font = font
  context.fillStyle = colors.text
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(emotion.text, x, y)
}

/** What the drawing shows: the game's current state. */
export interface EmotionsRiseScene {
  readonly bubbles: readonly Bubble[]
  readonly tapped: readonly Chosen<Bubble>[]
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { bubbles, tapped, timeMs }: EmotionsRiseScene,
  look: BubbleLook,
  bubbleImage?: CanvasImageSource,
) {
  clearGameCanvas(context)

  for (const bubble of bubbles) {
    drawBubble(context, bubble, look, bubbleImage)
  }

  for (const { item, right, atMs } of tapped) {
    context.globalAlpha = fadedOutAt(atMs, timeMs)
    const hue = hueFor(right, look.colors)
    drawBubble(context, item, look, bubbleImage, hue)
  }

  context.globalAlpha = 1
}
