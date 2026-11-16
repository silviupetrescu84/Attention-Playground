import { expect, vi } from 'vitest'
import { GAME_HEIGHT, GAME_WIDTH } from '../games/shared/game-canvas'
import { mountGame, type GameDefinition } from '../games/shared/game-shell'
import type { FontLoader } from '../games/shared/load-font'
import type { Pace } from '../games/shared/pace'
import { FakeFrames } from './fake-frames'
import { FakeStorage } from './fake-storage'

/** A font loader whose font is always ready. */
export const loadedFonts: FontLoader = { load: async () => [{ status: 'loaded' }] }

/**
 * Mounts the game `create` makes with a font loader that waits until the
 * test calls `finishLoading`, to check that Start waits for it. Returns the
 * loader (a mock), the Start button and `finishLoading`.
 */
export function mountWaitingForFont(create: (fonts: FontLoader) => GameDefinition) {
  let resolve: (faces: { status: string }[]) => void = () => {}
  const fonts = {
    load: vi.fn(() => new Promise<{ status: string }[]>((done) => (resolve = done))),
  } satisfies FontLoader
  const container = document.createElement('main')
  document.body.replaceChildren(container)
  mountGame(container, {
    signal: new AbortController().signal,
    game: create(fonts),
    gameId: 'test-game',
    storage: new FakeStorage(),
    scheduler: new FakeFrames(),
  })
  const start = container.querySelector<HTMLButtonElement>('.game-hud__start')!

  return { fonts, start, finishLoading: () => resolve([{ status: 'loaded' }]) }
}

/**
 * Mounts `game` in a new container on the page, with frames that only run
 * when the test says so, and waits until it has loaded (Start enabled). The
 * pace is Normal, so the game plays at its settings as they are (the pinned
 * difficulty); `choosePace` picks another before Start.
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
    gameId: 'test-game',
    storage: new FakeStorage(),
    scheduler: frames,
  })
  const startButton = container.querySelector<HTMLButtonElement>('.game-hud__start')!
  await vi.waitFor(() => expect(startButton.disabled).toBe(false))
  const paceButton = container.querySelector<HTMLButtonElement>('.game-hud__pace')!
  /** Presses the pace button until `pace` is chosen. */
  const choosePace = (pace: Pace) => {
    while (session.pace.pace !== pace) paceButton.click()
  }
  choosePace('normal')
  // Each time points were added this round (the combo multiplies them, so the score says less).
  let scored = 0
  session.score.subscribe((_, { reason }) => {
    scored = reason === 'add' ? scored + 1 : 0
  })
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
    session.canvas.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y }))
  /**
   * The player's finger goes down on the game at (x, y) in game units (the
   * middle, if not given), moves there (even off the game), or lifts.
   */
  const finger = {
    down: (x = GAME_WIDTH / 2, y = GAME_HEIGHT / 2) =>
      session.canvas.element.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1 }),
      ),
    move: (x: number, y = GAME_HEIGHT / 2) =>
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 1 }),
      ),
    up: () => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 })),
  }

  /** Plays in 50 ms frames until the round is over; fails if it goes on for 3 minutes. */
  const playUntilOver = () => {
    for (let played = 0; session.lifecycle.state === 'playing'; played += 50) {
      if (played >= 180_000) {
        throw new Error('The round did not end within 3 minutes of play')
      }
      frames.frame(50)
    }
  }

  /**
   * The numbers in the game's own summary on the finished screen, in order:
   * without the best combo every summary ends with (the shell's, tested there).
   */
  const summaryValues = () =>
    [...container.querySelectorAll('.game-hud__summary dd')]
      .slice(0, -1)
      .map((e) => Number(e.textContent))

  /** How many times points were added this round: one for each good thing. */
  const timesScored = () => scored

  return {
    container,
    frames,
    session,
    click,
    text,
    tapAt,
    finger,
    playUntilOver,
    summaryValues,
    timesScored,
    choosePace,
  }
}
