import { afterEach, describe, expect, it, vi } from 'vitest'
import ovalUrl from '../../assets/emotions-rise/oval.png'
import greenBubbleUrl from '../../assets/focus-attention/green-bubble.png'
import { stubImages } from '../../test/fake-image'
import { GREEN_BUBBLE_BODY, LARGE_OVAL, LARGE_OVAL_TEXT, ovalOfWidth, ovalSeenIn } from './artwork'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shared artwork', () => {
  it('loads the oval and the green bubble, each once for every game', async () => {
    // A fresh copy of the module, so no image loaded by another test is used.
    vi.resetModules()
    const { loadGreenBubbleImage, loadOvalImage } = await import('./artwork')
    const images = stubImages()

    const oval = await loadOvalImage()
    const bubble = await loadGreenBubbleImage()

    expect(await loadOvalImage()).toBe(oval)
    expect(await loadGreenBubbleImage()).toBe(bubble)
    expect(images).toEqual([oval, bubble])
    expect([oval.src, bubble.src]).toEqual([ovalUrl, greenBubbleUrl])
  })

  it('sees the oval slightly inside its image, at any size', () => {
    expect(ovalSeenIn(140, 77)).toEqual({ width: 137, height: 74 })
    expect(ovalSeenIn(280, 154)).toEqual({ width: 274, height: 148 })
    expect(ovalSeenIn(168, 92.4).width).toBeCloseTo(164.4, 9)
    expect(ovalSeenIn(168, 92.4).height).toBeCloseTo(88.8, 9)
  })

  it('has a large oval 20% bigger than the Emotions Rise one, seen slightly inside', () => {
    expect(LARGE_OVAL.width).toBeCloseTo(140 * 1.2, 9)
    expect(LARGE_OVAL.height).toBeCloseTo(77 * 1.2, 9)
    expect(LARGE_OVAL.radiusX).toBeCloseTo(164.4 / 2, 9)
    expect(LARGE_OVAL.radiusY).toBeCloseTo(88.8 / 2, 9)
  })

  it('draws the oval at any width in its own shape, seen slightly inside', () => {
    expect(ovalOfWidth(140)).toEqual({ width: 140, height: 77, radiusX: 68.5, radiusY: 37 })
    const small = ovalOfWidth(100)
    expect(small.height).toBeCloseTo(55, 9)
    expect(small.radiusX * 2).toBeCloseTo(97.857, 3)
  })

  it('writes texts in the large oval as seen, 8 px from its edge, up to 24 px', () => {
    expect(LARGE_OVAL_TEXT).toEqual({
      radiusX: LARGE_OVAL.radiusX,
      radiusY: LARGE_OVAL.radiusY,
      margin: 8,
      minSize: 10,
      maxSize: 24,
    })
  })

  it('sees the green bubble as 90% of its image', () => {
    expect(GREEN_BUBBLE_BODY).toBe(0.9)
  })
})
