// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFakeCanvasContexts } from '../../test/fake-canvas-context'
import { FakeFrames } from '../../test/fake-frames'
import { FakeStorage } from '../../test/fake-storage'
import type { GamePoint } from './game-canvas'
import type { GameFrame } from './game-loop'
import { mountGame, type GameHandlers, type GameSession } from './game-shell'
import { highScoresKey, parseHighScores } from './high-scores'

beforeEach(() => {
  useFakeCanvasContexts()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function setup(
  extra: Pick<GameHandlers, 'instructions' | 'drag'> = {},
  storage = new FakeStorage(),
) {
  const container = document.createElement('main')
  document.body.replaceChildren(container)
  const screen = new AbortController()
  const frames = new FakeFrames()
  const handlers = {
    reset: vi.fn(),
    start: vi.fn(),
    frame: vi.fn<(frame: GameFrame) => void>(),
    tap: vi.fn(),
    summary: undefined as GameHandlers['summary'],
    ...extra,
  } satisfies GameHandlers
  let session!: GameSession
  const game = vi.fn((given: GameSession) => {
    session = given
    return handlers
  })

  const returned = mountGame(container, {
    signal: screen.signal,
    game,
    gameId: 'test-game',
    storage,
    scheduler: frames,
  })

  const button = (selector: string) =>
    container.querySelector<HTMLButtonElement>(`.game-hud ${selector}`)!
  const tapAt = (clientX: number, clientY: number) =>
    session.canvas.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX, clientY, bubbles: true }),
    )

  return { container, screen, frames, handlers, game, session, returned, button, tapAt, storage }
}

describe('mounting a game', () => {
  it('puts the canvas and the buttons in the container', () => {
    const { container, session } = setup()

    expect(container.querySelector('.game-stage > canvas.game-canvas')).toBe(session.canvas.element)
    expect(session.hud.element.parentElement).toBe(session.canvas.stage)
  })

  it('gives the game the shared session and returns it', () => {
    const { game, session, returned } = setup()

    expect(game).toHaveBeenCalledOnce()
    expect(returned).toBe(session)
    expect(session.lifecycle.state).toBe('ready')
    expect(session.score.value).toBe(0)
    expect(session.loop.elapsedMs).toBe(0)
  })

  it('lets the game draw its starting picture, behind the Start button', () => {
    const { handlers, button } = setup()

    expect(handlers.reset).toHaveBeenCalledOnce()
    expect(button('.game-hud__start')).toBeTruthy()
  })
})

describe('playing', () => {
  it('starts the game with the Start button', () => {
    const { handlers, session, button } = setup()

    button('.game-hud__start').click()

    expect(session.lifecycle.state).toBe('playing')
    expect(handlers.start).toHaveBeenCalledOnce()
  })

  it('runs the game every frame and shows the time', () => {
    const { handlers, frames, button, container } = setup()
    button('.game-hud__start').click()

    frames.frame(600)
    frames.frame(600)

    expect(handlers.frame.mock.calls.map(([frame]) => frame)).toEqual([
      { deltaMs: 600, elapsedMs: 600 },
      { deltaMs: 600, elapsedMs: 1_200 },
    ])
    expect(container.querySelector('.game-hud__time')!.textContent).toBe('01')
  })

  it('starts each round with a score of 0', () => {
    const { session, button } = setup()
    button('.game-hud__start').click()
    session.score.add(3)
    session.lifecycle.finish()

    button('.game-hud__overlay--finished .game-hud__restart').click()
    button('.game-hud__start').click()

    expect(session.score.value).toBe(0)
  })
})

