import { afterEach, describe, expect, it, vi } from 'vitest'
import purpleBubbleUrl from '../../assets/shift-perspective/purple-bubble.png'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext, type DrawCall } from '../../test/fake-canvas-context'
import { stubImages } from '../../test/fake-image'
import {
  fitFontSize,
  fontAt,
  LINE_HEIGHT,
  wrapText,
  type CanvasFont,
  type TextBlock,
} from '../shared/text'
import data from './data/shift-perspective.json'
import {
  BUBBLE_BORDER_WIDTH,
  CHOICE_TEXT_FIT,
  createTurnText,
  drawBubble,
  drawRing,
  drawScene,
  drawTurn,
  RING_RADIUS,
  RING_WIDTH,
  SHIFT_COLORS,
  TEXT_MARGIN,
  THOUGHT_TEXT_FIT,
  type SceneLook,
  type ShiftColors,
} from './draw'
import {
  CENTRE,
  CHOICE_DISTANCE,
  CHOICE_RADIUS,
  CHOICE_SIZE,
  choicePositions,
  THOUGHT_RADIUS,
  THOUGHT_SIZE,
  type Turn,
} from './shift-perspective'
import { thoughtsFrom } from './thoughts'

// The fake font is 0.6 × size wide per character, spaces included.

const font: CanvasFont = { family: '"Test Sans"', weight: '600' }
/** Stand-ins for the colours read from the CSS. */
const colors: ShiftColors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  ring: 'ring purple',
  rightHue: 'green hue',
  wrongHue: 'red hue',
}
const bubbleImage = {} as CanvasImageSource
const oneLine = (text: string, fontSize = 14): TextBlock => ({ fontSize, lines: [text] })
/** Writes every text of a turn on one line: the thought at 18 px, choices at 14 px. */
const textOf = (turn: Turn) => ({
  thought: oneLine(turn.thought, 18),
  choices: turn.choices.map((choice) => oneLine(choice.text)),
})
const look: SceneLook = { textOf, font, colors, bubbleImage }
const names = (calls: readonly DrawCall[]) => calls.map((call) => call.name)
/** Where an image of `size` centred on `point` goes: left, top, width, height. */
const square = ({ x, y }: { x: number; y: number }, size: number) =>
  [x - size / 2, y - size / 2, size, size] as const

/** A turn shown at 1 s, its 2 choices (or `texts`) at 4 s, with 3 s to choose. */
function turn({
  texts = ['They may be busy', 'They hate me'],
  endedAtMs = undefined as number | undefined,
} = {}): Turn {
  const positions = choicePositions(texts.length)
  return {
    thought: 'They did not reply',
    choices: texts.map((text, i) => ({ text, good: i === 0, ...positions[i] })),
    shownAtMs: 1_000,
    choicesAtMs: 4_000,
    readyAtMs: 4_100,
    timeLimitMs: 3_000,
    deadlineMs: 7_100,
    endedAtMs,
    chosen: undefined,
  }
}

