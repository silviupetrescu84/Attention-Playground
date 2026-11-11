import ovalImageUrl from '../../assets/emotions-rise/oval.png'
import { CARD_COLORS, type CssValues, type CssVariables } from '../shared/canvas-style'
import { fadedOutAt, FEEDBACK_COLORS, type Chosen } from '../shared/feedback'
import { clearGameCanvas } from '../shared/game-canvas'
import { createImageLoader } from '../shared/load-image'
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

/** The colours bubbles are drawn with: a card's, and the feedback hues. */
export const EMOTION_COLORS = {
  ...CARD_COLORS,
  ...FEEDBACK_COLORS,
} as const satisfies CssVariables

export type BubbleColors = CssValues<keyof typeof EMOTION_COLORS>

/** How every bubble looks: its text's font (one size for all) and its colours. */
export interface BubbleLook {
  /** A canvas font shorthand, e.g. "600 19px …" (see `fontAt`). */
  readonly font: string
  readonly colors: BubbleColors
}

export const BUBBLE_BORDER_WIDTH = 1.5

/**
 * Every emotion is drawn at one size: the largest, up to 22 px, at which the
 * longest fits on one line inside the bubble, with a margin on each side.
 */
export const EMOTION_TEXT_FIT: TextFit = {
  maxWidth: BUBBLE_WIDTH - 20,
  minSize: 10,
  maxSize: 22,
}

/** Loads (once) the oval artwork used by every bubble. */
export const loadBubbleImage = createImageLoader(ovalImageUrl, 'oval.png')

/** A bubble with its word; `hue` (if any) tints the oval itself, under the word. */
export function drawBubble(
  context: CanvasRenderingContext2D,
  bubble: Bubble,
  { font, colors }: BubbleLook,
  bubbleImage?: CanvasImageSource,
  hue?: string,
) {
  const { x, y, emotion } = bubble

  if (bubbleImage) {
    context.drawImage(
      bubbleImage,
      x - BUBBLE_WIDTH / 2,
      y - BUBBLE_HEIGHT / 2,
      BUBBLE_WIDTH,
      BUBBLE_HEIGHT,
    )
  } else {
    // Keep the game usable if the image cannot load.
    context.beginPath()
    context.ellipse(x, y, BUBBLE_WIDTH / 2, BUBBLE_HEIGHT / 2, 0, 0, Math.PI * 2)
    context.fillStyle = colors.cardFill
    context.fill()
    context.lineWidth = BUBBLE_BORDER_WIDTH
    context.strokeStyle = colors.cardBorder
    context.stroke()
  }

  if (hue) {
    context.beginPath()
    context.ellipse(x, y, BUBBLE_HIT_WIDTH / 2, BUBBLE_HIT_HEIGHT / 2, 0, 0, Math.PI * 2)
    context.fillStyle = hue
    context.fill()
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
    const hue = right ? look.colors.rightHue : look.colors.wrongHue
    drawBubble(context, item, look, bubbleImage, hue)
  }

  context.globalAlpha = 1
}
