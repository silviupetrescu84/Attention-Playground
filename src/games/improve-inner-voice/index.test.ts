// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ovalUrl from '../../assets/emotions-rise/oval.png'
import { cssCanvasFont, cssVariables, useCssVariables } from '../../test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { stubImages } from '../../test/fake-image'
import { loadedFonts, mountForTest, mountWaitingForFont } from '../../test/mounted-game'
import { constantRandom, seededRandom } from '../../test/random'
import type { Random } from '../shared/random'
import { fitFontSize, fontAt, largestTextStyle } from '../shared/text'
import data from './data/improve-inner-voice.json'
import { PAD_LABEL, PAD_TEXT_FIT, WORD_TEXT } from './draw'
import { WORD_OVAL } from './improve-inner-voice'
import { improveInnerVoiceGame, INNER_VOICE_WORDS, INSTRUCTIONS } from './index'
import { wordsFrom } from './words'

const words = wordsFrom(data)
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
  return mountForTest(improveInnerVoiceGame({ random, fonts: loadedFonts }))
}

interface Drawn {
  readonly x: number
  readonly y: number
  readonly text: string
  readonly opacity: number
}

/** The words and the pad in the most recent drawing, read back from it. */
function lastDrawn() {
  const drawn: Drawn[] = []
  let padLeft: number | undefined
  for (const { name, args, globalAlpha } of context().lastDrawing()) {
    if (name === 'drawImage') {
      const [, left, top] = args as number[]
      drawn.push({
        x: left + WORD_OVAL.width / 2,
        y: top + WORD_OVAL.height / 2,
        text: '',
        opacity: globalAlpha,
      })
    } else if (name === 'fillText' && padLeft === undefined) {
      // A word's text (the pad's label is written after the pad).
      const last = drawn.pop()!
      drawn.push({ ...last, text: `${last.text} ${String(args[0])}`.trim() })
    } else if (name === 'roundRect') {
      padLeft = args[0] as number
    }
  }
  return { words: drawn, padX: padLeft === undefined ? undefined : padLeft + 50 }
}

/**
 * Plays in 50 ms frames with the finger on the first word fully shown that
 * `wanted` picks, until `done`: returns that word.
 */
function chase(
  played: Awaited<ReturnType<typeof setup>>,
  wanted: (word: Drawn) => boolean,
  done: () => boolean,
) {
  const { frames, finger } = played
  let target: Drawn | undefined
  for (let i = 0; i < 2_000 && !done(); i++) {
    frames.frame(50)
    target ??= lastDrawn().words.find((word) => word.opacity === 1 && wanted(word))
    if (target) finger.down(target.x)
  }
  if (!target) throw new Error('No such word came')
  return target
}

const isGood = ({ text }: Drawn) => words.good.includes(text)

