import type { CssVariables } from './canvas-style'

/**
 * Feedback on a choice, shown on the thing chosen while it is still on
 * screen, shared by every minigame: it stops, takes a see-through hue (green
 * when the choice was right, red when it was a mistake) and fades out over
 * FEEDBACK_FADE_MS.
 */

/** The hues, from CSS (game.css): the good and bad colours at 20%. */
export const FEEDBACK_COLORS = {
  rightHue: '--canvas-right-hue',
  wrongHue: '--canvas-wrong-hue',
} as const satisfies CssVariables

export const FEEDBACK_FADE_MS = 100

/** Something chosen at `atMs`, fading out where it was. */
export interface Chosen<T> {
  readonly item: T
  /** Whether the choice was right (green) or a mistake (red). */
  readonly right: boolean
  readonly atMs: number
}

/** How visible something chosen at `atMs` still is at `timeMs`: 1, to 0 over the fade. */
export function fadedOutAt(atMs: number, timeMs: number): number {
  return Math.min(1, Math.max(0, 1 - (timeMs - atMs) / FEEDBACK_FADE_MS))
}

/** The chosen things still on screen at `timeMs`. */
export function stillFading<T>(chosen: readonly Chosen<T>[], timeMs: number): Chosen<T>[] {
  return chosen.filter(({ atMs }) => timeMs < atMs + FEEDBACK_FADE_MS)
}
