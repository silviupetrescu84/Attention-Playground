import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { FakeFrames } from '../../test/fake-frames'
import { FakeStorage } from '../../test/fake-storage'
import { constantRandom } from '../../test/random'
import { findElement } from '../shared/dom'
import { GAME_WIDTH } from '../shared/game-canvas'
import { mountGame } from '../shared/game-shell'
import { HIGHEST_Y, LOWEST_Y } from './ball'
import { BALL_LOOK } from './draw'
import { stayInTheZoneGame } from './index'
import '../../style.css'
import '../../views/game-screen.css'

/**
 * Stay in the Zone played in a real browser, on a phone: the ball follows a
 * real finger held down (anywhere, even near an edge), then lifted, on a
 * canvas shown smaller than the game.
 */

/** Where the ball's centre was last drawn, in game units. */
let ballY: number | undefined

beforeEach(async () => {
  await page.viewport(360, 640)
  const drawImage = CanvasRenderingContext2D.prototype.drawImage
  vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage').mockImplementation(function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['drawImage']>
  ) {
    const [, , top] = args as unknown as number[]
    ballY = top + BALL_LOOK.height / 2
    drawImage.apply(this, args)
  })
})

afterEach(async () => {
  // Never leave a button held down for the next test.
  await userEvent.pointer('[/MouseLeft]').catch(() => undefined)
  vi.restoreAllMocks()
})

/** Plays `ms` of game time in 50 ms frames. */
function play(frames: FakeFrames, ms: number) {
  for (let played = 0; played < ms; played += 50) frames.frame(50)
}

it('raises the ball while a real finger is held down, up to the score bar, and lets it fall once lifted', async () => {
  document.body.innerHTML = '<main class="game-screen"></main>'
  const container = findElement(document, '.game-screen', HTMLElement)
  const frames = new FakeFrames()
  mountGame(container, {
    signal: new AbortController().signal,
    game: stayInTheZoneGame({ random: constantRandom(0.5) }),
    gameId: 'stay-in-the-zone',
    storage: new FakeStorage(),
    scheduler: frames,
  })
  const start = findElement(container, '.game-hud__start', HTMLButtonElement)
  await vi.waitFor(() => {
    expect(start.disabled).toBe(false)
  })
  await userEvent.click(start)
  const canvas = findElement(container, '.game-canvas', HTMLCanvasElement)
  const shown = canvas.getBoundingClientRect()
  expect(shown.width).toBeLessThan(GAME_WIDTH)
  expect(ballY).toBe(LOWEST_Y)

  // Held down near the top left corner, far from the ball: it rises (60 px/s at first).
  await userEvent.pointer({ target: canvas, coords: { x: 10, y: 10 }, keys: '[MouseLeft>]' })
  play(frames, 1_000)
  const risen = LOWEST_Y - (ballY ?? LOWEST_Y)
  expect(risen).toBeGreaterThan(60)
  expect(risen).toBeLessThan(100)

  // Still held: it goes up to just below the score bar, and no further.
  play(frames, 5_000)
  expect(ballY).toBe(HIGHEST_Y)

  // Lifted: it falls.
  await userEvent.pointer('[/MouseLeft]')
  play(frames, 1_000)
  expect(ballY).toBeGreaterThan(HIGHEST_Y + 30)
})
