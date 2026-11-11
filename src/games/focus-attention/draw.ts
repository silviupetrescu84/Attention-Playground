import greenBubbleUrl from '../../assets/focus-attention/green-bubble.png'
import projectorUrl from '../../assets/focus-attention/focus-projector.png'
import { CARD_COLORS, type CssValues, type CssVariables } from '../shared/canvas-style'
import { fadedOutAt, FEEDBACK_COLORS, type Chosen } from '../shared/feedback'
import { clearGameCanvas, GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { createImageLoader } from '../shared/load-image'
import { fitInCircle, fontAt, type CanvasFont, type TextFit } from '../shared/text'
import {
  BUBBLE_RADIUS,
  BUBBLE_SIZE,
  BUTTONS,
  CENTRE,
  PROJECTOR_RADIUS,
  PROJECTOR_SIZE,
  type Bubble,
  type Button,
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
  ...CARD_COLORS,
  ...FEEDBACK_COLORS,
  projector: '--focus-projector',
  beam: '--focus-beam',
  buttonFill: '--focus-button-fill',
  buttonText: '--focus-button-text',
  buttonPressed: '--focus-button-pressed',
  buttonShadow: '--focus-button-shadow',
} as const satisfies CssVariables

export type FocusColors = CssValues<keyof typeof FOCUS_COLORS>

export const BUBBLE_BORDER_WIDTH = 1.5
/** The shadow under a button, as the app's own buttons have (0 0.5rem 1.5rem). */
export const BUTTON_SHADOW_BLUR = 24
export const BUTTON_SHADOW_OFFSET = 8
/** How far a pressed button goes down. */
export const BUTTON_PRESS_DEPTH = 3
/** How long a button shows as pressed. */
export const PRESS_MS = 150
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

/** Loads (once) the green bubble every word is drawn in. */
export const loadBubbleImage = createImageLoader(greenBubbleUrl, 'green-bubble.png')
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

/** Writes one line centred on (x, y). */
function writeLine(
  context: CanvasRenderingContext2D,
  text: string,
  { x, y }: GamePoint,
  font: string,
  color: string,
) {
  context.font = font
  context.fillStyle = color
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, x, y)
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

/** A bubble with its word, centred on it; `hue` (if any) tints the bubble, under the word. */
export function drawBubble(
  context: CanvasRenderingContext2D,
  bubble: Bubble,
  { bubbleImage, colors, font, wordFontSize }: SceneLook,
  hue?: string,
) {
  if (bubbleImage) {
    const half = BUBBLE_SIZE / 2
    context.drawImage(bubbleImage, bubble.x - half, bubble.y - half, BUBBLE_SIZE, BUBBLE_SIZE)
  } else {
    // Keep the game usable if the image cannot load.
    context.beginPath()
    context.arc(bubble.x, bubble.y, BUBBLE_RADIUS, 0, Math.PI * 2)
    context.fillStyle = colors.cardFill
    context.fill()
    context.lineWidth = BUBBLE_BORDER_WIDTH
    context.strokeStyle = colors.cardBorder
    context.stroke()
  }

  if (hue) {
    context.beginPath()
    context.arc(bubble.x, bubble.y, BUBBLE_RADIUS, 0, Math.PI * 2)
    context.fillStyle = hue
    context.fill()
  }

  writeLine(context, bubble.text, bubble, fontAt(font, wordFontSize), colors.text)
}

/**
 * A button: a raised pill with its label. While pressed it is pushed down,
 * lighter and without its shadow.
 */
export function drawButton(
  context: CanvasRenderingContext2D,
  button: Button,
  pressed: boolean,
  { colors, font, buttonFontSize }: SceneLook,
) {
  const y = pressed ? button.y + BUTTON_PRESS_DEPTH : button.y

  context.beginPath()
  context.roundRect(button.x, y, button.width, button.height, button.height / 2)
  context.shadowColor = colors.buttonShadow
  context.shadowBlur = pressed ? 0 : BUTTON_SHADOW_BLUR
  context.shadowOffsetY = pressed ? 0 : BUTTON_SHADOW_OFFSET
  context.fillStyle = pressed ? colors.buttonPressed : colors.buttonFill
  context.fill()
  context.shadowBlur = 0
  context.shadowOffsetY = 0

  const centre = { x: button.x + button.width / 2, y: y + button.height / 2 }
  writeLine(context, button.label, centre, fontAt(font, buttonFontSize), colors.buttonText)
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
    drawBubble(context, item, look, right ? look.colors.rightHue : look.colors.wrongHue)
  }
  context.globalAlpha = 1

  const pressed = press && timeMs - press.atMs < PRESS_MS ? press.answer : undefined
  for (const button of BUTTONS) {
    drawButton(context, button, button.answer === pressed, look)
  }
}
