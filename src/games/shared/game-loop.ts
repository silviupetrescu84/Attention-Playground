import { isNewRound, type GameLifecycle } from './game-lifecycle'

/**
 * The frame loop and game timer shared by every minigame. It follows the
 * game lifecycle:
 *
 * - start:   the timer resets to 0 and frames begin.
 * - every frame while playing, the time since the previous frame is added to
 *   the timer and `onFrame` is called (update and draw the game there).
 * - pause:   frames stop; time spent paused is not counted.
 * - resume:  frames continue from where the timer was.
 * - finish:  frames stop; the timer keeps its value (e.g. to show it).
 * - restart: the timer resets to 0.
 *
 * The loop stops for good when the lifecycle is stopped (the player leaves
 * the screen).
 */

export interface GameFrame {
  /** Time counted for this frame. */
  readonly deltaMs: number
  /** Timer value after this frame. */
  readonly elapsedMs: number
}

/** Where frames and time come from (the browser by default; fakes in tests). */
export interface FrameScheduler {
  requestFrame(callback: (timestamp: number) => void): number
  cancelFrame(id: number): void
  now(): number
}

export const browserFrameScheduler: FrameScheduler = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
}

export interface GameLoopOptions {
  lifecycle: GameLifecycle
  /** Called on every frame while playing. */
  onFrame?: (frame: GameFrame) => void
  scheduler?: FrameScheduler
}

export interface GameLoop {
  /** Time played in the current round. */
  readonly elapsedMs: number
}

export function createGameLoop({
  lifecycle,
  onFrame,
  scheduler = browserFrameScheduler,
}: GameLoopOptions): GameLoop {
  let elapsedMs = 0
  let previousFrameTime = 0
  let frameId: number | undefined

  function requestFrame() {
    frameId = scheduler.requestFrame(onAnimationFrame)
  }

  function cancelFrame() {
    if (frameId !== undefined) {
      scheduler.cancelFrame(frameId)
      frameId = undefined
    }
  }

  function run() {
    // Count from now, so time spent before (ready, paused) is never added.
    previousFrameTime = scheduler.now()
    requestFrame()
  }

  function onAnimationFrame(timestamp: number) {
    frameId = undefined

    // A frame's timestamp can be slightly earlier than the moment the loop
    // (re)started. Count nothing for it, and keep measuring from the later
    // moment so that gap is not counted by the next frame either.
    const sincePrevious = Math.max(0, timestamp - previousFrameTime)
    previousFrameTime = Math.max(previousFrameTime, timestamp)

    elapsedMs += sincePrevious

    // Request the next frame first so an error in `onFrame` does not freeze
    // the game. Pausing or finishing in `onFrame` cancels it.
    requestFrame()
    onFrame?.({ deltaMs: sincePrevious, elapsedMs })
  }

  // Leaving the screen needs no extra handling: the lifecycle pauses a
  // running game (which cancels the next frame) and never changes again.
  lifecycle.subscribe((change) => {
    if (isNewRound(change)) {
      elapsedMs = 0
    }

    if (change.state === 'playing') {
      run()
    } else {
      cancelFrame()
    }
  })

  if (lifecycle.state === 'playing') {
    run()
  }

  return {
    get elapsedMs() {
      return elapsedMs
    },
  }
}
