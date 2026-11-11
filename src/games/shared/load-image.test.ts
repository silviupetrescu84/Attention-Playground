import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubImages } from '../../test/fake-image'
import { createImageLoader } from './load-image'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createImageLoader', () => {
  it('loads the image from its URL', async () => {
    const images = stubImages()
    const load = createImageLoader('/art/bubble.png', 'bubble.png')

    const image = await load()

    expect(images).toEqual([image])
    expect(image.src).toBe('/art/bubble.png')
  })

  it('downloads it only once, however often it is asked for', async () => {
    const images = stubImages()
    const load = createImageLoader('/art/bubble.png', 'bubble.png')

    const [first, second] = await Promise.all([load(), load()])
    const later = await load()

    expect(images).toHaveLength(1)
    expect(second).toBe(first)
    expect(later).toBe(first)
  })

  it('fails if the image cannot load, naming it, and tries again the next time', async () => {
    const failing = stubImages('error')
    const load = createImageLoader('/art/bubble.png', 'bubble.png')

    await expect(load()).rejects.toThrow(new Error('Could not load bubble.png'))
    expect(failing).toHaveLength(1)

    const working = stubImages()
    const image = await load()

    expect(working).toEqual([image])
  })

  it('keeps each image apart', async () => {
    stubImages()
    const loadOne = createImageLoader('/art/one.png', 'one.png')
    const loadTwo = createImageLoader('/art/two.png', 'two.png')

    const [one, two] = await Promise.all([loadOne(), loadTwo()])

    expect([one.src, two.src]).toEqual(['/art/one.png', '/art/two.png'])
  })
})
