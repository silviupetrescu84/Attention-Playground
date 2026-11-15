// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ovalUrl from '../../assets/emotions-rise/oval.png'
import greenBubbleUrl from '../../assets/focus-attention/green-bubble.png'
import { cssCanvasFont, cssVariables, useCssVariables } from '../../test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { stubImages } from '../../test/fake-image'
import { loadedFonts, mountForTest, mountWaitingForFont } from '../../test/mounted-game'
import { seededRandom } from '../../test/random'
import { LARGE_OVAL_TEXT } from '../shared/artwork'
import { chooseTextStyle, fontAt } from '../shared/text'
import type { ShownGoal, Turn } from './break-it-down'
import data from './data/break-it-down.json'
import { GOAL_TEXT } from './draw'
import { distractionsFrom, goalsFrom } from './goals'
import { breakItDownGame, goalMessage, INSTRUCTIONS, mistakeMessage } from './index'
import { CENTRE, GOAL_SIZE, OPTION_WIDTH } from './layout'

const goals = goalsFrom(data)
const actions = new Set(goals.flatMap((goal) => goal.actions))
let contexts: FakeContext[]

beforeEach(() => {
  contexts = useFakeCanvasContexts()
  stubImages()
  useCssVariables()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** The context of the game mounted in the test. */
const context = () => contexts.at(-1)!

function setup(seed = 1) {
  return mountForTest(breakItDownGame({ random: seededRandom(seed), fonts: loadedFonts }))
}

interface Drawn {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly text: string
  readonly opacity: number
}

/**
 * What the most recent drawing shows, read back from it: each image, with
 * the lines of text written after it. Goals are square; actions are ovals.
 */
function lastDrawn() {
  const drawn: Drawn[] = []
  for (const { name, args, globalAlpha } of context().lastDrawing()) {
    if (name === 'drawImage') {
      const [, left, top, width, height] = args as number[]
      drawn.push({
        x: left + width / 2,
        y: top + height / 2,
        size: width,
        text: '',
        opacity: globalAlpha,
      })
    } else if (name === 'fillText') {
      const last = drawn.pop()!
      drawn.push({ ...last, text: `${last.text} ${String(args[0])}`.trim() })
    }
  }
  const options = drawn.filter((item) => item.size === OPTION_WIDTH)
  return {
    goals: drawn.filter((item) => item.size !== OPTION_WIDTH),
    options,
    good: options.find((option) => actions.has(option.text)),
    bad: options.find((option) => !actions.has(option.text)),
  }
}

describe('loading', () => {
  it('loads the game font and both images before Start can be pressed', async () => {
    const { fonts, start, finishLoading } = mountWaitingForFont((fonts) =>
      breakItDownGame({ fonts }),
    )

    expect(fonts.load).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(cssCanvasFont.family),
    )
    expect(start.disabled).toBe(true)

    finishLoading()
    await vi.waitFor(() => expect(start.disabled).toBe(false))
  })

  it('can still be played, with plain shapes, if the images do not load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages('error')
    // Fresh modules, so the images loaded by other tests are not cached.
    vi.resetModules()
    const { breakItDownGame: freshGame } = await import('./index')
    const { click, frames, session } = await mountForTest(
      freshGame({ random: seededRandom(1), fonts: loadedFonts }),
    )

    click('.game-hud__start')
    frames.frame(3_100)

    expect(session.lifecycle.state).toBe('playing')
    expect(context().callsTo('drawImage')).toEqual([])
    // The goal and its 2 actions, as plain shapes.
    expect(
      context()
        .lastDrawing()
        .filter((call) => call.name === 'ellipse'),
    ).toHaveLength(3)
    expect(error).toHaveBeenCalledWith('The game could not load everything', expect.any(Error))
  })

  it('uses each image that loads, even if the other does not', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // The goal's bubble fails; the oval loads.
    let made = 0
    class HalfImage extends EventTarget {
      #src = ''
      readonly failing = made++ === 0
      get src() {
        return this.#src
      }
      set src(url: string) {
        this.#src = url
        queueMicrotask(() => this.dispatchEvent(new Event(this.failing ? 'error' : 'load')))
      }
    }
    vi.stubGlobal('Image', HalfImage)
    vi.resetModules()
    const { breakItDownGame: freshGame } = await import('./index')
    const { click, frames } = await mountForTest(
      freshGame({ random: seededRandom(1), fonts: loadedFonts }),
    )

    click('.game-hud__start')
    frames.frame(3_100)

    // A plain circle for the goal, the oval image for each action.
    const drawing = context().lastDrawing()
    const images = drawing.filter((call) => call.name === 'drawImage')
    expect(images.map((call) => call.args[3])).toEqual([OPTION_WIDTH, OPTION_WIDTH])
    expect(drawing.filter((call) => call.name === 'ellipse')).toHaveLength(1)
  })
})

