import type { GameLifecycle } from './game-lifecycle'

type ListenOptions = { signal: AbortSignal }

/** The parts of `document` and `window` this helper needs (lets tests pass fakes). */
export interface PageEvents {
  readonly document: {
    readonly visibilityState: DocumentVisibilityState
    addEventListener(type: 'visibilitychange', listener: () => void, options: ListenOptions): void
  }
  readonly window: {
    addEventListener(type: 'blur', listener: () => void, options: ListenOptions): void
  }
}

/**
 * Pauses the game whenever the player looks away:
 * - the page is hidden: switching tabs, minimising the window, locking the
 *   phone, switching apps, or leaving for another site;
 * - the window loses focus: clicking into another app while the game is still
 *   visible (this includes clicking into the browser's developer tools).
 *
 * It never resumes by itself: when the player comes back they see the pause
 * menu and choose to resume or restart.
 *
 * Only a `playing` game is paused; other states are left alone.
 *
 * Stops listening when the lifecycle's signal is aborted.
 */
export function pauseWhenAway(
  lifecycle: GameLifecycle,
  page: PageEvents = { document, window },
): void {
  const { signal } = lifecycle

  function pauseIfPlaying() {
    if (lifecycle.can('pause')) {
      lifecycle.pause()
    }
  }

  function onVisibilityChange() {
    if (page.document.visibilityState === 'hidden') {
      pauseIfPlaying()
    }
  }

  // Both stop listening when the lifecycle's signal is aborted.
  page.document.addEventListener('visibilitychange', onVisibilityChange, { signal })
  page.window.addEventListener('blur', pauseIfPlaying, { signal })
}
