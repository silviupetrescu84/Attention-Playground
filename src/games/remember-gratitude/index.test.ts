// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ovalUrl from '../../assets/emotions-rise/oval.png'
import { cssCanvasFont, cssVariables, useCssVariables } from '../../test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { stubImages } from '../../test/fake-image'
import { loadedFonts, mountForTest, mountWaitingForFont } from '../../test/mounted-game'
import { seededRandom } from '../../test/random'
import { repeatUntil } from '../../test/repeat'
import { ovalTextShape } from '../shared/artwork'
import type { Random } from '../shared/random'
import { chooseTextStyle, fitFontSize, fontAt } from '../shared/text'
import data from './data/remember-gratitude.json'
import { DONE_TEXT_FIT } from './draw'
import {
  GRATITUDE_WORDS,
  INSTRUCTIONS,
  preloadRememberGratitude,
  rememberGratitudeGame,
} from './index'
import { DONE_BUTTON, ovalFor } from './layout'
import { thingsFrom } from './things'

const things = thingsFrom(data)
const isGood = (text: string) => things.good.includes(text)
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

function setup(random: Random = seededRandom(1)) {
  return mountForTest(rememberGratitudeGame({ random, fonts: loadedFonts }))
}

type Played = Awaited<ReturnType<typeof setup>>

interface Drawn {
  readonly x: number
  readonly y: number
  readonly text: string
  readonly opacity: number
}

/** The things in the most recent drawing (their texts, if shown), and the Done label if shown. */
function lastDrawn() {
  const drawn: Drawn[] = []
  let done: string | undefined
  for (const { name, args, globalAlpha } of context().lastDrawing()) {
    if (name === 'drawImage') {
      const [, left, top, width, height] = args as number[]
      drawn.push({ x: left + width / 2, y: top + height / 2, text: '', opacity: globalAlpha })
    } else if (name === 'fillText' && args[0] === DONE_BUTTON.label) {
      done = DONE_BUTTON.label
    } else if (name === 'fillText') {
      const last = drawn.pop()!
      drawn.push({ ...last, text: `${last.text} ${String(args[0])}`.trim() })
    }
  }
  return { things: drawn, done }
}

/** Plays in 50 ms frames until the things have turned around, remembering what they were. */
function rememberAndTurnAround({ frames }: Played) {
  frames.frame(100)
  const remembered = lastDrawn().things
  repeatUntil(
    () => lastDrawn().done !== undefined,
    () => frames.frame(50),
    200,
  )
  return remembered
}

const tapDone = ({ tapAt }: Played) =>
  tapAt(DONE_BUTTON.x + DONE_BUTTON.width / 2, DONE_BUTTON.y + DONE_BUTTON.height / 2)

describe('loading', () => {
  it('loads the game font before Start can be pressed', async () => {
    const { fonts, start, finishLoading } = mountWaitingForFont((fonts) =>
      rememberGratitudeGame({ fonts }),
    )

    expect(fonts.load).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(cssCanvasFont.family),
    )
    expect(start.disabled).toBe(true)

    finishLoading()
    await vi.waitFor(() => {
      expect(start.disabled).toBe(false)
    })
  })

  it('loads the oval, when the app starts too', async () => {
    vi.resetModules()
    const images = stubImages()
    const { preloadRememberGratitude: freshPreload } = await import('./index')

    const image = await freshPreload(loadedFonts)

    expect(images).toEqual([image])
    expect(image.src).toBe(ovalUrl)
    expect(preloadRememberGratitude).toBeTypeOf('function')
  })

  it('can still be played, with plain ovals, if the oval does not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages('error')
    // Fresh modules, so the image loaded by other tests is not cached.
    vi.resetModules()
    const { rememberGratitudeGame: freshGame } = await import('./index')
    const { click, frames, session } = await mountForTest(
      freshGame({ random: seededRandom(1), fonts: loadedFonts }),
    )

    click('.game-hud__start')
    frames.frame(100)

    expect(session.lifecycle.state).toBe('playing')
    expect(context().callsTo('drawImage')).toEqual([])
    const ovals = context()
      .lastDrawing()
      .filter((call) => call.name === 'ellipse')
    expect(ovals).toHaveLength(2)
  })
})

