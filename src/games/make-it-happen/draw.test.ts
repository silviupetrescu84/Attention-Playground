import { describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext, type DrawCall } from '../../test/fake-canvas-context'
import { expectTextsInside } from '../../test/text-fit'
import { LARGE_OVAL_TEXT } from '../shared/artwork'
import { BUBBLE_BORDER_WIDTH } from '../shared/canvas-style'
import { fontAt, type CanvasFont, type TextBlock, type TextStyle } from '../shared/text'
import data from './data/make-it-happen.json'
import {
  createTextLayout,
  DEFAULT_STYLES,
  drawGoal,
  drawScene,
  drawTurn,
  GOAL_TEXT,
  MAKE_IT_HAPPEN_COLORS,
  TEXT_MARGIN,
  type MakeItHappenColors,
  type SceneLook,
} from './draw'
import { distractionsFrom, goalsFrom } from './goals'
import {
  CENTRE,
  GOAL_SIZE,
  goalRadiusFor,
  goalSizeFor,
  OPTION_HEIGHT,
  OPTION_HIT_HEIGHT,
  OPTION_HIT_WIDTH,
  OPTION_WIDTH,
} from './layout'
import { goalSizeAt, type Option, type ShownGoal, type Turn } from './make-it-happen'

// The fake font is 0.6 × size wide per character, spaces included.

const font: CanvasFont = { family: '"Test Sans"', weight: '600' }
/** Stand-ins for the colours read from the CSS. */
const colors: MakeItHappenColors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  ring: 'ring teal',
  rightHue: 'green hue',
  wrongHue: 'red hue',
}
const goalImage = { name: 'goal' } as unknown as CanvasImageSource
const optionImage = { name: 'oval' } as unknown as CanvasImageSource
/** Writes the goal at 20 px and each action at 14 px, each on one line. */
const text = {
  goal: (goal: ShownGoal): TextBlock => ({ fontSize: 20, lines: [goal.goal.title] }),
  options: (turn: Turn): TextBlock[] =>
    turn.options.map((option) => ({ fontSize: 14, lines: [option.text] })),
}
const look: SceneLook = { text, font, colors, goalImage, optionImage }
const names = (calls: readonly DrawCall[]) => calls.map((call) => call.name)

/** A goal shown at 1 s, at its starting size. */
function goal(changes: Partial<ShownGoal> = {}): ShownGoal {
  return {
    goal: { title: 'Sleep better', actions: ['Dim the lights', 'Put the phone away'] },
    shownAtMs: 1_000,
    options: 2,
    timeLimitMs: 4_000,
    level: 0,
    fromSize: GOAL_SIZE,
    resizedAtMs: 1_000,
    endedAtMs: undefined,
    outcome: undefined,
    ...changes,
  }
}

const options: Option[] = [
  { text: 'Dim the lights', good: true, x: 100, y: 200 },
  { text: 'Scroll Instagram', good: false, x: 300, y: 650 },
]

/** A set of actions for `shown`, at 4 s, with 4 s to choose. */
function turn(shown = goal(), changes: Partial<Turn> = {}): Turn {
  return {
    goal: shown,
    options,
    shownAtMs: 4_000,
    readyAtMs: 4_100,
    timeLimitMs: 4_000,
    deadlineMs: 8_100,
    endedAtMs: undefined,
    chosen: undefined,
    ...changes,
  }
}

