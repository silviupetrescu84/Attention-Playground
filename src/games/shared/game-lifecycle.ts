import { createListeners } from './listeners'

/**
 * Shared lifecycle for every minigame.
 *
 *   ready    --start-->   playing
 *   playing  --pause-->   paused
 *   playing  --finish-->  finished   (the game ends itself: time up, last round)
 *   paused   --resume-->  playing    (pause menu)
 *   paused   --finish-->  finished   (pause menu)
 *   paused   --restart--> ready      (pause menu)
 *   finished --restart--> ready
 *
 * The player cannot restart while playing: they have to pause first.
 *
 * `restart` returns the game to `ready` so each minigame has a single place
 * to reset its own state (when it sees `ready`). Call `start()` afterwards to
 * begin the new round.
 *
 * Every allowed transition moves to a *different* state, so subscribers are
 * notified exactly once per real state change. Invalid transitions throw an
 * `InvalidTransitionError` and leave the state untouched; use `can()` to check
 * first when the call may legitimately be redundant (e.g. double clicks).
 *
 * Every lifecycle is tied to an `AbortSignal` (normally the current screen's,
 * see `src/screen-signal.ts`). When it is aborted the lifecycle stops for good:
 * a playing game is paused first, so anything that stops on pause stops too,
 * and afterwards every action throws a `GameStoppedError`.
 *
 * To pause automatically when the player looks away, see `pause-when-away.ts`.
 */

export type GameState = 'ready' | 'playing' | 'paused' | 'finished'

export type GameAction = 'start' | 'pause' | 'resume' | 'finish' | 'restart'

const transitions: Readonly<
  Record<GameState, Readonly<Partial<Record<GameAction, GameState>>>>
> = {
  ready: { start: 'playing' },
  playing: { pause: 'paused', finish: 'finished' },
  paused: { resume: 'playing', finish: 'finished', restart: 'ready' },
  finished: { restart: 'ready' },
}

export const initialGameState: GameState = 'ready'

/** Returns the state `action` leads to from `state`, or `undefined` if not allowed. */
export function nextGameState(
  state: GameState,
  action: GameAction,
): GameState | undefined {
  return transitions[state][action]
}

export interface GameStateChange {
  /** The state entered by this transition. */
  readonly state: GameState
  /** The state that was left. */
  readonly previousState: GameState
  /** The action that caused the transition. */
  readonly action: GameAction
}

export type GameStateListener = (change: GameStateChange) => void

/**
 * Whether a change begins a fresh round (start, or restart back to ready):
 * the moment per-round values like the score and the timer go back to 0.
 */
export function isNewRound({ action }: GameStateChange): boolean {
  return action === 'start' || action === 'restart'
}

export type Unsubscribe = () => void

export class InvalidTransitionError extends Error {
  readonly state: GameState
  readonly action: GameAction

  constructor(state: GameState, action: GameAction) {
    super(`Cannot ${action} a game that is ${state}`)
    this.name = 'InvalidTransitionError'
    this.state = state
    this.action = action
  }
}

export class GameStoppedError extends Error {
  readonly action: GameAction

  constructor(action: GameAction) {
    super(`Cannot ${action} a game that has been stopped`)
    this.name = 'GameStoppedError'
    this.action = action
  }
}

export interface GameLifecycleOptions {
  /** Stops the lifecycle for good when aborted. */
  signal: AbortSignal
}

export interface GameLifecycle {
  /** The current state. */
  readonly state: GameState
  /** The signal that stops this lifecycle. */
  readonly signal: AbortSignal
  /** Whether `action` is allowed now (always false once stopped). */
  can(action: GameAction): boolean
  start(): void
  pause(): void
  resume(): void
  finish(): void
  restart(): void
  /**
   * Calls `listener` after every state change (not immediately on subscribe;
   * read `state` for the current value). Returns a function that removes it.
   */
  subscribe(listener: GameStateListener): Unsubscribe
}

export function createGameLifecycle({
  signal,
}: GameLifecycleOptions): GameLifecycle {
  let state: GameState = initialGameState
  let stopped = false
  const listeners = createListeners<[GameStateChange]>()

  function transition(action: GameAction) {
    if (stopped) {
      throw new GameStoppedError(action)
    }

    apply(action)
  }

  function apply(action: GameAction) {
    const previousState = state
    const nextState = nextGameState(previousState, action)

    if (!nextState) {
      throw new InvalidTransitionError(previousState, action)
    }

    state = nextState
    listeners.notify({ state: nextState, previousState, action })
  }

  function stop() {
    // Mark as stopped first so listeners reacting to the final pause cannot
    // start the game again.
    stopped = true

    if (state === 'playing') {
      apply('pause')
    }
  }

  if (signal.aborted) {
    stop()
  } else {
    signal.addEventListener('abort', stop, { once: true })
  }

  return {
    get state() {
      return state
    },
    signal,
    can: (action) => !stopped && nextGameState(state, action) !== undefined,
    start: () => transition('start'),
    pause: () => transition('pause'),
    resume: () => transition('resume'),
    finish: () => transition('finish'),
    restart: () => transition('restart'),
    subscribe: listeners.add,
  }
}
