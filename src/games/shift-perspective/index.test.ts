// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cssCanvasFont, cssVariables, useCssVariables } from '../../test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { FakeFrames } from '../../test/fake-frames'
import { stubImages } from '../../test/fake-image'
import { loadedFonts, mountForTest } from '../../test/mounted-game'
import { seededRandom } from '../../test/random'
import { mountGame } from '../shared/game-shell'
import type { FontLoader } from '../shared/load-font'
import { fitFontSize, fontAt } from '../shared/text'
import data from './data/shift-perspective.json'
import { CHOICE_TEXT_FIT, THOUGHT_TEXT_FIT } from './draw'
import { CENTRE } from './shift-perspective'
import { mistakeMessage, shiftPerspectiveGame } from './index'
import { thoughtsFrom } from './thoughts'

const thoughts = thoughtsFrom(data)
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
  return mountForTest(shiftPerspectiveGame({ random: seededRandom(seed), fonts: loadedFonts }))
}

interface DrawnBubble {
  readonly x: number
  readonly y: number
  readonly text: string
  readonly opacity: number
}

/**
 * The bubbles in the most recent drawing, read back from it: each bubble
 * image, with the lines of text written after it. The thought comes first,
 * then its choices.
 */
function lastDrawn() {
  const bubbles: DrawnBubble[] = []
  for (const { name, args, globalAlpha } of context().lastDrawing()) {
    if (name === 'drawImage') {
      const [, left, top, size] = args as number[]
      bubbles.push({ x: left + size / 2, y: top + size / 2, text: '', opacity: globalAlpha })
    } else if (name === 'fillText') {
      const last = bubbles.pop()!
      bubbles.push({ ...last, text: `${last.text} ${String(args[0])}`.trim() })
    }
  }
  const [thoughtBubble, ...choices] = bubbles
  const thought = thoughts.find((candidate) => candidate.text === thoughtBubble?.text)
  return {
    thought: thoughtBubble,
    choices,
    good: choices.find((choice) => thought?.good.includes(choice.text)),
    bad: choices.find((choice) => thought?.bad.includes(choice.text)),
  }
}

/** The hues drawn in the most recent drawing (only a chosen bubble has one). */
const hues = () =>
  context()
    .lastDrawing()
    .filter((call) => call.name === 'fill')
    .map((call) => call.fillStyle)

