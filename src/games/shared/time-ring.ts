import type { GamePoint } from './game-canvas'

/**
 * The ring that shows the time left to choose, around what the player must
 * choose for (a thought, a goal), shared by the minigames that have one.
 */

export const TIME_RING_WIDTH = 4

/**
 * The ring of `radius` around `centre`: from the top, clockwise, as far
 * round as the share of the time left (1: all the way); gone with none left.
 */
export function drawTimeRing(
  context: CanvasRenderingContext2D,
  centre: GamePoint,
  radius: number,
  timeLeft: number,
  color: string,
): void {
  if (timeLeft <= 0) {
    return
  }

  const start = -Math.PI / 2
  context.beginPath()
  context.arc(centre.x, centre.y, radius, start, start + timeLeft * 2 * Math.PI)
  context.lineWidth = TIME_RING_WIDTH
  context.lineCap = 'round'
  context.strokeStyle = color
  context.stroke()
}
