import { expect } from 'vitest'
import {
  chooseTextStyle,
  fontAt,
  LINE_HEIGHT,
  wrapText,
  type CanvasFont,
  type TextShape,
} from '../games/shared/text'

/**
 * Checks that every one of `texts`, at the one size chosen for them, fits in
 * `shape`: within its lines, with every corner of each line inside, margin
 * included.
 */
export function expectTextsInside(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  texts: readonly string[],
  shape: TextShape,
): void {
  const { fontSize, fit } = chooseTextStyle(context, font, texts, shape)
  const maxLines = fit.maxLines ?? 1
  const halfHeight = (maxLines * fontSize * LINE_HEIGHT) / 2
  context.font = fontAt(font, fontSize)

  for (const text of texts) {
    const lines = wrapText(context, text, fit.maxWidth)
    expect(lines.length, text).toBeLessThanOrEqual(maxLines)
    for (const line of lines) {
      const halfWidth = context.measureText(line).width / 2 + shape.margin
      const corner = (halfWidth / shape.radiusX) ** 2 + (halfHeight / shape.radiusY) ** 2
      expect(corner, text).toBeLessThanOrEqual(1)
    }
  }
}