describe('colours', () => {
  it('come from CSS variables the app declares', () => {
    for (const variable of Object.values(SHIFT_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('use the shared card colours and feedback hues, and a deep purple ring', () => {
    expect(SHIFT_COLORS).toEqual({
      text: '--color-ink',
      cardFill: '--canvas-card-fill',
      cardBorder: '--canvas-card-border',
      rightHue: '--canvas-right-hue',
      wrongHue: '--canvas-wrong-hue',
      ring: '--shift-ring',
    })
    expect(cssVariables.get('--shift-ring')).toBe('#7e57c2')
  })
})

describe('text sizes', () => {
  it('writes thoughts at up to 20 px and choices at up to 16 px, in up to 3 lines', () => {
    // As wide as each bubble is at the top and bottom of 3 lines, less 4 px a side.
    expect(THOUGHT_TEXT_FIT).toEqual({ maxWidth: 91, maxLines: 3, minSize: 10, maxSize: 20 })
    expect(CHOICE_TEXT_FIT).toEqual({ maxWidth: 86, maxLines: 3, minSize: 10, maxSize: 16 })
  })

  it.each([
    ['thought', THOUGHT_RADIUS, THOUGHT_TEXT_FIT],
    ['choice', CHOICE_RADIUS, CHOICE_TEXT_FIT],
  ] as const)('keeps every corner of a %s’s text inside its bubble', (_kind, radius, fit) => {
    const { maxWidth, maxLines = 1, maxSize } = fit
    const halfHeight = (maxLines * maxSize * LINE_HEIGHT) / 2

    expect(Math.hypot(maxWidth / 2 + TEXT_MARGIN, halfHeight)).toBeLessThanOrEqual(radius)
  })

  it('fits every thought and every choice of the real list inside its bubble', () => {
    const thoughts = thoughtsFrom(data)
    const context = createFakeContext().asContext()
    const kinds = [
      [thoughts.map((thought) => thought.text), THOUGHT_TEXT_FIT],
      [thoughts.flatMap((thought) => [...thought.good, ...thought.bad]), CHOICE_TEXT_FIT],
    ] as const

    for (const [texts, fit] of kinds) {
      const size = fitFontSize(context, font, texts, fit)
      context.font = fontAt(font, size)
      for (const text of texts) {
        const lines = wrapText(context, text, fit.maxWidth)
        expect(lines.length, text).toBeLessThanOrEqual(3)
        for (const line of lines) {
          expect(context.measureText(line).width, text).toBeLessThanOrEqual(fit.maxWidth)
        }
      }
    }
  })
})

describe('laying out a turn’s texts', () => {
  it('writes the thought and each choice at their sizes, wrapped to fit their bubbles', () => {
    const textFor = createTurnText(createFakeContext().asContext(), font, {
      thoughtFontSize: 15,
      choiceFontSize: 10,
    })

    const text = textFor(turn({ texts: ['Failure is possible, not certain', 'I fail'] }))

    // 91 px holds 10.1 characters at 15 px; 86 px holds 14.3 at 10 px.
    expect(text).toEqual({
      thought: { fontSize: 15, lines: ['They did', 'not reply'] },
      choices: [
        { fontSize: 10, lines: ['Failure is', 'possible, not', 'certain'] },
        { fontSize: 10, lines: ['I fail'] },
      ],
    })
  })

  it('lays out each turn once, however often it is drawn', () => {
    const context = createFakeContext()
    const measure = vi.spyOn(context.asContext(), 'measureText')
    const textFor = createTurnText(context.asContext(), font, {
      thoughtFontSize: 15,
      choiceFontSize: 10,
    })
    const shown = turn()

    const text = textFor(shown)
    const measured = measure.mock.calls.length

    expect(textFor(shown)).toBe(text)
    expect(measure.mock.calls.length).toBe(measured)
    expect(textFor(turn())).not.toBe(text)
  })
})

describe('drawing a bubble', () => {
  it('draws the bubble image at its size, centred on the point', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), 150, 300, 120, { colors, bubbleImage })

    expect(context.calls.map((call) => [call.name, call.args])).toEqual([
      ['drawImage', [bubbleImage, 90, 240, 120, 120]],
    ])
  })

  it('draws a plain circle the size of the bubble itself if the image did not load', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), 150, 300, 120, { colors })

    expect(context.callsTo('arc').map((call) => call.args)).toEqual([
      [150, 300, CHOICE_RADIUS, 0, Math.PI * 2],
    ])
    expect(context.callsTo('fill')[0].fillStyle).toBe('card fill')
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth]).toEqual(['card border', BUBBLE_BORDER_WIDTH])
    expect(context.callsTo('drawImage')).toEqual([])
  })
})

describe('drawing the ring', () => {
  it('is just outside the thought’s bubble, and clear of the choices', () => {
    expect(RING_RADIUS).toBeCloseTo(THOUGHT_RADIUS + 6, 9)
    expect(CHOICE_DISTANCE - CHOICE_RADIUS - (RING_RADIUS + RING_WIDTH / 2)).toBeGreaterThan(5)
  })

  it.each([
    [1, 2 * Math.PI],
    [0.75, 1.5 * Math.PI],
    [0.5, Math.PI],
    [0.1, 0.2 * Math.PI],
  ])('with %s of the time left, goes that far round, clockwise from the top', (left, sweep) => {
    const context = createFakeContext()

    drawRing(context.asContext(), left, 'ring purple')

    const [arc] = context.callsTo('arc')
    const [x, y, radius, start, end] = arc.args as number[]
    expect([x, y, radius, start]).toEqual([CENTRE.x, CENTRE.y, RING_RADIUS, -Math.PI / 2])
    expect(end - start).toBeCloseTo(sweep, 9)
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth]).toEqual(['ring purple', RING_WIDTH])
    expect(context.lineCap).toBe('round')
  })

  it('is gone when no time is left', () => {
    const context = createFakeContext()

    drawRing(context.asContext(), 0, 'ring purple')

    expect(context.calls).toEqual([])
  })
})

