import type { GamePoint } from './game-canvas'

/**
 * How games draw on the canvas (colours, font), shared by every minigame.
 *
 * Every style in the app is set in CSS. A canvas cannot use CSS, so each game
 * lists the CSS variables it draws with (under names its drawing code uses)
 * and reads their values from the page with `readCssVariables`. The
 * variables are in game.css (shared) and each game's own CSS.
 */

export type CssVariable = `--${string}`

/** The CSS variable for each style (a colour, a font…) a game draws with. */
export type CssVariables<Name extends string = string> = Readonly<Record<Name, CssVariable>>

/** The value of each of those styles, ready to draw with. */
export type CssValues<Name extends string> = Readonly<Record<Name, string>>

/** The colours of a card with text on it (see game.css). */
export const CARD_COLORS = {
  text: '--color-ink',
  cardFill: '--canvas-card-fill',
  cardBorder: '--canvas-card-border',
} as const satisfies CssVariables

/** The border of a plain bubble (see `drawBubbleImage`). */
export const BUBBLE_BORDER_WIDTH = 1.5

/** Starts a path around the ellipse centred on `centre` (a circle if both radii are the same). */
export function traceEllipse(
  context: CanvasRenderingContext2D,
  { x, y }: GamePoint,
  radiusX: number,
  radiusY: number,
): void {
  context.beginPath()
  context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2)
}

/** How big a bubble image is drawn, and how big the bubble in it is as seen. */
export interface BubbleSize {
  readonly width: number
  readonly height: number
  /** The bubble itself, without its glow or transparent edges. */
  readonly radiusX: number
  readonly radiusY: number
}

/**
 * A bubble centred on `centre`: `image` drawn at `size`, or, if it could not
 * load, a plain bubble in the card colours the size of the bubble as seen,
 * so the game can still be played.
 */
export function drawBubbleImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | undefined,
  centre: GamePoint,
  size: BubbleSize,
  colors: CssValues<'cardFill' | 'cardBorder'>,
): void {
  if (image) {
    const { width, height } = size
    context.drawImage(image, centre.x - width / 2, centre.y - height / 2, width, height)
    return
  }

  traceEllipse(context, centre, size.radiusX, size.radiusY)
  context.fillStyle = colors.cardFill
  context.fill()
  context.lineWidth = BUBBLE_BORDER_WIDTH
  context.strokeStyle = colors.cardBorder
  context.stroke()
}

/**
 * The value of each of `variables` for `element` (the game's canvas). Throws
 * if one is not set, so a style missing from the CSS is never drawn with
 * nothing.
 */
export function readCssVariables<Name extends string>(
  element: Element,
  variables: CssVariables<Name>,
): CssValues<Name> {
  const style = getComputedStyle(element)
  const values = Object.entries<CssVariable>(variables).map(([name, variable]) => {
    const value = style.getPropertyValue(variable).trim()

    if (!value) {
      throw new Error(`The CSS variable ${variable} is not set`)
    }

    return [name, value]
  })

  // Object.entries loses the names' type; these are exactly the names given.
  return Object.fromEntries(values) as CssValues<Name>
}
