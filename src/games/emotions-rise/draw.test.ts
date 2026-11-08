import { describe, expect, it } from 'vitest'
import { createFakeContext, fontSizeOf } from '../../test/fake-canvas-context'
import emotions from './data/emotions.json'
import {
  drawBubble,
  drawScene,
  EMOTION_FONT_FAMILY,
  fitFontSize,
  font,
  MAX_FONT_SIZE,
  MAX_TEXT_WIDTH,
  MIN_FONT_SIZE,
  TEXT_COLOR,
} from './draw'
import { BUBBLE_HEIGHT, BUBBLE_WIDTH, type Bubble } from './emotions-rise'

const allEmotions = [...emotions.positive, ...emotions.negative]
const bubbleImage = {} as CanvasImageSource

function bubble(text: string, type: 'good' | 'bad', x = 200, y = 400): Bubble {
  return { emotion: { text, type }, x, y, speed: 50, spawnedAtMs: 0 }
}

/** Everything about how a bubble is drawn, except where and which word. */
function lookOf(calls: ReturnType<typeof createFakeContext>['calls']) {
  return calls.map(({ name, fillStyle, strokeStyle, lineWidth, font: drawnFont }) => ({
    name,
    fillStyle,
    font: name === 'fillText' ? drawnFont : undefined,
    strokeStyle: name === 'stroke' ? strokeStyle : undefined,
    lineWidth: name === 'stroke' ? lineWidth : undefined,
  }))
}

describe('the emotion font', () => {
  it('is the bundled condensed font, semi-bold, with condensed fallbacks', () => {
    expect(EMOTION_FONT_FAMILY).toBe('"Roboto Condensed", "Arial Narrow", sans-serif')
    expect(font(19)).toBe('600 19px "Roboto Condensed", "Arial Narrow", sans-serif')
  })
})

describe('drawing a bubble', () => {
  it('draws the oval image, then the text over it', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Joy', 'good'), 19, bubbleImage)

    expect(context.calls.map((call) => call.name)).toEqual(['drawImage', 'fillText'])
  })

  it('centres the text and the 140 × 77 image on the bubble position', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Calm', 'good', 123, 456), 19, bubbleImage)

    expect(context.callsTo('fillText')[0].args).toEqual(['Calm', 123, 456])
    expect(context.textAlign).toBe('center')
    expect(context.textBaseline).toBe('middle')
    expect(context.callsTo('drawImage')[0].args).toEqual([
      bubbleImage,
      123 - BUBBLE_WIDTH / 2,
      456 - BUBBLE_HEIGHT / 2,
      BUBBLE_WIDTH,
      BUBBLE_HEIGHT,
    ])
    expect([BUBBLE_WIDTH, BUBBLE_HEIGHT]).toEqual([140, 77])
  })

  it('draws the text at the given size', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Hope', 'good'), 18.5, bubbleImage)

    expect(context.callsTo('fillText')[0].font).toBe(font(18.5))
  })

  it('uses the supplied image instead of generating an oval', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Hope', 'good'), 19, bubbleImage)

    expect(context.callsTo('drawImage')[0].args[0]).toBe(bubbleImage)
    expect(context.callsTo('ellipse')).toEqual([])
  })

  it('draws every emotion exactly alike (same size too), so only the word differs', () => {
    const looks = allEmotions.map((text, i) => {
      const context = createFakeContext()
      drawBubble(context.asContext(), bubble(text, i % 2 ? 'good' : 'bad'), 19, bubbleImage)
      return lookOf(context.calls)
    })

    for (const look of looks) {
      expect(look).toEqual(looks[0])
    }
    expect(looks[0].find((call) => call.name === 'fillText')?.fillStyle).toBe(TEXT_COLOR)
  })
})

describe('choosing the text size', () => {
  // The fake font is 0.6 × size wide per letter.
  const widthAt = (text: string, size: number) => text.length * size * 0.6

  it('uses the largest size when every word fits', () => {
    const context = createFakeContext()

    expect(fitFontSize(context.asContext(), ['Joy', 'Calm'])).toBe(MAX_FONT_SIZE)
  })

  it('picks the largest half-pixel size at which the longest word fits the bubble', () => {
    const context = createFakeContext()
    const texts = ['Joy', 'Disappointment', 'Calm']

    const size = fitFontSize(context.asContext(), texts)

    // 14 letters: 14 × 0.6 × 14 = 117.6 ≤ 120, but at 14.5 it is 121.8.
    expect(size).toBe(14)
    expect(widthAt('Disappointment', size)).toBeLessThanOrEqual(MAX_TEXT_WIDTH)
    expect(widthAt('Disappointment', size + 0.5)).toBeGreaterThan(MAX_TEXT_WIDTH)
  })

  it('steps down in half pixels, to keep the text as large as possible', () => {
    const context = createFakeContext()

    // 12 letters: 12 × 0.6 × 16.5 = 118.8 ≤ 120, but at 17 it is 122.4.
    expect(fitFontSize(context.asContext(), ['Hopelessness'])).toBe(16.5)
  })

  it('fits every emotion of the real list at one size', () => {
    const context = createFakeContext()

    const size = fitFontSize(context.asContext(), allEmotions)

    for (const text of allEmotions) {
      expect(widthAt(text, size), text).toBeLessThanOrEqual(MAX_TEXT_WIDTH)
    }
    expect(size).toBeGreaterThan(MIN_FONT_SIZE)
  })

  it('never goes below the smallest size', () => {
    const context = createFakeContext()

    expect(fitFontSize(context.asContext(), ['Supercalifragilisticexpialidocious'])).toBe(
      MIN_FONT_SIZE,
    )
  })

  it('leaves room inside the oval on both sides of the text', () => {
    expect(MAX_TEXT_WIDTH).toBe(BUBBLE_WIDTH - 20)
  })

  it('measures in the emotion font', () => {
    const context = createFakeContext()
    const fonts: string[] = []
    const measure = context.asContext().measureText
    Object.assign(context, {
      measureText: (text: string) => {
        fonts.push(context.font)
        return measure(text)
      },
    })

    fitFontSize(context.asContext(), ['Disappointment'])

    expect(fonts.length).toBeGreaterThan(0)
    for (const measuredIn of fonts) {
      expect(measuredIn).toBe(font(fontSizeOf(measuredIn)))
    }
  })
})

describe('drawing the scene', () => {
  it('clears the drawing layer, then draws the bubbles in order', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      [bubble('Joy', 'good'), bubble('Fear', 'bad')],
      19,
      bubbleImage,
    )

    expect(context.callsTo('clearRect')[0].args).toEqual([0, 0, 400, 800])
    expect(context.callsTo('drawImage')).toHaveLength(2)
    expect(context.callsTo('fillText').map((call) => call.args[0])).toEqual(['Joy', 'Fear'])
    expect(context.callsTo('fillText').map((call) => call.font)).toEqual([font(19), font(19)])
    const names = context.calls.map((call) => call.name)
    expect(names.indexOf('clearRect')).toBeLessThan(names.indexOf('fillText'))
  })

  it('clears the drawing layer when there are no bubbles', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), [], 19)

    expect(context.calls.map((call) => call.name)).toEqual(['clearRect'])
  })
})
