import type { CssValues, CssVariables } from '../shared/canvas-style'
import { BUBBLE_COLORS, hueFor } from '../shared/feedback'
import { clearGameCanvas, GAME_HEIGHT, GAME_WIDTH } from '../shared/game-canvas'
import { drawLabelledBubble } from '../shared/labelled-bubble'
import { drawPill, PILL_COLORS } from '../shared/pill'
import { remember } from '../shared/remember'
import {
  layOutText,
  type CanvasFont,
  type TextBlock,
  type TextFit,
  type TextShape,
  type TextStyle,
} from '../shared/text'
import { WORD_OVAL, wordOpacityAt, type FallingWord } from './improve-inner-voice'
import { PAD_WIDTH, type Pad } from './pad'
import './improve-inner-voice.css'

/**
 * Drawing for Improve Inner Voice: each word in an oval (the one from
 * Emotions Rise, a quarter of the canvas wide), all at one size on one line;
 * one caught fades out with a green hue (good) or a red one (bad). The pad is
 * drawn over the words, like the app's white buttons (Difficulty, High
 * scores): a raised white pill, with "Inner Voice" written on it in ink.
 * While the player is empowered, the pad has a green border, and a green
 * line runs along the bottom of the canvas, under it.
 */

/** The colours the game is drawn with, from CSS (game.css and improve-inner-voice.css). */
export const INNER_VOICE_COLORS = {
  ...BUBBLE_COLORS,
  ...PILL_COLORS,
  padFill: '--inner-voice-pad-fill',
  padText: '--inner-voice-pad-text',
  empowered: '--inner-voice-empowered',
} as const satisfies CssVariables

export type InnerVoiceColors = CssValues<keyof typeof INNER_VOICE_COLORS>

/** How words are written: on one line, inside the oval as seen, as large as the longest allows. */
export const WORD_TEXT: TextShape = {
  radiusX: WORD_OVAL.radiusX,
  radiusY: WORD_OVAL.radiusY,
  margin: 6,
  minSize: 8,
  maxSize: 18,
}

/** What is written on the pad. */
export const PAD_LABEL = 'Inner Voice'

/** It is written on one line, up to 15 px, at least 12 px from the pad's ends. */
export const PAD_TEXT_FIT: TextFit = {
  maxWidth: PAD_WIDTH - 2 * 12,
  minSize: 10,
  maxSize: 15,
}

/** How wide the green border of the pad is while the player is empowered… */
export const EMPOWERED_BORDER_WIDTH = 3
/** …and how high the green line along the bottom of the canvas. */
export const EMPOWERED_EDGE_HEIGHT = 6

/** Lays out each word's text in `style` once, the first time it is drawn. */
export function createWordText(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  { fontSize, fit }: TextStyle,
): (falling: FallingWord) => TextBlock {
  return remember((falling: FallingWord) =>
    layOutText(context, font, falling.word.text, fontSize, fit.maxWidth),
  )
}

/** How the scene looks. */
export interface SceneLook {
  /** Each word's text, laid out. */
  readonly textOf: (falling: FallingWord) => TextBlock
  /** The size the pad's label is written at. */
  readonly padFontSize: number
  readonly font: CanvasFont
  readonly colors: InnerVoiceColors
  /** The oval artwork; plain ovals are drawn if it did not load. */
  readonly ovalImage?: CanvasImageSource
}

/** The pad, with its label, and a green border while `empowered`. */
export function drawPad(
  context: CanvasRenderingContext2D,
  pad: Pad,
  empowered: boolean,
  { padFontSize, font, colors }: Pick<SceneLook, 'padFontSize' | 'font' | 'colors'>,
): void {
  const border = empowered ? { color: colors.empowered, width: EMPOWERED_BORDER_WIDTH } : undefined
  const pill = { box: pad.box, label: PAD_LABEL, fontSize: padFontSize, border }
  drawPill(context, pill, font, {
    fill: colors.padFill,
    text: colors.padText,
    shadow: colors.pillShadow,
  })
}

/** The green line along the bottom of the canvas while the player is empowered. */
export function drawEmpoweredEdge(context: CanvasRenderingContext2D, color: string): void {
  context.fillStyle = color
  context.fillRect(0, GAME_HEIGHT - EMPOWERED_EDGE_HEIGHT, GAME_WIDTH, EMPOWERED_EDGE_HEIGHT)
}

/** What the drawing shows: the game's current state. */
export interface ImproveInnerVoiceScene {
  readonly words: readonly FallingWord[]
  readonly pad: Pad
  readonly empowered: boolean
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { words, pad, empowered, timeMs }: ImproveInnerVoiceScene,
  look: SceneLook,
): void {
  clearGameCanvas(context)

  for (const falling of words) {
    const opacity = wordOpacityAt(falling, timeMs)

    if (opacity === 0) {
      continue
    }

    // Only one caught takes a hue: green if good, red if bad.
    const right = falling.word.type === 'good'
    const hue = falling.end === 'tapped' ? hueFor(right, look.colors) : undefined
    const bubble = { centre: falling, size: WORD_OVAL, text: look.textOf(falling), hue }
    context.globalAlpha = opacity
    drawLabelledBubble(context, look.ovalImage, bubble, look.font, look.colors)
  }

  context.globalAlpha = 1

  if (empowered) {
    drawEmpoweredEdge(context, look.colors.empowered)
  }
  drawPad(context, pad, empowered, look)
}
