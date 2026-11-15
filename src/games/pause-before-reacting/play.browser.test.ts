import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { FakeFrames } from '../../test/fake-frames'
import { FakeStorage } from '../../test/fake-storage'
import { seededRandom } from '../../test/random'
import { findElement } from '../shared/dom'
import { GAME_HEIGHT, GAME_WIDTH } from '../shared/game-canvas'
import { mountGame } from '../shared/game-shell'
import data from './data/pause-before-reacting.json'
import { pauseBeforeReactingGame } from './index'
import { situationsFrom } from './situations'
import '../../style.css'
import '../../views/game-screen.css'

/**
 * Pause Before Reacting played in a real browser, on a phone: the canvas is
 * shown smaller than the game, so taps must be scaled back to game units to
 * land on the situation tapped.
 */

const { good } = situationsFrom(data)

interface Drawn {
  readonly x: number
  readonly y: number
  readonly text: string
}

let drawn: Drawn[] = []

beforeEach(async () => {
  await page.viewport(360, 640)
  // What the game draws, in game units: each oval's centre, then its text.
  const drawImage = CanvasRenderingContext2D.prototype.drawImage
  vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect').mockImplementation(() => {
    drawn = []
  })
  vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage').mockImplementation(function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['drawImage']>
  ) {
    const [, left, top, width, height] = args as unknown as number[]
    drawn.push({ x: left + width / 2, y: top + height / 2, text: '' })
    drawImage.apply(this, args)
  })
  vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText').mockImplementation((text) => {
    const last = drawn.pop()
    if (last) drawn.push({ ...last, text: `${last.text} ${text}`.trim() })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('scores a good situation tapped on a phone-sized canvas', async () => {
  document.body.innerHTML = '<main class="game-screen"></main>'
  const container = findElement(document, '.game-screen', HTMLElement)
  const frames = new FakeFrames()
  mountGame(container, {
    signal: new AbortController().signal,
    game: pauseBeforeReactingGame({ random: seededRandom(2) }),
    gameId: 'pause-before-reacting',
    storage: new FakeStorage(),
    scheduler: frames,
  })
  const start = findElement(container, '.game-hud__start', HTMLButtonElement)
  await vi.waitFor(() => {
    expect(start.disabled).toBe(false)
  })
  await userEvent.click(start)

  // Until a good situation is on screen, fully faded in.
  let target: Drawn | undefined
  for (let i = 0; i < 100 && !target; i++) {
    frames.frame(500)
    target = drawn.find((situation) => good.includes(situation.text))
  }
  if (!target) throw new Error('No good situation came')
  frames.frame(100)

  const canvas = findElement(container, '.game-canvas', HTMLCanvasElement)
  const shown = canvas.getBoundingClientRect()
  // Shown smaller than the game: the taps are scaled.
  expect(shown.width).toBeLessThan(GAME_WIDTH)
  // The oval is really painted where it is: not see-through at its middle.
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D drawing is not supported')
  const pixelRatio = canvas.width / GAME_WIDTH
  const [, , , alpha] = context.getImageData(
    target.x * pixelRatio,
    target.y * pixelRatio,
    1,
    1,
  ).data
  expect(alpha).toBeGreaterThan(0)

  await userEvent.click(canvas, {
    position: {
      x: (target.x * shown.width) / GAME_WIDTH,
      y: (target.y * shown.height) / GAME_HEIGHT,
    },
  })

  expect(findElement(container, '.game-hud__score', HTMLElement).textContent).toBe('Score: 1')
  expect(findElement(container, '.game-hud__mistakes', HTMLElement).textContent).toBe('Mistakes: 0')
})
