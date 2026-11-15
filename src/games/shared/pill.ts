import type { CssVariables } from './canvas-style'
import type { Box } from './geometry'
import { drawTextBlock, type CanvasFont } from './text'

/**
 * A pill drawn on the canvas like the app's own buttons (see game.css):
 * rounded ends, a label on one line in the middle, and raised by a soft
 * shadow under it (or flat, when pressed). It may have a border.
 */

/** The colour of the shadow, the same as under the app's own buttons. */
export const PILL_COLORS = {
  pillShadow: '--button-shadow',
} as const satisfies CssVariables

export interface PillColors {
  readonly fill: string
  readonly text: string
  readonly shadow: string
}

export interface PillShadow {
  readonly blur: number
  /** How far below the pill it is. */
  readonly offsetY: number
}

/** Raised, like the app's own buttons (0 0.5rem 1.5rem). */
export const RAISED: PillShadow = { blur: 24, offsetY: 8 }
/** No shadow. */
export const FLAT: PillShadow = { blur: 0, offsetY: 0 }

/** A line around a pill, centred on its edge. */
export interface PillBorder {
  readonly color: string
  readonly width: number
}

export interface Pill {
  readonly box: Box
  readonly label: string
  readonly fontSize: number
  /** None if not given. */
  readonly border?: PillBorder
}

export function drawPill(
  context: CanvasRenderingContext2D,
  { box, label, fontSize, border }: Pill,
  font: CanvasFont,
  colors: PillColors,
  shadow: PillShadow = RAISED,
): void {
  const { left, right, top, bottom } = box
  const height = bottom - top

  context.beginPath()
  context.roundRect(left, top, right - left, height, height / 2)
  context.shadowColor = colors.shadow
  context.shadowBlur = shadow.blur
  context.shadowOffsetY = shadow.offsetY
  context.fillStyle = colors.fill
  context.fill()
  // Only the pill casts a shadow, not its border or label.
  context.shadowBlur = 0
  context.shadowOffsetY = 0

  if (border) {
    context.strokeStyle = border.color
    context.lineWidth = border.width
    context.stroke()
  }

  const line = { fontSize, lines: [label] }
  drawTextBlock(context, line, (left + right) / 2, (top + bottom) / 2, font, colors.text)
}