describe('mistakes', () => {
  it('gives the game the difficulty and the mistakes of the round', () => {
    const { session } = setup()

    expect(session.mistakes.level).toBe('easy')
    expect(session.mistakes.count).toBe(0)
  })

  it('plays at the difficulty picked with the difficulty button', () => {
    const { session, button } = setup()

    button('.game-hud__difficulty').click()
    button('.game-hud__start').click()

    expect(session.mistakes.level).toBe('medium')
  })

  it('keeps playing while the mistakes are within what the difficulty allows', () => {
    const { handlers, frames, session, button } = setup()
    button('.game-hud__start').click()
    handlers.frame.mockImplementation(() => session.mistakes.add())

    // Easy allows 9.
    frames.frames(9)

    expect(session.lifecycle.state).toBe('playing')
  })

  it('ends the round the moment of the mistake too many, in the middle of a frame', () => {
    const { handlers, frames, session, button, container } = setup()
    button('.game-hud__start').click()
    frames.frame(3_000)
    handlers.frame.mockImplementation(() => session.mistakes.add())
    frames.frames(9)
    session.score.add(5)
    const statesAfterMistake: string[] = []
    handlers.frame.mockImplementation(() => {
      session.mistakes.add()
      statesAfterMistake.push(session.lifecycle.state)
    })

    frames.frame(1_000)

    expect(statesAfterMistake).toEqual(['finished'])
    // 3 s, nine 16 ms frames, then 1 s.
    expect(container.querySelector('.game-hud__time')!.textContent).toBe('04')
    expect(container.querySelector('.game-hud__final-score')!.textContent).toBe('Score: 5')
  })

  it('lets the game stop at once before showing its summary', () => {
    const { handlers, frames, session, button } = setup()
    const order: string[] = []
    const end = vi.fn(() => order.push('end'))
    Object.assign(handlers, { end })
    handlers.summary = () => {
      order.push('summary')
      return []
    }
    // Extreme: the first mistake ends the round.
    for (let i = 0; i < 3; i++) button('.game-hud__difficulty').click()
    button('.game-hud__start').click()
    handlers.frame.mockImplementation(() => session.mistakes.add())

    frames.frame()

    expect(order).toEqual(['end', 'summary'])
    expect(end).toHaveBeenCalledOnce()
  })

  it('ends the round the moment a tap makes one mistake too many', () => {
    const { handlers, session, button, tapAt } = setup()
    for (let i = 0; i < 3; i++) button('.game-hud__difficulty').click()
    button('.game-hud__start').click()
    handlers.tap.mockImplementation(() => {
      session.mistakes.add()
      expect(session.lifecycle.state).toBe('finished')
    })

    tapAt(10, 10)

    expect(handlers.tap).toHaveBeenCalledOnce()
    expect(session.lifecycle.state).toBe('finished')
  })
})

describe('high scores', () => {
  /** Hard: the third mistake ends the round. */
  function playHardRound({ handlers, frames, session, button }: ReturnType<typeof setup>) {
    button('.game-hud__difficulty').click()
    button('.game-hud__difficulty').click()
    button('.game-hud__start').click()
    session.score.add(5)
    handlers.frame.mockImplementation(() => session.mistakes.add())
    frames.frames(3)
  }

  it("saves a round that ends under the player's name and the game's id, at its difficulty", () => {
    const storage = new FakeStorage()
    const played = setup({}, storage)
    const { session, container } = played
    playHardRound(played)
    expect(session.lifecycle.state).toBe('finished')

    const name = container.querySelector<HTMLInputElement>('.game-hud__name')!
    name.value = 'Ana'
    name.dispatchEvent(new Event('input'))
    container.querySelector<HTMLFormElement>('.game-hud__name-form')!.requestSubmit()

    // At the pace a game starts on: Slow.
    expect(session.highScores.best('hard', 'slow')).toEqual({ name: 'Ana', score: 5 })
    expect(parseHighScores(storage.getItem(highScoresKey('test-game'))).hard.slow).toEqual([
      { name: 'Ana', score: 5 },
    ])
  })

  it('counts the score the round ended on, even if the game adds points as it stops', () => {
    const { handlers, session, button } = setup()
    Object.assign(handlers, { end: () => session.score.add(100) })
    button('.game-hud__start').click()
    session.score.add(2)

    session.lifecycle.finish()

    expect(session.highScores.lastRound?.score).toBe(2)
  })

  it('shows the high scores saved before the game was opened', () => {
    const storage = new FakeStorage()
    // At the pace a game starts on: Slow.
    const saved = { easy: { slow: [{ name: 'Bo', score: 8 }] } }
    storage.setItem(highScoresKey('test-game'), JSON.stringify(saved))
    const { container, button } = setup({}, storage)

    button('.game-hud__high-scores-open').click()

    expect(container.querySelector('.game-hud__high-scores li')!.textContent).toBe('1Bo8')
  })
})

