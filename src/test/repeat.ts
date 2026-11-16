/**
 * Calls `step` until `done`, at most `most` times, for tests that play a game
 * on until something happens: if it never does, the test fails saying so,
 * instead of running forever.
 */
export function repeatUntil(done: () => boolean, step: () => void, most = 10_000): void {
  for (let times = 0; !done(); times++) {
    if (times >= most) {
      throw new Error(`Still not done after ${most} steps`)
    }
    step()
  }
}
