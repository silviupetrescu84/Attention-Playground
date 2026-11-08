import { describe, expect, it, vi } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext, type DrawCall } from '../../test/fake-canvas-context'
import { fontAt, type CanvasFont } from '../shared/text'
import {
  ACTION_SIZE,
  CHECK_Y,
  CIRCLE_RADIUS,
  GOAL_HEIGHT,
  GOAL_TOP,
  LANES_TOP,
  type Row,
} from './align-the-actions'
import {
  ACTION_TEXT_FIT,
  ALIGN_COLORS,
  CORNER_RADIUS,
  createActionText,
  drawCircle,
  drawGoal,
  drawLanes,
  drawRow,
  drawScene,
  drawTextBlock,
  GOAL_TEXT_FIT,
  layOutActions,
  LINE_HEIGHT,
  type AlignColors,
  type SceneLook,
  type TextBlock,
} from './draw'
import type { ActionKind, Goal } from './goals'

// The fake font is 0.6 × size wide per character, spaces included, so a line
// of 84 px holds 140 / size characters.

const goal: Goal = { title: 'Pause and Breathe', aligned: [], against: [] }

function row({
  texts = ['Take a breath', 'Rush on', 'Skip my breaks', 'Dance'],
  y = 400,
  chosenLane = undefined as number | undefined,
  alignedLane = 0,
} = {}): Row {
  const kinds: ActionKind[] = ['against', 'against', 'otherGoal']
  kinds.splice(alignedLane, 0, 'aligned')
  return {
    goal,
    actions: texts.map((text, lane) => ({ text, kind: kinds[lane], goal })),
    spawnedAtMs: 0,
    y,
    chosenLane,
  }
}

const oneLine = (text: string, fontSize = 16): TextBlock => ({ fontSize, lines: [text] })
/** Stand-ins for the colours read from the CSS. */
const colors: AlignColors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  aligned: 'green tint',
  notAligned: 'red tint',
  laneLine: 'lane line',
  circle: 'circle green',
}
/** A stand-in for the font read from the CSS. */
const font: CanvasFont = { family: '"Test Sans"', weight: '600' }
const textLook = { font, colors }
/** A whole scene's look, with goals written at `goalFontSize`. */
const lookWith = (goalFontSize: number): SceneLook => ({
  goalFontSize,
  textOf: () => [],
  colors,
  font,
})
const names = (calls: readonly DrawCall[]) => calls.map((call) => call.name)

