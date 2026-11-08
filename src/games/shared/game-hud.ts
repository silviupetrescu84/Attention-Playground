import { pauseIcon, playIcon } from '../../components/icons'
import type { GameLifecycle, GameState } from './game-lifecycle'
import type { GameLoop } from './game-loop'
import type { Score, ScoreChange } from './score'

/**
 * Everything shown over the canvas that is the same in every game:
 *
 * - ready:    the Start button ("Loading…" and disabled while the game loads).
 * - playing:  "Score: x" top left (flashing green when points are won, red
 *             when lost); the time in seconds and a Pause button top right.
 * - paused:   the same bar, with Resume instead of Pause, over a dimmed game
 *             with a Restart button (back to the Start button).
 * - finished: "Time's up!", the final score, the game's own summary (if any)
 *             and a Restart button.
 *
 * The score and time are always shown.
 */

/** One line of a game's end-of-round summary, e.g. "Good emotions tapped: 12". */
export interface SummaryItem {
  readonly label: string
  readonly value: number | string
}

export interface GameHud {
  readonly element: HTMLElement
  /** Shows the loop's current time (called on every frame). */
  updateTime(): void
  /** Sets the summary shown on the finished screen (hidden when empty). */
  showSummary(items: readonly SummaryItem[]): void
  /** Enables the Start button, or shows "Loading…" while the game loads. */
  setStartReady(ready: boolean): void
}

export interface GameHudOptions {
  lifecycle: GameLifecycle
  loop: GameLoop
  score: Score
}

/** Whole seconds, at least two digits: 00, 01, … 60. */
export function formatSeconds(ms: number): string {
  return String(Math.floor(ms / 1000)).padStart(2, '0')
}

export function createGameHud(
  stage: HTMLElement,
  { lifecycle, loop, score }: GameHudOptions,
): GameHud {
  const element = document.createElement('div')
  element.className = 'game-hud'
  element.innerHTML = `
    <div class="game-hud__bar">
      <span class="game-hud__score"></span>
      <span class="game-hud__right">
        <span class="game-hud__time" aria-label="Time in seconds"></span>
        <button class="game-hud__pause" type="button"></button>
      </span>
    </div>
    <div class="game-hud__overlay game-hud__overlay--start">
      <button class="game-hud__button game-hud__start" type="button">Start</button>
    </div>
    <div class="game-hud__overlay game-hud__overlay--paused">
      <button class="game-hud__button game-hud__restart" type="button">Restart</button>
    </div>
    <div class="game-hud__overlay game-hud__overlay--finished">
      <p class="game-hud__title">Time's up!</p>
      <p class="game-hud__final-score"></p>
      <dl class="game-hud__summary" hidden></dl>
      <button class="game-hud__button game-hud__restart" type="button">Restart</button>
    </div>
  `
  stage.append(element)

  function find<T extends HTMLElement>(selector: string) {
    return element.querySelector<T>(selector)!
  }

  const scoreText = find('.game-hud__score')
  const timeText = find('.game-hud__time')
  const pauseButton = find<HTMLButtonElement>('.game-hud__pause')
  const startOverlay = find('.game-hud__overlay--start')
  const pausedOverlay = find('.game-hud__overlay--paused')
  const finishedOverlay = find('.game-hud__overlay--finished')
  const startButton = find<HTMLButtonElement>('.game-hud__start')
  const finalScoreText = find('.game-hud__final-score')
  const summaryList = find('.game-hud__summary')

  function showSummary(items: readonly SummaryItem[]) {
    summaryList.replaceChildren(
      ...items.flatMap(({ label, value }) => {
        const term = document.createElement('dt')
        term.textContent = label
        const detail = document.createElement('dd')
        detail.textContent = String(value)
        return [term, detail]
      }),
    )
    summaryList.hidden = items.length === 0
  }

  function showScore(value: number) {
    scoreText.textContent = `Score: ${value}`
    finalScoreText.textContent = `Score: ${value}`
  }

  function flashScore(value: number, { previous, reason }: ScoreChange) {
    scoreText.classList.remove('game-hud__score--up', 'game-hud__score--down')

    if (reason === 'reset') {
      return
    }

    // Reading the layout restarts the animation if the same class comes back.
    void scoreText.offsetWidth
    scoreText.classList.add(value > previous ? 'game-hud__score--up' : 'game-hud__score--down')
  }

  function updateTime() {
    const text = formatSeconds(loop.elapsedMs)

    if (timeText.textContent !== text) {
      timeText.textContent = text
    }
  }

  function showState(state: GameState) {
    element.dataset.state = state
    startOverlay.hidden = state !== 'ready'
    pausedOverlay.hidden = state !== 'paused'
    finishedOverlay.hidden = state !== 'finished'
    // No Pause button while the Start button is shown or once finished.
    pauseButton.hidden = state === 'ready' || state === 'finished'

    const paused = state === 'paused'
    pauseButton.innerHTML = paused ? playIcon : pauseIcon
    pauseButton.setAttribute('aria-label', paused ? 'Resume' : 'Pause')

    updateTime()
  }

  pauseButton.addEventListener('click', () => {
    if (lifecycle.can('pause')) {
      lifecycle.pause()
    } else if (lifecycle.can('resume')) {
      lifecycle.resume()
    }
  })

  function setStartReady(ready: boolean) {
    startButton.disabled = !ready
    startButton.textContent = ready ? 'Start' : 'Loading…'
  }

  startButton.addEventListener('click', () => {
    if (lifecycle.can('start')) {
      lifecycle.start()
    }
  })

  for (const restartButton of element.querySelectorAll('.game-hud__restart')) {
    restartButton.addEventListener('click', () => {
      if (lifecycle.can('restart')) {
        lifecycle.restart()
      }
    })
  }

  lifecycle.subscribe(({ state }) => showState(state))
  score.subscribe((value, change) => {
    showScore(value)
    flashScore(value, change)
  })
  showScore(score.value)
  showState(lifecycle.state)

  return { element, updateTime, showSummary, setStartReady }
}
