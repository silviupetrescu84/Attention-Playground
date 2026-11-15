import { createGameCanvas, type GameCanvas, type GamePoint } from './game-canvas'
import { createGameHud, type GameHud, type SummaryItem } from './game-hud'
import { createGameLifecycle, type GameLifecycle } from './game-lifecycle'
import { createGameLoop, type FrameScheduler, type GameFrame, type GameLoop } from './game-loop'
import { createGameStatus, type GameStatus } from './game-status'
import { createHighScores, type HighScores, type ScoreStorage } from './high-scores'
import { createMistakes, type Mistakes } from './mistakes'
import { pauseWhenAway } from './pause-when-away'
import { createScore, type Score } from './score'
import './game.css'

/**
 * Sets up everything a minigame shares (lifecycle, auto-pause, canvas, score,
 * timer, difficulty and mistakes, best scores, Start/Pause/Restart buttons,
 * status bar and taps) and runs a game in it.
 *
 * A game only provides its own rules as `GameHandlers`, and reports each
 * mistake the player makes to `mistakes`. A round goes on until the player
 * makes one mistake more than the chosen difficulty allows, and ends the
 * moment they do, even in the middle of a frame or tap (see `end`).
 */

export interface GameSession {
  readonly lifecycle: GameLifecycle
  readonly loop: GameLoop
  readonly score: Score
  /** The difficulty chosen, and the mistakes made this round. */
  readonly mistakes: Mistakes
  /** The game's best scores at each difficulty, kept in the browser. */
  readonly highScores: HighScores
  readonly canvas: GameCanvas
  readonly hud: GameHud
  readonly status: GameStatus
}

export interface GameHandlers {
  /**
   * Loads what the game needs (fonts, images…) before the first round. The
   * Start button waits for it; if it fails, the game can still be started.
   */
  load?(): Promise<unknown>
  /** Draws the picture shown behind the Start button (also after restart). */
  reset(): void
  /** A new round starts: set up the game from scratch. */
  start(): void
  /** Every frame while playing: update and draw the game. */
  frame(frame: GameFrame): void
  /** The player tapped the game while playing, in game units. */
  tap?(point: GamePoint): void
  /**
   * Where the player's finger (or mouse, while pressed) is, in game units:
   * from when it goes down on the game while playing, as it moves (even off
   * the game), then `undefined` when it lifts, or when the round stops being
   * played (paused, over).
   */
  readonly drag?: (point: GamePoint | undefined) => void
  /**
   * The round has just ended (one mistake too many), possibly in the middle
   * of `frame` or `tap`: stop at once, so nothing after that mistake counts.
   */
  end?(): void
  /** Extra lines for the finished screen, below the score. */
  summary?(): readonly SummaryItem[]
  /** How to play, one paragraph each: shown with the Start button whenever it is shown. */
  readonly instructions?: readonly string[]
}

/** A minigame: given the shared session, returns its rules. */
export type GameDefinition = (session: GameSession) => GameHandlers

export interface MountGameOptions {
  /** Stops the game for good when aborted (normally the screen signal). */
  signal: AbortSignal
  game: GameDefinition
  /** The game's id (as in the catalog): its best scores are kept under it. */
  gameId: string
  /** Where the best scores are kept; defaults to the browser's `localStorage`. */
  storage?: ScoreStorage
  scheduler?: FrameScheduler
}

export function mountGame(
  container: HTMLElement,
  { signal, game, gameId, storage, scheduler }: MountGameOptions,
): GameSession {
  const lifecycle = createGameLifecycle({ signal })
  pauseWhenAway(lifecycle)
  const canvas = createGameCanvas(container, { signal })
  const score = createScore({ lifecycle })
  const mistakes = createMistakes({ lifecycle })
  // Created before the game's own rules, so a round counts with the score it
  // ended on, before the game stops.
  const highScores = createHighScores({ gameId, lifecycle, score, mistakes, storage })

  const loop = createGameLoop({
    lifecycle,
    scheduler,
    // Frames only come once a round starts, when the game's rules exist.
    onFrame: (frame) => {
      rules.frame(frame)
      hud.updateTime()
      status.update()
    },
  })
  const hud = createGameHud(canvas.stage, { lifecycle, loop, score, mistakes, highScores })
  const status = createGameStatus(container, { loop })
  const session: GameSession = {
    lifecycle,
    loop,
    score,
    mistakes,
    highScores,
    canvas,
    hud,
    status,
  }
  const rules = game(session)
  hud.showInstructions(rules.instructions ?? [])

  lifecycle.subscribe(({ state, action }) => {
    // A new round or a restart: old messages no longer apply. (At the end,
    // the message about the last mistake stays, to show why the round ended.)
    if (action === 'start' || state === 'ready') {
      status.clear()
    }

    if (action === 'start') {
      rules.start()
    } else if (state === 'ready') {
      rules.reset()
    } else if (state === 'finished') {
      rules.end?.()
      hud.showSummary(rules.summary?.() ?? [])
    }
  })

  canvas.element.addEventListener(
    'pointerdown',
    (event) => {
      if (lifecycle.state === 'playing' && rules.tap) {
        rules.tap(canvas.toGamePoint(event.clientX, event.clientY))
      }
    },
    { signal },
  )

  if (rules.drag) {
    followDrags(canvas, lifecycle, rules.drag, signal)
  }

  rules.reset()

  if (rules.load) {
    hud.setStartReady(false)
    rules
      .load()
      .catch((error: unknown) => console.error('The game could not load everything', error))
      .finally(() => hud.setStartReady(true))
  }

  return session
}

/**
 * Tells `drag` where the player's finger is (see `GameHandlers.drag`): one
 * finger at a time, from when it goes down on the canvas while playing. Moves
 * and lifts are heard on the whole window, so the finger can leave the game.
 */
function followDrags(
  canvas: GameCanvas,
  lifecycle: GameLifecycle,
  drag: (point: GamePoint | undefined) => void,
  signal: AbortSignal,
) {
  /** The pointer being dragged, if any. */
  let dragging: number | undefined

  function stop() {
    if (dragging !== undefined) {
      dragging = undefined
      drag(undefined)
    }
  }

  canvas.element.addEventListener(
    'pointerdown',
    (event) => {
      // Unless a tap (heard first) just ended the round.
      if (lifecycle.state === 'playing') {
        dragging = event.pointerId
        drag(canvas.toGamePoint(event.clientX, event.clientY))
      }
    },
    { signal },
  )
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId === dragging) {
        drag(canvas.toGamePoint(event.clientX, event.clientY))
      }
    },
    { signal },
  )
  for (const type of ['pointerup', 'pointercancel'] as const) {
    window.addEventListener(
      type,
      (event) => {
        if (event.pointerId === dragging) {
          stop()
        }
      },
      { signal },
    )
  }
  lifecycle.subscribe(({ state }) => {
    if (state !== 'playing') {
      stop()
    }
  })
}
