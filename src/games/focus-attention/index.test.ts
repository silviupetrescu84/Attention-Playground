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
import data from './data/focus-attention.json'
import { BUTTON_TEXT_FIT, WORD_TEXT_FIT } from './draw'
import { BUTTONS, type Answer } from './focus-attention'
import { focusAttentionGame, mistakeMessage } from './index'

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
  return mountForTest(focusAttentionGame({ random: seededRandom(seed), fonts: loadedFonts }))
}

const labels = BUTTONS.map((button) => button.label)

/**
 * The word the beam points at in the most recent drawing, if any: the one
 * written where the beam's triangle ends. Whether it is a value or not.
 */
function target() {
  const drawing = context().lastDrawing()
  const apex = drawing.find((call) => call.name === 'lineTo')?.args
  const word = drawing.find(
    (call) =>
      call.name === 'fillText' && apex && call.args[1] === apex[0] && call.args[2] === apex[1],
  )
  if (!word) return undefined
  const text = String(word.args[0])
  return { text, isValue: data.values.includes(text) }
}

/** The hue drawn on the bubble with `word`, just before the word itself, if any. */
function hueOn(word: string) {
  const drawing = context().lastDrawing()
  const at = drawing.findIndex((call) => call.name === 'fillText' && call.args[0] === word)
  const before = drawing[at - 1]
  return before?.name === 'fill' ? before.fillStyle : undefined
}

/** Taps the middle of the button for `answer`. */
function press(tapAt: (x: number, y: number) => void, answer: Answer) {
  const button = BUTTONS.find((candidate) => candidate.answer === answer)!
  tapAt(button.x + button.width / 2, button.y + button.height / 2)
}

/** Plays in 50 ms frames until the beam points at a word `wanted` says yes to. */
function untilTarget(
  frames: FakeFrames,
  wanted: (word: { text: string; isValue: boolean }) => boolean,
) {
  for (let i = 0; i < 2_000; i++) {
    const word = target()
    if (word && wanted(word)) return word
    frames.frame(50)
  }
  throw new Error('The beam never pointed at such a word')
}

describe('loading', () => {
  it('loads the game font and both images before Start can be pressed', async () => {
    let finishLoading = (_: { status: string }[]) => {}
    const fonts: FontLoader & { load: ReturnType<typeof vi.fn> } = {
      load: vi.fn(() => new Promise<{ status: string }[]>((resolve) => (finishLoading = resolve))),
    }
    const images = stubImages()
    const container = document.createElement('main')
    document.body.replaceChildren(container)
    vi.resetModules()
    const { focusAttentionGame: freshGame } = await import('./index')
    mountGame(container, {
      signal: new AbortController().signal,
      game: freshGame({ fonts }),
      scheduler: new FakeFrames(),
    })
    const start = container.querySelector<HTMLButtonElement>('.game-hud__start')!

    expect(fonts.load).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(cssCanvasFont.family),
    )
    expect(images).toHaveLength(2)
    expect(start.disabled).toBe(true)

    finishLoading([{ status: 'loaded' }])
    await vi.waitFor(() => expect(start.disabled).toBe(false))
  })

  it('can still be played, with plain shapes, if the images do not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages('error')
    // Fresh modules, so the images loaded by other tests are not cached.
    vi.resetModules()
    const { focusAttentionGame: freshGame } = await import('./index')
    const { click, frames, session } = await mountForTest(
      freshGame({ random: seededRandom(1), fonts: loadedFonts }),
    )

    click('.game-hud__start')
    frames.frames(10, 50)

    expect(session.lifecycle.state).toBe('playing')
    expect(context().callsTo('drawImage')).toEqual([])
    // The projector's orb and the bubble, as circles.
    expect(context().lastDrawing().filter((call) => call.name === 'arc')).toHaveLength(2)
  })
})

