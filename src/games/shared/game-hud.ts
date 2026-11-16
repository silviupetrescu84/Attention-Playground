import { pauseIcon, playIcon } from '../../components/icons'
import type { Combo } from './combo'
import { findElement } from './dom'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from './game-canvas'
import type { GameLifecycle, GameState } from './game-lifecycle'
import type { GameLoop } from './game-loop'
import { canSave, MAX_NAME_LENGTH, type HighScores } from './high-scores'
import { DIFFICULTY_NAMES, MISTAKES_TO_FAIL, type DifficultyLevel, type Mistakes } from './mistakes'
import { PACE_NAMES, type Pace, type PaceChoice } from './pace'
import type { Score, ScoreChange } from './score'

/**
 * Everything shown over the canvas that is the same in every game:
 *
 * - ready:    the Start button, 28% of the way down ("Loading…" and
 *             disabled while the game loads), the difficulty button under it
 *             ("Difficulty: Easy"; each press picks the next difficulty),
 *             the pace button under that ("Pace: Slow" at first, then
 *             Normal and Fast, the same way),
 *             then the mistake it fails on ("Fail on 10 mistakes"),
 *             then a High scores button, and under that the game's
 *             instructions (if any) on a white card.
 * - playing:  the combo's multiplier ("X1", green from X2 on) and "Score: x"
 *             top left (the score flashing green when points are won);
 *             "Mistakes: x" in the middle; the time in seconds and a Pause
 *             button top right.
 * - paused:   the same bar, with Resume instead of Pause, over a dimmed game
 *             with a Restart button (back to the Start button).
 * - finished: "Game over", the final score, then how it did among the high
 *             scores (see high-scores.ts): a score that makes them ("New
 *             best score!", "New high score: #4") comes with a name field
 *             and a Save button; once saved, where it went ("Saved: #4 on
 *             Easy · Slow"); otherwise, the best score at that difficulty and
 *             pace ("Best score: 12 by Sam").
 *             Then the game's own summary (if any, on the same white card as
 *             the instructions) and a Restart button.
 *
 * The score, mistakes and time are always shown, except on the high scores
 * screen: opened with the High scores button, it shows the high scores of
 * the difficulty and pace chosen, named at the top ("Easy · Slow"; names and
 * scores, best first, or a message when there are none) on the canvas background, with nothing else from the game
 * but a Back button to the Start button.
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
  /** Sets the instructions shown with the Start button, one paragraph each (hidden when empty). */
  showInstructions(paragraphs: readonly string[]): void
  /** Enables the Start button, or shows "Loading…" while the game loads. */
  setStartReady(ready: boolean): void
}

export interface GameHudOptions {
  lifecycle: GameLifecycle
  loop: GameLoop
  score: Score
  combo: Combo
  mistakes: Mistakes
  pace: PaceChoice
  highScores: HighScores
}

/**
 * Height of the score and time bar across the top of the canvas, in game
 * units. Games keep what the player must see below it. (Passed to the CSS as
 * `--game-bar-height`.)
 */
export const GAME_BAR_HEIGHT = 64

/** The middle of the canvas below the score bar, where games put what they are about. */
export const PLAY_CENTRE: GamePoint = {
  x: GAME_WIDTH / 2,
  y: (GAME_BAR_HEIGHT + GAME_HEIGHT) / 2,
}

/** Whole seconds, at least two digits: 00, 01, … 99, 100, … */
export function formatSeconds(ms: number): string {
  return String(Math.floor(ms / 1000)).padStart(2, '0')
}

/** The name of a difficulty and pace together, as the high scores are kept: "Easy · Slow". */
export function settingsName(level: DifficultyLevel, pace: Pace): string {
  return `${DIFFICULTY_NAMES[level]} · ${PACE_NAMES[pace]}`
}

/** A new `tag` element with `text` in it (as text, never as HTML), and `className` if given. */
function textElement<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  text: string,
  className?: string,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag)
  element.textContent = text

  if (className) {
    element.className = className
  }

  return element
}

