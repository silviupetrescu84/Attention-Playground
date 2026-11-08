import ovalImageUrl from '../../assets/emotions-rise/oval.png'
import type { CARD_COLORS, CssValues } from '../shared/canvas-style'
import { clearGameCanvas } from '../shared/game-canvas'
import type { TextFit } from '../shared/text'
import { BUBBLE_HEIGHT, BUBBLE_WIDTH, type Bubble } from './emotions-rise'

/**
 * Drawing for Emotions Rise. Every emotion looks the same (text colour and
 * size, bubble), so players must read the word to know whether it is good or
 * bad. The word is drawn over the bubble.
 */

/** The colours a bubble is drawn with: a card's (see CARD_COLORS). */
export type BubbleColors = CssValues<keyof typeof CARD_COLORS>

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

let bubbleImagePromise: Promise<HTMLImageElement> | undefined

/** Loads and caches the oval artwork used by every bubble. */
export function loadBubbleImage(): Promise<HTMLImageElement> {
  if (!bubbleImagePromise) {
    bubbleImagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => resolve(image), { once: true })
      image.addEventListener('error', () => reject(new Error('Could not load oval.png')), {
        once: true,
      })
      image.src = ovalImageUrl
    }).catch((error: unknown) => {
      bubbleImagePromise = undefined
      throw error
    })
  }

  return bubbleImagePromise
}

export function drawBubble(
  context: CanvasRenderingContext2D,
  bubble: Bubble,
  { font, colors }: BubbleLook,
  bubbleImage?: CanvasImageSource,
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

  context.font = font
  context.fillStyle = colors.text
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(emotion.text, x, y)
}

export function drawScene(
  context: CanvasRenderingContext2D,
  bubbles: readonly Bubble[],
  look: BubbleLook,
  bubbleImage?: CanvasImageSource,
) {
  clearGameCanvas(context)

  for (const bubble of bubbles) {
    drawBubble(context, bubble, look, bubbleImage)
  }
}
