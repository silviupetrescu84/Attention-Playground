// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { FakeStorage } from '../../test/fake-storage'
import { createCombo } from './combo'
import { findElement } from './dom'
import { GAME_HEIGHT, GAME_WIDTH } from './game-canvas'
import { createGameHud, formatSeconds, GAME_BAR_HEIGHT, PLAY_CENTRE } from './game-hud'
import { createGameLifecycle, isNewRound, type GameState } from './game-lifecycle'
import type { GameLoop } from './game-loop'
import gameCss from './game.css?raw'
import { createHighScores, highScoresKey, PLAYER_NAME_KEY, type HighScore } from './high-scores'
import { createMistakes } from './mistakes'
import { createPaceChoice } from './pace'
import { createScore } from './score'

/**
 * A HUD with everything it shows. The pace is Normal, chosen with the pace
 * button, unless `atFirstPace` (then Slow, as a game starts).
 */
function setup(storage = new FakeStorage(), { atFirstPace = false } = {}) {
  const screen = new AbortController()
  const lifecycle = createGameLifecycle({ signal: screen.signal })
  const loop = { elapsedMs: 0 } satisfies GameLoop
  // The real loop resets its time on start and restart; so does this one.
  lifecycle.subscribe((change) => {
    if (isNewRound(change)) loop.elapsedMs = 0
  })
  const mistakes = createMistakes({ lifecycle })
  const combo = createCombo({ lifecycle, mistakes })
  const score = createScore({ lifecycle, combo })
  const pace = createPaceChoice({ lifecycle })
  const highScores = createHighScores({
    gameId: 'test-game',
    lifecycle,
    score,
    mistakes,
    pace,
    storage,
  })
  const stage = document.createElement('div')
  const hud = createGameHud(stage, { lifecycle, loop, score, combo, mistakes, pace, highScores })

  const visible = (element: Element) => !element.closest('[hidden]')
  const ui = {
    score: findElement(hud.element, '.game-hud__score', HTMLElement),
    combo: findElement(hud.element, '.game-hud__combo', HTMLElement),
    time: findElement(hud.element, '.game-hud__time', HTMLElement),
    pause: findElement(hud.element, '.game-hud__pause', HTMLButtonElement),
    start: findElement(hud.element, '.game-hud__start', HTMLButtonElement),
    difficulty: findElement(hud.element, '.game-hud__difficulty', HTMLButtonElement),
    pace: findElement(hud.element, '.game-hud__pace', HTMLButtonElement),
    failOn: findElement(hud.element, '.game-hud__fail-on', HTMLElement),
    mistakes: findElement(hud.element, '.game-hud__mistakes', HTMLElement),
    startOverlay: findElement(hud.element, '.game-hud__overlay--start', HTMLElement),
    pausedOverlay: findElement(hud.element, '.game-hud__overlay--paused', HTMLElement),
    finishedOverlay: findElement(hud.element, '.game-hud__overlay--finished', HTMLElement),
    pausedRestart: findElement(
      hud.element,
      '.game-hud__overlay--paused .game-hud__restart',
      HTMLButtonElement,
    ),
    finishedRestart: findElement(
      hud.element,
      '.game-hud__overlay--finished .game-hud__restart',
      HTMLButtonElement,
    ),
    finalScore: findElement(hud.element, '.game-hud__final-score', HTMLElement),
    instructions: findElement(hud.element, '.game-hud__instructions', HTMLElement),
    summary: findElement(hud.element, '.game-hud__summary', HTMLElement),
    bar: findElement(hud.element, '.game-hud__bar', HTMLElement),
    roundResult: findElement(hud.element, '.game-hud__round-result', HTMLElement),
    nameForm: findElement(hud.element, '.game-hud__name-form', HTMLFormElement),
    name: findElement(hud.element, '.game-hud__name', HTMLInputElement),
    save: findElement(hud.element, '.game-hud__save', HTMLButtonElement),
    highScoresOpen: findElement(hud.element, '.game-hud__high-scores-open', HTMLButtonElement),
    highScoresOverlay: findElement(hud.element, '.game-hud__overlay--high-scores', HTMLElement),
    highScoresLevel: findElement(hud.element, '.game-hud__high-scores-level', HTMLElement),
    highScoresList: findElement(hud.element, '.game-hud__high-scores', HTMLElement),
    noHighScores: findElement(hud.element, '.game-hud__no-high-scores', HTMLElement),
    back: findElement(hud.element, '.game-hud__back', HTMLButtonElement),
  }

  while (!atFirstPace && pace.pace !== 'normal') ui.pace.click()

  /** Which of the big pieces are visible. */
  function shown() {
    return {
      start: visible(ui.start),
      pause: visible(ui.pause),
      paused: visible(ui.pausedOverlay),
      finished: visible(ui.finishedOverlay),
      score: visible(ui.score),
      time: visible(ui.time),
    }
  }

  return {
    screen,
    lifecycle,
    loop,
    score,
    combo,
    mistakes,
    pace,
    highScores,
    stage,
    hud,
    ui,
    shown,
    visible,
  }
}

