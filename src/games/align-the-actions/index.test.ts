// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cssCanvasFont, useCssVariables } from '../../test/css-variables'
import {
  fontSizeOf,
  useFakeCanvasContexts,
  type FakeContext,
} from '../../test/fake-canvas-context'
import { FakeFrames } from '../../test/fake-frames'
import { loadedFonts, mountForTest } from '../../test/mounted-game'
import { seededRandom } from '../../test/random'
import { mountGame } from '../shared/game-shell'
import type { FontLoader } from '../shared/load-font'
import { fitFontSize, fontAt } from '../shared/text'
import {
  CHECK_Y,
  laneCentre,
  START_LANE,
  START_SPAWN_INTERVAL_MS,
  START_SPEED,
} from './align-the-actions'
import data from './data/align_the_actions_goals.json'
import { GOAL_TEXT_FIT } from './draw'
import { goalsFrom, type ActionKind } from './goals'
import { alignTheActionsGame, mistakeMessage } from './index'

const goals = goalsFrom(data)
let contexts: FakeContext[]

beforeEach(() => {
  contexts = useFakeCanvasContexts()
  useCssVariables()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The context of the game mounted in the test. */
const context = () => contexts.at(-1)!

function setup(seed = 1) {
  return mountForTest(alignTheActionsGame({ random: seededRandom(seed), fonts: loadedFonts }))
}

/** 50 ms frames until just after the first row reaches the circle (and before the second). */
const framesToFirstChoice = Math.ceil((START_SPAWN_INTERVAL_MS + 500) / 50)

/**
 * What the most recent drawing shows, read back from the text drawn: the
 * goal (written across the middle) and the action in each lane (written at
 * the lane's centre). Only for while a single row is on screen.
 */
function lastDrawn() {
  const linesAt = new Map<number, string[]>()
  for (const { args } of context().lastDrawing().filter((call) => call.name === 'fillText')) {
    const [text, x] = args as [string, number]
    linesAt.set(x, [...(linesAt.get(x) ?? []), text])
  }
  const title = linesAt.get(200)?.join(' ')
  const goal = goals.find((candidate) => candidate.title === title)
  const actions = [0, 1, 2, 3].map((lane) => linesAt.get(laneCentre(lane))?.join(' '))
  const kindOf = (text: string | undefined): ActionKind | undefined => {
    if (!goal || !text) return undefined
    if (goal.aligned.includes(text)) return 'aligned'
    if (goal.against.includes(text)) return 'against'
    return 'otherGoal'
  }
  const circle = context().lastDrawing().find((call) => call.name === 'arc')
  return {
    goal,
    actions,
    laneOf: (kind: ActionKind) => actions.findIndex((text) => kindOf(text) === kind),
    circleX: circle?.args[0],
  }
}

describe('loading', () => {
  it('loads the game font before Start can be pressed', async () => {
    let finishLoading = (_: { status: string }[]) => {}
    const fonts: FontLoader & { load: ReturnType<typeof vi.fn> } = {
      load: vi.fn(() => new Promise<{ status: string }[]>((resolve) => (finishLoading = resolve))),
    }
    const container = document.createElement('main')
    document.body.replaceChildren(container)
    mountGame(container, {
      signal: new AbortController().signal,
      game: alignTheActionsGame({ fonts }),
      scheduler: new FakeFrames(),
    })
    const start = container.querySelector<HTMLButtonElement>('.game-hud__start')!

    expect(fonts.load).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(cssCanvasFont.family),
    )
    expect(start.disabled).toBe(true)

    finishLoading([{ status: 'loaded' }])
    await vi.waitFor(() => expect(start.disabled).toBe(false))
  })
})

describe('Align the Actions', () => {
  it('shows the empty lanes and the circle behind the Start button', async () => {
    await setup()

    expect(context().callsTo('moveTo')).toHaveLength(3)
    expect(context().callsTo('fillText')).toEqual([])
    expect(lastDrawn().circleX).toBe(laneCentre(START_LANE))
  })

  it('shows a goal and a row of 4 actions when Start is pressed', async () => {
    const { click } = await setup()

    click('.game-hud__start')

    const { goal, actions, laneOf } = lastDrawn()
    expect(goal).toBeDefined()
    expect(actions.every((text) => text !== undefined)).toBe(true)
    expect(laneOf('aligned')).not.toBe(-1)
    expect(laneOf('otherGoal')).not.toBe(-1)
  })

  it('writes every goal at one size, chosen when the round starts', async () => {
    const { click } = await setup()
    // A font twice as wide as usual, so the longest goal does not fit at 24 px.
    Object.assign(context(), {
      measureText: (text: string) => ({ width: text.length * fontSizeOf(context().font) * 1.2 }),
    })

    click('.game-hud__start')

    const titles = goals.map((g) => g.title)
    const size = fitFontSize(context().asContext(), cssCanvasFont, titles, GOAL_TEXT_FIT)
    const goalText = context()
      .lastDrawing()
      .filter((call) => call.name === 'fillText' && call.args[1] === 200)
    expect(size).toBeLessThan(GOAL_TEXT_FIT.maxSize)
    expect(goalText.length).toBeGreaterThan(0)
    const expectedFont = fontAt(cssCanvasFont, size)
    expect(goalText.map((call) => call.font)).toEqual(goalText.map(() => expectedFont))
  })

  it('moves the actions down as time passes', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    const yOf = () => context().lastDrawing().find((call) => call.name === 'roundRect')!.args[1]
    const before = yOf() as number

    frames.frames(40, 50)

    expect(yOf()).toBeCloseTo(before + START_SPEED * 2, 6)
  })

  it('moves the circle to the lane tapped', async () => {
    const { click, tapAt } = await setup()
    click('.game-hud__start')

    tapAt(360, 300)
    expect(lastDrawn().circleX).toBe(laneCentre(3))

    tapAt(20, 780)
    expect(lastDrawn().circleX).toBe(laneCentre(0))
  })

  it('gives a point for choosing the aligned action, without a message', async () => {
    const { click, frames, tapAt, text, session } = await setup(2)
    click('.game-hud__start')
    tapAt(laneCentre(lastDrawn().laneOf('aligned')), CHECK_Y)

    frames.frames(framesToFirstChoice, 50)

    expect(text('.game-hud__score')).toBe('Score: 1')
    expect(session.status.text).toBe('')
  })

  it.each<[ActionKind, (action: string, goal: string, other: string) => string]>([
    ['against', (action, goal) => `Works against “${goal}”: ${action} (−1)`],
    ['otherGoal', (action, _goal, other) => `Belongs to “${other}”: ${action} (−1)`],
  ])('takes a point for choosing the %s action, and says why in red', async (kind, message) => {
    const { click, frames, tapAt, text, session } = await setup(3)
    click('.game-hud__start')
    const { goal, actions, laneOf } = lastDrawn()
    const action = actions[laneOf(kind)]!
    const other = goals.find((candidate) => candidate.aligned.includes(action))
    tapAt(laneCentre(laneOf(kind)), CHECK_Y)
    const messages = new Set<string>()

    for (let i = 0; i < framesToFirstChoice; i++) {
      frames.frame(50)
      if (session.status.text) {
        messages.add(`${session.status.element.dataset.tone}: ${session.status.text}`)
      }
    }

    expect(text('.game-hud__score')).toBe('Score: -1')
    expect([...messages]).toEqual([`bad: ${message(action, goal!.title, other?.title ?? '')}`])
  })

  it('explains mistakes in the status bar below the canvas', () => {
    const [pause, move] = [goals[2], goals[7]]
    const against = { text: pause.against[0], kind: 'against' as const, goal: pause }
    const other = { text: move.aligned[0], kind: 'otherGoal' as const, goal: move }

    expect(mistakeMessage('against', against, pause)).toBe(
      `Works against “${pause.title}”: ${pause.against[0]} (−1)`,
    )
    expect(mistakeMessage('otherGoal', other, pause)).toBe(
      `Belongs to “${move.title}”: ${move.aligned[0]} (−1)`,
    )
  })

  it('ends with the 10th mistake on Easy, with what was chosen matching the score', async () => {
    const { click, frames, tapAt, session, container, summaryValues } = await setup(4)
    click('.game-hud__start')
    const random = seededRandom(40)
    for (let i = 0; i < 6_000 && session.lifecycle.state === 'playing'; i++) {
      frames.frame(100)
      if (random() < 0.05) tapAt(random() * 400, 600)
    }
    expect(session.lifecycle.state).toBe('finished')

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    const labels = [...list.querySelectorAll('dt')].map((e) => e.textContent)
    const values = summaryValues()
    expect(labels).toEqual([
      'Aligned actions chosen',
      'Actions against the goal chosen',
      'Actions for another goal chosen',
    ])
    const [aligned, against, otherGoal] = values
    expect(against + otherGoal).toBe(10)
    expect(aligned).toBeGreaterThan(0)
    expect(session.score.value).toBe(aligned - against - otherGoal)
  })

  it('ends with the first mistake on Extreme, and says what it was', async () => {
    const { click, tapAt, session, playUntilOver, summaryValues } = await setup(3)
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')
    const { goal, actions, laneOf } = lastDrawn()
    tapAt(laneCentre(laneOf('against')), CHECK_Y)

    playUntilOver()

    const values = summaryValues()
    expect(values).toEqual([0, 1, 0])
    expect(session.status.text).toBe(
      mistakeMessage(
        'against',
        { text: actions[laneOf('against')]!, kind: 'against', goal: goal! },
        goal!,
      ),
    )
  })

  it('chooses nothing after the mistake that ends the round, even in one long frame', async () => {
    const { click, frames, session, summaryValues } = await setup(6)
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')

    // Several rows reach the circle in this one frame.
    frames.frame(40_000)

    const [aligned, against, otherGoal] = summaryValues()
    expect(against + otherGoal).toBe(1)
    expect(session.mistakes.count).toBe(1)
    expect(session.score.value).toBe(aligned - 1)
  })

  it('clears the board on restart and starts fresh on the next Start', async () => {
    const { click, frames, tapAt } = await setup()
    click('.game-hud__start')
    tapAt(390, 700)
    frames.frames(100, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')
    expect(context().lastDrawing().filter((call) => call.name === 'fillText')).toEqual([])
    expect(lastDrawn().circleX).toBe(laneCentre(START_LANE))

    click('.game-hud__start')
    expect(lastDrawn().goal).toBeDefined()
  })
})
