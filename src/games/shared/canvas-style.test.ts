// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext } from '../../test/fake-canvas-context'
import {
  BUBBLE_BORDER_WIDTH,
  CARD_COLORS,
  drawBubbleImage,
  readCssVariables,
  traceEllipse,
} from './canvas-style'

/** A canvas on a page whose styles set `variables`. */
function canvasWith(variables: Record<string, string>) {
  for (const [name, value] of Object.entries(variables)) {
    document.documentElement.style.setProperty(name, value)
  }
  const canvas = document.createElement('canvas')
  document.body.replaceChildren(canvas)
  return canvas
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.body.replaceChildren()
})

describe('readCssVariables', () => {
  it('reads each colour from its CSS variable, under the name the game uses', () => {
    const canvas = canvasWith({ '--paper': 'rgb(255 255 255)', '--pen': '#17345d' })

    const colors = readCssVariables(canvas, { background: '--paper', text: '--pen' })

    expect(colors).toEqual({ background: 'rgb(255 255 255)', text: '#17345d' })
  })

  it('reads the value without the spaces around it', () => {
    const canvas = canvasWith({ '--pen': '   #17345d  ' })

    expect(readCssVariables(canvas, { text: '--pen' })).toEqual({ text: '#17345d' })
  })

  it('names a variable that is not set, instead of drawing with nothing', () => {
    const canvas = canvasWith({ '--pen': '#17345d' })

    expect(() => readCssVariables(canvas, { text: '--pen', fill: '--missing' })).toThrow(
      new Error('The CSS variable --missing is not set'),
    )
  })
})

describe('card colours', () => {
  it('are the ink text colour and the shared card fill and border', () => {
    expect(CARD_COLORS).toEqual({
      text: '--color-ink',
      cardFill: '--canvas-card-fill',
      cardBorder: '--canvas-card-border',
    })
  })

  it('are all declared in the CSS', () => {
    for (const variable of Object.values(CARD_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('make the border and the tints see-through versions of the page colours', () => {
    expect(cssVariables.get('--canvas-card-border')).toBe(
      'color-mix(in srgb, var(--color-ink) 35%, transparent)',
    )
    expect(cssVariables.get('--canvas-good-tint')).toBe(
      'color-mix(in srgb, var(--color-good) 35%, transparent)',
    )
    expect(cssVariables.get('--canvas-bad-tint')).toBe(
      'color-mix(in srgb, var(--color-bad) 35%, transparent)',
    )
  })
})

describe('bubbles', () => {
  const colors = { cardFill: 'card fill', cardBorder: 'card border' }

  it('traces an ellipse, or a circle, centred on a point', () => {
    const context = createFakeContext()

    traceEllipse(context.asContext(), { x: 100, y: 200 }, 50, 30)
    traceEllipse(context.asContext(), { x: 10, y: 20 }, 5, 5)

    expect(context.calls.map((call) => [call.name, call.args])).toEqual([
      ['beginPath', []],
      ['ellipse', [100, 200, 50, 30, 0, 0, Math.PI * 2]],
      ['beginPath', []],
      ['ellipse', [10, 20, 5, 5, 0, 0, Math.PI * 2]],
    ])
  })

  it('draws a bubble image at its size, centred on a point', () => {
    const context = createFakeContext()
    const image = {} as CanvasImageSource
    const size = { width: 120, height: 60, radiusX: 55, radiusY: 27 }

    drawBubbleImage(context.asContext(), image, { x: 100, y: 200 }, size, colors)

    expect(context.calls.map((call) => [call.name, call.args])).toEqual([
      ['drawImage', [image, 40, 170, 120, 60]],
    ])
  })

  it('draws a plain bubble the size of the bubble as seen if the image did not load', () => {
    const context = createFakeContext()
    const size = { width: 120, height: 60, radiusX: 55, radiusY: 27 }

    drawBubbleImage(context.asContext(), undefined, { x: 100, y: 200 }, size, colors)

    expect(context.callsTo('ellipse')[0].args).toEqual([100, 200, 55, 27, 0, 0, Math.PI * 2])
    expect(context.callsTo('fill')[0].fillStyle).toBe('card fill')
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth]).toEqual(['card border', BUBBLE_BORDER_WIDTH])
    expect(BUBBLE_BORDER_WIDTH).toBe(1.5)
    expect(context.callsTo('drawImage')).toEqual([])
  })
})