describe('formatSeconds', () => {
  it.each([
    [0, '00'],
    [999, '00'],
    [1_000, '01'],
    [9_999, '09'],
    [10_000, '10'],
    [59_999, '59'],
    [60_000, '60'],
    [125_000, '125'],
  ])('shows %s ms as %s', (ms, text) => {
    expect(formatSeconds(ms)).toBe(text)
  })
})

describe('game HUD layout', () => {
  it('has a 64 px bar across the top, and tells the CSS its height', () => {
    const { hud } = setup()

    expect(GAME_BAR_HEIGHT).toBe(64)
    // What games are about goes in the middle of the rest of the canvas.
    expect(PLAY_CENTRE).toEqual({ x: GAME_WIDTH / 2, y: (64 + GAME_HEIGHT) / 2 })
    expect(hud.element.style.getPropertyValue('--game-bar-height')).toBe('64px')
  })

  it('takes its sizes from the game instead of repeating them in the CSS', () => {
    const ruleFor = (selector: string) =>
      new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(gameCss)![1]

    expect(ruleFor('.game-hud')).toMatch(/width: var\(--game-width\);/)
    expect(ruleFor('.game-hud')).toMatch(/height: var\(--game-height\);/)
    expect(ruleFor('.game-hud__bar')).toMatch(/height: var\(--game-bar-height\);/)
    expect(gameCss).not.toMatch(/\b(400|800|64)px\b/)
  })
})

