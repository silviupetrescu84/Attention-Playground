import { readCssVariables, type CssValues, type CssVariables } from './canvas-style'
import { loadFont, type LoadFontOptions } from './load-font'

/**
 * Text on the game canvas, shared by every minigame.
 *
 * Games write in one font, set in CSS (game.css) like every other style, and
 * read with `readCssVariables(canvas, CANVAS_FONT)`. Load it before a round
 * starts (see `load-font.ts`): a canvas does not wait for it.
 */

/** The CSS variables of the canvas font. */
export const CANVAS_FONT = {
  family: '--canvas-font-family',
  weight: '--canvas-font-weight',
} as const satisfies CssVariables

export type CanvasFont = CssValues<keyof typeof CANVAS_FONT>

/** `font` at `size` px, as a canvas (and CSS) font shorthand: "600 20px …". */
export function fontAt({ weight, family }: CanvasFont, size: number): string {
  return `${weight} ${size}px ${family}`
}

/**
 * Loads the canvas font set in the page's CSS (see `loadFont`). Loading it at
 * one size loads it for every size.
 */
export function loadCanvasFont(options?: LoadFontOptions): Promise<boolean> {
  const font = readCssVariables(document.documentElement, CANVAS_FONT)
  return loadFont(fontAt(font, 16), options)
}

/**
 * Loads the canvas font and, at the same time, what `load` loads (a game's
 * images); resolves with the latter once both are done.
 */
export async function loadWithCanvasFont<Loaded>(
  load: () => Promise<Loaded>,
  options?: LoadFontOptions,
): Promise<Loaded> {
  const [, loaded] = await Promise.all([loadCanvasFont(options), load()])
  return loaded
}

/**
 * Splits `text` into lines no wider than `maxWidth`, breaking only between
 * words, in the context's current font. A word wider than `maxWidth` gets a
 * line of its own (and is still too wide).
 */
export function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of text.split(' ')) {
    const longer = line ? `${line} ${word}` : word

    if (line && context.measureText(longer).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = longer
    }
  }

  lines.push(line)
  return lines
}

export interface TextFit {
  /** Widest a line may be. */
  readonly maxWidth: number
  /** Most lines a text may take. Defaults to 1. */
  readonly maxLines?: number
  /** Smallest size to try; used even if the texts do not fit at it. */
  readonly minSize: number
  /** Largest size to try. */
  readonly maxSize: number
}

/**
 * Whether each of `texts`, in `font` at `size`, fits in `maxLines` lines
 * (default 1) of `maxWidth`. Measured with whatever font is available.
 */
export function textsFit(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  texts: readonly string[],
  size: number,
  { maxWidth, maxLines = 1 }: Pick<TextFit, 'maxWidth' | 'maxLines'>,
): boolean {
  context.font = fontAt(font, size)

  return texts.every((text) => {
    const lines = wrapText(context, text, maxWidth)
    return (
      lines.length <= maxLines && lines.every((line) => context.measureText(line).width <= maxWidth)
    )
  })
}

/**
 * The one size to write all of `texts` in `font`: the largest, in half pixels
 * between `minSize` and `maxSize`, at which each of them fits in `maxLines`
 * lines of `maxWidth`. Measured with whatever font is available, so it fits
 * even if the font could not load.
 */
export function fitFontSize(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  texts: readonly string[],
  fit: TextFit,
): number {
  for (let size = fit.maxSize; size > fit.minSize; size -= 0.5) {
    if (textsFit(context, font, texts, size, fit)) {
      return size
    }
  }

  return fit.minSize
}

/** `text` broken into lines no wider than `maxWidth`, at `fontSize` in `font`. */
export function layOutText(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  text: string,
  fontSize: number,
  maxWidth: number,
): TextBlock {
  context.font = fontAt(font, fontSize)
  return { fontSize, lines: wrapText(context, text, maxWidth) }
}

/** Space between the lines of a text, as a share of its size. */
export const LINE_HEIGHT = 1.2

/** A text broken into lines, and the size to write it at. */
export interface TextBlock {
  readonly fontSize: number
  readonly lines: readonly string[]
}

