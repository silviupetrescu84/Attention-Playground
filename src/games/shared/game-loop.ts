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
 * When the timer reaches the game duration (60 seconds by default), the
 * last frame is shown and the loop calls `finish()`.
 *
 * The loop stops for good when the lifecycle is stopped (the player leaves
 * the screen).
 */

export const GAME_DURATION_MS = 60_000

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
  /** How long a game lasts. Defaults to 60 seconds. */
  durationMs?: number
  scheduler?: FrameScheduler
}

export interface GameLoop {
  /** Time played in the current round. */
  readonly elapsedMs: number
  readonly durationMs: number
}

export function createGameLoop({
  lifecycle,
  onFrame,
  durationMs = GAME_DURATION_MS,
  scheduler = browserFrameScheduler,
}: GameLoopOptions): GameLoop {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError(`Game duration must be a positive number of ms, got ${durationMs}`)
  }

  let elapsedMs = 0
  let previousFrameTime = 0
  let frameId: number | undefined

  function requestFrame() {
    // Safety net: two pending frames would make the timer run twice as fast.
    if (frameId === undefined) {
      frameId = scheduler.requestFrame(onAnimationFrame)
    }
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

    const remainingBefore = durationMs - elapsedMs
    const timeUp = sincePrevious >= remainingBefore
    const deltaMs = timeUp ? remainingBefore : sincePrevious
    elapsedMs = timeUp ? durationMs : elapsedMs + deltaMs

    const frame: GameFrame = { deltaMs, elapsedMs }

    if (!timeUp) {
      // Request the next frame first so an error in `onFrame` does not
      // freeze the game. Pausing or finishing in `onFrame` cancels it.
      requestFrame()
      onFrame?.(frame)
      return
    }

    try {
      onFrame?.(frame)
    } finally {
      if (lifecycle.can('finish')) {
        lifecycle.finish()
      }
    }
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
    durationMs,
  }
}
