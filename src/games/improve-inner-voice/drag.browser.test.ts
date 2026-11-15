import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { FakeFrames } from '../../test/fake-frames'
import { FakeStorage } from '../../test/fake-storage'
import { seededRandom } from '../../test/random'
import { findElement } from '../shared/dom'
import { GAME_WIDTH } from '../shared/game-canvas'
import { mountGame } from '../shared/game-shell'
import { improveInnerVoiceGame } from './index'
import { PAD_WIDTH } from './pad'
import '../../style.css'
import '../../views/game-screen.css'

/**
 * Improve Inner Voice played in a real browser, on a phone: the pad follows
 * a real finger (held down, moved, lifted) on a canvas shown smaller than
 * the game.
 */

/** Where the pad's centre was last drawn, in game units. */
let padX: number | undefined

beforeEach(async () => {
  await page.viewport(360, 640)
  const roundRect = CanvasRenderingContext2D.prototype.roundRect
  vi.spyOn(CanvasRenderingContext2D.prototype, 'roundRect').mockImplementation(function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['roundRect']>
  ) {
    padX = args[0] + PAD_WIDTH / 2
    roundRect.apply(this, args)
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

it('moves the pad towards a real finger held down, follows it, and stops when it lifts', async () => {
  document.body.innerHTML = '<main class="game-screen"></main>'
  const container = findElement(document, '.game-screen', HTMLElement)
  const frames = new FakeFrames()
  mountGame(container, {
    signal: new AbortController().signal,
    game: improveInnerVoiceGame({ random: seededRandom(1) }),
    gameId: 'improve-inner-voice',
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
  /** A point on the canvas as shown, `x` game units across, near the bottom. */
  const at = (x: number) => ({ x: (x * shown.width) / GAME_WIDTH, y: shown.height * 0.9 })
  expect(shown.width).toBeLessThan(GAME_WIDTH)

  // Held down on the right: the pad heads there at its own pace (60 px/s at first).
  await userEvent.pointer({ target: canvas, coords: at(380), keys: '[MouseLeft>]' })
  play(frames, 1_000)
  expect(padX).toBeGreaterThan(200 + 60)
  expect(padX).toBeLessThan(200 + 70)

  // Moved to the left, off the canvas: it turns back and follows.
  const before = padX ?? 0
  await userEvent.pointer({ coords: { x: shown.left - 20, y: shown.bottom - 20 } })
  play(frames, 1_000)
  expect(padX).toBeLessThan(before - 55)

  // Lifted: it stops where it is.
  await userEvent.pointer('[/MouseLeft]')
  play(frames, 100)
  const stoppedAt = padX
  play(frames, 1_000)
  expect(padX).toBe(stoppedAt)
})
