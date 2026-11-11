import { CARD_COLORS, type CssValues, type CssVariables } from '../shared/canvas-style'
import { clearGameCanvas, GAME_HEIGHT, GAME_WIDTH } from '../shared/game-canvas'
import {
  drawTextBlock,
  fitFontSize,
  fontAt,
  wrapText,
  type CanvasFont,
  type TextBlock,
  type TextFit,
} from '../shared/text'
import {
  ACTION_SIZE,
  CHECK_Y,
  CIRCLE_RADIUS,
  GOAL_HEIGHT,
  GOAL_TOP,
  LANE_COUNT,
  LANE_WIDTH,
  laneCentre,
  LANES_TOP,
  type Row,
} from './align-the-actions'
import './align-the-actions.css'
import type { Goal } from './goals'

/**
 * Drawing for Align the Actions: the goal at the top, the lanes, the rows of
 * actions (each on a rounded square, with its text over it) and the circle.
 *
 * Rows are only drawn below the goal, so they seem to come out from under
 * it. The circle is drawn over them, so the action in it is tinted green.
 * Once a row is chosen from, the chosen square turns green if it was aligned
 * and red if not.
 */

/** The colours the game is drawn with, from CSS (game.css and align-the-actions.css). */
export const ALIGN_COLORS = {
  ...CARD_COLORS,
  aligned: '--canvas-good-tint',
  notAligned: '--canvas-bad-tint',
  laneLine: '--align-lane-line',
  circle: '--align-circle',
} as const satisfies CssVariables

export type AlignColors = CssValues<keyof typeof ALIGN_COLORS>

export const LANE_LINE_WIDTH = 1
export const CARD_BORDER_WIDTH = 1.5
export const CORNER_RADIUS = 12

/** Space around the goal's card, and inside it around the text. */
const GOAL_MARGIN = 12
const GOAL_CARD_HEIGHT = GOAL_HEIGHT - 8

/** Every goal at one size: the largest, up to 24 px, at which each fits in 2 lines. */
export const GOAL_TEXT_FIT: TextFit = {
  maxWidth: GAME_WIDTH - 4 * GOAL_MARGIN,
  maxLines: 2,
  minSize: 14,
  maxSize: 24,
}

/**
 * The 4 actions of a row at one size: the largest, up to 16 px, at which each
 * fits in 2 lines inside its square, 4 px from each side.
 */
export const ACTION_TEXT_FIT: TextFit = {
  maxWidth: ACTION_SIZE - 8,
  maxLines: 2,
  minSize: 8,
  maxSize: 16,
}

/** What the drawing shows: the game's current state. */
export interface AlignTheActionsScene {
  readonly rows: readonly Row[]
  readonly goal: Goal | undefined
  readonly circleLane: number
}

/** How the scene looks: its text sizes and colours. */
export interface SceneLook {
  /** The size for every goal (see GOAL_TEXT_FIT). */
  readonly goalFontSize: number
  /** How to write each of a row's actions, in lane order. */
  textOf(row: Row): readonly TextBlock[]
  readonly colors: AlignColors
  readonly font: CanvasFont
}

/** How to write `texts` (a row's actions): all at one size, in at most 2 lines each. */
export function layOutActions(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
  texts: readonly string[],
): TextBlock[] {
  const fontSize = fitFontSize(context, font, texts, ACTION_TEXT_FIT)
  context.font = fontAt(font, fontSize)

  return texts.map((text) => ({
    fontSize,
    lines: wrapText(context, text, ACTION_TEXT_FIT.maxWidth),
  }))
}

/**
 * Lays out each row's actions the first time they are needed, and remembers
 * them for as long as the row exists.
 */
export function createActionText(
  context: CanvasRenderingContext2D,
  font: CanvasFont,
): (row: Row) => TextBlock[] {
  const laidOut = new WeakMap<Row, TextBlock[]>()

  return (row) => {
    let blocks = laidOut.get(row)

    if (!blocks) {
      blocks = layOutActions(
        context,
        font,
        row.actions.map((action) => action.text),
      )
      laidOut.set(row, blocks)
    }

    return blocks
  }
}

function drawCard(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  border: string,
) {
  context.beginPath()
  context.roundRect(x, y, width, height, CORNER_RADIUS)
  context.fillStyle = fill
  context.fill()
  context.lineWidth = CARD_BORDER_WIDTH
  context.strokeStyle = border
  context.stroke()
}

export function drawLanes(context: CanvasRenderingContext2D, color: string) {
  context.beginPath()
  for (let lane = 1; lane < LANE_COUNT; lane++) {
    context.moveTo(lane * LANE_WIDTH, LANES_TOP)
    context.lineTo(lane * LANE_WIDTH, GAME_HEIGHT)
  }
  context.lineWidth = LANE_LINE_WIDTH
  context.strokeStyle = color
  context.stroke()
}

/** The fill of a row's square in `lane`: tinted once chosen, plain otherwise. */
function fillOf(row: Row, lane: number, colors: AlignColors) {
  if (row.chosenLane !== lane) {
    return colors.cardFill
  }

  return row.actions[lane].kind === 'aligned' ? colors.aligned : colors.notAligned
}

export function drawRow(
  context: CanvasRenderingContext2D,
  row: Row,
  text: readonly TextBlock[],
  look: Pick<SceneLook, 'font' | 'colors'>,
) {
  const { colors } = look

  row.actions.forEach((_action, lane) => {
    const x = laneCentre(lane)
    drawCard(
      context,
      x - ACTION_SIZE / 2,
      row.y - ACTION_SIZE / 2,
      ACTION_SIZE,
      ACTION_SIZE,
      fillOf(row, lane, colors),
      colors.cardBorder,
    )
    drawTextBlock(context, text[lane], x, row.y, look.font, colors.text)
  })
}

export function drawCircle(context: CanvasRenderingContext2D, lane: number, color: string) {
  context.beginPath()
  context.arc(laneCentre(lane), CHECK_Y, CIRCLE_RADIUS, 0, Math.PI * 2)
  context.fillStyle = color
  context.fill()
}

export function drawGoal(context: CanvasRenderingContext2D, goal: Goal, look: SceneLook) {
  const { goalFontSize: fontSize, font, colors } = look
  const top = GOAL_TOP + (GOAL_HEIGHT - GOAL_CARD_HEIGHT) / 2
  const width = GAME_WIDTH - 2 * GOAL_MARGIN
  drawCard(context, GOAL_MARGIN, top, width, GOAL_CARD_HEIGHT, colors.cardFill, colors.cardBorder)

  context.font = fontAt(font, fontSize)
  const lines = wrapText(context, goal.title, GOAL_TEXT_FIT.maxWidth)
  const centre = GOAL_TOP + GOAL_HEIGHT / 2
  drawTextBlock(context, { fontSize, lines }, GAME_WIDTH / 2, centre, font, colors.text)
}

export function drawScene(
  context: CanvasRenderingContext2D,
  { rows, goal, circleLane }: AlignTheActionsScene,
  look: SceneLook,
) {
  const { textOf, colors } = look
  clearGameCanvas(context)
  drawLanes(context, colors.laneLine)

  // Rows only show below the goal, as if they came out from under it.
  context.save()
  context.beginPath()
  context.rect(0, LANES_TOP, GAME_WIDTH, GAME_HEIGHT - LANES_TOP)
  context.clip()
  for (const row of rows) {
    drawRow(context, row, textOf(row), look)
  }
  context.restore()

  drawCircle(context, circleLane, colors.circle)

  if (goal) {
    drawGoal(context, goal, look)
  }
}
