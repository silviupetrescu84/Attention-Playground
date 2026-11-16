import { describe, expect, it, vi } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext, type DrawCall } from '../../test/fake-canvas-context'
import { ovalTextShape } from '../shared/artwork'
import { BUTTON_PRESS_DEPTH } from '../shared/canvas-button'
import type { BubbleSize } from '../shared/canvas-style'
import { defaultTextStyle, type CanvasFont, type TextBlock } from '../shared/text'
import { TIME_RING_WIDTH } from '../shared/time-ring'
import {
  createTurnText,
  DONE_TEXT_FIT,
  drawScene,
  GRATITUDE_COLORS,
  RING_CENTRE,
  RING_RADIUS,
  type GratitudeColors,
  type SceneLook,
} from './draw'
import { DONE_BUTTON, ovalFor } from './layout'
import type { Thing, Turn } from './remember-gratitude'

// The fake font is 0.6 × size wide per character, spaces included.

const font: CanvasFont = { family: '"Test Sans"', weight: '600' }
/** Stand-ins for the colours read from the CSS. */
const colors: GratitudeColors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  rightHue: 'green hue',
  wrongHue: 'red hue',
  pillShadow: 'shadow',
  buttonFill: 'button ink',
  buttonText: 'button white',
  buttonPressed: 'button light ink',
  ring: 'ink ring',
}
const ovalImage = {} as CanvasImageSource
const oneLine = (text: string): TextBlock => ({ fontSize: 14, lines: [text] })
const look: SceneLook = {
  textOf: (turn) => turn.things.map((thing) => oneLine(thing.word.text)),
  font,
  doneFontSize: 20,
  colors,
  ovalImage,
}
const names = (calls: readonly DrawCall[]) => calls.map((call) => call.name)
const texts = (calls: readonly DrawCall[]) =>
  calls.filter((call) => call.name === 'fillText').map((call) => call.args[0])

function thing(text: string, type: 'good' | 'bad', x: number, y: number): Thing {
  return { word: { text, type }, x, y, end: undefined }
}

/** A turn of a good thing and a bad one, shown at 1 s, turned around at 6 s. */
function turn(changes: Partial<Turn> = {}): Turn {
  return {
    things: [thing('A warm hug', 'good', 100, 200), thing('Being insulted', 'bad', 300, 500)],
    size: ovalFor(2),
    shownAtMs: 1_000,
    choosingAtMs: 6_000,
    endedAtMs: undefined,
    goneAtMs: undefined,
    ...changes,
  }
}

