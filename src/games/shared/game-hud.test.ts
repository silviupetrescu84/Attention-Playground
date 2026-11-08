// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createGameHud, formatSeconds } from './game-hud'
import { createGameLifecycle, isNewRound, type GameState } from './game-lifecycle'
import type { GameLoop } from './game-loop'
import { createScore } from './score'

function setup() {
  const screen = new AbortController()
  const lifecycle = createGameLifecycle({ signal: screen.signal })
  const loop = { elapsedMs: 0, durationMs: 60_000 } satisfies GameLoop
  // The real loop resets its time on start and restart; so does this one.
  lifecycle.subscribe((change) => {
    if (isNewRound(change)) loop.elapsedMs = 0
  })
  const score = createScore({ lifecycle })
  const stage = document.createElement('div')
  const hud = createGameHud(stage, { lifecycle, loop, score })

  const get = <T extends HTMLElement = HTMLElement>(selector: string) =>
    hud.element.querySelector<T>(selector)!
  const visible = (element: HTMLElement) => !element.closest('[hidden]')
  const ui = {
    score: get('.game-hud__score'),
    time: get('.game-hud__time'),
    pause: get<HTMLButtonElement>('.game-hud__pause'),
    start: get<HTMLButtonElement>('.game-hud__start'),
    startOverlay: get('.game-hud__overlay--start'),
    pausedOverlay: get('.game-hud__overlay--paused'),
    finishedOverlay: get('.game-hud__overlay--finished'),
    pausedRestart: get<HTMLButtonElement>('.game-hud__overlay--paused .game-hud__restart'),
    finishedRestart: get<HTMLButtonElement>('.game-hud__overlay--finished .game-hud__restart'),
    finalScore: get('.game-hud__final-score'),
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

  return { screen, lifecycle, loop, score, stage, hud, ui, shown }
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
  ])('shows %s ms as %s', (ms, text) => {
    expect(formatSeconds(ms)).toBe(text)
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

    score.subtract(5)
    expect(ui.score.textContent).toBe('Score: -2')
  })

  it('flashes the top score green when points are won and red when lost', () => {
    const { score, ui } = setup()
    ui.start.click()
    const classes = () =>
      [...ui.score.classList].filter((name) => name.startsWith('game-hud__score--'))

    score.add(1)
    expect(classes()).toEqual(['game-hud__score--up'])

    score.subtract(2)
    expect(classes()).toEqual(['game-hud__score--down'])

    score.subtract(1)
    expect(classes()).toEqual(['game-hud__score--down'])

    score.add(5)
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
    score.subtract(3)

    lifecycle.finish()

    expect(ui.finalScore.className).toBe('game-hud__final-score')
  })

  it('shows the final score when finished', () => {
    const { lifecycle, score, ui } = setup()
    ui.start.click()
    score.add(7)

    lifecycle.finish()

    expect(ui.finalScore.textContent).toBe('Score: 7')
    expect(ui.finishedOverlay.textContent).toContain("Time's up!")
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

    for (const button of [ui.start, ui.pause, ui.pausedRestart, ui.finishedRestart]) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.type).toBe('button')
    }
  })
})