describe('preloading', () => {
  it('loads the font and both images when the app starts', async () => {
    vi.resetModules()
    const images = stubImages()
    const { preloadBreakItDown } = await import('./index')
    const fonts = { load: vi.fn(async () => [{ status: 'loaded' }]) }

    await expect(preloadBreakItDown(fonts)).resolves.toBeUndefined()

    expect(fonts.load).toHaveBeenCalledOnce()
    expect(images.map((image) => image.src)).toEqual([greenBubbleUrl, ovalUrl])
  })

  it('fails if any of it does not load', async () => {
    vi.resetModules()
    stubImages('error')
    const { preloadBreakItDown } = await import('./index')

    await expect(preloadBreakItDown(loadedFonts)).rejects.toThrow('Could not load green-bubble.png')
  })
})

describe('Break It Down', () => {
  it('explains how to play with the Start button, before every round', async () => {
    const { container, click } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!
    const paragraphs = () => [...card.querySelectorAll('p')].map((p) => p.textContent)

    expect(card.closest('[hidden]')).toBeNull()
    expect(INSTRUCTIONS).toEqual([
      'Big goals are reached through small correct actions.',
      'Distractions make the goals seem bigger.',
    ])
    expect(paragraphs()).toEqual(INSTRUCTIONS)

    click('.game-hud__start')
    expect(card.closest('[hidden]')).not.toBeNull()
  })

  it('shows only the background behind the Start button', async () => {
    await setup()

    expect(context().calls.map((call) => call.name)).toEqual(['setTransform', 'clearRect'])
  })

  it('fades in a goal in the middle, alone for 3 s, then 2 actions around it', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frame(50)
    expect(lastDrawn().goals).toEqual([
      expect.objectContaining({ x: CENTRE.x, y: CENTRE.y, size: GOAL_SIZE, opacity: 0.5 }),
    ])
    frames.frame(2_949)
    expect(lastDrawn().goals[0].opacity).toBe(1)
    expect(lastDrawn().options).toEqual([])
    expect(goals.map((goal) => goal.title)).toContain(lastDrawn().goals[0].text)

    frames.frame(51)
    expect(lastDrawn().options.map((option) => option.opacity)).toEqual([0.5, 0.5])
    frames.frame(50)
    const { options, good, bad } = lastDrawn()
    expect(options.map((option) => option.opacity)).toEqual([1, 1])
    expect(good).toBeDefined()
    expect(bad).toBeDefined()
  })

  it('writes every goal at one size and every action at another, set at the start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frame(3_100)

    const styleOf = (texts: readonly string[], shape: typeof GOAL_TEXT) =>
      chooseTextStyle(context().asContext(), cssCanvasFont, texts, shape)
    const goalStyle = styleOf(
      goals.map((goal) => goal.title),
      GOAL_TEXT,
    )
    const optionStyle = styleOf([...actions, ...distractionsFrom(data)], LARGE_OVAL_TEXT)
    // (On 2 lines at 17 px in a browser; the test font is wider.)
    expect(optionStyle.fit.maxLines).toBeLessThanOrEqual(3)
    const { options } = lastDrawn()
    expect(options).toHaveLength(2)

    const texts = context()
      .lastDrawing()
      .filter((call) => call.name === 'fillText')
    for (const call of texts) {
      const isGoal = Math.abs((call.args[2] as number) - CENTRE.y) < 30 && call.args[1] === CENTRE.x
      const { fontSize } = isGoal ? goalStyle : optionStyle
      expect(call.font).toBe(fontAt(cssCanvasFont, fontSize))
    }
  })

  it('shows the time left as a ring around the goal that runs out', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    const sweep = () => {
      const [, , , start, end] = context()
        .lastDrawing()
        .find((call) => call.name === 'arc')!.args as number[]
      return (end - start) / (2 * Math.PI)
    }

    // Full while the goal is read and the actions come in…
    frames.frame(100)
    expect(sweep()).toBeCloseTo(1, 9)
    frames.frame(3_000)
    expect(sweep()).toBeCloseTo(1, 9)
    // …then 10 s to choose.
    frames.frame(5_000)
    expect(sweep()).toBeCloseTo(0.5, 9)
  })

  it('gives a point for the good action, shrinks the goal and brings new actions', async () => {
    const { click, frames, tapAt, text, session } = await setup()
    click('.game-hud__start')
    frames.frame(3_100)
    const first = lastDrawn()

    tapAt(first.good!.x, first.good!.y)
    expect(context().lastFills()).toEqual([cssVariables.get('--canvas-right-hue')])
    frames.frames(10, 50)

    expect(text('.game-hud__score')).toBe('Score: 1')
    expect(session.status.text).toBe('')
    const next = lastDrawn()
    expect(next.goals[0].text).toBe(first.goals[0].text)
    expect(next.goals[0].size).toBeCloseTo(GOAL_SIZE * 0.85, 9)
    expect(next.options.map((option) => option.text)).not.toContain(first.good!.text)
  })

  it('says in green when a goal is reached, after 3 good actions', async () => {
    const { click, frames, tapAt, text, session } = await setup()
    click('.game-hud__start')
    frames.frame(3_100)
    const title = lastDrawn().goals[0].text

    for (let i = 0; i < 3; i++) {
      const { good } = lastDrawn()
      tapAt(good!.x, good!.y)
      frames.frames(4, 50)
    }

    expect(text('.game-hud__score')).toBe('Score: 3')
    expect(session.status.text).toBe(`Goal reached: ${title}`)
    expect(session.status.element.dataset.tone).toBe('good')
  })

  it('counts a distraction as a mistake, says which in red, and grows the goal', async () => {
    const { click, frames, tapAt, text, session } = await setup()
    click('.game-hud__start')
    frames.frame(3_100)
    const { bad } = lastDrawn()

    tapAt(bad!.x, bad!.y)

    expect(context().lastFills()).toEqual([cssVariables.get('--canvas-wrong-hue')])
    expect(text('.game-hud__score')).toBe('Score: 0')
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe(`Tapped a distraction: ${bad!.text}`)
    expect(session.status.element.dataset.tone).toBe('bad')
    frames.frames(10, 50)
    expect(lastDrawn().goals[0].size).toBeCloseTo(GOAL_SIZE * 1.15, 9)
  })

  it('fails a goal after 3 distractions, saying so in red, with no extra mistake', async () => {
    const { click, frames, tapAt, text, session } = await setup()
    click('.game-hud__start')
    frames.frame(3_100)
    const title = lastDrawn().goals[0].text

    for (let i = 0; i < 3; i++) {
      const { bad } = lastDrawn()
      tapAt(bad!.x, bad!.y)
      frames.frames(4, 50)
    }

    expect(text('.game-hud__mistakes')).toBe('Mistakes: 3')
    expect(session.status.text).toBe(`Goal failed: ${title}`)
    expect(session.status.element.dataset.tone).toBe('bad')
    // The next goal, read alone.
    frames.frames(10, 50)
    expect(lastDrawn().goals.map((goal) => goal.text)).not.toContain(title)
    expect(lastDrawn().options).toEqual([])
  })

  it('counts choosing nothing in time as a mistake, and says so in red', async () => {
    const { click, frames, text, session } = await setup()
    click('.game-hud__start')

    frames.frame(13_099)
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 0')
    frames.frame(1)

    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe('Too slow: No action chosen')
    expect(session.status.element.dataset.tone).toBe('bad')
  })

  it('explains mistakes and goals over in the status bar below the canvas', () => {
    const goal: ShownGoal = {
      goal: goals[0],
      shownAtMs: 0,
      options: 2,
      timeLimitMs: 10_000,
      level: 3,
      fromSize: 150,
      resizedAtMs: 0,
      endedAtMs: 4_000,
      outcome: 'failed',
    }
    const turn: Turn = {
      goal,
      options: [],
      shownAtMs: 3_000,
      readyAtMs: 3_100,
      timeLimitMs: 10_000,
      deadlineMs: 13_100,
      endedAtMs: 3_800,
      chosen: { text: 'Scroll Instagram', good: false, x: 100, y: 200 },
    }

    expect(mistakeMessage('distraction', turn)).toBe('Tapped a distraction: Scroll Instagram')
    expect(mistakeMessage('tooSlow', { ...turn, chosen: undefined })).toBe(
      'Too slow: No action chosen',
    )
    expect(goalMessage('reached', goal)).toBe('Goal reached: Be healthier')
    expect(goalMessage('failed', goal)).toBe('Goal failed: Be healthier')
  })

  it('ends with the 10th mistake on Easy, the summary matching what was chosen', async () => {
    const { click, frames, tapAt, session, container, summaryValues } = await setup(4)
    click('.game-hud__start')
    const random = seededRandom(40)
    let lastOptions = ''
    for (let i = 0; i < 20_000 && session.lifecycle.state === 'playing'; i++) {
      // Only this frame's drawing is recorded.
      context().calls.splice(0)
      frames.frame(50)
      const { options, good, bad } = lastDrawn()
      const shown = options.map((option) => option.text).join('|')
      // Once each set of actions is fully shown: good (mostly), a distraction, or wait.
      if (!good || good.opacity < 1 || shown === lastOptions) continue
      lastOptions = shown
      const fate = random()
      if (fate < 0.7) tapAt(good.x, good.y)
      else if (fate < 0.9) tapAt(bad!.x, bad!.y)
    }
    expect(session.lifecycle.state).toBe('finished')

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    const labels = [...list.querySelectorAll('dt')].map((e) => e.textContent)
    expect(labels).toEqual([
      'Goals completed',
      'Goals failed',
      'Good actions tapped',
      'Distractions tapped',
      'Too slow',
    ])
    const [reached, , good, distracted, tooSlow] = summaryValues()
    expect(reached).toBeGreaterThan(0)
    expect(distracted).toBeGreaterThan(0)
    expect(tooSlow).toBeGreaterThan(0)
    // The 10th mistake ended the round.
    expect(distracted + tooSlow).toBe(10)
    expect(session.score.value).toBe(good)
  })

  it('ends with the first mistake on Extreme, keeping everything on screen', async () => {
    const { click, frames, tapAt, session, summaryValues } = await setup()
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')
    frames.frame(3_100)
    const before = lastDrawn()

    tapAt(before.bad!.x, before.bad!.y)

    expect(session.lifecycle.state).toBe('finished')
    expect(summaryValues()).toEqual([0, 0, 0, 1, 0])
    expect(lastDrawn().goals).toEqual(before.goals)
    expect(lastDrawn().options.map((option) => option.text)).toEqual(
      before.options.map((option) => option.text),
    )
    expect(session.status.text).toBe(`Tapped a distraction: ${before.bad!.text}`)
  })

  it('clears everything on restart and starts fresh on the next Start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(80, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')
    expect(
      context()
        .lastDrawing()
        .map((call) => call.name),
    ).toEqual(['clearRect'])

    click('.game-hud__start')
    frames.frame(3_100)
    expect(lastDrawn().options).toHaveLength(2)
    expect(lastDrawn().goals[0].size).toBe(GOAL_SIZE)
  })
})
