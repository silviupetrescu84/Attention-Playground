import projectorUrl from '../../assets/focus-attention/focus-projector.png'
import { BUTTON_COLORS, drawButton, PRESS_MS } from '../shared/canvas-button'
import {
  drawBubbleImage,
  type BubbleSize,
  type CssValues,
  type CssVariables,
} from '../shared/canvas-style'
import { BUBBLE_COLORS, drawHue, fadedOutAt, hueFor, type Chosen } from '../shared/feedback'
import { clearGameCanvas, GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { createImageLoader } from '../shared/load-image'
import { drawTextBlock, fitInCircle, type CanvasFont, type TextFit } from '../shared/text'
import {
  BUBBLE_RADIUS,
  BUBBLE_SIZE,
  BUTTONS,
  CENTRE,
  PROJECTOR_RADIUS,
  PROJECTOR_SIZE,
  type Bubble,
  type Press,
} from './focus-attention'
import './focus-attention.css'

/**
 * Drawing for Focus Attention: the projector in the middle, its beam (a
 * see-through yellow triangle from the sides of its orb to the centre of the
 * target), the values and anti-values in green bubbles (an answered one
 * fading out with a green or red hue), and the two buttons
 * at the bottom, over everything: drawn like the app's own buttons (Start,
 * Restart), pill-shaped, ink blue and raised. Every word is written at one
 * size.
 */

/** The colours the game is drawn with, from CSS (game.css and focus-attention.css). */
export const FOCUS_COLORS = {
  ...BUBBLE_COLORS,
  ...BUTTON_COLORS,
  projector: '--focus-projector',
  beam: '--focus-beam',
} as const satisfies CssVariables

export type FocusColors = CssValues<keyof typeof FOCUS_COLORS>

/** Space kept between a word and its bubble's edge. */
export const TEXT_MARGIN = 4

/** Every word at one size: the largest, up to 18 px, at which each fits on one line. */
export const WORD_TEXT_FIT = fitInCircle(BUBBLE_RADIUS, TEXT_MARGIN, {
  maxLines: 1,
  minSize: 10,
  maxSize: 18,
})

/** Both labels at one size: the largest, up to 20 px, at which each fits on its button. */
export const BUTTON_TEXT_FIT: TextFit = {
  maxWidth: BUTTONS[0].width - 32,
  minSize: 12,
  maxSize: 20,
}

/** Loads (once) the projector. */
export const loadProjectorImage = createImageLoader(projectorUrl, 'focus-projector.png')

/** How the scene looks. */
export interface SceneLook {
  readonly wordFontSize: number
  readonly buttonFontSize: number
  readonly font: CanvasFont
  readonly colors: FocusColors
  /** The artwork; plain shapes are drawn for any that did not load. */
  readonly bubbleImage?: CanvasImageSource
  readonly projectorImage?: CanvasImageSource
}

/**
 * The projector. Its image has a white background, so it is multiplied onto
 * the canvas: white leaves the background as it is, the yellow stays yellow.
 */
export function drawProjector(
  context: CanvasRenderingContext2D,
  { projectorImage, colors }: Pick<SceneLook, 'projectorImage' | 'colors'>,
) {
  if (projectorImage) {
    const half = PROJECTOR_SIZE / 2
    context.globalCompositeOperation = 'multiply'
    const [left, top] = [CENTRE.x - half, CENTRE.y - half]
    context.drawImage(projectorImage, left, top, PROJECTOR_SIZE, PROJECTOR_SIZE)
    context.globalCompositeOperation = 'source-over'
    return
  }

  // Keep the game usable if the image cannot load.
  context.beginPath()
  context.arc(CENTRE.x, CENTRE.y, PROJECTOR_RADIUS, 0, Math.PI * 2)
  context.fillStyle = colors.projector
  context.fill()
}

/**
 * The beam: a filled triangle from the two sides of the projector's orb
 * (across its middle, square to the target) to the target's centre. It is
 * only drawn outside the orb, so it seems to come out of it.
 */
export function drawBeam(context: CanvasRenderingContext2D, target: GamePoint, color: string) {
  const length = Math.hypot(target.x - CENTRE.x, target.y - CENTRE.y)
  // Square to the direction of the target, as long as the orb's radius.
  const side = {
    x: (-(target.y - CENTRE.y) / length) * PROJECTOR_RADIUS,
    y: ((target.x - CENTRE.x) / length) * PROJECTOR_RADIUS,
  }

  context.save()
  context.beginPath()
  context.rect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  context.arc(CENTRE.x, CENTRE.y, PROJECTOR_RADIUS, 0, Math.PI * 2)
  context.clip('evenodd')

  context.beginPath()
  context.moveTo(CENTRE.x + side.x, CENTRE.y + side.y)
  context.lineTo(target.x, target.y)
  context.lineTo(CENTRE.x - side.x, CENTRE.y - side.y)
  context.closePath()
  context.fillStyle = color
  context.fill()
  context.restore()
}

/** A bubble's image, or a plain circle the size of the bubble itself if it did not load. */
const BUBBLE_DRAWN: BubbleSize = {
  width: BUBBLE_SIZE,
  height: BUBBLE_SIZE,
  radiusX: BUBBLE_RADIUS,
  radiusY: BUBBLE_RADIUS,
}

/** A bubble with its word, centred on it; `hue` (if any) tints the bubble, under the word. */
export function drawBubble(
  context: CanvasRenderingContext2D,
  bubble: Bubble,
  { bubbleImage, colors, font, wordFontSize }: SceneLook,
  hue?: string,
) {
  drawBubbleImage(context, bubbleImage, bubble, BUBBLE_DRAWN, colors)

  if (hue) {
    drawHue(context, bubble, BUBBLE_RADIUS, BUBBLE_RADIUS, hue)
  }

  const line = { fontSize: wordFontSize, lines: [bubble.text] }
  drawTextBlock(context, line, bubble.x, bubble.y, font, colors.text)
}

/** What the drawing shows: the game's current state. */
export interface FocusAttentionScene {
  readonly bubbles: readonly Bubble[]
  readonly target: Bubble | undefined
  readonly answered: readonly Chosen<Bubble>[]
  readonly press: Press | undefined
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { bubbles, target, answered, press, timeMs }: FocusAttentionScene,
  look: SceneLook,
) {
  clearGameCanvas(context)
  drawProjector(context, look)

  if (target) {
    drawBeam(context, target, look.colors.beam)
  }

  for (const bubble of bubbles) {
    drawBubble(context, bubble, look)
  }

  for (const { item, right, atMs } of answered) {
    context.globalAlpha = fadedOutAt(atMs, timeMs)
    drawBubble(context, item, look, hueFor(right, look.colors))
  }
  context.globalAlpha = 1

  const pressed = press && timeMs - press.atMs < PRESS_MS ? press.answer : undefined
  for (const button of BUTTONS) {
    const { font, buttonFontSize, colors } = look
    drawButton(context, button, button.answer === pressed, font, buttonFontSize, colors)
  }
}
