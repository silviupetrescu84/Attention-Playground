import { GAME_HEIGHT, GAME_WIDTH } from '../games/shared/game-canvas'
import { BUBBLE_HEIGHT, BUBBLE_WIDTH } from '../games/emotions-rise/emotions-rise'

/** Anything with a centre: bubbles, or bubbles read back from a drawing. */
export interface Centred {
  readonly x: number
  readonly y: number
}

/** The bubbles that a tap at (x, y) would hit (written independently of the game's own check). */
export function bubblesAt<T extends Centred>(bubbles: readonly T[], x: number, y: number): T[] {
  const rx = BUBBLE_WIDTH / 2
  const ry = BUBBLE_HEIGHT / 2
  return bubbles.filter((b) => ((b.x - x) / rx) ** 2 + ((b.y - y) / ry) ** 2 <= 1)
}

/**
 * Scans the canvas (top to bottom, every `step` px) for a point whose bubbles
 * pass `test`. Returns the point and those bubbles, or undefined.
 */
export function findPoint<T extends Centred>(
  bubbles: readonly T[],
  test: (under: T[]) => boolean,
  { step = 5, maxY = GAME_HEIGHT } = {},
): { x: number; y: number; under: T[] } | undefined {
  for (let y = 0; y <= maxY; y += step) {
    for (let x = 0; x <= GAME_WIDTH; x += step) {
      const under = bubblesAt(bubbles, x, y)
      if (test(under)) return { x, y, under }
    }
  }
  return undefined
}
