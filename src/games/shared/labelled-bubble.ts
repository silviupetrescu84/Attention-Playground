import { drawBubbleImage, type BubbleSize } from './canvas-style'
import { drawHue, type BubbleColors } from './feedback'
import type { GamePoint } from './game-canvas'
import { drawTextBlock, type CanvasFont, type TextBlock } from './text'

/** A bubble with a text in it (none while hidden), and a hue if it was chosen. */
export interface LabelledBubble {
  readonly centre: GamePoint
  readonly size: BubbleSize
  /** None while it is hidden (Remember Gratitude's, turned around). */
  readonly text?: TextBlock
  /** Over the bubble as seen, under the text (see the shared feedback). */
  readonly hue?: string
}

/**
 * `bubble` drawn with `image` (or a plain bubble if it did not load), its
 * hue if any, then its text (if any) centred on it.
 */
export function drawLabelledBubble(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | undefined,
  { centre, size, text, hue }: LabelledBubble,
  font: CanvasFont,
  colors: BubbleColors,
): void {
  drawBubbleImage(context, image, centre, size, colors)

  if (hue) {
    drawHue(context, centre, size.radiusX, size.radiusY, hue)
  }

  if (text) {
    drawTextBlock(context, text, centre.x, centre.y, font, colors.text)
  }
}
