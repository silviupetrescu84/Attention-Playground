import { describe, expect, it } from 'vitest'
import { createFakeContext } from '../../test/fake-canvas-context'
import { expectTextsInside } from '../../test/text-fit'
import { LARGE_OVAL, LARGE_OVAL_TEXT } from '../shared/artwork'
import type { TextStyle } from '../shared/text'
import data from './data/pause-before-reacting.json'
import { createSituationText, drawScene, type SceneLook } from './draw'
import type { Situation } from './pause-before-reacting'
import { situationsFrom } from './situations'

// The fake font is 0.6 × size wide per character, spaces included.

const font = { family: '"Test Sans"', weight: '600' }
const colors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  rightHue: 'green hue',
  wrongHue: 'red hue',
}
const ovalImage = { name: 'oval' } as unknown as CanvasImageSource
const look: SceneLook = {
  textOf: (situation) => ({ fontSize: 14, lines: [situation.word.text] }),
  font,
  colors,
  ovalImage,
}

function situation(text: string, type: 'good' | 'bad', changes: Partial<Situation> = {}) {
  const shown: Situation = {
    word: { text, type },
    x: 120,
    y: 300,
    shownAtMs: 1_000,
    endedAtMs: undefined,
    end: undefined,
    ...changes,
  }
  return shown
}

describe('texts', () => {
  it('fit every situation of the real list inside the oval, at one size', () => {
    const { good, bad } = situationsFrom(data)

    expectTextsInside(createFakeContext().asContext(), font, [...good, ...bad], LARGE_OVAL_TEXT)
  })

  it('are laid out once for each situation, however often it is drawn', () => {
    const context = createFakeContext()
    const style: TextStyle = {
      fontSize: 10,
      fit: { maxWidth: 60, maxLines: 2, minSize: 10, maxSize: 10 },
    }
    const textOf = createSituationText(context.asContext(), font, style)
    const shown = situation('Someone asks for help', 'good')

    // 6 px a character at 10 px: 60 px is 10 characters.
    const text = textOf(shown)
    expect(text).toEqual({ fontSize: 10, lines: ['Someone', 'asks for', 'help'] })
    expect(textOf(shown)).toBe(text)
    expect(textOf(situation('Someone asks for help', 'good'))).not.toBe(text)
  })
})

describe('drawing the scene', () => {
  it('clears the canvas, then draws each situation in its oval, with its text', () => {
    const context = createFakeContext()
    const situations = [
      situation('A friend needs a hand', 'good'),
      situation('Replay an awkward moment', 'bad', { x: 280, y: 600 }),
    ]

    drawScene(context.asContext(), { situations, timeMs: 2_000 }, look)

    expect(context.calls[0].name).toBe('clearRect')
    expect(context.callsTo('drawImage').map((call) => call.args)).toEqual([
      [ovalImage, 120 - 84, 300 - 46.2, 168, 92.4],
      [ovalImage, 280 - 84, 600 - 46.2, 168, 92.4],
    ])
    expect(context.callsTo('fillText').map((call) => call.args)).toEqual([
      ['A friend needs a hand', 120, 300],
      ['Replay an awkward moment', 280, 600],
    ])
    // The same for every situation: only the text tells good from bad.
    expect(context.callsTo('fill')).toEqual([])
  })

  it('draws situations see-through as they fade in and out', () => {
    const context = createFakeContext()
    const situations = [
      situation('A friend needs a hand', 'good', { shownAtMs: 1_950 }),
      situation('Replay an awkward moment', 'bad', { endedAtMs: 1_925, end: 'gone' }),
    ]

    drawScene(context.asContext(), { situations, timeMs: 2_000 }, look)

    expect(context.callsTo('drawImage').map((call) => call.globalAlpha)).toEqual([0.5, 0.25])
    expect(context.globalAlpha).toBe(1)
  })

  it.each([
    ['good', 'green hue'],
    ['bad', 'red hue'],
  ] as const)('tints a %s situation tapped %s as it fades out', (type, hue) => {
    const context = createFakeContext()
    const tapped = situation('A friend needs a hand', type, { endedAtMs: 2_000, end: 'tapped' })

    drawScene(context.asContext(), { situations: [tapped], timeMs: 2_050 }, look)

    expect(context.callsTo('fill').map((call) => [call.fillStyle, call.globalAlpha])).toEqual([
      [hue, 0.5],
    ])
    expect(context.callsTo('ellipse')[0].args.slice(2, 4)).toEqual([
      LARGE_OVAL.radiusX,
      LARGE_OVAL.radiusY,
    ])
  })

  it('tints nothing that went without a tap', () => {
    const context = createFakeContext()
    const gone = situation('A friend needs a hand', 'good', { endedAtMs: 2_000, end: 'gone' })

    drawScene(context.asContext(), { situations: [gone], timeMs: 2_050 }, look)

    expect(context.callsTo('fill')).toEqual([])
    expect(context.callsTo('drawImage')).toHaveLength(1)
  })

  it('draws nothing of a situation before it comes, or once it has faded out', () => {
    const context = createFakeContext()
    const situations = [
      situation('Not yet', 'good', { shownAtMs: 3_000 }),
      situation('Gone', 'bad', { endedAtMs: 1_500, end: 'gone' }),
    ]

    drawScene(context.asContext(), { situations, timeMs: 2_000 }, look)

    expect(context.calls.map((call) => call.name)).toEqual(['clearRect'])
  })

  it('draws plain ovals, as big as they are seen, if the image did not load', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      { situations: [situation('A friend needs a hand', 'good')], timeMs: 2_000 },
      { ...look, ovalImage: undefined },
    )

    expect(context.callsTo('drawImage')).toEqual([])
    expect(context.callsTo('ellipse')[0].args.slice(0, 4)).toEqual([
      120,
      300,
      LARGE_OVAL.radiusX,
      LARGE_OVAL.radiusY,
    ])
  })
})