describe('game HUD', () => {
  it('is added to the stage', () => {
    const { stage, hud } = setup()

    expect(hud.element.parentElement).toBe(stage)
  })

  it.each<[GameState, string[], ReturnType<ReturnType<typeof setup>['shown']>]>([
    [
      'ready',
      [],
      { start: true, pause: false, paused: false, finished: false, score: true, time: true },
    ],
    [
      'playing',
      ['start'],
      { start: false, pause: true, paused: false, finished: false, score: true, time: true },
    ],
    [
      'paused',
      ['start', 'pause'],
      { start: false, pause: true, paused: true, finished: false, score: true, time: true },
    ],
    [
      'finished',
      ['start', 'finish'],
      { start: false, pause: false, paused: false, finished: true, score: true, time: true },
    ],
  ])('shows the right pieces when %s', (state, actions, expected) => {
    const { lifecycle, shown, hud } = setup()

    for (const action of actions) {
      lifecycle[action as 'start']()
    }

    expect(lifecycle.state).toBe(state)
    expect(shown()).toEqual(expected)
    expect(hud.element.dataset.state).toBe(state)
  })

  it('disables Start and shows "Loading…" until the game is ready', () => {
    const { lifecycle, hud, ui } = setup()
    expect(ui.start.disabled).toBe(false)
    expect(ui.start.textContent).toBe('Start')

    hud.setStartReady(false)
    expect(ui.start.disabled).toBe(true)
    expect(ui.start.textContent).toBe('Loading…')
    ui.start.click()
    expect(lifecycle.state).toBe('ready')

    hud.setStartReady(true)
    expect(ui.start.disabled).toBe(false)
    expect(ui.start.textContent).toBe('Start')
    ui.start.click()
    expect(lifecycle.state).toBe('playing')
  })

  it('shows the difficulty, Easy at first, under the Start button', () => {
    const { ui } = setup()

    expect(ui.difficulty.textContent).toBe('Difficulty: Easy')
    expect(ui.difficulty.parentElement).toBe(ui.startOverlay)
    expect(ui.start.nextElementSibling).toBe(ui.difficulty)
  })

  it('shows the pace, Slow at first, under the difficulty', () => {
    const { ui } = setup(undefined, { atFirstPace: true })

    expect(ui.pace.textContent).toBe('Pace: Slow')
    expect(ui.difficulty.nextElementSibling).toBe(ui.pace)
  })

  it('picks the next pace with each press: Slow, Normal, Fast, and Slow again', () => {
    const { ui, pace } = setup(undefined, { atFirstPace: true })
    const shown = [ui.pace.textContent]

    for (let i = 0; i < 3; i++) {
      ui.pace.click()
      shown.push(ui.pace.textContent)
    }

    expect(shown).toEqual(['Pace: Slow', 'Pace: Normal', 'Pace: Fast', 'Pace: Slow'])
    expect(pace.pace).toBe('slow')
  })

  it('keeps the pace chosen for the next rounds, and only lets it change before one', () => {
    const { ui, lifecycle, pace } = setup()
    ui.pace.click()

    lifecycle.start()
    expect(ui.pace.closest('[hidden]')).not.toBeNull()
    expect(() => pace.next()).toThrow('Cannot change the pace of a game that is playing')
    lifecycle.pause()
    lifecycle.restart()

    expect(ui.pace.textContent).toBe('Pace: Fast')
  })

  it('shows under the pace how many mistakes fail the round', () => {
    const { ui } = setup()
    const failOn = [ui.failOn.textContent]

    for (let i = 0; i < 3; i++) {
      ui.difficulty.click()
      failOn.push(ui.failOn.textContent)
    }

    expect(ui.pace.nextElementSibling).toBe(ui.failOn)
    expect(failOn).toEqual([
      'Fail on 10 mistakes',
      'Fail on 6 mistakes',
      'Fail on 3 mistakes',
      'Fail on 1 mistake',
    ])
  })

  it.each([0, 1, 2, 3])(
    'counts up to the number shown under the difficulty when the round fails (%i presses)',
    (presses) => {
      const { lifecycle, mistakes, ui } = setup()
      for (let i = 0; i < presses; i++) ui.difficulty.click()
      const failOn = Number(/\d+/.exec(ui.failOn.textContent)![0])
      ui.start.click()

      // More mistakes than needed: the ones after the round fails do not count.
      for (let i = 0; i < failOn + 5; i++) mistakes.add()

      expect(lifecycle.state).toBe('finished')
      expect(ui.mistakes.textContent).toBe(`Mistakes: ${failOn}`)
    },
  )

  it('shows "Mistakes: x" in the top bar, as they happen and back to 0 for a new round', () => {
    const { lifecycle, mistakes, ui } = setup()
    expect(ui.mistakes.textContent).toBe('Mistakes: 0')
    expect(ui.mistakes.parentElement).toBe(ui.bar)
    expect(ui.bar.contains(ui.score)).toBe(true)
    ui.start.click()

    mistakes.add()
    mistakes.add()
    expect(ui.mistakes.textContent).toBe('Mistakes: 2')

    lifecycle.pause()
    lifecycle.restart()
    expect(ui.mistakes.textContent).toBe('Mistakes: 0')
  })

  it('picks the next difficulty on each press, then starts again from Easy', () => {
    const { mistakes, ui } = setup()
    const shownNames: string[] = []

    for (let i = 0; i < 4; i++) {
      ui.difficulty.click()
      shownNames.push(ui.difficulty.textContent)
    }

    expect(shownNames).toEqual([
      'Difficulty: Medium',
      'Difficulty: Hard',
      'Difficulty: Extreme',
      'Difficulty: Easy',
    ])
    expect(mistakes.level).toBe('easy')
  })

  it('shows the difficulty only before a round, and keeps it for the next one', () => {
    const { lifecycle, ui } = setup()
    ui.difficulty.click()
    ui.start.click()
    const hidden = () => ui.difficulty.closest('[hidden]') !== null

    expect(hidden()).toBe(true)
    lifecycle.pause()
    expect(hidden()).toBe(true)
    lifecycle.resume()
    lifecycle.finish()
    expect(hidden()).toBe(true)

    ui.finishedRestart.click()
    expect(hidden()).toBe(false)
    expect(ui.difficulty.textContent).toBe('Difficulty: Medium')
  })

  it('starts the game with the Start button', () => {
    const { lifecycle, ui } = setup()

    ui.start.click()

    expect(lifecycle.state).toBe('playing')
  })

  it('pauses with the Pause button, which then becomes a Resume button', () => {
    const { lifecycle, ui } = setup()
    ui.start.click()
    expect(ui.pause.getAttribute('aria-label')).toBe('Pause')
    const pauseIcon = ui.pause.innerHTML

    ui.pause.click()

    expect(lifecycle.state).toBe('paused')
    expect(ui.pause.getAttribute('aria-label')).toBe('Resume')
    expect(ui.pause.innerHTML).not.toBe(pauseIcon)

    ui.pause.click()

    expect(lifecycle.state).toBe('playing')
    expect(ui.pause.getAttribute('aria-label')).toBe('Pause')
    expect(ui.pause.innerHTML).toBe(pauseIcon)
  })

  it('goes back to the Start button with Restart from the pause screen', () => {
    const { lifecycle, ui, shown } = setup()
    ui.start.click()
    ui.pause.click()

    ui.pausedRestart.click()

    expect(lifecycle.state).toBe('ready')
    expect(shown().start).toBe(true)
  })

  it('goes back to the Start button with Restart from the finished screen', () => {
    const { lifecycle, ui, shown } = setup()
    ui.start.click()
    lifecycle.finish()

    ui.finishedRestart.click()

    expect(lifecycle.state).toBe('ready')
    expect(shown().start).toBe(true)
  })

  it('shows the score as "Score: x", updating as it changes', () => {
    const { score, ui } = setup()
    expect(ui.score.textContent).toBe('Score: 0')

    ui.start.click()
    score.add(3)
    expect(ui.score.textContent).toBe('Score: 3')

    score.add(2)
    expect(ui.score.textContent).toBe('Score: 5')
  })

  it('flashes the top score green every time points are won', () => {
    const { score, ui } = setup()
    ui.start.click()
    const classes = () =>
      [...ui.score.classList].filter((name) => name.startsWith('game-hud__score--'))
    expect(classes()).toEqual([])

    score.add(1)
    expect(classes()).toEqual(['game-hud__score--up'])

    // Taken off and put back, so the flash plays again.
    const removed: string[] = []
    const remove = ui.score.classList.remove.bind(ui.score.classList)
    ui.score.classList.remove = (...names: string[]) => {
      removed.push(...names)
      remove(...names)
    }
    score.add(5)
    expect(removed).toEqual(['game-hud__score--up'])
    expect(classes()).toEqual(['game-hud__score--up'])
  })

  it('does not flash when the score goes back to 0 for a new round', () => {
    const { lifecycle, score, ui } = setup()
    ui.start.click()
    score.add(3)
    lifecycle.pause()

    lifecycle.restart()

    expect(ui.score.className).toBe('game-hud__score')
  })

  it('never colours the score on the finished screen', () => {
    const { lifecycle, score, ui } = setup()
    ui.start.click()
    score.add(1)
    score.add(3)

    lifecycle.finish()

    expect(ui.finalScore.className).toBe('game-hud__final-score')
  })

  it('shows the final score when finished', () => {
    const { lifecycle, score, ui } = setup()
    ui.start.click()
    score.add(7)

    lifecycle.finish()

    expect(ui.finalScore.textContent).toBe('Score: 7')
    expect(ui.finishedOverlay.textContent).toContain('Game over')
  })

  it('shows the instructions on a card under the difficulty, whenever Start is shown', () => {
    const { lifecycle, hud, ui } = setup()
    const paragraphs = () => [...ui.instructions.querySelectorAll('p')].map((p) => p.textContent)
    const seen = () => !ui.instructions.closest('[hidden]')

    hud.showInstructions(['Choose the good ones.', 'Let the bad ones go.'])

    expect(seen()).toBe(true)
    expect(paragraphs()).toEqual(['Choose the good ones.', 'Let the bad ones go.'])
    // Start, the difficulty and pace, what it fails on and the high scores, then the instructions.
    expect([...ui.startOverlay.children]).toEqual([
      ui.start,
      ui.difficulty,
      ui.pace,
      ui.failOn,
      ui.highScoresOpen,
      ui.instructions,
    ])

    ui.start.click()
    expect(seen()).toBe(false)
    lifecycle.pause()
    expect(seen()).toBe(false)
    lifecycle.restart()
    expect(seen()).toBe(true)
    ui.start.click()
    lifecycle.finish()
    expect(seen()).toBe(false)
    ui.finishedRestart.click()
    expect(seen()).toBe(true)
    expect(paragraphs()).toEqual(['Choose the good ones.', 'Let the bad ones go.'])
  })

  it('hides the instructions card when there are none, and replaces old ones', () => {
    const { hud, ui } = setup()
    expect(ui.instructions.hidden).toBe(true)

    hud.showInstructions(['A'])
    hud.showInstructions(['B', 'C'])
    expect(ui.instructions.textContent).toBe('BC')

    hud.showInstructions([])
    expect(ui.instructions.hidden).toBe(true)
    expect(ui.instructions.children).toHaveLength(0)
  })

  it('shows instructions as plain text', () => {
    const { hud, ui } = setup()

    hud.showInstructions(['<img src=x onerror=alert(1)>'])

    expect(ui.instructions.querySelector('img')).toBeNull()
    expect(ui.instructions.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('puts the Start button 28% of the way down, and the rest under it', () => {
    const rule = /\.game-hud__overlay--start\s*\{([^}]*)\}/.exec(gameCss)![1]

    expect(rule).toMatch(/justify-content: flex-start;/)
    expect(rule).toMatch(/padding-top: calc\(var\(--game-height\) \* 0\.28\);/)
  })

  it('writes the instructions on the same white card, in the same font, as the summary', () => {
    const { ui } = setup()
    const ruleFor = (selector: string) =>
      new RegExp(`(^|\n)${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`).exec(gameCss)![2]

    expect(ui.instructions.classList).toContain('game-hud__card')
    expect(ui.summary.classList).toContain('game-hud__card')
    const card = ruleFor('.game-hud__card')
    expect(card).toMatch(/background: rgb\(255 255 255 \/ 92%\);/)
    expect(card).toMatch(/color: var\(--color-ink\);/)
    expect(card).toMatch(/font-size: 18px;/)
    // The instructions in the weight of the summary's labels.
    expect(ruleFor('.game-hud__summary dt,\n.game-hud__instructions')).toMatch(/font-weight: 600;/)
  })

  it('shows a game summary on the finished screen', () => {
    const { lifecycle, hud, ui } = setup()
    ui.start.click()

    hud.showSummary([
      { label: 'Good emotions tapped', value: 12 },
      { label: 'Bad emotions let go', value: 3 },
    ])
    lifecycle.finish()

    const list = ui.finishedOverlay.querySelector<HTMLElement>('.game-hud__summary')!
    expect(list.hidden).toBe(false)
    expect(list.tagName).toBe('DL')
    expect([...list.querySelectorAll('dt')].map((e) => e.textContent)).toEqual([
      'Good emotions tapped',
      'Bad emotions let go',
    ])
    expect([...list.querySelectorAll('dd')].map((e) => e.textContent)).toEqual(['12', '3'])
  })

  it('hides the summary when there is none, and replaces an old one', () => {
    const { hud, ui } = setup()
    const list = ui.finishedOverlay.querySelector<HTMLElement>('.game-hud__summary')!
    expect(list.hidden).toBe(true)

    hud.showSummary([{ label: 'A', value: 1 }])
    hud.showSummary([{ label: 'B', value: 2 }])
    expect(list.textContent).toBe('B2')

    hud.showSummary([])
    expect(list.hidden).toBe(true)
    expect(list.children).toHaveLength(0)
  })

  it('shows summary labels as plain text', () => {
    const { hud, ui } = setup()

    hud.showSummary([{ label: '<img src=x onerror=alert(1)>', value: '<b>1</b>' }])

    const list = ui.finishedOverlay.querySelector('.game-hud__summary')!
    expect(list.querySelector('img, b')).toBeNull()
    expect(list.textContent).toBe('<img src=x onerror=alert(1)><b>1</b>')
  })

  it('shows the time in whole seconds with no label', () => {
    const { loop, hud, ui } = setup()
    expect(ui.time.textContent).toBe('00')

    ui.start.click()
    for (const [ms, text] of [
      [500, '00'],
      [1_000, '01'],
      [12_300, '12'],
    ] as const) {
      loop.elapsedMs = ms
      hud.updateTime()
      expect(ui.time.textContent).toBe(text)
    }
  })

  it('keeps showing the score and time while paused', () => {
    const { loop, score, hud, ui } = setup()
    ui.start.click()
    score.add(2)
    loop.elapsedMs = 5_000
    hud.updateTime()

    ui.pause.click()

    expect(ui.score.textContent).toBe('Score: 2')
    expect(ui.time.textContent).toBe('05')
  })

  it('shows 00 and Score: 0 again after restart', () => {
    const { loop, score, hud, ui } = setup()
    ui.start.click()
    score.add(4)
    loop.elapsedMs = 8_000
    hud.updateTime()
    ui.pause.click()

    ui.pausedRestart.click()

    expect(ui.time.textContent).toBe('00')
    expect(ui.score.textContent).toBe('Score: 0')
  })

  it('ignores buttons once the game has been stopped', () => {
    const { screen, lifecycle, ui } = setup()
    ui.start.click()
    screen.abort()

    expect(() => {
      ui.pause.click()
      ui.pausedRestart.click()
      ui.start.click()
    }).not.toThrow()
    expect(lifecycle.state).toBe('paused')
  })

  it('uses real buttons', () => {
    const { ui } = setup()

    for (const button of [
      ui.difficulty,
      ui.start,
      ui.pause,
      ui.pausedRestart,
      ui.finishedRestart,
      ui.highScoresOpen,
      ui.back,
    ]) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.type).toBe('button')
    }
  })
})

