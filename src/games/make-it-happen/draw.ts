import { LARGE_OVAL, LARGE_OVAL_TEXT } from '../shared/artwork'
import { drawBubbleImage, type CssValues, type CssVariables } from '../shared/canvas-style'
import { BUBBLE_COLORS, hueFor } from '../shared/feedback'
import { clearGameCanvas } from '../shared/game-canvas'
import { drawLabelledBubble } from '../shared/labelled-bubble'
import { remember } from '../shared/remember'
import {
  defaultTextStyle,
  drawTextBlock,
  layOutText,
  type CanvasFont,
  type TextBlock,
  type TextShape,
  type TextStyle,
} from '../shared/text'
import { drawTimeRing } from '../shared/time-ring'
import { timeLeftAt } from '../shared/timed-turns'
import { CENTRE, GOAL_SIZE, goalRadiusFor, RING_OFFSET } from './layout'
import {
  goalOpacityAt,
  goalSizeAt,
  optionsOpacityAt,
  type ShownGoal,
  type Turn,
} from './make-it-happen'
import './make-it-happen.css'

/**
 * Drawing for Make It Happen: the goal in a green bubble (the one from Focus
 * Attention) in the middle, growing and shrinking, its text with it; a ring
 * around it that runs out with the time to choose; and the actions in ovals
 * (the one from Emotions Rise) around it. The action chosen takes a green
 * hue (good) or a red one (a distraction) as the actions fade out.
 *
 * Every text of a kind is written at one size, so nothing changes size from
 * one set of actions to the next (see the shared `chooseTextStyle`).
 */

/** The colours the game is drawn with, from CSS (game.css and make-it-happen.css). */
export const MAKE_IT_HAPPEN_COLORS = {
  ...BUBBLE_COLORS,
  ring: '--make-it-happen-ring',
} as const satisfies CssVariables

export type MakeItHappenColors = CssValues<keyof typeof MAKE_IT_HAPPEN_COLORS>

/** Space kept between a text and its bubble's edge. */
export const TEXT_MARGIN = 8

/** The goals, inside the goal's bubble at its starting size (the text is scaled with it). */
export const GOAL_TEXT: TextShape = {
  radiusX: goalRadiusFor(GOAL_SIZE),
  radiusY: goalRadiusFor(GOAL_SIZE),
  margin: TEXT_MARGIN,
  minSize: 10,
  maxSize: 24,
}

/** How goals and actions are written. */
export interface TextStyles {
  readonly goal: TextStyle
  readonly option: TextStyle
}

/** Before the font is measured: the largest sizes, on 2 lines. */
export const DEFAULT_STYLES: TextStyles = {
  goal: defaultTextStyle(GOAL_TEXT),
  option: defaultTextStyle(LARGE_OVAL_TEXT),
}

/** Lays out texts in lines, once each, remembering them for as long as what they are for exists. */
export interface TextLayout {
  /** The goal's text at its starting size. */
  goal(goal: ShownGoal): TextBlock
  /** Each action's text, in the order of the turn's options. */
  options(turn: Turn): readonly TextBlock[]
}

export function createTextLayout(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  styles: TextStyles,
): TextLayout {
  function layOut(text: string, { fontSize, fit }: TextStyle): TextBlock {
    return layOutText(context, font, text, fontSize, fit.maxWidth)
  }

  return {
    goal: remember((goal: ShownGoal) => layOut(goal.goal.title, styles.goal)),
    options: remember((turn: Turn) =>
      turn.options.map((option) => layOut(option.text, styles.option)),
    ),
  }
}

/** How the scene looks. */
export interface SceneLook {
  readonly text: TextLayout
  readonly font: CanvasFont
  readonly colors: MakeItHappenColors
  /** The artwork; plain shapes are drawn for any that did not load. */
  readonly goalImage?: CanvasImageSource
  readonly optionImage?: CanvasImageSource
}

/**
 * The goal as it is at `timeMs`: faded in or out, at its size, its text
 * scaled with it, and the ring for `turn` (its actions) while it goes on.
 */
export function drawGoal(
  context: CanvasRenderingContext2D,
  goal: ShownGoal,
  turn: Turn | undefined,
  timeMs: number,
  look: SceneLook,
): void {
  const opacity = goalOpacityAt(goal, timeMs)

  if (opacity === 0) {
    return
  }

  const size = goalSizeAt(goal, timeMs)
  const radius = goalRadiusFor(size)
  const { colors, font } = look
  context.globalAlpha = opacity

  const drawn = { width: size, height: size, radiusX: radius, radiusY: radius }
  drawBubbleImage(context, look.goalImage, CENTRE, drawn, colors)

  const block = look.text.goal(goal)
  const scaled = { ...block, fontSize: (block.fontSize * size) / GOAL_SIZE }
  drawTextBlock(context, scaled, CENTRE.x, CENTRE.y, font, colors.text)

  if (turn?.goal === goal && goal.endedAtMs === undefined) {
    drawTimeRing(context, CENTRE, radius + RING_OFFSET, timeLeftAt(turn, timeMs), colors.ring)
  }

  context.globalAlpha = 1
}

/** A set of actions as it is at `timeMs`, faded in or out; the one chosen with its hue. */
export function drawTurn(
  context: CanvasRenderingContext2D,
  turn: Turn,
  timeMs: number,
  look: SceneLook,
): void {
  const opacity = optionsOpacityAt(turn, timeMs)

  if (opacity === 0) {
    return
  }

  const { text, font, colors } = look
  const blocks = text.options(turn)
  context.globalAlpha = opacity
  turn.options.forEach((option, i) => {
    // Only the one chosen takes a hue: green if good, red if a distraction.
    const hue = option === turn.chosen ? hueFor(option.good, colors) : undefined
    const bubble = { centre: option, size: LARGE_OVAL, text: blocks[i], hue }
    drawLabelledBubble(context, look.optionImage, bubble, font, colors)
  })
  context.globalAlpha = 1
}

/** What the drawing shows: the game's current state. */
export interface MakeItHappenScene {
  readonly goal: ShownGoal | undefined
  readonly previousGoal: ShownGoal | undefined
  readonly turn: Turn | undefined
  readonly previousTurn: Turn | undefined
  readonly timeMs: number
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { goal, previousGoal, turn, previousTurn, timeMs }: MakeItHappenScene,
  look: SceneLook,
): void {
  clearGameCanvas(context)

  for (const shown of [previousGoal, goal]) {
    if (shown) {
      drawGoal(context, shown, turn, timeMs, look)
    }
  }

  for (const shown of [previousTurn, turn]) {
    if (shown) {
      drawTurn(context, shown, timeMs, look)
    }
  }
}