export function createGameHud(
  stage: HTMLElement,
  { lifecycle, loop, score, combo, mistakes, pace, highScores }: GameHudOptions,
): GameHud {
  const element = document.createElement('div')
  element.className = 'game-hud'
  element.style.setProperty('--game-bar-height', `${GAME_BAR_HEIGHT}px`)
  element.innerHTML = `
    <div class="game-hud__bar">
      <span class="game-hud__left">
        <span class="game-hud__combo"></span>
        <span class="game-hud__score"></span>
      </span>
      <span class="game-hud__mistakes"></span>
      <span class="game-hud__right">
        <span class="game-hud__time" aria-label="Time in seconds"></span>
        <button class="game-hud__pause" type="button"></button>
      </span>
    </div>
    <div class="game-hud__overlay game-hud__overlay--start">
      <button class="game-hud__button game-hud__start" type="button">Start</button>
      <button class="game-hud__button game-hud__difficulty" type="button"></button>
      <button class="game-hud__button game-hud__pace" type="button"></button>
      <p class="game-hud__fail-on"></p>
      <button class="game-hud__button game-hud__high-scores-open" type="button">High scores</button>
      <div class="game-hud__card game-hud__instructions" hidden></div>
    </div>
    <div class="game-hud__overlay game-hud__overlay--paused">
      <button class="game-hud__button game-hud__restart" type="button">Restart</button>
    </div>
    <div class="game-hud__overlay game-hud__overlay--finished">
      <p class="game-hud__title">Game over</p>
      <p class="game-hud__final-score"></p>
      <p class="game-hud__round-result" hidden></p>
      <form class="game-hud__name-form" hidden>
        <label class="game-hud__name-label">
          Your name
          <input
            class="game-hud__name"
            type="text"
            name="name"
            maxlength="${MAX_NAME_LENGTH}"
            autocomplete="nickname"
            spellcheck="false"
            required
          />
        </label>
        <button class="game-hud__button game-hud__save" type="submit">Save</button>
      </form>
      <dl class="game-hud__card game-hud__summary" hidden></dl>
      <button class="game-hud__button game-hud__restart" type="button">Restart</button>
    </div>
    <div
      class="game-hud__overlay game-hud__overlay--high-scores"
      role="dialog"
      aria-label="High scores"
      hidden
    >
      <p class="game-hud__title">High scores</p>
      <p class="game-hud__high-scores-level"></p>
      <ol class="game-hud__card game-hud__high-scores"></ol>
      <p class="game-hud__card game-hud__no-high-scores">No high scores yet</p>
      <button class="game-hud__button game-hud__back" type="button">Back</button>
    </div>
  `
  stage.append(element)

  const scoreText = findElement(element, '.game-hud__score', HTMLElement)
  const comboText = findElement(element, '.game-hud__combo', HTMLElement)
  const mistakesText = findElement(element, '.game-hud__mistakes', HTMLElement)
  const failOnText = findElement(element, '.game-hud__fail-on', HTMLElement)
  const timeText = findElement(element, '.game-hud__time', HTMLElement)
  const pauseButton = findElement(element, '.game-hud__pause', HTMLButtonElement)
  const startOverlay = findElement(element, '.game-hud__overlay--start', HTMLElement)
  const pausedOverlay = findElement(element, '.game-hud__overlay--paused', HTMLElement)
  const finishedOverlay = findElement(element, '.game-hud__overlay--finished', HTMLElement)
  const difficultyButton = findElement(element, '.game-hud__difficulty', HTMLButtonElement)
  const paceButton = findElement(element, '.game-hud__pace', HTMLButtonElement)
  const startButton = findElement(element, '.game-hud__start', HTMLButtonElement)
  const finalScoreText = findElement(element, '.game-hud__final-score', HTMLElement)
  const summaryList = findElement(element, '.game-hud__summary', HTMLElement)
  const instructionsCard = findElement(element, '.game-hud__instructions', HTMLElement)
  const bar = findElement(element, '.game-hud__bar', HTMLElement)
  const roundResultText = findElement(element, '.game-hud__round-result', HTMLElement)
  const nameForm = findElement(element, '.game-hud__name-form', HTMLFormElement)
  const nameInput = findElement(element, '.game-hud__name', HTMLInputElement)
  const saveButton = findElement(element, '.game-hud__save', HTMLButtonElement)
  const highScoresButton = findElement(element, '.game-hud__high-scores-open', HTMLButtonElement)
  const highScoresOverlay = findElement(element, '.game-hud__overlay--high-scores', HTMLElement)
  const highScoresLevel = findElement(element, '.game-hud__high-scores-level', HTMLElement)
  const highScoresList = findElement(element, '.game-hud__high-scores', HTMLElement)
  const noHighScoresText = findElement(element, '.game-hud__no-high-scores', HTMLElement)
  const backButton = findElement(element, '.game-hud__back', HTMLButtonElement)
  let highScoresOpen = false

  function showSummary(items: readonly SummaryItem[]) {
    summaryList.replaceChildren(
      ...items.flatMap(({ label, value }) => [
        textElement('dt', label),
        textElement('dd', String(value)),
      ]),
    )
    summaryList.hidden = items.length === 0
  }

  function showInstructions(paragraphs: readonly string[]) {
    instructionsCard.replaceChildren(...paragraphs.map((text) => textElement('p', text)))
    instructionsCard.hidden = paragraphs.length === 0
  }

  function showScore(value: number) {
    scoreText.textContent = `Score: ${value}`
    finalScoreText.textContent = `Score: ${value}`
  }

  function showCombo() {
    const { multiplier } = combo
    comboText.textContent = `X${multiplier}`
    comboText.dataset.multiplier = String(multiplier)
  }

  function flashScore({ reason }: ScoreChange) {
    scoreText.classList.remove('game-hud__score--up')

    if (reason === 'reset') {
      return
    }

    // Measuring the layout restarts the animation when the class comes back.
    scoreText.getBoundingClientRect()
    scoreText.classList.add('game-hud__score--up')
  }

  function updateTime() {
    const text = formatSeconds(loop.elapsedMs)

    if (timeText.textContent !== text) {
      timeText.textContent = text
    }
  }

  function showState(state: GameState) {
    element.dataset.state = state
    // The high scores screen shows nothing else but its Back button.
    bar.hidden = highScoresOpen
    highScoresOverlay.hidden = !highScoresOpen
    startOverlay.hidden = state !== 'ready' || highScoresOpen
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

  function showDifficulty() {
    difficultyButton.textContent = `Difficulty: ${DIFFICULTY_NAMES[mistakes.level]}`
    const failOn = MISTAKES_TO_FAIL[mistakes.level]
    failOnText.textContent = `Fail on ${failOn} ${failOn === 1 ? 'mistake' : 'mistakes'}`
  }

  function showPace() {
    paceButton.textContent = `Pace: ${PACE_NAMES[pace.pace]}`
  }

  /** How the round just over did among the high scores, and the name form if it made them. */
  function showRoundResult() {
    const round = highScores.lastRound
    const best = round && highScores.best(round.level, round.pace)
    let text = ''

    if (canSave(round)) {
      text = round.newBest ? 'New best score!' : `New high score: #${round.rank + 1}`
    } else if (round?.savedAs !== undefined) {
      text =
        round.rank === undefined
          ? 'No longer a high score'
          : `Saved: #${round.rank + 1} on ${settingsName(round.level, round.pace)}`
    } else if (best) {
      text = `Best score: ${best.score} by ${best.name}`
    }

    roundResultText.textContent = text
    roundResultText.hidden = text === ''
    const newBest = canSave(round) && round.newBest
    roundResultText.classList.toggle('game-hud__round-result--best', newBest)

    const asking = canSave(round)
    if (asking && nameForm.hidden) {
      // Suggest the name last saved, ready to change.
      nameInput.value = highScores.playerName
      updateSaveButton()
    }
    nameForm.hidden = !asking
  }

  function updateSaveButton() {
    saveButton.disabled = nameInput.value.trim() === ''
  }

  /** The high scores of the difficulty and pace chosen, best first. */
  function showHighScores() {
    const kept = highScores.table[mistakes.level][pace.pace]

    highScoresLevel.textContent = settingsName(mistakes.level, pace.pace)
    highScoresList.replaceChildren(
      ...kept.map(({ name, score: value }, rank) => {
        const item = document.createElement('li')
        const rankText = textElement('span', String(rank + 1), 'game-hud__high-score-rank')
        // The list already tells screen readers each one's place.
        rankText.setAttribute('aria-hidden', 'true')
        item.append(
          rankText,
          textElement('span', name, 'game-hud__high-score-name'),
          textElement('span', String(value), 'game-hud__high-score-score'),
        )
        return item
      }),
    )
    highScoresList.hidden = kept.length === 0
    noHighScoresText.hidden = kept.length !== 0
  }

  function setHighScoresOpen(open: boolean) {
    highScoresOpen = open

    if (open) {
      showHighScores()
    }
    showState(lifecycle.state)
    // Keyboard users stay where they are: on Back while open, then back on High scores.
    if (open) {
      backButton.focus()
    } else {
      highScoresButton.focus()
    }
  }

  function showMistakes(count: number) {
    mistakesText.textContent = `Mistakes: ${count}`
  }

  highScoresButton.addEventListener('click', () => setHighScoresOpen(true))
  backButton.addEventListener('click', () => setHighScoresOpen(false))
  highScoresOverlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setHighScoresOpen(false)
    }
  })

  nameInput.addEventListener('input', updateSaveButton)
  nameForm.addEventListener('submit', (event) => {
    event.preventDefault()

    if (!canSave(highScores.lastRound) || saveButton.disabled) {
      return
    }

    highScores.save(nameInput.value)
    // The form is gone: Restart is what comes next.
    findElement(
      element,
      '.game-hud__overlay--finished .game-hud__restart',
      HTMLButtonElement,
    ).focus()
  })

  difficultyButton.addEventListener('click', () => {
    mistakes.nextLevel()
    showDifficulty()
  })

  paceButton.addEventListener('click', () => {
    pace.next()
    showPace()
  })

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

  lifecycle.subscribe(({ state }) => {
    // A round starting (or the game stopping) closes the high scores.
    highScoresOpen = false
    showState(state)
  })
  highScores.subscribe(showRoundResult)
  score.subscribe((value, change) => {
    showScore(value)
    flashScore(change)
  })
  mistakes.subscribe(showMistakes)
  combo.subscribe(showCombo)
  showScore(score.value)
  showCombo()
  showMistakes(mistakes.count)
  showDifficulty()
  showPace()
  showState(lifecycle.state)

  return { element, updateTime, showSummary, showInstructions, setStartReady }
}
