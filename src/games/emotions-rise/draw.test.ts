import { afterEach, describe, expect, it, vi } from 'vitest'
import ovalImageUrl from '../../assets/emotions-rise/oval.png'
import { createFakeContext } from '../../test/fake-canvas-context'
import { stubImages } from '../../test/fake-image'
import { fitFontSize, type CanvasFont } from '../shared/text'
import emotions from './data/emotions.json'
import {
  BUBBLE_BORDER_WIDTH,
  drawBubble,
  drawScene,
  EMOTION_TEXT_FIT,
  type BubbleLook,
} from './draw'
import { BUBBLE_HEIGHT, BUBBLE_WIDTH, type Bubble } from './emotions-rise'

const allEmotions = [...emotions.positive, ...emotions.negative]
const bubbleImage = {} as CanvasImageSource
/** Stand-ins for the font and colours read from the CSS. */
const look: BubbleLook = {
  font: 'test font',
  colors: { text: 'ink', cardFill: 'card fill', cardBorder: 'card border' },
}

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

describe('drawing a bubble', () => {
  it('draws the oval image, then the text over it', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Joy', 'good'), look, bubbleImage)

    expect(context.calls.map((call) => call.name)).toEqual(['drawImage', 'fillText'])
  })

  it('centres the text and the 140 × 77 image on the bubble position', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Calm', 'good', 123, 456), look, bubbleImage)

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

  it('draws the text in the look’s font', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Hope', 'good'), look, bubbleImage)

    expect(context.callsTo('fillText')[0].font).toBe('test font')
  })

  it('uses the supplied image instead of generating an oval', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Hope', 'good'), look, bubbleImage)

    expect(context.callsTo('drawImage')[0].args[0]).toBe(bubbleImage)
    expect(context.callsTo('ellipse')).toEqual([])
  })

  it('draws a plain translucent oval of the same size if the image did not load', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Calm', 'good', 123, 456), look)

    expect(context.calls.map((call) => call.name)).toEqual([
      'beginPath',
      'ellipse',
      'fill',
      'stroke',
      'fillText',
    ])
    expect(context.callsTo('ellipse')[0].args).toEqual([
      123,
      456,
      BUBBLE_WIDTH / 2,
      BUBBLE_HEIGHT / 2,
      0,
      0,
      Math.PI * 2,
    ])
    expect(context.callsTo('fill')[0].fillStyle).toBe('card fill')
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth]).toEqual(['card border', BUBBLE_BORDER_WIDTH])
    expect(context.callsTo('fillText')[0]).toMatchObject({
      args: ['Calm', 123, 456],
      fillStyle: 'ink',
    })
  })

  it('draws every emotion exactly alike (same size too), so only the word differs', () => {
    const looks = allEmotions.map((text, i) => {
      const context = createFakeContext()
      drawBubble(context.asContext(), bubble(text, i % 2 ? 'good' : 'bad'), look, bubbleImage)
      return lookOf(context.calls)
    })

    for (const look of looks) {
      expect(look).toEqual(looks[0])
    }
    expect(looks[0].find((call) => call.name === 'fillText')?.fillStyle).toBe('ink')
  })
})

describe('choosing the text size', () => {
  it('fits one line inside the bubble, leaving 10 px on each side, at 10 to 22 px', () => {
    expect(EMOTION_TEXT_FIT).toEqual({ maxWidth: BUBBLE_WIDTH - 20, minSize: 10, maxSize: 22 })
  })

  it('fits every emotion of the real list at one size, above the smallest', () => {
    const context = createFakeContext()

    const font: CanvasFont = { family: 'sans-serif', weight: '600' }

    const size = fitFontSize(context.asContext(), font, allEmotions, EMOTION_TEXT_FIT)

    // The fake font is 0.6 × size wide per letter.
    for (const text of allEmotions) {
      expect(text.length * size * 0.6, text).toBeLessThanOrEqual(EMOTION_TEXT_FIT.maxWidth)
    }
    expect(size).toBeGreaterThan(EMOTION_TEXT_FIT.minSize)
  })
})

describe('drawing the scene', () => {
  it('clears the drawing layer, then draws the bubbles in order', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      [bubble('Joy', 'good'), bubble('Fear', 'bad')],
      look,
      bubbleImage,
    )

    expect(context.callsTo('clearRect')[0].args).toEqual([0, 0, 400, 800])
    expect(context.callsTo('drawImage')).toHaveLength(2)
    expect(context.callsTo('fillText').map((call) => call.args[0])).toEqual(['Joy', 'Fear'])
    const fonts = context.callsTo('fillText').map((call) => call.font)
    expect(fonts).toEqual(['test font', 'test font'])
    const names = context.calls.map((call) => call.name)
    expect(names.indexOf('clearRect')).toBeLessThan(names.indexOf('fillText'))
  })

  it('clears the drawing layer when there are no bubbles', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), [], look)

    expect(context.calls.map((call) => call.name)).toEqual(['clearRect'])
  })
})

describe('loading the bubble image', () => {
  /** A fresh copy of the module, so no image loaded by another test is cached. */
  async function freshLoadBubbleImage() {
    vi.resetModules()
    const { loadBubbleImage } = await import('./draw')
    return loadBubbleImage
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the oval artwork', async () => {
    const images = stubImages()
    const loadBubbleImage = await freshLoadBubbleImage()

    const image = await loadBubbleImage()

    expect(images).toEqual([image])
    expect(image.src).toBe(ovalImageUrl)
  })

  it('downloads it only once, however often it is asked for', async () => {
    const images = stubImages()
    const loadBubbleImage = await freshLoadBubbleImage()

    const [first, second] = await Promise.all([loadBubbleImage(), loadBubbleImage()])
    const later = await loadBubbleImage()

    expect(images).toHaveLength(1)
    expect(second).toBe(first)
    expect(later).toBe(first)
  })

  it('fails if the image cannot load, and tries again the next time', async () => {
    const failing = stubImages('error')
    const loadBubbleImage = await freshLoadBubbleImage()

    await expect(loadBubbleImage()).rejects.toThrow(new Error('Could not load oval.png'))
    expect(failing).toHaveLength(1)

    const working = stubImages()
    const image = await loadBubbleImage()

    expect(working).toEqual([image])
  })
})