describe('tapping', () => {
  function withCanvasAt(setupResult: ReturnType<typeof setup>) {
    // Shown at half size with its top-left corner at (100, 50).
    vi.spyOn(setupResult.session.canvas.element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 50, 200, 400),
    )
    return setupResult
  }

  it('passes taps to the game in game units while playing', () => {
    const { handlers, button, tapAt } = withCanvasAt(setup())
    button('.game-hud__start').click()

    tapAt(150, 250)

    expect(handlers.tap).toHaveBeenCalledExactlyOnceWith({ x: 100, y: 400 })
  })

  it.each([
    ['before the game starts', []],
    ['while paused', ['start', 'pause']],
    ['once finished', ['start', 'finish']],
  ] as const)('ignores taps %s', (_when, actions) => {
    const setupResult = withCanvasAt(setup())
    for (const action of actions) {
      setupResult.session.lifecycle[action]()
    }

    setupResult.tapAt(150, 250)

    expect(setupResult.handlers.tap).not.toHaveBeenCalled()
  })

  it('works with games that do not use taps', () => {
    const container = document.createElement('main')
    const session = mountGame(container, {
      signal: new AbortController().signal,
      game: () => ({ reset() {}, start() {}, frame() {} }),
      gameId: 'test-game',
      storage: new FakeStorage(),
      scheduler: new FakeFrames(),
    })
    session.lifecycle.start()

    expect(() => session.canvas.element.dispatchEvent(new MouseEvent('pointerdown'))).not.toThrow()
  })
})

describe('dragging', () => {
  /** A game that follows drags, its canvas shown at half size with its top-left corner at (100, 50). */
  function dragging() {
    const drag = vi.fn<(point: GamePoint | undefined) => void>()
    const played = setup({ drag })
    vi.spyOn(played.session.canvas.element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 50, 200, 400),
    )
    /** A pointer event of `type` at (clientX, clientY) on screen, for pointer 1 unless told. */
    const pointer = (type: string, clientX: number, clientY: number, pointerId = 1) =>
      new PointerEvent(type, { clientX, clientY, pointerId, bubbles: true })
    const down = (x: number, y: number, id?: number) =>
      played.session.canvas.element.dispatchEvent(pointer('pointerdown', x, y, id))
    const move = (x: number, y: number, id?: number) =>
      window.dispatchEvent(pointer('pointermove', x, y, id))
    const up = (type = 'pointerup', id?: number) => window.dispatchEvent(pointer(type, 0, 0, id))
    return { ...played, drag, down, move, up }
  }

  it('tells the game where the finger goes down and moves, in game units, then that it lifted', () => {
    const { drag, button, down, move, up } = dragging()
    button('.game-hud__start').click()

    down(150, 250)
    move(200, 250)
    // Off the game: still followed.
    move(50, 500)
    up()

    expect(drag.mock.calls).toEqual([
      [{ x: 100, y: 400 }],
      [{ x: 200, y: 400 }],
      [{ x: -100, y: 900 }],
      [undefined],
    ])
  })

  it('follows one finger at a time', () => {
    const { drag, button, down, move, up } = dragging()
    button('.game-hud__start').click()
    down(150, 250, 1)

    move(200, 250, 2)
    up('pointerup', 2)

    expect(drag).toHaveBeenCalledOnce()
  })

  it('hears a finger lifted when the browser cancels it, e.g. to scroll', () => {
    const { drag, button, down, up } = dragging()
    button('.game-hud__start').click()
    down(150, 250)

    up('pointercancel')

    expect(drag).toHaveBeenLastCalledWith(undefined)
  })

  it('ignores fingers before the round, and moves or lifts without a finger down', () => {
    const { drag, button, down, move, up } = dragging()
    down(150, 250)
    button('.game-hud__start').click()

    move(200, 250)
    up()

    expect(drag).not.toHaveBeenCalled()
  })

  it.each([
    ['paused', 'pause'],
    ['over', 'finish'],
  ] as const)(
    'lifts the finger for the game when the round is %s, and ignores it after',
    (_when, action) => {
      const { drag, button, down, move, up, session } = dragging()
      button('.game-hud__start').click()
      down(150, 250)

      session.lifecycle[action]()
      move(200, 250)
      up()

      expect(drag.mock.calls).toEqual([[{ x: 100, y: 400 }], [undefined]])
    },
  )

  it('does not start a drag when the tap under it ended the round', () => {
    const { drag, handlers, button, down, session } = dragging()
    handlers.tap.mockImplementation(() => session.lifecycle.finish())
    button('.game-hud__start').click()

    down(150, 250)

    expect(drag).not.toHaveBeenCalled()
  })

  it('stops following drags when the game is left', () => {
    const { drag, button, down, move, screen } = dragging()
    button('.game-hud__start').click()
    down(150, 250)
    screen.abort()

    move(200, 250)

    // Only the lift, as the round stopped being played.
    expect(drag.mock.calls).toEqual([[{ x: 100, y: 400 }], [undefined]])
  })
})