describe('Remember Gratitude', () => {
  it('explains how to play with the Start button', async () => {
    const { container } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!

    expect(INSTRUCTIONS).toEqual([
      'Remember the things to be grateful for',
      'Once they turn around, tap them, then tap Done',
    ])
    expect([...card.querySelectorAll('p')].map((p) => p.textContent)).toEqual(INSTRUCTIONS)
  })

  it('shows nothing behind the Start button', async () => {
    await setup()

    expect(lastDrawn()).toEqual({ things: [], done: undefined })
  })

  it('shows a good thing and a bad one at once, fading in, without the Done button', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frame(50)

    const { things: shown, done } = lastDrawn()
    expect(shown.map((thing) => thing.opacity)).toEqual([0.5, 0.5])
    expect(shown.map((thing) => isGood(thing.text)).sort()).toEqual([false, true])
    expect(done).toBeUndefined()
  })

  it('turns them around after 5 s: no texts, and the Done button', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frames(99, 50)
    expect(lastDrawn().things.every((thing) => thing.text)).toBe(true)
    frames.frame(50)
    const turned = lastDrawn()
    // The button fades in from then on.
    frames.frame(50)

    expect(turned.things.map((thing) => thing.text)).toEqual(['', ''])
    expect(turned.done).toBeUndefined()
    expect(lastDrawn().done).toBe('Done')
  })

  it('writes every thing at one size for its oval, measured at the start, and Done at its own', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frame(100)

    const { fontSize } = chooseTextStyle(
      context().asContext(),
      cssCanvasFont,
      [...things.good, ...things.bad],
      ovalTextShape(ovalFor(2)),
    )
    const written = context().callsTo('fillText').slice(-2)
    expect(written.map((call) => call.font)).toEqual([
      fontAt(cssCanvasFont, fontSize),
      fontAt(cssCanvasFont, fontSize),
    ])
    frames.frames(100, 50)
    const doneSize = fitFontSize(context().asContext(), cssCanvasFont, ['Done'], DONE_TEXT_FIT)
    expect(context().callsTo('fillText').at(-1)!.font).toBe(fontAt(cssCanvasFont, doneSize))
  })

  it('ignores taps on the things before they turn around', async () => {
    const played = await setup()
    const { click, frames, tapAt, session } = played
    click('.game-hud__start')
    frames.frame(100)

    for (const thing of lastDrawn().things) tapAt(thing.x, thing.y)
    tapDone(played)

    expect([session.score.value, session.mistakes.count]).toEqual([0, 0])
  })

  it('gives a point for a good thing tapped, showing it again in green, with no message', async () => {
    const played = await setup()
    const { click, tapAt, text, session } = played
    click('.game-hud__start')
    const good = rememberAndTurnAround(played).find((thing) => isGood(thing.text))!

    tapAt(good.x, good.y)

    expect(text('.game-hud__score')).toBe('Score: 1')
    expect(session.status.text).toBe('')
    expect(lastDrawn().things.map((thing) => thing.text)).toContain(good.text)
    expect(context().lastFills()).toContain(cssVariables.get('--canvas-right-hue'))
  })

  it('counts a bad thing tapped as a mistake, showing it again in red, and says which', async () => {
    const played = await setup()
    const { click, tapAt, text, session } = played
    click('.game-hud__start')
    const bad = rememberAndTurnAround(played).find((thing) => !isGood(thing.text))!

    tapAt(bad.x, bad.y)

    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe(`Tapped a bad thing: ${bad.text}`)
    expect(session.status.element.dataset.tone).toBe('bad')
    expect(context().lastFills()).toContain(cssVariables.get('--canvas-wrong-hue'))
  })

  it('counts a good thing not tapped when done as a mistake, showing it in red for 2 s', async () => {
    const played = await setup()
    const { click, frames, text, session } = played
    click('.game-hud__start')
    const good = rememberAndTurnAround(played).find((thing) => isGood(thing.text))!

    tapDone(played)
    // Done fades out over 0.1 s.
    frames.frame(100)

    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe(`Missed a good thing: ${good.text}`)
    // Shown again, in red, and nothing else written: the bad one stays blank, Done has gone.
    expect(lastDrawn()).toEqual({
      things: expect.arrayContaining([expect.objectContaining({ text: good.text, opacity: 1 })]),
      done: undefined,
    })
    expect(context().lastFills()).toContain(cssVariables.get('--canvas-wrong-hue'))
    // 2 s, then 0.1 s to fade out and 0.5 s before the next things fade in.
    frames.frames(37, 50)
    expect(lastDrawn().things.map((thing) => thing.text)).toContain(good.text)
    frames.frames(13, 50)
    expect(lastDrawn().things).toEqual([])
    frames.frame(50)
    expect(lastDrawn().things).toHaveLength(2)
  })

  it('brings the next things 0.6 s after a turn all right, without waiting', async () => {
    const played = await setup()
    const { click, frames, tapAt } = played
    click('.game-hud__start')
    const good = rememberAndTurnAround(played).find((thing) => isGood(thing.text))!
    tapAt(good.x, good.y)

    tapDone(played)

    frames.frames(12, 50)
    expect(lastDrawn().things).toEqual([])
    frames.frame(50)
    expect(lastDrawn().things).toHaveLength(2)
  })

  it('ends the turn without Done once every thing is tapped', async () => {
    const played = await setup()
    const { click, frames, tapAt, session } = played
    click('.game-hud__start')
    const shown = rememberAndTurnAround(played)

    for (const thing of shown) tapAt(thing.x, thing.y)
    // Done fades out over 0.1 s, as if pressed.
    frames.frame(100)

    // The good one scored, the bad one a mistake: no Done needed.
    expect([session.score.value, session.mistakes.count]).toEqual([1, 1])
    expect(lastDrawn().done).toBeUndefined()
    expect(
      lastDrawn()
        .things.map((thing) => thing.text)
        .sort(),
    ).toEqual(shown.map((thing) => thing.text).sort())
  })

  it('runs a ring out where the Done button will be, while the things are remembered', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frames(50, 50)

    const [ring] = context()
      .lastDrawing()
      .filter((call) => call.name === 'stroke')
    expect(ring.strokeStyle).toBe(cssVariables.get('--gratitude-ring'))
    frames.frames(50, 50)
    expect(
      context()
        .lastDrawing()
        .filter((call) => call.name === 'arc'),
    ).toEqual([])
  })

  it('names things in the status bar and the summary', () => {
    expect(GRATITUDE_WORDS).toEqual({
      one: 'thing',
      many: 'things',
      tapped: 'tapped',
      letGo: 'left alone',
    })
  })

  it('ends with the 10th mistake on Easy, the summary matching what happened', async () => {
    const played = await setup(seededRandom(4))
    const { click, container, playUntilOver, session, summaryValues } = played
    click('.game-hud__start')

    // The first turn right, then done with every other straight away.
    const good = rememberAndTurnAround(played).find((thing) => isGood(thing.text))!
    played.tapAt(good.x, good.y)
    repeatUntil(
      () => session.lifecycle.state !== 'playing',
      () => {
        tapDone(played)
        played.frames.frame(50)
      },
    )
    playUntilOver()

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    expect([...list.querySelectorAll('dt')].map((e) => e.textContent)).toEqual([
      'Good things tapped',
      'Good things missed',
      'Bad things tapped',
      'Bad things left alone',
      'Best combo',
    ])
    const [goodTapped, goodMissed, badTapped] = summaryValues()
    expect([goodTapped, goodMissed, badTapped]).toEqual([1, 10, 0])
    expect(session.score.value).toBe(1)
  })

  it('ends with the first mistake on Extreme, keeping everything on screen', async () => {
    const played = await setup()
    const { click, frames, session } = played
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')
    rememberAndTurnAround(played)

    tapDone(played)
    const before = lastDrawn()
    frames.frames(20, 50)

    expect(session.lifecycle.state).toBe('finished')
    expect(session.mistakes.count).toBe(1)
    expect(before.things).toHaveLength(2)
    expect(lastDrawn()).toEqual(before)
  })

  it('clears everything on restart', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(20, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')

    expect(lastDrawn()).toEqual({ things: [], done: undefined })
  })
})
