import type { CssValues, CssVariables } from '../shared/canvas-style'
import { clearGameCanvas, type GamePoint } from '../shared/game-canvas'
import { drawTimeRing } from '../shared/time-ring'
import { timeLeftAt } from '../shared/timed-turns'
import { DOT_RADIUS, LINE_WIDTH, WALL_THICKNESS, type Wall } from './layout'
import { isConnected, roundOpacityAt, wallHitShownAt, type Round } from './make-good-connections'
import './make-good-connections.css'

/**
 * Drawing for Make Good Connections: the walls, ink bars; the path, green
 * lines from dot to dot (and, for a moment, a red one that went through a
 * wall); the dots, white with a soft shadow, green once on a path of two or
 * more, the last one with a green outline (the path goes on from it); and a
 * ring around one dot that runs out with the time to connect them all.
 * Everything fades in as a round appears, and out once it is gone.
 */

/** The colours the game is drawn with, from CSS (game.css and make-good-connections.css). */
export const CONNECT_COLORS = {
  dot: '--connect-dot',
  dotShadow: '--button-shadow',
  good: '--connect-good',
  wall: '--connect-wall',
  ring: '--connect-ring',
  wrong: '--connect-wrong',
} as const satisfies CssVariables

export type ConnectColors = CssValues<keyof typeof CONNECT_COLORS>

/** How soft the dots' shadow is. */
export const DOT_SHADOW_BLUR = 4
/** The green outline on the last dot of the path: its middle this far from the dot's centre… */
export const OUTLINE_RADIUS = DOT_RADIUS + 3
/** …and this thick. */
export const OUTLINE_WIDTH = 2
/** The ring that shows the time left: its middle this far from its dot's centre, clear of the outline. */
export const RING_RADIUS = DOT_RADIUS + 8

/** A straight line from `from` to `to`, `width` wide, in `color`. */
function drawLine(
  context: CanvasRenderingContext2D,
  from: GamePoint,
  to: GamePoint,
  width: number,
  color: string,
  cap: CanvasLineCap,
) {
  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.lineWidth = width
  context.lineCap = cap
  context.strokeStyle = color
  context.stroke()
}

/** `wall`: a bar WALL_THICKNESS thick, square at its ends. */
export function drawWall(context: CanvasRenderingContext2D, wall: Wall, color: string): void {
  drawLine(context, wall.from, wall.to, WALL_THICKNESS, color, 'butt')
}

/** The lines from each dot of `path` to the next. */
export function drawPath(
  context: CanvasRenderingContext2D,
  dots: readonly GamePoint[],
  path: readonly number[],
  color: string,
): void {
  path.slice(1).forEach((dot, i) => {
    drawLine(context, dots[path[i]], dots[dot], LINE_WIDTH, color, 'round')
  })
}

/** A dot at `centre`, filled with `fill`, with a soft shadow. */
export function drawDot(
  context: CanvasRenderingContext2D,
  centre: GamePoint,
  fill: string,
  shadow: string,
): void {
  context.beginPath()
  context.arc(centre.x, centre.y, DOT_RADIUS, 0, Math.PI * 2)
  context.shadowColor = shadow
  context.shadowBlur = DOT_SHADOW_BLUR
  context.fillStyle = fill
  context.fill()
  // Nothing drawn after casts a shadow.
  context.shadowBlur = 0
}

/** The green outline around the dot at `centre`. */
export function drawOutline(
  context: CanvasRenderingContext2D,
  centre: GamePoint,
  color: string,
): void {
  context.beginPath()
  context.arc(centre.x, centre.y, OUTLINE_RADIUS, 0, Math.PI * 2)
  context.lineWidth = OUTLINE_WIDTH
  context.strokeStyle = color
  context.stroke()
}

/** What the drawing shows: the game's current state. */
export interface MakeGoodConnectionsScene {
  readonly round: Round | undefined
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { round, timeMs }: MakeGoodConnectionsScene,
  colors: ConnectColors,
): void {
  clearGameCanvas(context)
  const opacity = round ? roundOpacityAt(round, timeMs) : 0

  if (!round || opacity === 0) {
    return
  }

  const { dots, walls } = round.layout
  const { path } = round
  context.globalAlpha = opacity

  for (const wall of walls) {
    drawWall(context, wall, colors.wall)
  }

  drawPath(context, dots, path, colors.good)
  const hit = wallHitShownAt(round, timeMs)
  if (hit) {
    drawLine(context, hit.from, hit.to, LINE_WIDTH, colors.wrong, 'round')
  }

  // Green once joined to another: a dot tapped alone only has the outline.
  const joined = path.length >= 2 ? path : []
  dots.forEach((dot, i) => {
    drawDot(context, dot, joined.includes(i) ? colors.good : colors.dot, colors.dotShadow)
  })

  const last = path.at(-1)
  if (last !== undefined && !isConnected(round)) {
    drawOutline(context, dots[last], colors.good)
  }

  drawTimeRing(context, dots[round.ringDot], RING_RADIUS, timeLeftAt(round, timeMs), colors.ring)
  context.globalAlpha = 1
}