describe('loading', () => {
  it('loads the game font before Start can be pressed', async () => {
    const { fonts, start, finishLoading } = mountWaitingForFont((fonts) =>
      improveInnerVoiceGame({ fonts }),
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

  it.each([
    ['has loaded', 'load'],
    ['could not load', 'error'],
  ] as const)('draws the pad again once the oval %s, in the font now loaded', async (_, event) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages(event)
    // Fresh modules, so the image loaded by other tests is not cached.
    vi.resetModules()
    const { improveInnerVoiceGame: freshGame } = await import('./index')
    const { start, finishLoading } = mountWaitingForFont((fonts) => freshGame({ fonts }))
    const drawings = () => context().callsTo('clearRect').length
    const before = drawings()

    finishLoading()
    await vi.waitFor(() => {
      expect(start.disabled).toBe(false)
    })

    expect(drawings()).toBe(before + 1)
    expect(context().lastDrawing().at(-1)?.args[0]).toBe('Inner Voice')
  })

  it('loads the oval, when the app starts too', async () => {
    vi.resetModules()
    const images = stubImages()
    const { preloadImproveInnerVoice } = await import('./index')

    const image = await preloadImproveInnerVoice(loadedFonts)

    expect(images).toEqual([image])
    expect(image.src).toBe(ovalUrl)
  })

  it('can still be played, with plain ovals, if the oval does not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages('error')
    // Fresh modules, so the image loaded by other tests is not cached.
    vi.resetModules()
    const { improveInnerVoiceGame: freshGame } = await import('./index')
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

describe('Improve Inner Voice', () => {
  it('explains how to play with the Start button', async () => {
    const { container } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!

    expect(INSTRUCTIONS).toEqual(['Internalize only what helps you'])
    expect([...card.querySelectorAll('p')].map((p) => p.textContent)).toEqual(INSTRUCTIONS)
  })

  it('shows the pad, in the middle, behind the Start button', async () => {
    await setup()

    expect(
      context()
        .lastDrawing()
        .map((call) => call.name),
    ).toEqual(['clearRect', 'beginPath', 'roundRect', 'fill', 'fillText'])
    expect(lastDrawn().padX).toBe(200)
    const [label] = context().callsTo('fillText')
    expect([label.args[0], label.font]).toEqual(['Inner Voice', fontAt(cssCanvasFont, 15)])
  })

  it('writes the pad’s label at the largest size that fits, set at the start', async () => {
    const { click } = await setup()
    click('.game-hud__start')

    // The fake font: 11 characters at 0.6 × size must fit in 76 px.
    const size = fitFontSize(context().asContext(), cssCanvasFont, [PAD_LABEL], PAD_TEXT_FIT)
    expect(size).toBe(11.5)
    const label = context().callsTo('fillText').at(-1)!
    expect([label.args[0], label.font]).toEqual([PAD_LABEL, fontAt(cssCanvasFont, size)])
  })

  it('fades in the first word at once, below the score bar, the next one 3 s later', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frame(50)
    const [first] = lastDrawn().words
    expect(first.opacity).toBe(0.5)
    expect(first.y - WORD_OVAL.height / 2).toBeCloseTo(64 + 2, 0)
    expect([...words.good, ...words.bad]).toContain(first.text)

    frames.frames(60, 50)
    expect(lastDrawn().words.map((word) => word.opacity)).toEqual([1, 0.5])
  })

  it('writes every word at one size, on one line, set at the start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(130, 50)

    const { fontSize } = largestTextStyle(
      context().asContext(),
      cssCanvasFont,
      [...words.good, ...words.bad],
      WORD_TEXT,
      1,
    )
    const texts = context()
      .lastDrawing()
      .filter((call) => call.name === 'fillText' && call.args[0] !== PAD_LABEL)
    expect(texts.length).toBeGreaterThan(2)
    for (const call of texts) {
      expect(call.font).toBe(fontAt(cssCanvasFont, fontSize))
    }
  })

  it('moves the pad towards the finger, at its own speed, and stops it when the finger lifts', async () => {
    const { click, frames, finger } = await setup()
    click('.game-hud__start')

    finger.down(380)
    frames.frames(20, 50)
    // 1 s: 60 px/s, a little faster as it goes.
    const after1s = lastDrawn().padX!
    expect(after1s - 200).toBeGreaterThan(60)
    expect(after1s - 200).toBeLessThan(70)

    finger.up()
    frames.frames(20, 50)
    expect(lastDrawn().padX).toBe(after1s)
  })

  it('follows the finger as it moves', async () => {
    const { click, frames, finger } = await setup()
    click('.game-hud__start')
    finger.down(380)
    frames.frames(10, 50)

    finger.move(20)
    frames.frames(10, 50)

    expect(lastDrawn().padX).toBeLessThan(200)
  })

  it('gives a point for a good word caught, with no message, fading it out green', async () => {
    const played = await setup(seededRandom(2))
    const { click, text, session } = played
    click('.game-hud__start')

    chase(played, isGood, () => session.score.value > 0)

    expect(context().lastFills()).toContain(cssVariables.get('--canvas-right-hue'))
    expect(text('.game-hud__score')).toBe('Score: 1')
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 0')
    expect(session.status.text).toBe('')
  })

  it('counts a bad word caught as a mistake, and says which in red', async () => {
    const played = await setup(seededRandom(2))
    const { click, session } = played
    click('.game-hud__start')

    const bad = chase(
      played,
      (word) => !isGood(word),
      () => session.status.text.startsWith('Caught'),
    )

    expect(session.status.text).toBe(`Caught a bad word: ${bad.text}`)
    expect(session.status.element.dataset.tone).toBe('bad')
    expect(context().lastFills()).toContain(cssVariables.get('--canvas-wrong-hue'))
  })

  it('counts a good word fallen off as a mistake, and says which', async () => {
    const { click, frames, session } = await setup(seededRandom(3))
    click('.game-hud__start')

    while (session.mistakes.count === 0) frames.frame(500)

    const missed = /^Missed a good word: (.+)$/.exec(session.status.text)
    expect(words.good).toContain(missed?.[1])
  })

  it('shows the player empowered after 3 good words in a row: the pad and the bottom edged green', async () => {
    // Always 0: 4 good words in columns 0 and 2, then a bad one, and so on.
    const { click, frames, finger, session } = await setup(constantRandom(0))
    const empowered = cssVariables.get('--inner-voice-empowered')
    const greenShown = () => {
      const drawing = context().lastDrawing()
      const strokes = drawing.filter((call) => call.name === 'stroke')
      const edges = drawing.filter((call) => call.name === 'fillRect')
      return [strokes.map((call) => call.strokeStyle), edges.map((call) => call.fillStyle)]
    }
    click('.game-hud__start')
    finger.down(100)

    while (session.score.value < 2) frames.frame(50)
    expect(greenShown()).toEqual([[], []])

    while (session.score.value < 3) frames.frame(50)
    expect(greenShown()).toEqual([[empowered], [empowered]])
  })

  it('forgives the next mistake without a word: a bad word caught disappears, and the green goes', async () => {
    const { click, frames, finger, session } = await setup(constantRandom(0))
    click('.game-hud__start')
    finger.down(100)
    const greenParts = () =>
      context()
        .lastDrawing()
        .filter((call) => call.name === 'stroke' || call.name === 'fillRect')
    while (session.score.value < 4) frames.frame(50)
    expect(greenParts()).toHaveLength(2)
    const padTop = 748

    // The 5th word, bad, reaches the pad 3 s after the 4th (the 6th 3 s later).
    frames.frames(70, 50)

    expect(session.mistakes.count).toBe(0)
    expect(session.status.text).toBe('')
    // Nothing caught left on the pad, fading out.
    expect(lastDrawn().words.every((word) => word.y + WORD_OVAL.height / 2 < padTop)).toBe(true)
    expect(context().lastFills()).not.toContain(cssVariables.get('--canvas-wrong-hue'))
    expect(greenParts()).toEqual([])
  })

  it('names words in the status bar and the summary', () => {
    expect(INNER_VOICE_WORDS).toEqual({
      one: 'word',
      many: 'words',
      tapped: 'caught',
      letGo: 'let fall',
    })
  })

  it('ends with the 10th mistake on Easy, the summary matching what happened', async () => {
    const { click, playUntilOver, timesScored, container, summaryValues } = await setup(
      seededRandom(4),
    )
    click('.game-hud__start')

    playUntilOver()

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    expect([...list.querySelectorAll('dt')].map((e) => e.textContent)).toEqual([
      'Good words caught',
      'Good words missed',
      'Bad words caught',
      'Bad words let fall',
      'Best combo',
    ])
    const [goodCaught, goodMissed, badCaught] = summaryValues()
    expect(goodMissed + badCaught).toBe(10)
    expect(timesScored()).toBe(goodCaught)
  })

  it('ends with the first mistake on Extreme, keeping everything on screen', async () => {
    const { click, frames, session } = await setup(seededRandom(3))
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')

    while (session.lifecycle.state === 'playing') frames.frame(500)
    const before = lastDrawn()
    frames.frames(20, 50)

    expect(session.mistakes.count).toBe(1)
    expect(lastDrawn()).toEqual(before)
  })

  it('clears everything on restart, the pad back in the middle', async () => {
    const { click, frames, finger } = await setup()
    click('.game-hud__start')
    finger.down(380)
    frames.frames(40, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')

    expect(lastDrawn()).toEqual({ words: [], padX: 200 })
  })
})
