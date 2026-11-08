// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeContext,
  useFakeCanvasContexts,
  type FakeContext,
} from '../../test/fake-canvas-context'
import {
  clearGameCanvas,
  createGameCanvas,
  fitGameCanvas,
  GAME_BOTTOM_PADDING,
  GAME_HEIGHT,
  GAME_TOP_PADDING,
  GAME_WIDTH,
} from './game-canvas'

const ratio = GAME_WIDTH / GAME_HEIGHT

describe('clearGameCanvas', () => {
  it('clears the whole 400 × 800 drawing layer, so the CSS background shows', () => {
    const context = createFakeContext()

    clearGameCanvas(context.asContext())

    expect(context.calls.map(({ name, args }) => [name, args])).toEqual([
      ['clearRect', [0, 0, 400, 800]],
    ])
  })
})

describe('fitGameCanvas', () => {
  it('is 400 × 800 with space for the Home button above and the status bar below', () => {
    expect(GAME_WIDTH).toBe(400)
    expect(GAME_HEIGHT).toBe(800)
    expect(GAME_TOP_PADDING).toBe(56)
    expect(GAME_BOTTOM_PADDING).toBe(56)
  })

  it('shows the game at full size, centred, on a large screen', () => {
    expect(fitGameCanvas(1200, 1000)).toEqual({
      scale: 1,
      width: 400,
      height: 800,
      left: 400,
      top: 100,
    })
  })

  it('never grows beyond the game size', () => {
    expect(fitGameCanvas(4000, 3000).scale).toBe(1)
  })

  it('keeps both paddings when there is just enough room', () => {
    expect(fitGameCanvas(400, 56 + 800 + 56)).toEqual({
      scale: 1,
      width: 400,
      height: 800,
      left: 0,
      top: 56,
    })
  })

  it('moves down rather than covering a larger top padding', () => {
    // Centred it would start at (1000 - 800) / 2 = 100, inside the 150 px padding.
    const layout = fitGameCanvas(1000, 1000, 150, 20)

    expect(layout.scale).toBe(1)
    expect(layout.top).toBe(150)
  })

  it('moves up rather than covering a larger bottom padding', () => {
    // Centred it would end at 900, inside the 150 px padding at the bottom.
    const layout = fitGameCanvas(1000, 1000, 20, 150)

    expect(layout.scale).toBe(1)
    expect(layout.top + layout.height).toBe(850)
  })

  it('shrinks to the screen width on a narrow screen', () => {
    expect(fitGameCanvas(200, 1000)).toEqual({
      scale: 0.5,
      width: 200,
      height: 400,
      left: 0,
      top: 300,
    })
  })

  it('shrinks to the space between the paddings on a short screen', () => {
    expect(fitGameCanvas(1000, 56 + 400 + 56)).toEqual({
      scale: 0.5,
      width: 200,
      height: 400,
      left: 400,
      top: GAME_TOP_PADDING,
    })
  })

  it('uses custom paddings', () => {
    const layout = fitGameCanvas(1000, 500, 100, 0)

    expect(layout.height).toBe(400)
    expect(layout.top).toBe(100)
  })

  it('does not go negative on a screen smaller than the padding', () => {
    const layout = fitGameCanvas(300, 20)

    expect(layout.scale).toBe(0)
    expect(layout.width).toBe(0)
    expect(layout.height).toBe(0)
  })

  it('keeps the ratio, the padding and the screen bounds for any screen size', () => {
    const sizes = [100, 240, 320, 375, 390, 400, 414, 768, 856, 1024, 1920]

    for (const viewportWidth of sizes) {
      for (const viewportHeight of sizes) {
        const layout = fitGameCanvas(viewportWidth, viewportHeight)
        const where = `${viewportWidth}×${viewportHeight}`

        expect(layout.scale, where).toBeLessThanOrEqual(1)
        if (viewportHeight <= GAME_TOP_PADDING + GAME_BOTTOM_PADDING) {
          // No room left between the paddings.
          expect(layout.scale, where).toBe(0)
          continue
        }
        expect(layout.width / layout.height, where).toBeCloseTo(ratio, 10)
        expect(layout.top, where).toBeGreaterThanOrEqual(GAME_TOP_PADDING)
        expect(layout.left, where).toBeGreaterThanOrEqual(0)
        if (viewportHeight >= GAME_TOP_PADDING + GAME_BOTTOM_PADDING) {
          expect(layout.top + layout.height, where).toBeLessThanOrEqual(
            viewportHeight - GAME_BOTTOM_PADDING + 1e-9,
          )
          // Centred vertically (the paddings are equal).
          expect(layout.top * 2 + layout.height, where).toBeCloseTo(viewportHeight, 9)
        }
        // Centred horizontally.
        expect(layout.left * 2 + layout.width, where).toBeCloseTo(viewportWidth, 9)
      }
    }
  })
})