describe('loading', () => {
  function mountWithLoad(load: () => Promise<unknown>) {
    const container = document.createElement('main')
    const session = mountGame(container, {
      signal: new AbortController().signal,
      game: () => ({ load, reset() {}, start() {}, frame() {} }),
      gameId: 'test-game',
      storage: new FakeStorage(),
      scheduler: new FakeFrames(),
    })
    const start = container.querySelector<HTMLButtonElement>('.game-hud__start')!
    return { session, start }
  }

  it('lets games without anything to load start straight away', () => {
    const { button } = setup()

    expect(button('.game-hud__start').disabled).toBe(false)
  })

  it('keeps Start disabled until the game has loaded', async () => {
    let finishLoading = () => {}
    const load = vi.fn(() => new Promise<void>((resolve) => (finishLoading = resolve)))
    const { start } = mountWithLoad(load)

    expect(load).toHaveBeenCalledOnce()
    expect(start.disabled).toBe(true)
    expect(start.textContent).toBe('Loading…')

    finishLoading()
    await vi.waitFor(() => expect(start.disabled).toBe(false))
    expect(start.textContent).toBe('Start')
  })

  it('still lets the game start if loading fails, and reports why', async () => {
    const failure = new Error('missing image')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { start, session } = mountWithLoad(() => Promise.reject(failure))

    await vi.waitFor(() => expect(start.disabled).toBe(false))
    expect(consoleError).toHaveBeenCalledWith('The game could not load everything', failure)

    start.click()
    expect(session.lifecycle.state).toBe('playing')
  })
})

describe('status bar', () => {
  it('is below the stage, outside the canvas, and shared with the game', () => {
    const { container, session } = setup()

    expect(session.status.element.parentElement).toBe(container)
    expect(session.canvas.stage.contains(session.status.element)).toBe(false)
  })

  it('hides a message after 2 seconds of play, not counting pauses', () => {
    const { frames, session, button } = setup()
    button('.game-hud__start').click()
    frames.frame(1_000)
    session.status.show('Oops', 'bad')

    button('.game-hud__pause').click()
    frames.wait(10_000)
    button('.game-hud__pause').click()
    frames.frame(1_500)
    expect(session.status.text).toBe('Oops')

    frames.frame(500)
    expect(session.status.text).toBe('')
  })

  it.each([
    [
      'a new round starts',
      (s: GameSession) => {
        s.lifecycle.pause()
        s.lifecycle.restart()
        s.status.show('Oops', 'bad')
        s.lifecycle.start()
      },
    ],
    [
      'the game restarts',
      (s: GameSession) => {
        s.lifecycle.pause()
        s.lifecycle.restart()
      },
    ],
  ])('is cleared when %s', (_when, act) => {
    const { session, button } = setup()
    button('.game-hud__start').click()
    session.status.show('Oops', 'bad')

    act(session)

    expect(session.status.text).toBe('')
  })

  it('keeps the last message when the round ends, to show why it ended', () => {
    const { session, button } = setup()
    button('.game-hud__start').click()
    session.status.show('Oops', 'bad')

    session.lifecycle.finish()

    expect(session.status.text).toBe('Oops')
  })

  it('keeps the message when paused and resumed', () => {
    const { session, button } = setup()
    button('.game-hud__start').click()
    session.status.show('Oops', 'bad')

    session.lifecycle.pause()
    session.lifecycle.resume()

    expect(session.status.text).toBe('Oops')
  })
})

