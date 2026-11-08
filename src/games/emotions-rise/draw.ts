import '@fontsource/roboto-condensed/600.css'
import ovalImageUrl from '../../assets/emotions-rise/oval.png'
import { GAME_HEIGHT, GAME_WIDTH } from '../shared/game-canvas'
import { BUBBLE_HEIGHT, BUBBLE_WIDTH, type Bubble } from './emotions-rise'

/**
 * Drawing for Emotions Rise. Every emotion looks the same (text colour and
 * size, bubble), so players must read the word to know whether it is good or
 * bad. The text is drawn first and the translucent bubble over it.
 */

export const TEXT_COLOR = '#17345d'
export const BUBBLE_FILL = 'rgb(255 255 255 / 45%)'
export const BUBBLE_BORDER = 'rgb(23 52 93 / 35%)'
export const BUBBLE_BORDER_WIDTH = 1.5

/**
 * A condensed font (bundled with the game) so long words fit at a readable
 * size. The fallbacks are only used if it cannot load.
 */
export const EMOTION_FONT_FAMILY = '"Roboto Condensed", "Arial Narrow", sans-serif'
export const MAX_FONT_SIZE = 22
export const MIN_FONT_SIZE = 10
/** Widest the text may be: the bubble's width minus a margin on each side. */
export const MAX_TEXT_WIDTH = BUBBLE_WIDTH - 20

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

export function font(size: number) {
  return `600 ${size}px ${EMOTION_FONT_FAMILY}`
}

/**
 * The one text size for every emotion: the largest (in half pixels, between
 * MIN_FONT_SIZE and MAX_FONT_SIZE) at which the widest of `texts` fits the
 * bubble. Measured with whatever font is available, so it fits even if the
 * bundled font could not load.
 */
export function fitFontSize(context: CanvasRenderingContext2D, texts: readonly string[]) {
  for (let size = MAX_FONT_SIZE; size > MIN_FONT_SIZE; size -= 0.5) {
    context.font = font(size)

    if (texts.every((text) => context.measureText(text).width <= MAX_TEXT_WIDTH)) {
      return size
    }
  }

  return MIN_FONT_SIZE
}

export function drawBackground(context: CanvasRenderingContext2D) {
  // The shared canvas background is CSS, so keep the drawing layer transparent.
  context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
}

export function drawBubble(
  context: CanvasRenderingContext2D,
  bubble: Bubble,
  fontSize: number,
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
    context.fillStyle = BUBBLE_FILL
    context.fill()
    context.lineWidth = BUBBLE_BORDER_WIDTH
    context.strokeStyle = BUBBLE_BORDER
    context.stroke()
  }

  context.font = font(fontSize)
  context.fillStyle = TEXT_COLOR
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(emotion.text, x, y)
}

export function drawScene(
  context: CanvasRenderingContext2D,
  bubbles: readonly Bubble[],
  fontSize: number,
  bubbleImage?: CanvasImageSource,
) {
  drawBackground(context)

  for (const bubble of bubbles) {
    drawBubble(context, bubble, fontSize, bubbleImage)
  }
}