describe('colours', () => {
  it('are the shared bubble colours, hues and button colours, all declared in the CSS', () => {
    expect(Object.keys(GRATITUDE_COLORS).sort()).toEqual(Object.keys(colors).sort())
    for (const variable of Object.values(GRATITUDE_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('draw the ring in ink, like the Done button that follows it', () => {
    expect(GRATITUDE_COLORS.ring).toBe('--gratitude-ring')
    expect(cssVariables.get('--gratitude-ring')).toBe('var(--color-ink)')
  })
})

describe('the Done label', () => {
  it('is written up to 20 px, 16 px from the button’s ends', () => {
    expect(DONE_TEXT_FIT).toEqual({ maxWidth: DONE_BUTTON.width - 32, minSize: 12, maxSize: 20 })
  })
})

describe('laying out a turn’s texts', () => {
  it('writes each thing in the style for the turn’s size of oval, wrapped to fit it', () => {
    const styleFor = vi.fn((size: BubbleSize) => defaultTextStyle(ovalTextShape(size)))
    const textOf = createTurnText(createFakeContext().asContext(), font, styleFor)
    const shown = turn()

    const laidOut = textOf(shown)

    expect(styleFor).toHaveBeenCalledWith(ovalFor(2))
    // 24 px: 0.6 × 24 = 14.4 px a character, so few fit on a line.
    expect(laidOut.map((text) => text.fontSize)).toEqual([24, 24])
    expect(laidOut.map((text) => text.lines.join(' '))).toEqual(['A warm hug', 'Being insulted'])
    expect(laidOut[1].lines.length).toBeGreaterThan(1)
  })

  it('lays out each turn once, however often it is drawn', () => {
    const styleFor = vi.fn((size: BubbleSize) => defaultTextStyle(ovalTextShape(size)))
    const textOf = createTurnText(createFakeContext().asContext(), font, styleFor)
    const shown = turn()

    const text = textOf(shown)

    expect(textOf(shown)).toBe(text)
    expect(styleFor).toHaveBeenCalledTimes(1)
    expect(textOf(turn())).not.toBe(text)
  })
})

describe('drawing the scene', () => {
  it('draws nothing without a turn', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { turn: undefined, timeMs: 0 }, look)

    expect(names(context.calls)).toEqual(['clearRect'])
  })

  it('shows every thing with its text, at its place and size, fading in, and no Done button yet', () => {
    const context = createFakeContext()
    const { width, height } = ovalFor(2)

    drawScene(context.asContext(), { turn: turn(), timeMs: 1_050 }, look)

    const images = context.callsTo('drawImage')
    expect(images.map((call) => call.args)).toEqual([
      [ovalImage, 100 - width / 2, 200 - height / 2, width, height],
      [ovalImage, 300 - width / 2, 500 - height / 2, width, height],
    ])
    expect(images.map((call) => call.globalAlpha)).toEqual([0.5, 0.5])
    expect(texts(context.calls)).toEqual(['A warm hug', 'Being insulted'])
    expect(context.callsTo('roundRect')).toEqual([])
    expect(context.globalAlpha).toBe(1)
  })

  it('hides the texts once the things turn around, and shows the Done button, fading in', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { turn: turn(), timeMs: 6_050 }, look)

    expect(texts(context.calls)).toEqual(['Done'])
    expect(context.callsTo('drawImage')).toHaveLength(2)
    const [button] = context.callsTo('roundRect')
    expect(button.args.slice(0, 4)).toEqual([120, 728, 160, 60])
    const [label] = context.callsTo('fillText')
    expect([label.globalAlpha, label.font]).toEqual([0.5, `600 20px "Test Sans"`])
  })

  it('shows a thing tapped with its text again and a green hue if good, a red one if bad', () => {
    const context = createFakeContext()
    const tapped = turn()
    for (const shown of tapped.things) shown.end = 'tapped'

    drawScene(context.asContext(), { turn: tapped, timeMs: 7_000 }, look)

    expect(texts(context.calls)).toEqual(['A warm hug', 'Being insulted', 'Done'])
    expect(context.lastFills().slice(0, 2)).toEqual(['green hue', 'red hue'])
  })

  it('draws a thing not tapped plainly, with no hue', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { turn: turn(), timeMs: 7_000 }, look)

    expect(context.callsTo('ellipse')).toEqual([])
  })

  it('shows Done pressed once done, and fades everything out over 0.1 s', () => {
    const context = createFakeContext()
    const done = turn({ endedAtMs: 8_000, goneAtMs: 8_000 })

    drawScene(context.asContext(), { turn: done, timeMs: 8_050 }, look)
    const fading = context.lastDrawing()
    drawScene(context.asContext(), { turn: done, timeMs: 8_100 }, look)
    const gone = context.lastDrawing()

    expect(
      fading.filter((call) => call.name !== 'clearRect').map((call) => call.globalAlpha),
    ).toEqual(Array.from({ length: fading.length - 1 }, () => 0.5))
    const button = fading.find((call) => call.name === 'roundRect')!
    expect(button.args[1]).toBe(728 + BUTTON_PRESS_DEPTH)
    expect(fading.find((call) => call.name === 'fill')!.fillStyle).toBe('button light ink')
    expect(names(gone)).toEqual(['clearRect'])
  })

  it('keeps the things of a turn with mistakes once over, a good one missed red, its text again', () => {
    const context = createFakeContext()
    const over = turn({ endedAtMs: 8_000, goneAtMs: 10_000 })
    const [missed, left] = over.things
    missed.end = 'gone'
    left.end = 'gone'

    drawScene(context.asContext(), { turn: over, timeMs: 9_000 }, look)

    // The bad one left alone stays plain and blank; the Done button has gone.
    expect(texts(context.calls)).toEqual(['A warm hug'])
    expect(context.lastFills()).toEqual(['red hue'])
    expect(context.callsTo('drawImage').map((call) => call.globalAlpha)).toEqual([1, 1])
    expect(context.callsTo('roundRect')).toEqual([])
  })

  it('runs a ring out at the bottom while the things are remembered, where Done will be', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { turn: turn(), timeMs: 3_500 }, look)

    const [ring] = context.callsTo('arc')
    expect(ring.args.slice(0, 3)).toEqual([RING_CENTRE.x, RING_CENTRE.y, RING_RADIUS])
    const share = ((ring.args[4] as number) - (ring.args[3] as number)) / (2 * Math.PI)
    expect(share).toBeCloseTo(0.5, 9)
    expect(context.callsTo('stroke')[0].strokeStyle).toBe('ink ring')
  })

  it('puts the ring in the middle of the Done button, inside it', () => {
    expect(RING_CENTRE).toEqual({ x: 200, y: 758 })
    expect(RING_RADIUS + TIME_RING_WIDTH / 2).toBeLessThanOrEqual(DONE_BUTTON.height / 2)
    expect(RING_RADIUS).toBe(22)
  })

  it('has no ring once the things turn around', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { turn: turn(), timeMs: 6_000 }, look)

    expect(context.callsTo('arc')).toEqual([])
  })

  it('draws plain ovals, as big as they are seen, if the oval did not load', () => {
    const context = createFakeContext()
    const { radiusX, radiusY } = ovalFor(2)

    drawScene(
      context.asContext(),
      { turn: turn(), timeMs: 2_000 },
      { ...look, ovalImage: undefined },
    )

    expect(context.callsTo('drawImage')).toEqual([])
    expect(context.callsTo('ellipse').map((call) => call.args.slice(0, 4))).toEqual([
      [100, 200, radiusX, radiusY],
      [300, 500, radiusX, radiusY],
    ])
  })
})
