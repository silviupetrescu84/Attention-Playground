import { CARD_COLORS, traceEllipse, type CssValues, type CssVariables } from './canvas-style'
import type { GamePoint } from './game-canvas'
import { clamp } from './numbers'
import { FADE_MS } from './timed-turns'

/**
 * Feedback on a choice, shown on the thing chosen while it is still on
 * screen, shared by every minigame: it stops, takes a see-through hue (green
 * when the choice was right, red when it was a mistake) and fades out over
 * FADE_MS, like everything in the games.
 */

/** The hues, from CSS (game.css): the good and bad colours at 20%. */
export const FEEDBACK_COLORS = {
  rightHue: '--canvas-right-hue',
  wrongHue: '--canvas-wrong-hue',
} as const satisfies CssVariables

/** What a bubble that can be chosen is drawn with: a card's colours, and the hues. */
export const BUBBLE_COLORS = {
  ...CARD_COLORS,
  ...FEEDBACK_COLORS,
} as const satisfies CssVariables

export type BubbleColors = CssValues<keyof typeof BUBBLE_COLORS>

/** The hue for a choice: green if it was right, red if it was a mistake. */
export function hueFor(right: boolean, colors: CssValues<keyof typeof FEEDBACK_COLORS>): string {
  return right ? colors.rightHue : colors.wrongHue
}

/** Something chosen at `atMs`, fading out where it was. */
export interface Chosen<T> {
  readonly item: T
  /** Whether the choice was right (green) or a mistake (red). */
  readonly right: boolean
  readonly atMs: number
}

/**
 * How visible something chosen (or otherwise over) at `atMs` still is at
 * `timeMs`: 1, to 0 over FADE_MS. For things that fade out but do not fade in.
 */
export function fadedOutAt(atMs: number, timeMs: number): number {
  return clamp(1 - (timeMs - atMs) / FADE_MS, 0, 1)
}

/** The chosen things still on screen at `timeMs`. */
export function stillFading<T>(chosen: readonly Chosen<T>[], timeMs: number): Chosen<T>[] {
  return chosen.filter(({ atMs }) => timeMs < atMs + FADE_MS)
}

/** A see-through `hue` over the ellipse centred on `centre`: what was chosen, as seen. */
export function drawHue(
  context: CanvasRenderingContext2D,
  centre: GamePoint,
  radiusX: number,
  radiusY: number,
  hue: string,
): void {
  traceEllipse(context, centre, radiusX, radiusY)
  context.fillStyle = hue
  context.fill()
}
