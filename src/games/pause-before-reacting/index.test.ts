// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ovalUrl from '../../assets/emotions-rise/oval.png'
import { cssCanvasFont, cssVariables, useCssVariables } from '../../test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { stubImages } from '../../test/fake-image'
import { loadedFonts, mountForTest, mountWaitingForFont } from '../../test/mounted-game'
import { seededRandom } from '../../test/random'
import { LARGE_OVAL, LARGE_OVAL_TEXT } from '../shared/artwork'
import { chooseTextStyle, fontAt } from '../shared/text'
import data from './data/pause-before-reacting.json'
import { INSTRUCTIONS, pauseBeforeReactingGame, SITUATION_WORDS } from './index'
import { situationsFrom } from './situations'

const situations = situationsFrom(data)
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
  return mountForTest(pauseBeforeReactingGame({ random: seededRandom(seed), fonts: loadedFonts }))
}

interface Drawn {
  readonly x: number
  readonly y: number
  readonly text: string
  readonly opacity: number
}

/** The situations in the most recent drawing, read back from it: each oval, with its text. */
function lastDrawn() {
  const drawn: Drawn[] = []
  for (const { name, args, globalAlpha } of context().lastDrawing()) {
    if (name === 'drawImage') {
      const [, left, top] = args as number[]
      drawn.push({
        x: left + LARGE_OVAL.width / 2,
        y: top + LARGE_OVAL.height / 2,
        text: '',
        opacity: globalAlpha,
      })
    } else if (name === 'fillText') {
      const last = drawn.pop()!
      drawn.push({ ...last, text: `${last.text} ${String(args[0])}`.trim() })
    }
  }
  return drawn
}

const isGood = ({ text }: Drawn) => situations.good.includes(text)

/** Plays in 50 ms frames until a good and a bad situation are fully shown. */
function untilBoth(frames: { frame(ms: number): void }) {
  for (let i = 0; i < 1_000; i++) {
    const shown = lastDrawn().filter((item) => item.opacity === 1)
    const good = shown.find(isGood)
    const bad = shown.find((item) => !isGood(item))
    if (good && bad) return { good, bad }
    frames.frame(50)
  }
  throw new Error('No good and bad situations came')
}

describe('loading', () => {
  it('loads the game font before Start can be pressed', async () => {
    const { fonts, start, finishLoading } = mountWaitingForFont((fonts) =>
      pauseBeforeReactingGame({ fonts }),
    )

    expect(fonts.load).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(cssCanvasFont.family),
    )
    expect(start.disabled).toBe(true)

    finishLoading()
    await vi.waitFor(() => expect(start.disabled).toBe(false))
  })

  it('loads the oval, when the app starts too', async () => {
    vi.resetModules()
    const images = stubImages()
    const { preloadPauseBeforeReacting } = await import('./index')

    const image = await preloadPauseBeforeReacting(loadedFonts)

    expect(images).toEqual([image])
    expect(image.src).toBe(ovalUrl)
  })

  it('can still be played, with plain ovals, if the oval does not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages('error')
    // Fresh modules, so the image loaded by other tests is not cached.
    vi.resetModules()
    const { pauseBeforeReactingGame: freshGame } = await import('./index')
    const { click, frames, session } = await mountForTest(
      freshGame({ random: seededRandom(1), fonts: loadedFonts }),
    )

    click('.game-hud__start')
    frames.frame(100)

    expect(session.lifecycle.state).toBe('playing')
    expect(context().callsTo('drawImage')).toEqual([])
    expect(
      context()
        .lastDrawing()
        .filter((call) => call.name === 'ellipse'),
    ).toHaveLength(1)
  })
})

