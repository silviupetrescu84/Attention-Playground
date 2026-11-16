import type { CssValues, CssVariables } from './canvas-style'
import type { GamePoint } from './game-canvas'
import { isInBox, type Box } from './geometry'
import { drawPill, FLAT, PILL_COLORS, RAISED } from './pill'
import type { CanvasFont } from './text'

/**
 * Buttons drawn on the canvas, shared by the minigames that have their own
 * (Focus Attention's answers, Remember Gratitude's Done): like the app's own
 * buttons (Start, Restart), pill-shaped, ink blue with white text and
 * raised. Pressed, one is pushed down, lighter and flat, for PRESS_MS.
 */

/** The colours, from CSS (game.css). */
export const BUTTON_COLORS = {
  ...PILL_COLORS,
  buttonFill: '--canvas-button-fill',
  buttonText: '--canvas-button-text',
  buttonPressed: '--canvas-button-pressed',
} as const satisfies CssVariables

export type ButtonColors = CssValues<keyof typeof BUTTON_COLORS>

/** How far a pressed button goes down. */
export const BUTTON_PRESS_DEPTH = 3
/** How long a button shows as pressed. */
export const PRESS_MS = 150

/** A button on the canvas: its label, and where it is (its top left corner) and how big. */
export interface CanvasButton {
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Where `button` is, all of it. */
export function boxOf({ x, y, width, height }: CanvasButton): Box {
  return { left: x, right: x + width, top: y, bottom: y + height }
}

/** Whether `point` is on `button` (its edge included). */
export function isOnButton(point: GamePoint, button: CanvasButton): boolean {
  return isInBox(point, boxOf(button))
}

/** `button`, with its label at `fontSize`: raised, or pushed down if `pressed`. */
export function drawButton(
  context: CanvasRenderingContext2D,
  button: CanvasButton,
  pressed: boolean,
  font: CanvasFont,
  fontSize: number,
  colors: ButtonColors,
): void {
  const depth = pressed ? BUTTON_PRESS_DEPTH : 0
  const box = boxOf({ ...button, y: button.y + depth })
  const fill = pressed ? colors.buttonPressed : colors.buttonFill
  const pillColors = { fill, text: colors.buttonText, shadow: colors.pillShadow }
  drawPill(
    context,
    { box, label: button.label, fontSize },
    font,
    pillColors,
    pressed ? FLAT : RAISED,
  )
}