describe('colours', () => {
  it('come from CSS variables the app declares', () => {
    for (const variable of Object.values(ALIGN_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('use the shared card colours, and tints for right and wrong choices', () => {
    expect(ALIGN_COLORS).toEqual({
      text: '--color-ink',
      cardFill: '--canvas-card-fill',
      cardBorder: '--canvas-card-border',
      aligned: '--canvas-good-tint',
      notAligned: '--canvas-bad-tint',
      laneLine: '--align-lane-line',
      circle: '--align-circle',
    })
  })

  it('make the circle light green and half see-through', () => {
    expect(cssVariables.get('--align-circle')).toBe('rgb(134 239 172 / 50%)')
  })
})

describe('text sizes', () => {
  it('writes goals at up to 24 px, in up to 2 lines, inside their card', () => {
    expect(GOAL_TEXT_FIT).toEqual({ maxWidth: 352, maxLines: 2, minSize: 14, maxSize: 24 })
  })

  it('writes actions at up to 16 px, in up to 2 lines, 4 px inside each side of the square', () => {
    expect(ACTION_TEXT_FIT).toEqual({
      maxWidth: ACTION_SIZE - 8,
      maxLines: 2,
      minSize: 8,
      maxSize: 16,
    })
  })
})

describe('laying out a row', () => {
  it('uses the largest size when all 4 fit', () => {
    const texts = ['Rest', 'Nap', 'Walk', 'Sit']

    const blocks = layOutActions(createFakeContext().asContext(), font, texts)

    expect(blocks).toEqual([oneLine('Rest'), oneLine('Nap'), oneLine('Walk'), oneLine('Sit')])
  })

  it('writes all 4 at the size the longest needs, each in at most 2 lines', () => {
    const texts = ['Rest', 'Nap', 'Drift through the morning', 'Sit']

    const blocks = layOutActions(createFakeContext().asContext(), font, texts)

    // 'Drift through' (13 characters) needs size ≤ 140 / 13 = 10.77.
    expect(blocks).toEqual([
      oneLine('Rest', 10.5),
      oneLine('Nap', 10.5),
      { fontSize: 10.5, lines: ['Drift through', 'the morning'] },
      oneLine('Sit', 10.5),
    ])
  })
})

describe('remembering how rows are written', () => {
  it('lays out each row once, however often it is drawn', () => {
    const context = createFakeContext()
    const measure = vi.spyOn(context.asContext(), 'measureText')
    const textOf = createActionText(context.asContext(), font)
    const first = row()

    const blocks = textOf(first)
    const measured = measure.mock.calls.length

    expect(textOf(first)).toBe(blocks)
    expect(measure.mock.calls.length).toBe(measured)
  })

  it('lays out each new row for its own actions', () => {
    const textOf = createActionText(createFakeContext().asContext(), font)

    const short = textOf(row({ texts: ['Rest', 'Nap', 'Walk', 'Sit'] }))
    const long = textOf(row({ texts: ['Rest', 'Nap', 'Drift through the morning', 'Sit'] }))

    expect(short[0].fontSize).toBe(16)
    expect(long[0].fontSize).toBe(10.5)
  })
})

describe('writing a text', () => {
  it('centres one line on the point, in the ink colour', () => {
    const context = createFakeContext()

    drawTextBlock(context.asContext(), oneLine('Rest', 14), 150, 300, textLook)

    const texts = context.callsTo('fillText')
    expect(texts.map(({ args, font, fillStyle }) => [args, font, fillStyle])).toEqual([
      [['Rest', 150, 300], fontAt(font, 14), 'ink'],
    ])
    expect([context.textAlign, context.textBaseline]).toEqual(['center', 'middle'])
  })

  it('centres several lines on the point, 1.2 × the size apart', () => {
    const context = createFakeContext()
    const twoLines = { fontSize: 10, lines: ['Drift', 'through'] }

    drawTextBlock(context.asContext(), twoLines, 150, 300, textLook)

    expect(LINE_HEIGHT).toBe(1.2)
    expect(context.callsTo('fillText').map((call) => call.args)).toEqual([
      ['Drift', 150, 294],
      ['through', 150, 306],
    ])
  })
})

describe('drawing the lanes', () => {
  it('draws a line between each pair of lanes, from under the goal to the bottom', () => {
    const context = createFakeContext()

    drawLanes(context.asContext(), 'lane line')

    const path = context.calls.filter((call) => call.name !== 'beginPath')
    expect(path.map((call) => [call.name, call.args])).toEqual([
      ['moveTo', [100, LANES_TOP]],
      ['lineTo', [100, 800]],
      ['moveTo', [200, LANES_TOP]],
      ['lineTo', [200, 800]],
      ['moveTo', [300, LANES_TOP]],
      ['lineTo', [300, 800]],
      ['stroke', []],
    ])
    expect(context.callsTo('stroke')[0].strokeStyle).toBe('lane line')
  })
})

describe('drawing a row', () => {
  const texts = [oneLine('A'), oneLine('B'), oneLine('C'), oneLine('D')]

  it('draws a rounded square in each lane, centred on the row, with its text over it', () => {
    const context = createFakeContext()

    drawRow(context.asContext(), row({ y: 400 }), texts, textLook)

    expect(context.callsTo('roundRect').map((call) => call.args)).toEqual(
      [50, 150, 250, 350].map((x) => [x - 46, 354, ACTION_SIZE, ACTION_SIZE, CORNER_RADIUS]),
    )
    expect(context.callsTo('fillText').map((call) => call.args)).toEqual([
      ['A', 50, 400],
      ['B', 150, 400],
      ['C', 250, 400],
      ['D', 350, 400],
    ])
    const order = names(context.calls).filter((name) => name === 'roundRect' || name === 'fillText')
    expect(order).toEqual(Array.from({ length: 4 }, () => ['roundRect', 'fillText']).flat())
  })

  it('draws the squares as translucent cards, all alike, until the row is chosen from', () => {
    const context = createFakeContext()

    drawRow(context.asContext(), row(), texts, textLook)

    const fills = context.callsTo('fill').map((call) => call.fillStyle)
    expect(fills).toEqual(Array(4).fill('card fill'))
    expect(context.callsTo('stroke').map((call) => call.strokeStyle)).toEqual(
      Array(4).fill('card border'),
    )
  })

  it.each([
    ['green when the chosen action was aligned', 2, 'green tint'],
    ['red when it was not', 1, 'red tint'],
  ])('tints the chosen square %s', (_case, chosenLane, tint) => {
    const context = createFakeContext()

    drawRow(context.asContext(), row({ chosenLane, alignedLane: 2 }), texts, textLook)

    const fills = context.callsTo('fill').map((call) => call.fillStyle)
    expect(fills[chosenLane]).toBe(tint)
    expect(fills.filter((fill) => fill === 'card fill')).toHaveLength(3)
  })
})

describe('drawing the circle', () => {
  it('draws the circle in its lane, where rows are chosen from, in its colour', () => {
    const context = createFakeContext()

    drawCircle(context.asContext(), 2, 'circle green')

    expect(context.callsTo('arc')[0].args).toEqual([250, CHECK_Y, CIRCLE_RADIUS, 0, Math.PI * 2])
    expect(context.callsTo('fill')[0].fillStyle).toBe('circle green')
  })
})

describe('drawing the goal', () => {
  it('writes the goal on a card across the top, below the score bar', () => {
    const context = createFakeContext()

    drawGoal(context.asContext(), goal, lookWith(24))

    expect(context.callsTo('roundRect')[0].args).toEqual([
      12,
      GOAL_TOP + 4,
      376,
      GOAL_HEIGHT - 8,
      CORNER_RADIUS,
    ])
    expect(context.callsTo('fillText').map(({ args, font }) => [args, font])).toEqual([
      [['Pause and Breathe', 200, GOAL_TOP + GOAL_HEIGHT / 2], fontAt(font, 24)],
    ])
  })

  it('breaks a long goal into 2 lines', () => {
    const context = createFakeContext()
    const long = { ...goal, title: 'Connect with Someone You Care About' }

    // At 20 px, 352 px holds 29.3 characters: the 35 do not fit on one line.
    drawGoal(context.asContext(), long, lookWith(20))

    expect(context.callsTo('fillText').map((call) => call.args[0])).toEqual([
      'Connect with Someone You Care',
      'About',
    ])
  })
})

describe('drawing the scene', () => {
  const textOf = () => [oneLine('A'), oneLine('B'), oneLine('C'), oneLine('D')]

  it('draws the lanes, the rows (only below the goal), the circle, then the goal', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      { rows: [row({ y: 100 }), row({ y: 500 })], goal, circleLane: 3 },
      { goalFontSize: 20, textOf, colors, font },
    )

    const calls = names(context.calls)
    const at = (name: string) => calls.indexOf(name)
    const cards = calls.flatMap((name, i) => (name === 'roundRect' ? [i] : []))
    const squares = cards.slice(0, 8)
    const goalCard = cards[8]

    expect(cards).toHaveLength(9)
    expect(calls[0]).toBe('clearRect')
    expect(at('moveTo')).toBeLessThan(at('save'))
    expect(context.callsTo('rect')[0].args).toEqual([0, LANES_TOP, 400, 800 - LANES_TOP])
    expect(at('save')).toBeLessThan(at('clip'))
    expect(at('clip')).toBeLessThan(squares[0])
    expect(squares.at(-1)).toBeLessThan(at('restore'))
    expect(at('restore')).toBeLessThan(at('arc'))
    expect(at('arc')).toBeLessThan(goalCard)
    expect(context.callsTo('arc')[0].args[0]).toBe(350)
    expect(context.callsTo('fillText').map((call) => call.args[0])).toEqual([
      ...['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D'],
      goal.title,
    ])
  })

  it('draws no goal before the round starts', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      { rows: [], goal: undefined, circleLane: 1 },
      { goalFontSize: 20, textOf, colors, font },
    )

    expect(context.callsTo('roundRect')).toEqual([])
    expect(context.callsTo('fillText')).toEqual([])
    expect(context.callsTo('arc')).toHaveLength(1)
    expect(context.callsTo('moveTo')).toHaveLength(3)
  })
})
