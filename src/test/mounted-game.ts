import { expect, vi } from 'vitest'
import { mountGame, type GameDefinition } from '../games/shared/game-shell'
import type { FontLoader } from '../games/shared/load-font'
import { FakeFrames } from './fake-frames'

/** A font loader whose font is always ready. */
export const loadedFonts: FontLoader = { load: async () => [{ status: 'loaded' }] }

/**
 * Mounts `game` in a new container on the page, with frames that only run
 * when the test says so, and waits until it has loaded (Start enabled).
 *
 * The canvas counts as shown at full size in the top-left corner, so screen
 * positions are game units. jsdom cannot draw: call `useFakeCanvasContexts()`
 * (and `stubImages()` for games with images) first.
 */
export async function mountForTest(game: GameDefinition) {
  const container = document.createElement('main')
  document.body.replaceChildren(container)
  const frames = new FakeFrames()
  const session = mountGame(container, {
    signal: new AbortController().signal,
    game,
    scheduler: frames,
  })
  const startButton = container.querySelector<HTMLButtonElement>('.game-hud__start')!
  await vi.waitFor(() => expect(startButton.disabled).toBe(false))
  vi.spyOn(session.canvas.element, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 800),
  )

  /** Clicks the HUD button matching `selector`. */
  const click = (selector: string) =>
    container.querySelector<HTMLButtonElement>(`.game-hud ${selector}`)!.click()
  /** The text of the element matching `selector`. */
  const text = (selector: string) => container.querySelector(selector)!.textContent
  /** Taps the canvas at a position in game units. */
  const tapAt = (x: number, y: number) =>
    session.canvas.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: x, clientY: y }),
    )

  /** Plays in 50 ms frames until the round is over; fails if it goes on for 3 minutes. */
  const playUntilOver = () => {
    for (let played = 0; session.lifecycle.state === 'playing'; played += 50) {
      if (played >= 180_000) {
        throw new Error('The round did not end within 3 minutes of play')
      }
      frames.frame(50)
    }
  }

  /** The numbers in the summary on the finished screen, in order. */
  const summaryValues = () =>
    [...container.querySelectorAll('.game-hud__summary dd')].map((e) => Number(e.textContent))

  return { container, frames, session, click, text, tapAt, playUntilOver, summaryValues }
}
