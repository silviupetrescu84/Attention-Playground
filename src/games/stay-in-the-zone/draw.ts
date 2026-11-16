import bubbleZoneUrl from '../../assets/stay-in-the-zone/bubble-zone.png'
import {
  CARD_COLORS,
  drawBubbleImage,
  type BubbleSize,
  type CssValues,
  type CssVariables,
} from '../shared/canvas-style'
import { clearGameCanvas, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { createImageLoader } from '../shared/load-image'
import { drawTimeRing } from '../shared/time-ring'
import { timeLeftAt } from '../shared/timed-turns'
import { BALL_RADIUS, BALL_RING_RADIUS, BALL_SIZE, BALL_X, type Ball } from './ball'
import {
  timeInZoneLeft,
  ZONE_RING_RADIUS,
  zoneCentre,
  zoneOpacityAt,
  type Zone,
} from './stay-in-the-zone'
import './stay-in-the-zone.css'

/**
 * Drawing for Stay in the Zone: the zone, a see-through green band across
 * the canvas, with a solid green ring in its middle that runs out with its
 * time; the ball in its bubble over it; and around the ball a white ring that
 * runs out with the time the ball still needs in the zone. The white ring
 * has a soft shadow, like the app's buttons, so it shows on the light
 * background too. The zone and both rings are there from when the zone
 * appears, and fade out with it; the ball is always there.
 */

/** The colours the game is drawn with, from CSS (game.css and stay-in-the-zone.css). */
export const STAY_COLORS = {
  ...CARD_COLORS,
  zone: '--stay-zone',
  zoneRing: '--stay-zone-ring',
  ballRing: '--stay-ball-ring',
  ballRingShadow: '--button-shadow',
} as const satisfies CssVariables

export type StayColors = CssValues<keyof typeof STAY_COLORS>

/** Loads (once) the bubble the ball is drawn in. */
export const loadBallImage = createImageLoader(bubbleZoneUrl, 'bubble-zone.png')

/** The ball itself, without its glow, is this share of its image (measured). */
export const BALL_IMAGE_BODY = 0.725

/** The ball's image is drawn this big, so the ball in it is BALL_SIZE as seen. */
export const BALL_LOOK: BubbleSize = {
  width: BALL_SIZE / BALL_IMAGE_BODY,
  height: BALL_SIZE / BALL_IMAGE_BODY,
  radiusX: BALL_RADIUS,
  radiusY: BALL_RADIUS,
}

/** How soft the white ring's shadow is. */
export const BALL_RING_SHADOW_BLUR = 4

/** How the scene looks. */
export interface SceneLook {
  readonly colors: StayColors
  /** The ball's artwork; a plain ball is drawn if it did not load. */
  readonly ballImage?: CanvasImageSource
}

/** The zone across the canvas, and the ring in its middle, as they are at `timeMs`. */
export function drawZone(
  context: CanvasRenderingContext2D,
  zone: Zone,
  timeMs: number,
  colors: StayColors,
): void {
  context.fillStyle = colors.zone
  context.fillRect(0, zone.top, GAME_WIDTH, zone.height)
  drawTimeRing(
    context,
    zoneCentre(zone),
    ZONE_RING_RADIUS,
    timeLeftAt(zone, timeMs),
    colors.zoneRing,
  )
}

/** The white ring around the ball at `centre`, as far round as `timeLeft` (0 to 1). */
export function drawBallRing(
  context: CanvasRenderingContext2D,
  centre: GamePoint,
  timeLeft: number,
  colors: StayColors,
): void {
  context.shadowColor = colors.ballRingShadow
  context.shadowBlur = BALL_RING_SHADOW_BLUR
  drawTimeRing(context, centre, BALL_RING_RADIUS, timeLeft, colors.ballRing)
  // Nothing drawn after casts a shadow.
  context.shadowBlur = 0
}

/** What the drawing shows: the game's current state. */
export interface StayInTheZoneScene {
  readonly ball: Ball
  readonly zone: Zone | undefined
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { ball, zone, timeMs }: StayInTheZoneScene,
  { colors, ballImage }: SceneLook,
): void {
  clearGameCanvas(context)
  const centre = { x: BALL_X, y: ball.y }
  const opacity = zone ? zoneOpacityAt(zone, timeMs) : 0

  if (zone && opacity > 0) {
    context.globalAlpha = opacity
    drawZone(context, zone, timeMs, colors)
    context.globalAlpha = 1
  }

  drawBubbleImage(context, ballImage, centre, BALL_LOOK, colors)

  if (zone && opacity > 0) {
    context.globalAlpha = opacity
    drawBallRing(context, centre, timeInZoneLeft(zone), colors)
    context.globalAlpha = 1
  }
}