describe('colours', () => {
  it('come from CSS variables the app declares', () => {
    for (const variable of Object.values(MAKE_IT_HAPPEN_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('use the shared card colours and feedback hues, and a deep teal ring', () => {
    expect(MAKE_IT_HAPPEN_COLORS).toEqual({
      text: '--color-ink',
      cardFill: '--canvas-card-fill',
      cardBorder: '--canvas-card-border',
      rightHue: '--canvas-right-hue',
      wrongHue: '--canvas-wrong-hue',
      ring: '--make-it-happen-ring',
    })
    expect(cssVariables.get('--make-it-happen-ring')).toBe('#1f9e9a')
  })
})

describe('text sizes', () => {
  it('writes goals in their bubble at its starting size, up to 24 px', () => {
    expect(GOAL_TEXT).toEqual({ radiusX: 67.5, radiusY: 67.5, margin: 8, minSize: 10, maxSize: 24 })
    expect(TEXT_MARGIN).toBe(8)
  })

  it('fits every goal and every action of the real lists inside their shapes', () => {
    const goals = goalsFrom(data)
    const context = createFakeContext().asContext()
    const actions = [...goals.flatMap((goal) => goal.actions), ...distractionsFrom(data)]

    expectTextsInside(
      context,
      font,
      goals.map((goal) => goal.title),
      GOAL_TEXT,
    )
    expectTextsInside(context, font, actions, LARGE_OVAL_TEXT)
  })

  it('starts at the largest sizes, on 2 lines, until the font is measured', () => {
    for (const style of [DEFAULT_STYLES.goal, DEFAULT_STYLES.option]) {
      expect(style).toEqual({ fontSize: 24, fit: expect.objectContaining({ maxLines: 2 }) })
    }
  })
})

describe('laying out texts', () => {
  const styles: { goal: TextStyle; option: TextStyle } = {
    goal: { fontSize: 20, fit: { maxWidth: 100, maxLines: 2, minSize: 20, maxSize: 20 } },
    option: { fontSize: 10, fit: { maxWidth: 60, maxLines: 2, minSize: 10, maxSize: 10 } },
  }

  it('wraps the goal and each action at their sizes', () => {
    const layout = createTextLayout(createFakeContext().asContext(), font, styles)
    const shown = turn()

    // 12 px a character at 20 px: "Sleep better" is 144 px, over 100.
    expect(layout.goal(shown.goal)).toEqual({ fontSize: 20, lines: ['Sleep', 'better'] })
    // 6 px a character at 10 px: 60 px is 10 characters.
    expect(layout.options(shown)).toEqual([
      { fontSize: 10, lines: ['Dim the', 'lights'] },
      { fontSize: 10, lines: ['Scroll', 'Instagram'] },
    ])
  })

  it('lays out each goal and each set of actions once, however often they are drawn', () => {
    const context = createFakeContext()
    const layout = createTextLayout(context.asContext(), font, styles)
    const shown = turn()

    const goalText = layout.goal(shown.goal)
    const optionTexts = layout.options(shown)
    const fontsSet = context.font

    context.font = 'untouched'
    expect(layout.goal(shown.goal)).toBe(goalText)
    expect(layout.options(shown)).toBe(optionTexts)
    // Nothing measured again.
    expect(context.font).toBe('untouched')
    expect(fontsSet).not.toBe('untouched')
    expect(layout.goal(goal())).not.toBe(goalText)
  })
})

describe('drawing the goal', () => {
  it('draws the bubble in the middle, its text, then a full ring while it is read', () => {
    const context = createFakeContext()
    const shown = goal()

    drawGoal(context.asContext(), shown, turn(shown), 2_000, look)

    expect(names(context.calls)).toEqual(['drawImage', 'fillText', 'beginPath', 'arc', 'stroke'])
    expect(context.callsTo('drawImage')[0].args).toEqual([
      goalImage,
      CENTRE.x - 75,
      CENTRE.y - 75,
      150,
      150,
    ])
    expect(context.callsTo('fillText')[0]).toMatchObject({
      args: ['Sleep better', CENTRE.x, CENTRE.y],
      fillStyle: 'ink',
      font: fontAt(font, 20),
    })
    const [arc] = context.callsTo('arc')
    // Just outside the bubble, from the top, all the way round.
    expect(arc.args.slice(0, 4)).toEqual([CENTRE.x, CENTRE.y, 67.5 + 6, -Math.PI / 2])
    expect(arc.args[4]).toBeCloseTo(Math.PI * 1.5)
    expect(context.callsTo('stroke')[0].strokeStyle).toBe('ring teal')
  })

  it('shows the time left on the ring', () => {
    const context = createFakeContext()
    const shown = goal()

    drawGoal(context.asContext(), shown, turn(shown), 6_100, look)

    // Half of the 4 s left: half a turn from the top.
    expect(context.callsTo('arc')[0].args[4]).toBeCloseTo(Math.PI / 2)
  })

  it('draws the bubble and its text at the size the goal has now', () => {
    const context = createFakeContext()
    const shown = goal({ level: -2, fromSize: GOAL_SIZE, resizedAtMs: 1_000 })
    const size = goalSizeFor(-2)

    drawGoal(context.asContext(), shown, turn(shown), 5_000, look)

    expect(context.callsTo('drawImage')[0].args.slice(3)).toEqual([size, size])
    // Written 70% as big, as the bubble is.
    expect(context.callsTo('fillText')[0].font).toBe(fontAt(font, 14))
    expect(context.callsTo('arc')[0].args[2]).toBeCloseTo(goalRadiusFor(size) + 6)
  })

  it('draws the goal see-through as it fades in', () => {
    const context = createFakeContext()
    const shown = goal()

    drawGoal(context.asContext(), shown, undefined, 1_050, look)

    expect(context.callsTo('drawImage')[0].globalAlpha).toBe(0.5)
    expect(context.globalAlpha).toBe(1)
  })

  it('has no ring without its actions, or once it is over', () => {
    for (const [shown, forTurn] of [
      [goal(), undefined],
      [goal(), turn(goal())],
      [goal({ endedAtMs: 5_000, level: -3, outcome: 'failed' }), undefined],
    ] as const) {
      const context = createFakeContext()
      const over = shown.endedAtMs !== undefined
      drawGoal(context.asContext(), shown, over ? turn(shown) : forTurn, 5_100, look)
      expect(context.callsTo('arc')).toEqual([])
    }
  })

  it('shrinks as it fades out when failed', () => {
    const context = createFakeContext()
    const shown = goal({
      level: -3,
      fromSize: goalSizeFor(-2),
      resizedAtMs: 5_000,
      endedAtMs: 5_000,
      outcome: 'failed',
    })

    drawGoal(context.asContext(), shown, undefined, 5_150, look)

    const [call] = context.callsTo('drawImage')
    expect(call.globalAlpha).toBe(0.5)
    expect(call.args[3]).toBe(goalSizeAt(shown, 5_150))
    expect(call.args[3]).toBeLessThan(goalSizeFor(-2))
  })

  it('draws nothing while it is hidden', () => {
    const context = createFakeContext()

    drawGoal(context.asContext(), goal(), undefined, 500, look)

    expect(context.calls).toEqual([])
  })

  it('draws a plain circle the size of the bubble itself if the image did not load', () => {
    const context = createFakeContext()

    drawGoal(context.asContext(), goal(), undefined, 2_000, { ...look, goalImage: undefined })

    expect(context.callsTo('ellipse')[0].args).toEqual([
      CENTRE.x,
      CENTRE.y,
      67.5,
      67.5,
      0,
      0,
      Math.PI * 2,
    ])
    expect(context.callsTo('fill')[0].fillStyle).toBe('card fill')
    expect(context.callsTo('stroke')[0]).toMatchObject({
      strokeStyle: 'card border',
      lineWidth: BUBBLE_BORDER_WIDTH,
    })
  })
})

describe('drawing a set of actions', () => {
  it('draws each action with its text, see-through as they fade in', () => {
    const context = createFakeContext()

    drawTurn(context.asContext(), turn(), 4_050, look)

    const images = context.callsTo('drawImage')
    expect(images.map((call) => call.args.slice(1, 3))).toEqual([
      [100 - OPTION_WIDTH / 2, 200 - OPTION_HEIGHT / 2],
      [300 - OPTION_WIDTH / 2, 650 - OPTION_HEIGHT / 2],
    ])
    expect(images.map((call) => call.globalAlpha)).toEqual([0.5, 0.5])
    expect(context.callsTo('fillText').map((call) => call.args[0])).toEqual([
      'Dim the lights',
      'Scroll Instagram',
    ])
    expect(context.globalAlpha).toBe(1)
  })

  it.each([
    [0, 'green hue'],
    [1, 'red hue'],
  ] as const)('tints the action chosen (%i) green if good, red if a distraction', (i, hue) => {
    const context = createFakeContext()

    const chosen = turn(goal(), { endedAtMs: 5_000, chosen: options[i] })

    drawTurn(context.asContext(), chosen, 5_050, look)

    expect(context.callsTo('fill').map((call) => call.fillStyle)).toEqual([hue])
  })

  it('draws plain ovals as big as they are seen if the image did not load', () => {
    const context = createFakeContext()

    drawTurn(context.asContext(), turn(), 5_000, { ...look, optionImage: undefined })

    expect(context.callsTo('drawImage')).toEqual([])
    expect(context.callsTo('ellipse').map((call) => call.args.slice(0, 4))).toEqual([
      [100, 200, OPTION_HIT_WIDTH / 2, OPTION_HIT_HEIGHT / 2],
      [300, 650, OPTION_HIT_WIDTH / 2, OPTION_HIT_HEIGHT / 2],
    ])
  })

  it('tints the chosen action as seen, under its text', () => {
    const context = createFakeContext()

    const chosen = turn(goal(), { endedAtMs: 5_000, chosen: options[0] })

    drawTurn(context.asContext(), chosen, 5_000, look)

    const names = context.calls.map((call) => call.name)
    expect(names.slice(0, 4)).toEqual(['drawImage', 'beginPath', 'ellipse', 'fill'])
    expect(context.callsTo('ellipse')[0].args.slice(2, 4)).toEqual([
      OPTION_HIT_WIDTH / 2,
      OPTION_HIT_HEIGHT / 2,
    ])
    expect(names.indexOf('fill')).toBeLessThan(names.indexOf('fillText'))
  })

  it('tints nothing when nothing was chosen in time', () => {
    const context = createFakeContext()

    drawTurn(context.asContext(), turn(goal(), { endedAtMs: 8_100 }), 8_150, look)

    expect(context.callsTo('fill')).toEqual([])
    expect(context.callsTo('drawImage')).toHaveLength(2)
  })

  it('draws nothing before the actions come, or once they have faded out', () => {
    for (const [shown, timeMs] of [
      [turn(), 3_000],
      [turn(goal(), { endedAtMs: 5_000 }), 5_100],
    ] as const) {
      const context = createFakeContext()
      drawTurn(context.asContext(), shown, timeMs, look)
      expect(context.calls).toEqual([])
    }
  })
})

describe('drawing the scene', () => {
  it('clears the canvas, then draws the goals, then the actions over them', () => {
    const context = createFakeContext()
    const before = goal({ endedAtMs: 4_000, level: 3, outcome: 'reached' })
    const now = goal({ shownAtMs: 4_000 })
    const ended = turn(before, { shownAtMs: 3_000, readyAtMs: 3_100, endedAtMs: 3_950 })
    const next = turn(now, { shownAtMs: 4_020, readyAtMs: 4_120 })

    drawScene(
      context.asContext(),
      { goal: now, previousGoal: before, turn: next, previousTurn: ended, timeMs: 4_040 },
      look,
    )

    const drawn = context.calls.filter(({ name }) => name === 'clearRect' || name === 'drawImage')
    // The goal before fading out, the new one fading in; then the actions
    // before fading out (10% left), and the new ones fading in (20% in).
    expect(
      drawn.map((call) => (call.name === 'clearRect' ? 'clear' : [call.args[0], call.globalAlpha])),
    ).toEqual([
      'clear',
      [goalImage, expect.closeTo(1 - 40 / 300, 9)],
      [goalImage, expect.closeTo(0.4, 9)],
      [optionImage, expect.closeTo(0.1, 9)],
      [optionImage, expect.closeTo(0.1, 9)],
      [optionImage, expect.closeTo(0.2, 9)],
      [optionImage, expect.closeTo(0.2, 9)],
    ])
  })

  it('only clears the canvas before the round starts', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      {
        goal: undefined,
        previousGoal: undefined,
        turn: undefined,
        previousTurn: undefined,
        timeMs: 0,
      },
      look,
    )

    expect(names(context.calls)).toEqual(['clearRect'])
  })
})