describe('Focus Attention', () => {
  it('explains how to play with the Start button, before every round', async () => {
    const { container, click } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!
    const paragraphs = () => [...card.querySelectorAll('p')].map((p) => p.textContent)

    expect(card.closest('[hidden]')).toBeNull()
    expect(paragraphs()).toEqual([
      'The more you focus on your values, the more they benefit you',
      'Every moment you make choices to follow your values or not',
      'Choose the right values, change your attention from the ones that don’t serve you',
    ])

    click('.game-hud__start')
    expect(card.closest('[hidden]')).not.toBeNull()
    click('.game-hud__pause')
    click('.game-hud__overlay--paused .game-hud__restart')
    expect(card.closest('[hidden]')).toBeNull()
  })

  it('shows nothing of the game behind the Start button, then all of it once started', async () => {
    const { click } = await setup()

    expect(context().calls.map((call) => call.name)).toEqual(['setTransform', 'clearRect'])

    click('.game-hud__start')
    // The projector, the first word and the two buttons.
    const drawing = context().lastDrawing()
    expect(drawing.filter((call) => call.name === 'drawImage')).toHaveLength(2)
    expect(
      drawing.filter((call) => call.name === 'fillText').map((call) => call.args[0]).slice(1),
    ).toEqual(labels)
  })

  it('brings the first word at once, and points the beam at it once in view', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    const words = () =>
      context()
        .lastDrawing()
        .filter((call) => call.name === 'fillText' && !labels.includes(String(call.args[0])))
    expect(words()).toHaveLength(1)
    expect(target()).toBeUndefined()

    const word = untilTarget(frames, () => true)
    expect(word.text).toBe(words()[0].args[0])
  })

  it('writes every word at one size and both labels at another, chosen at the start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(20, 50)

    const wordSize = fitFontSize(
      context().asContext(),
      cssCanvasFont,
      [...data.values, ...data.antiValues],
      WORD_TEXT_FIT,
    )
    const labelSize = fitFontSize(context().asContext(), cssCanvasFont, labels, BUTTON_TEXT_FIT)
    for (const call of context().lastDrawing().filter((c) => c.name === 'fillText')) {
      const isLabel = labels.includes(String(call.args[0]))
      expect(call.font).toBe(fontAt(cssCanvasFont, isLabel ? labelSize : wordSize))
    }
  })

  it.each([
    ['Focus', 'focus', true],
    ['Change attention', 'change', false],
  ] as const)('gives a point for %s when the beam is on a %s', async (_label, answer, isValue) => {
    const { click, frames, tapAt, text, session } = await setup(3)
    click('.game-hud__start')
    const word = untilTarget(frames, (candidate) => candidate.isValue === isValue)
    const before = session.score.value
    const mistakesBefore = text('.game-hud__mistakes')

    press(tapAt, answer)

    expect(session.score.value).toBe(before + 1)
    expect(text('.game-hud__mistakes')).toBe(mistakesBefore)
    expect(target()?.text).not.toBe(word.text)
    expect(hueOn(word.text)).toBe(cssVariables.get('--canvas-right-hue'))
  })

  it.each([
    ['change', true, (word: string) => `Changed attention from a value: ${word}`],
    ['focus', false, (word: string) => `Focused on an anti-value: ${word}`],
  ] as const)(
    'counts %s on the wrong kind of word as a mistake, and says which in red',
    async (answer, isValue, message) => {
      const { click, frames, tapAt, session } = await setup(3)
      click('.game-hud__start')
      const word = untilTarget(frames, (candidate) => candidate.isValue === isValue)
      const [scoreBefore, mistakesBefore] = [session.score.value, session.mistakes.count]

      press(tapAt, answer)

      expect(session.score.value).toBe(scoreBefore)
      expect(session.mistakes.count).toBe(mistakesBefore + 1)
      expect(session.status.text).toBe(message(word.text))
      expect(session.status.element.dataset.tone).toBe('bad')
      expect(hueOn(word.text)).toBe(cssVariables.get('--canvas-wrong-hue'))
    },
  )

  it('counts a word reaching the projector as a mistake, and says so in red', async () => {
    const { click, frames, session } = await setup()
    click('.game-hud__start')
    const first = untilTarget(frames, () => true)

    while (session.mistakes.count === 0) frames.frame(50)

    expect(session.status.text).toBe(`Too slow: ${first.text} reached the projector`)
    expect(session.status.element.dataset.tone).toBe('bad')
  })

  it('explains mistakes in the status bar below the canvas', () => {
    expect(mistakeMessage('focusedAntiValue', { text: 'Greed', type: 'bad' })).toBe(
      'Focused on an anti-value: Greed',
    )
    expect(mistakeMessage('leftValue', { text: 'Kindness', type: 'good' })).toBe(
      'Changed attention from a value: Kindness',
    )
    expect(mistakeMessage('reachedProjector', { text: 'Kindness', type: 'good' })).toBe(
      'Too slow: Kindness reached the projector',
    )
  })

  it('ends with the 10th mistake on Easy, with what happened matching the score', async () => {
    const { click, frames, tapAt, session, container, summaryValues } = await setup(4)
    click('.game-hud__start')
    const random = seededRandom(40)
    for (let i = 0; i < 10_000 && session.lifecycle.state === 'playing'; i++) {
      context().calls.splice(0)
      frames.frame(50)
      const word = target()
      // Now and then: right, wrong, or nothing (so words reach the projector).
      const roll = random()
      if (!word || roll > 0.1) continue
      const right = word.isValue ? 'focus' : 'change'
      const wrong = word.isValue ? 'change' : 'focus'
      press(tapAt, roll < 0.07 ? right : wrong)
    }
    expect(session.lifecycle.state).toBe('finished')

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    expect([...list.querySelectorAll('dt')].map((e) => e.textContent)).toEqual([
      'Values focused on',
      'Values changed attention from',
      'Anti-values changed attention from',
      'Anti-values focused on',
      'Reached the projector',
    ])
    const [valuesFocused, valuesLeft, antiValuesLeft, antiValuesFocused, reached] =
      summaryValues()
    expect(valuesLeft + antiValuesFocused + reached).toBe(10)
    expect(valuesFocused + antiValuesLeft).toBeGreaterThan(0)
    expect(session.score.value).toBe(valuesFocused + antiValuesLeft)
  })

  it('ends with the first mistake on Extreme, and says what it was', async () => {
    const { click, frames, tapAt, session, summaryValues } = await setup(3)
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')
    const word = untilTarget(frames, (candidate) => candidate.isValue)

    press(tapAt, 'change')

    expect(session.lifecycle.state).toBe('finished')
    expect(summaryValues()).toEqual([0, 1, 0, 0, 0])
    expect(session.status.text).toBe(`Changed attention from a value: ${word.text}`)
  })

  it('clears the words on restart and starts fresh on the next Start', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(100, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')
    expect(context().lastDrawing().map((call) => call.name)).toEqual(['clearRect'])

    click('.game-hud__start')
    expect(context().lastDrawing().filter((call) => call.name === 'fillText')).toHaveLength(3)
  })
})
