// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import gameCss from './game.css?raw'
import { createGameHud, formatSeconds, GAME_BAR_HEIGHT } from './game-hud'
import { createGameLifecycle, isNewRound, type GameState } from './game-lifecycle'
import type { GameLoop } from './game-loop'
import { createMistakes } from './mistakes'
import { createScore } from './score'

function setup() {
  const screen = new AbortController()
  const lifecycle = createGameLifecycle({ signal: screen.signal })
  const loop = { elapsedMs: 0 } satisfies GameLoop
  // The real loop resets its time on start and restart; so does this one.
  lifecycle.subscribe((change) => {
    if (isNewRound(change)) loop.elapsedMs = 0
  })
  const score = createScore({ lifecycle })
  const mistakes = createMistakes({ lifecycle })
  const stage = document.createElement('div')
  const hud = createGameHud(stage, { lifecycle, loop, score, mistakes })

  const get = <T extends HTMLElement = HTMLElement>(selector: string) =>
    hud.element.querySelector<T>(selector)!
  const visible = (element: HTMLElement) => !element.closest('[hidden]')
  const ui = {
    score: get('.game-hud__score'),
    time: get('.game-hud__time'),
    pause: get<HTMLButtonElement>('.game-hud__pause'),
    start: get<HTMLButtonElement>('.game-hud__start'),
    difficulty: get<HTMLButtonElement>('.game-hud__difficulty'),
    failOn: get('.game-hud__fail-on'),
    mistakes: get('.game-hud__mistakes'),
    startOverlay: get('.game-hud__overlay--start'),
    pausedOverlay: get('.game-hud__overlay--paused'),
    finishedOverlay: get('.game-hud__overlay--finished'),
    pausedRestart: get<HTMLButtonElement>('.game-hud__overlay--paused .game-hud__restart'),
    finishedRestart: get<HTMLButtonElement>('.game-hud__overlay--finished .game-hud__restart'),
    finalScore: get('.game-hud__final-score'),
    instructions: get('.game-hud__instructions'),
    summary: get('.game-hud__summary'),
  }

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

  return { screen, lifecycle, loop, score, mistakes, stage, hud, ui, shown }
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
    ['ready', [], { start: true, pause: false, paused: false, finished: false, score: true, time: true }],
    ['playing', ['start'], { start: false, pause: true, paused: false, finished: false, score: true, time: true }],
    ['paused', ['start', 'pause'], { start: false, pause: true, paused: true, finished: false, score: true, time: true }],
    ['finished', ['start', 'finish'], { start: false, pause: false, paused: false, finished: true, score: true, time: true }],
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

  it('shows under the difficulty how many mistakes fail the round', () => {
    const { ui } = setup()
    const failOn = [ui.failOn.textContent]

    for (let i = 0; i < 3; i++) {
      ui.difficulty.click()
      failOn.push(ui.failOn.textContent)
    }

    expect(ui.difficulty.nextElementSibling).toBe(ui.failOn)
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
      const failOn = Number(/\d+/.exec(ui.failOn.textContent!)![0])
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
    expect(ui.mistakes.parentElement).toBe(ui.score.parentElement)
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
      shownNames.push(ui.difficulty.textContent!)
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
    // Start, the difficulty and what it fails on, then the instructions.
    expect([...ui.startOverlay.children]).toEqual([
      ui.start,
      ui.difficulty,
      ui.failOn,
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

  it('puts the Start button a third of the way down, and the rest under it', () => {
    const rule = /\.game-hud__overlay--start\s*\{([^}]*)\}/.exec(gameCss)![1]

    expect(rule).toMatch(/justify-content: flex-start;/)
    expect(rule).toMatch(/padding-top: calc\(var\(--game-height\) \* 0\.33\);/)
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
    for (const [ms, text] of [[500, '00'], [1_000, '01'], [12_300, '12']] as const) {
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
    ]) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.type).toBe('button')
    }
  })
})