describe('createGameCanvas', () => {
  let contexts: FakeContext[]
  /** The scaling set on the canvas's context, one entry per call. */
  const transforms = () => contexts.at(-1)!.callsTo('setTransform').map((call) => call.args)

  function setViewport(width: number, height: number, pixelRatio = 1) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: pixelRatio,
    })
  }

  function resize(width: number, height: number) {
    setViewport(width, height, window.devicePixelRatio)
    window.dispatchEvent(new Event('resize'))
  }

  function setup() {
    const container = document.createElement('main')
    document.body.replaceChildren(container)
    const screen = new AbortController()
    const canvas = createGameCanvas(container, { signal: screen.signal })
    return { container, screen, canvas }
  }

  function shownLayout(stage: HTMLElement) {
    const { width, height, left, top } = stage.style
    return { width, height, left, top }
  }

  beforeEach(() => {
    setViewport(1200, 1000)
    contexts = useFakeCanvasContexts()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds a canvas, inside a stage, to the container', () => {
    const { container, canvas } = setup()

    expect(canvas.stage.parentElement).toBe(container)
    expect(canvas.stage.className).toBe('game-stage')
    expect(canvas.element.parentElement).toBe(canvas.stage)
    expect(canvas.element.className).toBe('game-canvas')
    expect(canvas.context).toBe(contexts[0].asContext())
    expect(canvas.width).toBe(GAME_WIDTH)
    expect(canvas.height).toBe(GAME_HEIGHT)
  })

  it('tells the page how much space to keep for the Home button', () => {
    const { container } = setup()

    expect(container.style.getPropertyValue('--game-top-padding')).toBe('56px')
  })

  it('tells the page where the canvas starts, so the Home button sits above it', () => {
    const { container } = setup()
    expect(container.style.getPropertyValue('--game-canvas-top')).toBe('100px')

    resize(1200, 500)

    expect(container.style.getPropertyValue('--game-canvas-top')).toBe('56px')
  })

  it('tells the page where the canvas ends and how much space is below, for the status bar', () => {
    const { container } = setup()
    expect(container.style.getPropertyValue('--game-bottom-padding')).toBe('56px')
    expect(container.style.getPropertyValue('--game-canvas-bottom')).toBe('900px')

    resize(1200, 500)

    expect(container.style.getPropertyValue('--game-canvas-bottom')).toBe('444px')
  })

  it('fits the canvas to the window straight away', () => {
    const { canvas } = setup()

    expect(shownLayout(canvas.stage)).toEqual({
      width: '400px',
      height: '800px',
      left: '400px',
      top: '100px',
    })
  })

  it('tells layers on the stage the game size, to lay out in game units', () => {
    const { canvas } = setup()

    expect(canvas.stage.style.getPropertyValue('--game-width')).toBe('400px')
    expect(canvas.stage.style.getPropertyValue('--game-height')).toBe('800px')
  })

  it('tells layers on the stage how much the game is scaled', () => {
    const { canvas } = setup()
    expect(canvas.stage.style.getPropertyValue('--game-scale')).toBe('1')

    resize(200, 1000)

    expect(canvas.stage.style.getPropertyValue('--game-scale')).toBe('0.5')
  })

  it('refits the canvas when the window is resized', () => {
    const { canvas } = setup()

    resize(200, 1000)

    expect(shownLayout(canvas.stage)).toEqual({
      width: '200px',
      height: '400px',
      left: '0px',
      top: '300px',
    })
  })

  it('stops refitting once the screen is left', () => {
    const { canvas, screen } = setup()
    const before = shownLayout(canvas.stage)

    screen.abort()
    resize(200, 1000)

    expect(shownLayout(canvas.stage)).toEqual(before)
  })

  // Not tested here: a signal that is already aborted. Browsers then add no
  // listener at all, but Vitest's jsdom setup wraps signals in a way that
  // misses signals aborted before the listener is added.

  it.each([
    [1, 400, 800],
    [2, 800, 1600],
    [3, 1200, 2400],
  ])('draws sharply at pixel ratio %s', (pixelRatio, width, height) => {
    setViewport(1200, 1000, pixelRatio)

    const { canvas } = setup()

    expect(canvas.element.width).toBe(width)
    expect(canvas.element.height).toBe(height)
    expect(transforms()).toEqual([[pixelRatio, 0, 0, pixelRatio, 0, 0]])
  })

  it('rounds the resolution for fractional pixel ratios and scales to match', () => {
    setViewport(1200, 1000, 1.001)

    const { canvas } = setup()

    // 400.4 and 800.8 device pixels round to 400 and 801.
    expect(canvas.element.width).toBe(400)
    expect(canvas.element.height).toBe(801)
    expect(transforms()).toEqual([[1, 0, 0, 801 / 800, 0, 0]])
  })

  it('falls back to a pixel ratio of 1 when the browser reports none', () => {
    setViewport(1200, 1000, 0)

    const { canvas } = setup()

    expect(canvas.element.width).toBe(400)
    expect(canvas.element.height).toBe(800)
  })

  it('keeps its resolution when the window is resized, so drawings are kept', () => {
    setViewport(1200, 1000, 2)
    const { canvas } = setup()

    resize(200, 500)

    expect(canvas.element.width).toBe(800)
    expect(canvas.element.height).toBe(1600)
    expect(transforms()).toHaveLength(1)
  })

  it('throws when 2D drawing is not available', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    const container = document.createElement('main')

    expect(() =>
      createGameCanvas(container, { signal: new AbortController().signal }),
    ).toThrow('Canvas 2D drawing is not supported')
    expect(container.children).toHaveLength(0)
  })

  it('converts screen positions to game units', () => {
    const { canvas } = setup()
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 60, 200, 400),
    )

    expect(canvas.toGamePoint(100, 60)).toEqual({ x: 0, y: 0 })
    expect(canvas.toGamePoint(300, 460)).toEqual({ x: 400, y: 800 })
    expect(canvas.toGamePoint(200, 260)).toEqual({ x: 200, y: 400 })
  })
})
