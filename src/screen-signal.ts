/**
 * Each screen (home, each game) gets its own `AbortSignal`. The router aborts
 * it before rendering the next screen, so everything tied to it stops with
 * the screen: the game lifecycle, auto-pause, and any timers or listeners a
 * game registers with the signal.
 *
 * Read the signal when the screen is set up, not later: after navigation
 * `getScreenSignal()` returns the next screen's signal.
 */

let controller = new AbortController()

/** The signal for the screen currently shown. */
export function getScreenSignal(): AbortSignal {
  return controller.signal
}

/** Stops everything tied to the current screen. Called by the router. */
export function leaveScreen(): void {
  const previous = controller
  controller = new AbortController()
  previous.abort()
}