describe('loading', () => {
  it('loads the game font and the bubble image before Start can be pressed', async () => {
    let finishLoading = (_: { status: string }[]) => {}
    const fonts: FontLoader & { load: ReturnType<typeof vi.fn> } = {
      load: vi.fn(() => new Promise<{ status: string }[]>((resolve) => (finishLoading = resolve))),
    }
    const container = document.createElement('main')
    document.body.replaceChildren(container)
    mountGame(container, {
      signal: new AbortController().signal,
      game: shiftPerspectiveGame({ fonts }),
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

  it('can still be played, with plain circles, if the bubble image does not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages('error')
    // Fresh modules, so the image loaded by other tests is not cached.
    vi.resetModules()
    const { shiftPerspectiveGame: freshGame } = await import('./index')
    const { click, frames, session } = await mountForTest(
      freshGame({ random: seededRandom(1), fonts: loadedFonts }),
    )

    click('.game-hud__start')
    frames.frame(3_100)

    expect(session.lifecycle.state).toBe('playing')
    expect(context().callsTo('drawImage')).toEqual([])
    // The thought and its 2 choices, as circles.
    expect(context().lastDrawing().filter((call) => call.name === 'fill')).toHaveLength(3)
  })
})

describe('Shift Perspective', () => {
  it('explains how to play with the Start button, before every round', async () => {
    const { container, click } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!
    const paragraphs = () => [...card.querySelectorAll('p')].map((p) => p.textContent)

    expect(card.closest('[hidden]')).toBeNull()
    expect(paragraphs()).toEqual([
      'It doesn’t matter what happens, it matters how you react to it',
      'Read what happened, choose the reaction that does you good',
    ])

    click('.game-hud__start')
    expect(card.closest('[hidden]')).not.toBeNull()
    click('.game-hud__pause')
    click('.game-hud__overlay--paused .game-hud__restart')
    expect(card.closest('[hidden]')).toBeNull()
  })

  it('shows only the background behind the Start button', async () => {
    await setup()

    expect(context().calls.map((call) => call.name)).toEqual(['setTransform', 'clearRect'])
  })

  it('fades in a thought, alone for 3 s, then 2 choices above and below it', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frame(50)
    expect(lastDrawn().thought.opacity).toBeCloseTo(0.5, 9)
    expect(lastDrawn().choices).toEqual([])
    frames.frame(2_949)
    expect(lastDrawn().thought).toMatchObject({ x: CENTRE.x, y: CENTRE.y, opacity: 1 })
    expect(lastDrawn().choices).toEqual([])

    frames.frame(51)
    expect(lastDrawn().choices.map((choice) => choice.opacity)).toEqual([0.5, 0.5])
    frames.frame(50)
    const { choices, good, bad } = lastDrawn()

    expect(choices.map((choice) => choice.opacity)).toEqual([1, 1])
    expect(choices.map(({ x, y }) => [x, Math.round(y)])).toEqual([
      [200, 432 - 134],
      [200, 432 + 134],
    ])
    expect(good).toBeDefined()
    expect(bad).toBeDefined()
  })

  it('writes all thoughts at one size and all choices at another, set at the start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frame(3_100)

    const sizeOf = (texts: readonly string[], fit: typeof THOUGHT_TEXT_FIT) =>
      fontAt(cssCanvasFont, fitFontSize(context().asContext(), cssCanvasFont, texts, fit))
    const thoughtFont = sizeOf(
      thoughts.map((thought) => thought.text),
      THOUGHT_TEXT_FIT,
    )
    const choiceFont = sizeOf(
      thoughts.flatMap((thought) => [...thought.good, ...thought.bad]),
      CHOICE_TEXT_FIT,
    )
    const texts = context()
      .lastDrawing()
      .filter((call) => call.name === 'fillText')
    const atCentre = texts.filter((call) => call.args[1] === CENTRE.x && call.args[2] !== undefined)
    expect(texts.length).toBeGreaterThan(2)
    for (const call of texts) {
      const isThought = Math.abs((call.args[2] as number) - CENTRE.y) < 40
      expect(call.font).toBe(isThought ? thoughtFont : choiceFont)
    }
    expect(atCentre.length).toBeGreaterThan(0)
  })

  it('shows the time left as a ring around the thought that runs out', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    const sweep = () => {
      const [, , , start, end] = context()
        .lastDrawing()
        .find((call) => call.name === 'arc')!.args as number[]
      return (end - start) / (2 * Math.PI)
    }

    // Full while the thought is read and the choices come in…
    frames.frame(100)
    expect(sweep()).toBeCloseTo(1, 9)
    frames.frame(3_000)
    expect(sweep()).toBeCloseTo(1, 9)
    // …then 10 s to choose.
    frames.frame(5_000)
    expect(sweep()).toBeCloseTo(0.5, 9)
  })

  it('gives a point for the good choice, with no message, then shows the next', async () => {
    const { click, frames, tapAt, text, session } = await setup()
    click('.game-hud__start')
    frames.frame(3_100)
    const first = lastDrawn()

    tapAt(first.good!.x, first.good!.y)
    expect(hues()).toEqual([cssVariables.get('--canvas-right-hue')])
    frames.frames(5, 50)

    expect(text('.game-hud__score')).toBe('Score: 1')
    expect(session.status.text).toBe('')
    expect(lastDrawn().thought.opacity).toBe(1)
    expect(lastDrawn().thought.text).not.toBe(first.thought.text)
  })

  it('counts a bad choice as a mistake, and says which in red', async () => {
    const { click, frames, tapAt, text, session } = await setup()
    click('.game-hud__start')
    frames.frame(3_100)
    const { bad } = lastDrawn()

    tapAt(bad!.x, bad!.y)

    expect(hues()).toEqual([cssVariables.get('--canvas-wrong-hue')])
    expect(text('.game-hud__score')).toBe('Score: 0')
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe(`Chose a bad thought: ${bad!.text}`)
    expect(session.status.element.dataset.tone).toBe('bad')
  })

  it('counts choosing nothing in time as a mistake, and says so in red', async () => {
    const { click, frames, text, session } = await setup()
    click('.game-hud__start')

    frames.frame(13_099)
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 0')
    frames.frame(1)

    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe('Too slow: No choice selected')
    expect(session.status.element.dataset.tone).toBe('bad')
  })

  it('explains mistakes in the status bar below the canvas', () => {
    const turn = {
      thought: 'They did not reply',
      choices: [],
      shownAtMs: 0,
      choicesAtMs: 3_000,
      readyAtMs: 3_100,
      timeLimitMs: 10_000,
      deadlineMs: 13_100,
      endedAtMs: 3_800,
      chosen: { text: 'They hate me', good: false, x: 200, y: 566 },
    }

    expect(mistakeMessage('badChosen', turn)).toBe('Chose a bad thought: They hate me')
    expect(mistakeMessage('tooSlow', { ...turn, chosen: undefined })).toBe(
      'Too slow: No choice selected',
    )
  })

  it('ends with the 10th mistake on Easy, with what was chosen matching the score', async () => {
    const { click, frames, tapAt, session, container, summaryValues } = await setup(4)
    click('.game-hud__start')
    const random = seededRandom(40)
    /** What happens to each thought, decided when it is shown: good, bad or too slow. */
    const fates = new Map<string, number>()
    for (let i = 0; i < 10_000 && session.lifecycle.state === 'playing'; i++) {
      // Only this frame's drawing is recorded.
      context().calls.splice(0)
      frames.frame(50)
      const { thought, good, bad } = lastDrawn()
      // Once its choices are fully shown.
      if (!good || good.opacity < 1) continue
      if (!fates.has(thought.text)) fates.set(thought.text, Math.floor(random() * 3))
      if (fates.get(thought.text) === 0) tapAt(good!.x, good!.y)
      else if (fates.get(thought.text) === 1) tapAt(bad!.x, bad!.y)
    }
    expect(session.lifecycle.state).toBe('finished')

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    const labels = [...list.querySelectorAll('dt')].map((e) => e.textContent)
    expect(labels).toEqual(['Good thoughts chosen', 'Bad thoughts chosen', 'Too slow'])
    const [good, bad, tooSlow] = summaryValues()
    expect(bad + tooSlow).toBe(10)
    expect(bad).toBeGreaterThan(0)
    expect(tooSlow).toBeGreaterThan(0)
    expect(good).toBeGreaterThan(0)
    expect(session.score.value).toBe(good)
  })

  it('ends with the first mistake on Extreme, keeping that thought on screen', async () => {
    const { click, frames, tapAt, session, summaryValues } = await setup()
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')
    frames.frame(3_100)
    const { thought, bad } = lastDrawn()

    tapAt(bad!.x, bad!.y)

    expect(session.lifecycle.state).toBe('finished')
    expect(summaryValues()).toEqual([0, 1, 0])
    expect(lastDrawn().thought).toEqual(thought)
    expect(session.status.text).toBe(`Chose a bad thought: ${bad!.text}`)
  })

  it('clears the thought on restart and starts fresh on the next Start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(20, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')
    expect(context().lastDrawing().map((call) => call.name)).toEqual(['clearRect'])

    click('.game-hud__start')
    frames.frame(3_100)
    expect(lastDrawn().choices).toHaveLength(2)
  })
})
