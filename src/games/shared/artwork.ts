import ovalUrl from '../../assets/emotions-rise/oval.png'
import greenBubbleUrl from '../../assets/focus-attention/green-bubble.png'
import type { BubbleSize } from './canvas-style'
import { createImageLoader } from './load-image'
import type { TextShape } from './text'

/**
 * Bubble images used by more than one minigame, each loaded once for all of
 * them, with what was measured of it.
 */

/** Loads (once) the oval (from Emotions Rise; the actions in Break It Down). */
export const loadOvalImage = createImageLoader(ovalUrl, 'oval.png')

/** The oval image, measured at this size… */
const OVAL_IMAGE = { width: 140, height: 77 }

/** …is seen this big: its visible alpha is inset from the image's edges. */
const OVAL_SEEN = { width: 137, height: 74 }

/**
 * The size of the oval as seen (for taps and hues), in an oval image drawn
 * `width` × `height`: transparent edges and corners left out.
 */
export function ovalSeenIn(width: number, height: number): { width: number; height: number } {
  return {
    width: (width * OVAL_SEEN.width) / OVAL_IMAGE.width,
    height: (height * OVAL_SEEN.height) / OVAL_IMAGE.height,
  }
}

/** The oval drawn `width` wide, in its own shape, and how big it is as seen. */
export function ovalOfWidth(width: number): BubbleSize {
  const height = (width * OVAL_IMAGE.height) / OVAL_IMAGE.width
  const seen = ovalSeenIn(width, height)
  return { width, height, radiusX: seen.width / 2, radiusY: seen.height / 2 }
}

/**
 * The oval 20% bigger than in Emotions Rise (140 × 77), for longer texts:
 * the actions in Break It Down, the situations in Pause Before Reacting.
 */
export const LARGE_OVAL = ovalOfWidth(168)

/** How texts are written in an oval of `size`: inside it as seen, 8 px from its edge. */
export function ovalTextShape({ radiusX, radiusY }: BubbleSize): TextShape {
  return { radiusX, radiusY, margin: 8, minSize: 10, maxSize: 24 }
}

/** How texts are written in the large oval. */
export const LARGE_OVAL_TEXT: TextShape = ovalTextShape(LARGE_OVAL)

/** Loads (once) the green bubble (the words in Focus Attention; the goals in Break It Down). */
export const loadGreenBubbleImage = createImageLoader(greenBubbleUrl, 'green-bubble.png')

/** The green bubble itself, without its glow, is at least this share of its image (measured). */
export const GREEN_BUBBLE_BODY = 0.9