/** A storage with `easy` (and `other` difficulties') high scores saved for the HUD's game. */
/** A storage with `saved` high scores for each difficulty, at the Normal pace. */
function storageWith(saved: Partial<Record<string, HighScore[]>>, playerName?: string) {
  const storage = new FakeStorage()
  const atNormal = Object.fromEntries(
    Object.entries(saved).map(([level, kept]) => [level, { normal: kept }]),
  )
  storage.setItem(highScoresKey('test-game'), JSON.stringify(atNormal))
  if (playerName !== undefined) storage.setItem(PLAYER_NAME_KEY, playerName)
  return storage
}

/** Plays a round ending on `points`. */
function playRound({ lifecycle, score }: ReturnType<typeof setup>, points: number) {
  if (lifecycle.state === 'finished') lifecycle.restart()
  lifecycle.start()
  score.add(points)
  lifecycle.finish()
}

/** Types `name` in the name field, as the player does. */
function typeName(ui: ReturnType<typeof setup>['ui'], name: string) {
  ui.name.value = name
  ui.name.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Saves with the Save button (submitting the form, as the browser does). */
function clickSave(ui: ReturnType<typeof setup>['ui']) {
  ui.nameForm.requestSubmit(ui.save)
}

describe('the combo', () => {
  it('shows X1 before the score, from the start', () => {
    const { ui } = setup()

    expect(ui.combo.textContent).toBe('X1')
    expect(ui.combo.dataset.multiplier).toBe('1')
    expect(ui.combo.nextElementSibling).toBe(ui.score)
  })

  it('colours each multiplier softly, warming up to X5: light ink, green, yellow, orange, red', () => {
    const rule = /\.game-hud__combo \{([^}]*)\}/.exec(gameCss)![1]
    expect(rule).toContain('color: var(--color-ink);')
    expect(rule).toContain('background: var(--combo-x1);')
    for (const multiplier of [2, 3, 4, 5]) {
      expect(gameCss).toContain(
        `.game-hud__combo[data-multiplier='${multiplier}'] {\n  background: var(--combo-x${multiplier});`,
      )
    }
    expect([1, 2, 3, 4, 5].map((multiplier) => cssVariables.get(`--combo-x${multiplier}`))).toEqual(
      [
        'color-mix(in srgb, var(--color-ink) 12%, white)',
        '#8fd6a3',
        '#f7dc6f',
        '#f5b27a',
        '#f19a94',
      ],
    )
  })

  it('shows the multiplier as it goes up, and the points it adds', () => {
    const { lifecycle, score, ui } = setup()
    lifecycle.start()

    for (let i = 0; i < 5; i++) score.add(1)
    expect([ui.combo.textContent, ui.score.textContent]).toEqual(['X2', 'Score: 5'])
    score.add(1)

    expect([ui.combo.textContent, ui.score.textContent]).toEqual(['X2', 'Score: 7'])
    expect(ui.combo.dataset.multiplier).toBe('2')
  })

  it('goes back to X1 after a mistake, and for a new round', () => {
    const { lifecycle, score, mistakes, ui } = setup()
    lifecycle.start()
    for (let i = 0; i < 5; i++) score.add(1)

    mistakes.add()
    expect(ui.combo.textContent).toBe('X1')

    for (let i = 0; i < 5; i++) score.add(1)
    lifecycle.pause()
    lifecycle.restart()
    expect(ui.combo.textContent).toBe('X1')
  })
})