describe('instructions', () => {
  it("shows the game's instructions with the Start button", () => {
    const { container } = setup({ instructions: ['Read this.', 'Then start.'] })

    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!
    expect(card.hidden).toBe(false)
    expect([...card.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'Read this.',
      'Then start.',
    ])
  })

  it('shows no instructions for games without any', () => {
    const { container } = setup()

    expect(container.querySelector<HTMLElement>('.game-hud__instructions')!.hidden).toBe(true)
  })
})

describe('summary', () => {
  it("shows the game's summary on the finished screen, as it is at the end", () => {
    const { handlers, frames, session, button, container } = setup()
    let tapped = 0
    const summary = vi.fn(() => [{ label: 'Tapped', value: tapped }])
    handlers.summary = summary
    button('.game-hud__start').click()
    frames.frame()
    tapped = 4

    session.lifecycle.finish()

    expect(summary).toHaveBeenCalledOnce()
    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    expect(list.hidden).toBe(false)
    expect(list.textContent).toBe('Tapped4Best comboX1')
  })

  it('shows only the best combo for games without a summary of their own', () => {
    const { session, button, container } = setup()
    button('.game-hud__start').click()

    session.lifecycle.finish()

    expect(container.querySelector('.game-hud__summary')!.textContent).toBe('Best comboX1')
  })

  it('ends the summary with the best combo of the round, even if a mistake ended it', () => {
    const { session, button, container } = setup()
    button('.game-hud__start').click()
    // 12 good things in a row: X3, then a mistake.
    for (let i = 0; i < 12; i++) session.score.add(1)
    session.mistakes.add()

    session.lifecycle.finish()

    const lines = [...container.querySelectorAll('.game-hud__summary dd')]
    expect(lines.at(-1)?.textContent).toBe('X3')
    expect(session.combo.multiplier).toBe(1)
  })

  it('gives the game a score multiplied by the combo', () => {
    const { session, button } = setup()
    button('.game-hud__start').click()

    for (let i = 0; i < 6; i++) session.score.add(1)

    expect(session.score.value).toBe(5 + 2)
  })
})

describe('pausing and restarting', () => {
  it('stops running the game while paused', () => {
    const { handlers, frames, button } = setup()
    button('.game-hud__start').click()
    frames.frame(100)

    button('.game-hud__pause').click()
    frames.frames(10, 100)

    expect(handlers.frame).toHaveBeenCalledOnce()
  })

  it('pauses on its own when the window loses focus', () => {
    const { session, button, container } = setup()
    button('.game-hud__start').click()

    window.dispatchEvent(new Event('blur'))

    expect(session.lifecycle.state).toBe('paused')
    expect(container.querySelector<HTMLElement>('.game-hud__overlay--paused')!.hidden).toBe(false)
  })

  it('lets the game reset its picture on restart', () => {
    const { handlers, button } = setup()
    button('.game-hud__start').click()
    button('.game-hud__pause').click()
    handlers.reset.mockClear()

    button('.game-hud__overlay--paused .game-hud__restart').click()

    expect(handlers.reset).toHaveBeenCalledOnce()
    expect(handlers.start).toHaveBeenCalledOnce()
  })

  it('does not reset the picture when pausing, resuming or finishing', () => {
    const { handlers, session, button } = setup()
    handlers.reset.mockClear()

    button('.game-hud__start').click()
    session.lifecycle.pause()
    session.lifecycle.resume()
    session.lifecycle.finish()

    expect(handlers.reset).not.toHaveBeenCalled()
  })
})

describe('leaving the screen', () => {
  it('stops the game, its frames and its taps', () => {
    const { screen, handlers, frames, session, button, tapAt } = setup()
    button('.game-hud__start').click()
    frames.frame(100)
    handlers.frame.mockClear()

    screen.abort()
    frames.frames(5, 100)
    tapAt(10, 10)

    expect(session.lifecycle.state).toBe('paused')
    expect(handlers.frame).not.toHaveBeenCalled()
    expect(handlers.tap).not.toHaveBeenCalled()
  })

  it('stops pausing on focus changes', () => {
    const { screen, session } = setup()
    screen.abort()

    window.dispatchEvent(new Event('blur'))

    expect(session.lifecycle.state).toBe('ready')
  })
})
