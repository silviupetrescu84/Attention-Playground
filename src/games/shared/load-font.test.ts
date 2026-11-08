import { afterEach, describe, expect, it, vi } from 'vitest'
import { FONT_TIMEOUT_MS, loadFont, type FontLoader } from './load-font'

const FONT = '600 22px "Roboto Condensed"'

function fontsThat(load: FontLoader['load']): FontLoader & { load: ReturnType<typeof vi.fn> } {
  return { load: vi.fn(load) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('loadFont', () => {
  it('asks the browser to load the font and reports it ready', async () => {
    const fonts = fontsThat(async () => [{ status: 'loaded' }])

    await expect(loadFont(FONT, { fonts })).resolves.toBe(true)
    expect(fonts.load).toHaveBeenCalledExactlyOnceWith(FONT)
  })

  it('reports false when no font by that name is declared', async () => {
    const fonts = fontsThat(async () => [])

    await expect(loadFont(FONT, { fonts })).resolves.toBe(false)
  })

  it('reports false when a part of the font did not load', async () => {
    const fonts = fontsThat(async () => [{ status: 'loaded' }, { status: 'error' }])

    await expect(loadFont(FONT, { fonts })).resolves.toBe(false)
  })

  it('reports false instead of failing when loading fails', async () => {
    const fonts = fontsThat(async () => {
      throw new Error('network down')
    })

    await expect(loadFont(FONT, { fonts })).resolves.toBe(false)
  })

  it('gives up after 5 seconds', async () => {
    vi.useFakeTimers()
    const fonts = fontsThat(() => new Promise(() => {}))

    const result = loadFont(FONT, { fonts })
    await vi.advanceTimersByTimeAsync(FONT_TIMEOUT_MS - 1)
    let settled = false
    void result.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe(false)
    expect(FONT_TIMEOUT_MS).toBe(5_000)
  })

  it('uses a custom time limit', async () => {
    vi.useFakeTimers()
    const result = loadFont(FONT, { fonts: fontsThat(() => new Promise(() => {})), timeoutMs: 100 })

    await vi.advanceTimersByTimeAsync(100)

    await expect(result).resolves.toBe(false)
  })

  it('leaves no timer running once the font is ready', async () => {
    vi.useFakeTimers()

    await loadFont(FONT, { fonts: fontsThat(async () => [{ status: 'loaded' }]) })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports false where the page has no font loading at all', async () => {
    vi.stubGlobal('document', undefined)
    try {
      await expect(loadFont(FONT)).resolves.toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
