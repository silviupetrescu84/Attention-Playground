// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFakeCanvasContexts } from '../../test/fake-canvas-context'
import { FakeFrames } from '../../test/fake-frames'
import { mountGame, type GameHandlers, type GameSession } from './game-shell'

beforeEach(() => {
  useFakeCanvasContexts()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function setup(extra: Pick<GameHandlers, 'instructions'> = {}) {
  const container = document.createElement('main')
  document.body.replaceChildren(container)
  const screen = new AbortController()
  const frames = new FakeFrames()
  const handlers = {
    reset: vi.fn(),
    start: vi.fn(),
    frame: vi.fn(),
    tap: vi.fn(),
    summary: undefined as GameHandlers['summary'],
    ...extra,
  } satisfies GameHandlers
  let session!: GameSession
  const game = vi.fn((given: GameSession) => {
    session = given
    return handlers
  })

  const returned = mountGame(container, { signal: screen.signal, game, scheduler: frames })

  const button = (selector: string) =>
    container.querySelector<HTMLButtonElement>(`.game-hud ${selector}`)!
  const tapAt = (clientX: number, clientY: number) =>
    session.canvas.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX, clientY, bubbles: true }),
    )

  return { container, screen, frames, handlers, game, session, returned, button, tapAt }
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
      scheduler: new FakeFrames(),
    })
    session.lifecycle.start()

    expect(() =>
      session.canvas.element.dispatchEvent(new MouseEvent('pointerdown')),
    ).not.toThrow()
  })
})

describe('loading', () => {
  function mountWithLoad(load: () => Promise<unknown>) {
    const container = document.createElement('main')
    const session = mountGame(container, {
      signal: new AbortController().signal,
      game: () => ({ load, reset() {}, start() {}, frame() {} }),
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
    ['a new round starts', (s: GameSession) => {
      s.lifecycle.pause()
      s.lifecycle.restart()
      s.status.show('Oops', 'bad')
      s.lifecycle.start()
    }],
    ['the game restarts', (s: GameSession) => {
      s.lifecycle.pause()
      s.lifecycle.restart()
    }],
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
    expect(list.textContent).toBe('Tapped4')
  })

  it('shows no summary for games without one', () => {
    const { session, button, container } = setup()
    button('.game-hud__start').click()

    session.lifecycle.finish()

    expect(container.querySelector<HTMLElement>('.game-hud__summary')!.hidden).toBe(true)
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