describe('high scores screen', () => {
  /** The high scores shown, as [rank, name, score]. */
  function listed(ui: ReturnType<typeof setup>['ui']) {
    return [...ui.highScoresList.querySelectorAll('li')].map((item) =>
      [...item.children].map((part) => part.textContent),
    )
  }

  it('opens with a High scores button under what the round fails on', () => {
    const { ui, visible } = setup()

    expect(ui.failOn.nextElementSibling).toBe(ui.highScoresOpen)
    expect(ui.highScoresOpen.textContent).toBe('High scores')
    expect(visible(ui.highScoresOpen)).toBe(true)
    expect(visible(ui.highScoresOverlay)).toBe(false)
  })

  it('shows nothing but the high scores and a Back button', () => {
    const { hud, ui, visible } = setup()
    document.body.append(hud.element)

    ui.highScoresOpen.click()

    // Of everything in the HUD, only the high scores screen is left: no
    // score, mistakes or time, and nothing from the Start button's screen.
    expect([...hud.element.children].filter((child) => visible(child))).toEqual([
      ui.highScoresOverlay,
    ])
    expect(visible(ui.back)).toBe(true)
    expect(ui.back.textContent).toBe('Back')
    expect(ui.highScoresOverlay.getAttribute('role')).toBe('dialog')
    expect(ui.highScoresOverlay.getAttribute('aria-label')).toBe('High scores')
    expect(document.activeElement).toBe(ui.back)
    expect(ui.highScoresOverlay.querySelectorAll('button')).toHaveLength(1)
    hud.element.remove()
  })

  it('is on the canvas background, over the top bar and the game', () => {
    // Every rule for `selector` on its own (not in a list of selectors), joined.
    const rules = (selector: string) =>
      [
        ...gameCss.matchAll(
          new RegExp(`(^|\n)${selector.replace(/\./g, '\\.')} \\{([^}]*)\\}`, 'g'),
        ),
      ]
        .map((match) => match[2])
        .join('')

    expect(rules('.game-canvas,\n.game-hud__overlay--high-scores')).toMatch(
      /background: #fff url\('..\/..\/assets\/background\/canvas-background.png'\)/,
    )
    expect(rules('.game-hud__overlay--high-scores')).toMatch(/z-index: 3;/)
    expect(rules('.game-hud__bar')).toMatch(/z-index: 2;/)
  })

  it('goes back to the Start button with Back', () => {
    const { hud, ui, visible } = setup()
    document.body.append(hud.element)
    ui.highScoresOpen.click()

    ui.back.click()

    expect(visible(ui.highScoresOverlay)).toBe(false)
    expect(visible(ui.startOverlay)).toBe(true)
    expect(visible(ui.bar)).toBe(true)
    expect(document.activeElement).toBe(ui.highScoresOpen)
    hud.element.remove()
  })

  it('goes back with Escape too', () => {
    const { ui, visible } = setup()
    ui.highScoresOpen.click()

    ui.back.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(visible(ui.highScoresOverlay)).toBe(true)

    ui.back.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(visible(ui.startOverlay)).toBe(true)
  })

  it('shows the names and scores of the difficulty chosen, best first', () => {
    const { ui } = setup(
      storageWith({
        easy: [
          { name: 'Ana', score: 4 },
          { name: 'Bo', score: 12 },
        ],
        hard: [{ name: 'Cy', score: 3 }],
      }),
    )

    ui.highScoresOpen.click()
    expect(ui.highScoresLevel.textContent).toBe('Easy · Normal')
    expect(listed(ui)).toEqual([
      ['1', 'Bo', '12'],
      ['2', 'Ana', '4'],
    ])

    ui.back.click()
    ui.difficulty.click()
    ui.difficulty.click()
    ui.highScoresOpen.click()
    expect(ui.highScoresLevel.textContent).toBe('Hard · Normal')
    expect(listed(ui)).toEqual([['1', 'Cy', '3']])
  })

  it('shows the high scores of the pace chosen, naming it with the difficulty', () => {
    const storage = new FakeStorage()
    const saved = {
      easy: { normal: [{ name: 'Ana', score: 4 }], slow: [{ name: 'Bo', score: 9 }] },
    }
    storage.setItem(highScoresKey('test-game'), JSON.stringify(saved))
    const { ui } = setup(storage)

    ui.highScoresOpen.click()
    expect(ui.highScoresLevel.textContent).toBe('Easy · Normal')
    expect(listed(ui)).toEqual([['1', 'Ana', '4']])

    ui.back.click()
    ui.pace.click()
    ui.highScoresOpen.click()
    expect(ui.highScoresLevel.textContent).toBe('Easy · Fast')
    expect(ui.noHighScores.hidden).toBe(false)

    ui.back.click()
    ui.pace.click()
    ui.highScoresOpen.click()
    expect(ui.highScoresLevel.textContent).toBe('Easy · Slow')
    expect(listed(ui)).toEqual([['1', 'Bo', '9']])
  })

  it('shows the 10 best', () => {
    const easy = Array.from({ length: 12 }, (_, i) => ({ name: `P${i}`, score: i + 1 }))
    const { ui } = setup(storageWith({ easy }))

    ui.highScoresOpen.click()

    expect(ui.highScoresList.tagName).toBe('OL')
    expect(listed(ui).map(([rank, , score]) => [rank, score])).toEqual(
      Array.from({ length: 10 }, (_, i) => [String(i + 1), String(12 - i)]),
    )
  })

  it('leaves the ranks to the list for screen readers', () => {
    const { ui } = setup(storageWith({ easy: [{ name: 'Ana', score: 4 }] }))

    ui.highScoresOpen.click()

    expect(ui.highScoresList.querySelector('li > :first-child')!.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('says so when the difficulty chosen has no high scores yet', () => {
    const { ui, visible } = setup(storageWith({ medium: [{ name: 'Ana', score: 4 }] }))

    ui.highScoresOpen.click()
    expect(visible(ui.noHighScores)).toBe(true)
    expect(ui.noHighScores.textContent).toBe('No high scores yet')
    expect(visible(ui.highScoresList)).toBe(false)

    ui.back.click()
    ui.difficulty.click()
    ui.highScoresOpen.click()
    expect(visible(ui.noHighScores)).toBe(false)
    expect(visible(ui.highScoresList)).toBe(true)
  })

  it('shows names as plain text', () => {
    const { ui } = setup(storageWith({ easy: [{ name: '<img src=x>', score: 4 }] }))

    ui.highScoresOpen.click()

    expect(ui.highScoresList.querySelector('img')).toBeNull()
    expect(listed(ui)).toEqual([['1', '<img src=x>', '4']])
  })

  it('shows a high score saved after a round', () => {
    const played = setup()
    const { ui } = played
    playRound(played, 6)
    typeName(ui, 'Ana')
    clickSave(ui)
    ui.finishedRestart.click()

    ui.highScoresOpen.click()

    expect(listed(ui)).toEqual([['1', 'Ana', '6']])
  })

  it('closes when the game moves on', () => {
    const { lifecycle, ui, visible } = setup()
    ui.highScoresOpen.click()

    lifecycle.start()

    expect(visible(ui.highScoresOverlay)).toBe(false)
    expect(visible(ui.bar)).toBe(true)
  })
})

describe('saving a high score at game over', () => {
  it('compares a round with the high scores of its own difficulty and pace only', () => {
    const played = setup(storageWith({ easy: [{ name: 'Ana', score: 12 }] }))
    played.ui.pace.click()

    playRound(played, 1)

    expect(played.ui.roundResult.textContent).toBe('New best score!')
  })

  it('asks for a name under the final score when the round beat every high score', () => {
    const played = setup()
    const { ui, visible } = played

    playRound(played, 5)

    expect(ui.finalScore.nextElementSibling).toBe(ui.roundResult)
    expect(ui.roundResult.nextElementSibling).toBe(ui.nameForm)
    expect(ui.roundResult.textContent).toBe('New best score!')
    expect(ui.roundResult.classList).toContain('game-hud__round-result--best')
    expect(visible(ui.nameForm)).toBe(true)
    expect(ui.nameForm.textContent).toContain('Your name')
    expect(ui.name.labels![0]).toBe(ui.name.closest('label'))
    expect(ui.name.maxLength).toBe(16)
    expect(ui.save.textContent).toBe('Save')
  })

  it('asks for a name when the round makes the 10 best, telling where', () => {
    const played = setup(storageWith({ easy: [{ name: 'Ana', score: 9 }] }))
    const { ui, visible } = played

    playRound(played, 4)

    expect(ui.roundResult.textContent).toBe('New high score: #2')
    expect(ui.roundResult.classList).not.toContain('game-hud__round-result--best')
    expect(visible(ui.nameForm)).toBe(true)
  })

  it('suggests the name last saved, or none the first time', () => {
    const first = setup()
    playRound(first, 5)
    expect(first.ui.name.value).toBe('')
    expect(first.ui.save.disabled).toBe(true)

    const again = setup(storageWith({}, 'Ana'))
    playRound(again, 5)
    expect(again.ui.name.value).toBe('Ana')
    expect(again.ui.save.disabled).toBe(false)
  })

  it('saves under the name typed, and says where it went', () => {
    const played = setup(storageWith({ easy: [{ name: 'Ana', score: 9 }] }))
    const { hud, highScores, ui, visible } = played
    document.body.append(hud.element)
    playRound(played, 4)

    typeName(ui, '  Bo  ')
    clickSave(ui)

    expect(highScores.table.easy.normal).toEqual([
      { name: 'Ana', score: 9 },
      { name: 'Bo', score: 4 },
    ])
    expect(ui.roundResult.textContent).toBe('Saved: #2 on Easy · Normal')
    expect(visible(ui.nameForm)).toBe(false)
    // The form is gone: Restart is next.
    expect(document.activeElement).toBe(ui.finishedRestart)
    hud.element.remove()
  })

  it('only lets a name be saved once one is typed', () => {
    const played = setup()
    const { highScores, ui } = played
    playRound(played, 5)

    typeName(ui, '   ')
    expect(ui.save.disabled).toBe(true)
    // Enter in the field, with Save disabled.
    ui.nameForm.requestSubmit()
    expect(highScores.lastRound?.savedAs).toBeUndefined()

    typeName(ui, 'A')
    expect(ui.save.disabled).toBe(false)
  })

  it('saves only once', () => {
    const played = setup()
    const { highScores, ui } = played
    playRound(played, 5)
    typeName(ui, 'Ana')
    clickSave(ui)

    expect(() => ui.nameForm.requestSubmit()).not.toThrow()

    expect(highScores.table.easy.normal).toHaveLength(1)
  })

  it('suggests the name just saved for the next high score', () => {
    const played = setup()
    const { ui } = played
    playRound(played, 5)
    typeName(ui, 'Ana')
    clickSave(ui)

    playRound(played, 7)

    expect(ui.name.value).toBe('Ana')
  })

  it('does not keep a round the player did not save', () => {
    const played = setup()
    const { highScores, ui, visible } = played
    playRound(played, 5)
    typeName(ui, 'Ana')

    ui.finishedRestart.click()
    playRound(played, 0)

    expect(highScores.table.easy.normal).toEqual([])
    expect(visible(ui.nameForm)).toBe(false)
    expect(visible(ui.roundResult)).toBe(false)
  })

  it.each([0, 2])(
    'shows the best score instead when the round does not make the high scores (%i)',
    (points) => {
      const played = setup(
        storageWith({
          easy: Array.from({ length: 10 }, (_, i) => ({
            name: i ? `P${i}` : 'Ana',
            score: 12 - i,
          })),
        }),
      )
      const { ui, visible } = played

      playRound(played, points)

      expect(ui.roundResult.textContent).toBe('Best score: 12 by Ana')
      expect(visible(ui.nameForm)).toBe(false)
    },
  )

  it('shows nothing about high scores for a round under 1 point when there are none', () => {
    const played = setup()
    const { ui, visible } = played

    playRound(played, 0)

    expect(visible(ui.roundResult)).toBe(false)
    expect(visible(ui.nameForm)).toBe(false)
  })

  it('tells when another tab took the place before it was saved', () => {
    const full = Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, score: 20 - i }))
    const storage = storageWith({ easy: full })
    const played = setup(storage)
    const { ui } = played
    playRound(played, 3)
    storage.setItem(
      highScoresKey('test-game'),
      JSON.stringify({ easy: { normal: [...full, { name: 'Other tab', score: 10 }] } }),
    )

    typeName(ui, 'Ana')
    clickSave(ui)

    expect(ui.roundResult.textContent).toBe('No longer a high score')
  })

  it('shows names typed as plain text', () => {
    const played = setup()
    const { ui } = played
    playRound(played, 5)
    typeName(ui, '<b>Ana</b>')
    clickSave(ui)
    played.lifecycle.restart()
    playRound(played, 1)

    expect(ui.roundResult.textContent).toBe('New high score: #2')
    ui.finishedRestart.click()
    ui.highScoresOpen.click()
    expect(ui.highScoresList.querySelector('b')).toBeNull()
  })
})
