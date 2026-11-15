import { describe, expect, it } from 'vitest'
import { createFakeContext } from '../../test/fake-canvas-context'
import { drawLabelledBubble, type LabelledBubble } from './labelled-bubble'
import { fontAt } from './text'

const font = { family: '"Test Sans"', weight: '600' }
const colors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  rightHue: 'green hue',
  wrongHue: 'red hue',
}
const image = { name: 'oval' } as unknown as CanvasImageSource
const bubble: LabelledBubble = {
  centre: { x: 100, y: 200 },
  size: { width: 168, height: 92, radiusX: 82, radiusY: 44 },
  text: { fontSize: 14, lines: ['Dim the', 'lights'] },
}

describe('a labelled bubble', () => {
  it('draws the image centred on it, then its lines of text, centred too', () => {
    const context = createFakeContext()

    drawLabelledBubble(context.asContext(), image, bubble, font, colors)

    expect(context.callsTo('drawImage')[0].args).toEqual([image, 100 - 84, 200 - 46, 168, 92])
    const lines = context.callsTo('fillText')
    expect(lines.map((call) => call.args)).toEqual([
      ['Dim the', 100, 200 - 8.4],
      ['lights', 100, 200 + 8.4],
    ])
    expect(lines.map((call) => [call.font, call.fillStyle])).toEqual([
      [fontAt(font, 14), 'ink'],
      [fontAt(font, 14), 'ink'],
    ])
  })

  it('tints the bubble as seen with its hue, over the image and under the text', () => {
    const context = createFakeContext()

    drawLabelledBubble(context.asContext(), image, { ...bubble, hue: 'green hue' }, font, colors)

    expect(context.calls.map((call) => call.name)).toEqual([
      'drawImage',
      'beginPath',
      'ellipse',
      'fill',
      'fillText',
      'fillText',
    ])
    expect(context.callsTo('ellipse')[0].args.slice(0, 4)).toEqual([100, 200, 82, 44])
    expect(context.callsTo('fill')[0].fillStyle).toBe('green hue')
  })

  it('draws a plain bubble, as big as it is seen, if the image did not load', () => {
    const context = createFakeContext()

    drawLabelledBubble(context.asContext(), undefined, bubble, font, colors)

    expect(context.callsTo('drawImage')).toEqual([])
    expect(context.callsTo('ellipse')[0].args.slice(0, 4)).toEqual([100, 200, 82, 44])
    expect(context.callsTo('fill')[0].fillStyle).toBe('card fill')
    expect(context.callsTo('fillText')).toHaveLength(2)
  })
})