/** Writes `block` centred on (x, y), in `font` and `color`. */
export function drawTextBlock(
  context: CanvasRenderingContext2D,
  { fontSize, lines }: TextBlock,
  x: number,
  y: number,
  font: CanvasFont,
  color: string,
) {
  const lineHeight = fontSize * LINE_HEIGHT
  const firstY = y - ((lines.length - 1) * lineHeight) / 2

  context.font = fontAt(font, fontSize)
  context.fillStyle = color
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  lines.forEach((line, i) => context.fillText(line, x, firstY + i * lineHeight))
}

/**
 * How to fit texts of up to `maxLines` lines inside an ellipse of radii
 * `radiusX` (across) and `radiusY` (up and down): as wide as the ellipse is
 * at the top and bottom of the tallest block of text (at `maxSize`), less
 * `margin` on each side. Throws if that block is taller than the ellipse.
 */
export function fitInEllipse(
  radiusX: number,
  radiusY: number,
  margin: number,
  { maxLines, minSize, maxSize }: Required<Omit<TextFit, 'maxWidth'>>,
): TextFit {
  const halfHeight = (maxLines * maxSize * LINE_HEIGHT) / 2

  if (halfHeight >= radiusY) {
    throw new RangeError(`${maxLines} lines of ${maxSize} px do not fit ${radiusY * 2} px high`)
  }

  const maxWidth = 2 * radiusX * Math.sqrt(1 - (halfHeight / radiusY) ** 2) - 2 * margin
  return { maxWidth: Math.floor(maxWidth), maxLines, minSize, maxSize }
}

/** How to fit texts inside a circle of `radius` (see `fitInEllipse`). */
export function fitInCircle(
  radius: number,
  margin: number,
  fit: Required<Omit<TextFit, 'maxWidth'>>,
): TextFit {
  return fitInEllipse(radius, radius, margin, fit)
}

/** Where a kind of text is written: inside an ellipse (or circle), between two sizes. */
export interface TextShape {
  readonly radiusX: number
  readonly radiusY: number
  /** Space kept between the text and the edge. */
  readonly margin: number
  readonly minSize: number
  readonly maxSize: number
}

/** How every text of a kind is written: the size, and the fit its lines are wrapped to. */
export interface TextStyle {
  readonly fontSize: number
  readonly fit: TextFit
}

/** Texts go on 3 lines only if on 2 they would be smaller than this (see `chooseTextStyle`). */
export const READABLE_SIZE = 14

/** How to write `maxLines` lines at `size` in `shape`: as wide as it is at their top and bottom. */
export function textStyleAt(shape: TextShape, maxLines: number, size: number): TextStyle {
  const { radiusX, radiusY, margin } = shape
  const fit = fitInEllipse(radiusX, radiusY, margin, { maxLines, minSize: size, maxSize: size })
  return { fontSize: size, fit }
}

/** How texts are written in `shape` before the font is measured: the largest size, on 2 lines. */
export function defaultTextStyle(shape: TextShape): TextStyle {
  return textStyleAt(shape, 2, shape.maxSize)
}

/**
 * The largest size, in half pixels, at which each of `texts` fits in
 * `shape` on `maxLines` lines; the smallest size if none does.
 */
export function largestTextStyle(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  texts: readonly string[],
  shape: TextShape,
  maxLines: number,
): TextStyle {
  for (let size = shape.maxSize; size > shape.minSize; size -= 0.5) {
    const style = textStyleAt(shape, maxLines, size)

    if (textsFit(context, font, texts, size, style.fit)) {
      return style
    }
  }

  return textStyleAt(shape, maxLines, shape.minSize)
}

/**
 * The one size to write every one of `texts` at inside `shape`, so none
 * looks bigger than another: the largest on 2 lines, unless that is under
 * READABLE_SIZE and 3 lines allow larger.
 */
export function chooseTextStyle(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  texts: readonly string[],
  shape: TextShape,
): TextStyle {
  const twoLines = largestTextStyle(context, font, texts, shape, 2)

  if (twoLines.fontSize >= READABLE_SIZE) {
    return twoLines
  }

  const threeLines = largestTextStyle(context, font, texts, shape, 3)
  return threeLines.fontSize > twoLines.fontSize ? threeLines : twoLines
}