describe('Pause Before Reacting', () => {
  it('explains how to play with the Start button, before every round', async () => {
    const { container, click } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!
    const paragraphs = () => [...card.querySelectorAll('p')].map((p) => p.textContent)

    expect(INSTRUCTIONS).toEqual([
      'Pausing before reacting is the most important skill in life.',
      'It doesn’t matter what happens, it matters if you react to it',
    ])
    expect(paragraphs()).toEqual(INSTRUCTIONS)

    click('.game-hud__start')
    expect(card.closest('[hidden]')).not.toBeNull()
  })

  it('shows only the background behind the Start button', async () => {
    await setup()

    expect(context().calls.map((call) => call.name)).toEqual(['setTransform', 'clearRect'])
  })

  it('fades in the first situation at once, the next one 3 s later', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frame(50)
    expect(lastDrawn().map((item) => item.opacity)).toEqual([0.5])
    expect([...situations.good, ...situations.bad]).toContain(lastDrawn()[0].text)

    frames.frame(2_949)
    expect(lastDrawn()).toHaveLength(1)
    frames.frame(51)
    expect(lastDrawn().map((item) => item.opacity)).toEqual([1, 0.5])
  })

  it('writes every situation at one size, set at the start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(200, 50)

    const { fontSize } = chooseTextStyle(
      context().asContext(),
      cssCanvasFont,
      [...situations.good, ...situations.bad],
      LARGE_OVAL_TEXT,
    )
    const texts = context()
      .lastDrawing()
      .filter((call) => call.name === 'fillText')
    expect(texts.length).toBeGreaterThan(5)
    for (const call of texts) {
      expect(call.font).toBe(fontAt(cssCanvasFont, fontSize))
    }
  })

  it('gives a point for a good situation tapped, with no message', async () => {
    const { click, frames, tapAt, text, session } = await setup(2)
    click('.game-hud__start')
    const { good } = untilBoth(frames)

    tapAt(good.x, good.y)
    frames.frame(50)

    expect(context().lastFills()).toEqual([cssVariables.get('--canvas-right-hue')])
    expect(text('.game-hud__score')).toBe('Score: 1')
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 0')
    expect(session.status.text).toBe('')
  })

  it('counts a bad situation tapped as a mistake, and says which in red', async () => {
    const { click, frames, tapAt, text, session } = await setup(2)
    click('.game-hud__start')
    const { bad } = untilBoth(frames)

    tapAt(bad.x, bad.y)

    expect(context().lastFills()).toEqual([cssVariables.get('--canvas-wrong-hue')])
    expect(text('.game-hud__score')).toBe('Score: 0')
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe(`Tapped a bad situation: ${bad.text}`)
    expect(session.status.element.dataset.tone).toBe('bad')
  })

  it('counts a good situation gone without a tap as a mistake, and says which', async () => {
    const { click, frames, session } = await setup(3)
    click('.game-hud__start')

    while (session.mistakes.count === 0) frames.frame(1_000)

    expect(session.status.text).toMatch(/^Missed a good situation: .+$/)
    const missed = session.status.text.replace('Missed a good situation: ', '')
    expect(situations.good).toContain(missed)
  })

  it('names situations in the status bar and the summary', () => {
    expect(SITUATION_WORDS).toEqual({
      one: 'situation',
      many: 'situations',
      tapped: 'tapped',
      letGo: 'let pass',
    })
  })

  it('ends with the 10th mistake on Easy, the summary matching what happened', async () => {
    const { click, frames, tapAt, session, container, summaryValues, timesScored } = await setup(4)
    click('.game-hud__start')
    const random = seededRandom(40)
    const decided = new Set<string>()
    for (let i = 0; i < 20_000 && session.lifecycle.state === 'playing'; i++) {
      // Only this frame's drawing is recorded.
      context().calls.splice(0)
      frames.frame(50)
      for (const item of lastDrawn().filter((shown) => shown.opacity === 1)) {
        if (decided.has(item.text)) continue
        decided.add(item.text)
        // Mostly right: good ones tapped, bad ones let pass; sometimes not.
        const right = random() < 0.8
        if (isGood(item) === right) tapAt(item.x, item.y)
      }
    }
    expect(session.lifecycle.state).toBe('finished')

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    const labels = [...list.querySelectorAll('dt')].map((e) => e.textContent)
    expect(labels).toEqual([
      'Good situations tapped',
      'Good situations missed',
      'Bad situations tapped',
      'Bad situations let pass',
      'Best combo',
    ])
    const [goodTapped, goodMissed, badTapped, badLetPass] = summaryValues()
    expect(goodMissed + badTapped).toBe(10)
    expect(goodTapped).toBeGreaterThan(0)
    expect(badLetPass).toBeGreaterThan(0)
    // Only good ones tapped score; bad ones let pass do not.
    expect(timesScored()).toBe(goodTapped)
  })

  it('ends with the first mistake on Extreme, keeping everything on screen', async () => {
    const { click, frames, tapAt, session, summaryValues } = await setup(2)
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')
    const { bad } = untilBoth(frames)
    const before = lastDrawn().map((item) => item.text)

    tapAt(bad.x, bad.y)
    frames.frames(20, 50)

    expect(session.lifecycle.state).toBe('finished')
    expect(summaryValues()).toEqual([0, 0, 1, expect.any(Number)])
    expect(lastDrawn().map((item) => item.text)).toEqual(before)
  })

  it('clears everything on restart and starts fresh on the next Start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(200, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')
    expect(
      context()
        .lastDrawing()
        .map((call) => call.name),
    ).toEqual(['clearRect'])

    click('.game-hud__start')
    frames.frame(100)
    expect(lastDrawn()).toHaveLength(1)
  })
})