describe('drawing a turn', () => {
  it('draws the thought in the middle, the ring, then each choice, with their texts', () => {
    const context = createFakeContext()
    const shown = turn()

    drawTurn(context.asContext(), shown, 5_000, look)

    const [top, bottom] = choicePositions(2)
    expect(context.callsTo('drawImage').map((call) => call.args)).toEqual([
      [bubbleImage, ...square(CENTRE, THOUGHT_SIZE)],
      [bubbleImage, ...square(top, CHOICE_SIZE)],
      [bubbleImage, ...square(bottom, CHOICE_SIZE)],
    ])
    expect(context.callsTo('fillText').map(({ args, font: drawn }) => [args, drawn])).toEqual([
      [['They did not reply', CENTRE.x, CENTRE.y], fontAt(font, 18)],
      [['They may be busy', top.x, top.y], fontAt(font, 14)],
      [['They hate me', bottom.x, bottom.y], fontAt(font, 14)],
    ])
    expect(names(context.calls).filter((name) => name !== 'beginPath' && name !== 'arc')).toEqual([
      'drawImage',
      'fillText',
      'stroke',
      'drawImage',
      'fillText',
      'drawImage',
      'fillText',
    ])
  })

  it('draws only the thought, with a full ring, while it is read', () => {
    const context = createFakeContext()

    drawTurn(context.asContext(), turn(), 3_999, look)

    expect(context.callsTo('drawImage')).toHaveLength(1)
    expect(context.callsTo('fillText').map((call) => call.args[0])).toEqual(['They did not reply'])
    const [, , , start, end] = context.callsTo('arc')[0].args as number[]
    expect(end - start).toBeCloseTo(2 * Math.PI, 9)
  })

  it('shows the time left on the ring', () => {
    const context = createFakeContext()

    // 1.5 s of 3 s gone since the choices were in, at 4.1 s.
    drawTurn(context.asContext(), turn(), 5_600, look)

    const [, , , start, end] = context.callsTo('arc')[0].args as number[]
    expect(end - start).toBeCloseTo(Math.PI, 9)
  })

  it('draws the thought see-through while it fades in, then goes back to opaque', () => {
    const context = createFakeContext()

    drawTurn(context.asContext(), turn(), 1_050, look)

    expect(context.calls.length).toBeGreaterThan(3)
    for (const call of context.calls) expect(call.globalAlpha).toBe(0.5)
    expect(context.globalAlpha).toBe(1)
  })

  it('draws the choices see-through while they fade in, the thought opaque', () => {
    const context = createFakeContext()

    drawTurn(context.asContext(), turn(), 4_050, look)

    expect(context.callsTo('drawImage').map((call) => call.globalAlpha)).toEqual([1, 0.5, 0.5])
    expect(context.callsTo('fillText').map((call) => call.globalAlpha)).toEqual([1, 0.5, 0.5])
    expect(context.callsTo('stroke')[0].globalAlpha).toBe(1)
    expect(context.globalAlpha).toBe(1)
  })

  it('draws nothing while it is hidden', () => {
    const context = createFakeContext()

    drawTurn(context.asContext(), turn(), 900, look)
    drawTurn(context.asContext(), turn({ endedAtMs: 5_000 }), 5_100, look)

    expect(context.calls).toEqual([])
  })
})

describe('showing what was chosen', () => {
  /** A turn that ended at 5 s, with the choice at `chosen` (if any) chosen. */
  function ended(chosen?: number) {
    const shown = turn({ endedAtMs: 5_000 })
    return { ...shown, chosen: chosen === undefined ? undefined : shown.choices[chosen] }
  }

  it.each([
    ['green', 0, 'green hue'],
    ['red', 1, 'red hue'],
  ] as const)('tints the chosen bubble %s as everything fades out', (_colour, chosen, hue) => {
    const context = createFakeContext()
    const shown = ended(chosen)

    drawTurn(context.asContext(), shown, 5_040, look)

    const hues = context.callsTo('fill')
    expect(hues.map((call) => [call.fillStyle, call.globalAlpha])).toEqual([[hue, 0.6]])
    const { x, y } = shown.choices[chosen]
    expect(context.callsTo('arc').at(-1)!.args).toEqual([x, y, CHOICE_RADIUS, 0, Math.PI * 2])
    // Over its bubble, under its text.
    const calls = names(context.calls)
    const fill = calls.indexOf('fill')
    expect(calls.slice(0, fill).filter((name) => name === 'drawImage')).toHaveLength(1 + chosen + 1)
    expect(context.calls[fill + 1].name).toBe('fillText')
  })

  it('tints nothing when nothing was chosen in time', () => {
    const context = createFakeContext()

    drawTurn(context.asContext(), ended(), 5_040, look)

    expect(context.callsTo('fill')).toEqual([])
  })
})

describe('drawing the scene', () => {
  it('clears the canvas, then draws the thought fading out, then the next one fading in', () => {
    const previous = turn({ endedAtMs: 5_000 })
    const next = {
      ...turn({ texts: ['I can follow up', 'I annoyed them'] }),
      shownAtMs: 5_100,
      choicesAtMs: 8_100,
    }
    const drawnAt = (timeMs: number) => {
      const context = createFakeContext()
      drawScene(context.asContext(), { previous, turn: next, timeMs }, look)
      expect(context.calls[0].name).toBe('clearRect')
      return context.callsTo('fillText').map((call) => [call.args[0], call.globalAlpha])
    }

    expect(drawnAt(5_050)).toEqual([
      ['They did not reply', 0.5],
      ['They may be busy', 0.5],
      ['They hate me', 0.5],
    ])
    expect(drawnAt(5_150)).toEqual([['They did not reply', 0.5]])
  })

  it('only clears the canvas before the round starts', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { previous: undefined, turn: undefined, timeMs: 0 }, look)

    expect(names(context.calls)).toEqual(['clearRect'])
  })
})

describe('loading the bubble image', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the purple bubble artwork', async () => {
    // A fresh copy of the module, so no image loaded by another test is used.
    vi.resetModules()
    const { loadBubbleImage } = await import('./draw')
    const images = stubImages()

    const image = await loadBubbleImage()

    expect(images).toEqual([image])
    expect(image.src).toBe(purpleBubbleUrl)
  })
})
