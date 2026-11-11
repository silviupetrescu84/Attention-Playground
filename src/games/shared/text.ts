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
 * The one size to write all of `texts` in `font`: the largest, in half pixels
 * between `minSize` and `maxSize`, at which each of them fits in `maxLines`
 * lines of `maxWidth`. Measured with whatever font is available, so it fits
 * even if the font could not load.
 */
export function fitFontSize(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  texts: readonly string[],
  { maxWidth, maxLines = 1, minSize, maxSize }: TextFit,
): number {
  function fitsAt(size: number) {
    context.font = fontAt(font, size)

    return texts.every((text) => {
      const lines = wrapText(context, text, maxWidth)
      return (
        lines.length <= maxLines &&
        lines.every((line) => context.measureText(line).width <= maxWidth)
      )
    })
  }

  for (let size = maxSize; size > minSize; size -= 0.5) {
    if (fitsAt(size)) {
      return size
    }
  }

  return minSize
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
 * How to fit texts of up to `maxLines` lines inside a circle of `radius`: as
 * wide as the circle is at the top and bottom of the tallest block of text
 * (at `maxSize`), less `margin` on each side.
 */
export function fitInCircle(
  radius: number,
  margin: number,
  { maxLines, minSize, maxSize }: Required<Omit<TextFit, 'maxWidth'>>,
): TextFit {
  const halfHeight = (maxLines * maxSize * LINE_HEIGHT) / 2
  const maxWidth = 2 * Math.sqrt(radius ** 2 - halfHeight ** 2) - 2 * margin
  return { maxWidth: Math.floor(maxWidth), maxLines, minSize, maxSize }
}
