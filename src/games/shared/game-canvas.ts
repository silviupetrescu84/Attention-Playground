/**
 * The canvas every minigame draws on.
 *
 * Games always draw in game units: GAME_WIDTH × GAME_HEIGHT (400 × 800),
 * whatever size the canvas is shown at. The ratio never changes because game
 * logic depends on it.
 *
 * On screen the canvas is centred, shrinks to fit when the window is smaller
 * than the game (it never grows beyond it), and always leaves
 * GAME_TOP_PADDING free directly above it for the Home button and
 * GAME_BOTTOM_PADDING free directly below it for the status bar.
 */

export const GAME_WIDTH = 400
export const GAME_HEIGHT = 800

/** Space kept free directly above the canvas for the Home button, in CSS pixels. */
export const GAME_TOP_PADDING = 56

/** Space kept free directly below the canvas for the status bar, in CSS pixels. */
export const GAME_BOTTOM_PADDING = 56

export interface GameCanvasLayout {
  /** Shown size ÷ game size (at most 1). */
  readonly scale: number
  /** Shown size and position in CSS pixels, relative to the viewport. */
  readonly width: number
  readonly height: number
  readonly left: number
  readonly top: number
}

/**
 * Where to show the canvas in a viewport: as large as possible up to the game
 * size, centred, and never covering the top or bottom padding.
 */
export function fitGameCanvas(
  viewportWidth: number,
  viewportHeight: number,
  topPadding = GAME_TOP_PADDING,
  bottomPadding = GAME_BOTTOM_PADDING,
): GameCanvasLayout {
  const availableHeight = Math.max(0, viewportHeight - topPadding - bottomPadding)
  const scale = Math.max(
    0,
    Math.min(1, viewportWidth / GAME_WIDTH, availableHeight / GAME_HEIGHT),
  )
  const width = GAME_WIDTH * scale
  const height = GAME_HEIGHT * scale

  return {
    scale,
    width,
    height,
    left: (viewportWidth - width) / 2,
    // Centred on the whole screen, moved down or up if that would cover the
    // top or bottom padding.
    top: Math.max(
      topPadding,
      Math.min((viewportHeight - height) / 2, viewportHeight - bottomPadding - height),
    ),
  }
}

export interface GamePoint {
  readonly x: number
  readonly y: number
}

export interface GameCanvas {
  /**
   * Positioned and sized like the canvas, which fills it. Put anything shown
   * over the game (buttons, score) in here; it sets `--game-scale` so such
   * layers can be laid out in game units and scaled to match.
   */
  readonly stage: HTMLDivElement
  readonly element: HTMLCanvasElement
  /** Already scaled so that drawing uses game units. */
  readonly context: CanvasRenderingContext2D
  readonly width: typeof GAME_WIDTH
  readonly height: typeof GAME_HEIGHT
  /** Converts a position on screen (e.g. a pointer event's clientX/clientY) to game units. */
  toGamePoint(clientX: number, clientY: number): GamePoint
}

export interface GameCanvasOptions {
  /** Stops resizing the canvas when aborted (normally the screen signal). */
  signal: AbortSignal
}

/** Creates the game canvas inside `container` and keeps it fitted to the window. */
export function createGameCanvas(
  container: HTMLElement,
  { signal }: GameCanvasOptions,
): GameCanvas {
  const stage = document.createElement('div')
  stage.className = 'game-stage'
  const element = document.createElement('canvas')
  element.className = 'game-canvas'
  stage.append(element)

  // Draw at the screen's pixel density so games stay sharp on phones. The
  // resolution is fixed: resizing the window only changes the shown size, so
  // what is drawn is never cleared (a paused game keeps its picture).
  const pixelRatio = window.devicePixelRatio || 1
  element.width = Math.round(GAME_WIDTH * pixelRatio)
  element.height = Math.round(GAME_HEIGHT * pixelRatio)

  const context = element.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D drawing is not supported')
  }

  context.setTransform(
    element.width / GAME_WIDTH,
    0,
    0,
    element.height / GAME_HEIGHT,
    0,
    0,
  )

  // Lets the page place the Home button above the canvas and the status bar
  // below it.
  container.style.setProperty('--game-top-padding', `${GAME_TOP_PADDING}px`)
  container.style.setProperty('--game-bottom-padding', `${GAME_BOTTOM_PADDING}px`)
  container.append(stage)

  function fit() {
    const layout = fitGameCanvas(window.innerWidth, window.innerHeight)
    stage.style.width = `${layout.width}px`
    stage.style.height = `${layout.height}px`
    stage.style.left = `${layout.left}px`
    stage.style.top = `${layout.top}px`
    stage.style.setProperty('--game-scale', String(layout.scale))
    container.style.setProperty('--game-canvas-top', `${layout.top}px`)
    container.style.setProperty('--game-canvas-bottom', `${layout.top + layout.height}px`)
  }

  fit()
  window.addEventListener('resize', fit, { signal })

  return {
    stage,
    element,
    context,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    toGamePoint(clientX, clientY) {
      const rect = element.getBoundingClientRect()

      return {
        x: ((clientX - rect.left) / rect.width) * GAME_WIDTH,
        y: ((clientY - rect.top) / rect.height) * GAME_HEIGHT,
      }
    },
  }
}
