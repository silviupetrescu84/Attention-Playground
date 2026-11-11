// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bubblesAt, findPoint } from '../../test/emotions-rise/bubbles'
import { cssCanvasFont, cssVariables, useCssVariables } from '../../test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { FakeFrames } from '../../test/fake-frames'
import { stubImages } from '../../test/fake-image'
import { loadedFonts, mountForTest } from '../../test/mounted-game'
import { seededRandom } from '../../test/random'
import { mountGame } from '../shared/game-shell'
import type { FontLoader } from '../shared/load-font'
import { fitFontSize, fontAt } from '../shared/text'
import emotions from './data/emotions.json'
import { EMOTION_TEXT_FIT } from './draw'
import { SPAWN_Y } from './emotions-rise'
import { emotionsRiseGame, mistakeMessage } from './index'

let contexts: FakeContext[]

beforeEach(() => {
  contexts = useFakeCanvasContexts()
  stubImages()
  useCssVariables()
})

/** The context of the game mounted in the test. */
const context = () => contexts.at(-1)!

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Mounts the game and waits until it has loaded (Start enabled). */
function setup(seed = 1) {
  return mountForTest(emotionsRiseGame({ random: seededRandom(seed), fonts: loadedFonts }))
}

/** The bubbles in the most recent drawing: word and centre. */
function lastDrawnBubbles() {
  return context()
    .lastDrawing()
    .filter((call) => call.name === 'fillText')
    .map(({ args: [word, x, y] }) => ({ word: word as string, x: x as number, y: y as number }))
}

const isGood = (word: string) => emotions.positive.includes(word)

describe('loading', () => {
  it('loads the emotion font before Start can be pressed', async () => {
    let finishLoading = (_: { status: string }[]) => {}
    const fonts: FontLoader & { load: ReturnType<typeof vi.fn> } = {
      load: vi.fn(() => new Promise<{ status: string }[]>((resolve) => (finishLoading = resolve))),
    }
    const container = document.createElement('main')
    document.body.replaceChildren(container)
    mountGame(container, {
      signal: new AbortController().signal,
      game: emotionsRiseGame({ fonts }),
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

  it('can still be played if the font does not load', async () => {
    const fonts: FontLoader = { load: async () => [] }
    const container = document.createElement('main')
    document.body.replaceChildren(container)
    const session = mountGame(container, {
      signal: new AbortController().signal,
      game: emotionsRiseGame({ fonts }),
      scheduler: new FakeFrames(),
    })
    const start = container.querySelector<HTMLButtonElement>('.game-hud__start')!

    await vi.waitFor(() => expect(start.disabled).toBe(false))
    start.click()

    expect(session.lifecycle.state).toBe('playing')
    expect(context().callsTo('fillText')).toHaveLength(1)
  })

  it('draws every bubble with the loaded oval image', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(100, 50)

    const images = context().callsTo('drawImage')
    expect(images.length).toBeGreaterThan(5)
    expect(images).toHaveLength(context().callsTo('fillText').length)
    expect(new Set(images.map((call) => call.args[0])).size).toBe(1)
    expect(context().callsTo('ellipse')).toEqual([])
  })

  it('can still be played, with plain ovals, if the bubble image does not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages('error')
    // Fresh modules, so the image loaded by other tests is not cached.
    vi.resetModules()
    const { emotionsRiseGame: freshGame } = await import('./index')
    const { click, frames, session } = await mountForTest(
      freshGame({ random: seededRandom(1), fonts: loadedFonts }),
    )

    click('.game-hud__start')
    frames.frames(100, 50)

    expect(session.lifecycle.state).toBe('playing')
    expect(context().callsTo('fillText').length).toBeGreaterThan(5)
    expect(context().callsTo('ellipse')).toHaveLength(context().callsTo('fillText').length)
    expect(context().callsTo('drawImage')).toEqual([])
  })

  it('draws every emotion at one size, chosen when the round starts', async () => {
    const { click, frames } = await setup(8)
    click('.game-hud__start')
    frames.frames(300, 50)

    const sizes = new Set(context().callsTo('fillText').map((call) => call.font))
    const allEmotions = [...emotions.positive, ...emotions.negative]
    const size = fitFontSize(context().asContext(), cssCanvasFont, allEmotions, EMOTION_TEXT_FIT)
    expect(sizes).toEqual(new Set([fontAt(cssCanvasFont, size)]))
  })
})

describe('Emotions Rise', () => {
  it('explains how to play with the Start button, before every round', async () => {
    const { container, click } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!
    const paragraphs = () => [...card.querySelectorAll('p')].map((p) => p.textContent)

    expect(card.closest('[hidden]')).toBeNull()
    expect(paragraphs()).toEqual([
      'Emotions rise but sometimes they are good, sometimes they are bad but all the same',
      'Choose the good ones, let the bad ones fade away',
      'Don’t let good emotions fade away',
    ])

    click('.game-hud__start')
    expect(card.closest('[hidden]')).not.toBeNull()
    click('.game-hud__pause')
    click('.game-hud__overlay--paused .game-hud__restart')
    expect(card.closest('[hidden]')).toBeNull()
  })

  it('shows only the background behind the Start button', async () => {
    await setup()

    expect(lastDrawnBubbles()).toEqual([])
    expect(context().callsTo('clearRect')).toHaveLength(1)
  })

  it('draws the first emotion just under the canvas when Start is pressed', async () => {
    const { click } = await setup()

    click('.game-hud__start')

    const [first, ...others] = lastDrawnBubbles()
    expect(others).toEqual([])
    expect(first.y).toBe(SPAWN_Y)
    expect([...emotions.positive, ...emotions.negative]).toContain(first.word)
  })

  it('moves the emotions up and adds more as time passes', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frames(200, 50)

    const bubbles = lastDrawnBubbles()
    expect(bubbles.length).toBeGreaterThan(5)
    expect(bubbles[0].y).toBeLessThan(SPAWN_Y - 30)
  })

  it('draws the emotions swaying from side to side as they rise, inside the canvas', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    // The oldest bubble is drawn first; follow it for 5 s (at least 200 px up).
    const xs: number[] = []
    for (let i = 0; i < 100; i++) {
      frames.frame(50)
      xs.push(lastDrawnBubbles()[0].x)
    }

    expect(SPAWN_Y - lastDrawnBubbles()[0].y).toBeGreaterThanOrEqual(200)
    const sideways = xs.slice(1).map((x, i) => x - xs[i])
    expect(sideways.some((dx) => dx > 0.2)).toBe(true)
    expect(sideways.some((dx) => dx < -0.2)).toBe(true)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(10 + 1e-9)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(70 - 1e-9)
    expect(Math.max(...xs)).toBeLessThanOrEqual(330 + 1e-9)
  })

  it.each([
    ['good', 'Score: 1', '--canvas-right-hue'],
    ['bad', 'Score: 0', '--canvas-wrong-hue'],
  ] as const)(
    'shows the score after tapping a %s emotion: %s, and fades it out with a hue',
    async (type, score, hue) => {
      const { click, frames, tapAt, text } = await setup(3)
      click('.game-hud__start')
      frames.frames(200, 50)
      const bubbles = lastDrawnBubbles()

      // A visible point covered by exactly one bubble, of that type.
      const target = findPoint(
        bubbles,
        (under) => under.length === 1 && isGood(under[0].word) === (type === 'good'),
        { maxY: 795 },
      )!
      const [tapped] = target.under
      tapAt(target.x, target.y)

      expect(text('.game-hud__score')).toBe(score)
      // Still there, where it was tapped, with its hue over it…
      expect(lastDrawnBubbles()).toContainEqual(tapped)
      const hues = context()
        .lastDrawing()
        .filter((call) => call.name === 'fill')
        .map((call) => call.fillStyle)
      expect(hues).toEqual([cssVariables.get(hue)])

      // …then, 0.1 s later, gone, while the others went on rising.
      frames.frame(50)
      expect(lastDrawnBubbles()).toContainEqual(tapped)
      frames.frame(50)
      expect(lastDrawnBubbles().map((b) => b.word)).not.toContain(tapped.word)
      expect(lastDrawnBubbles()).toHaveLength(bubbles.length - 1)
    },
  )

  it('freezes while paused: no movement, no taps', async () => {
    const { click, frames, tapAt, text } = await setup()
    click('.game-hud__start')
    frames.frames(100, 50)
    click('.game-hud__pause')
    const frozen = lastDrawnBubbles()

    frames.frames(100, 50)
    tapAt(frozen[0].x, frozen[0].y)

    expect(lastDrawnBubbles()).toEqual(frozen)
    expect(text('.game-hud__score')).toBe('Score: 0')
  })

  it('clears the emotions on restart and starts fresh on the next Start', async () => {
    const { click, frames, text } = await setup()
    click('.game-hud__start')
    frames.frames(100, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')
    expect(lastDrawnBubbles()).toEqual([])
    expect(text('.game-hud__time')).toBe('00')

    click('.game-hud__start')
    expect(lastDrawnBubbles()).toHaveLength(1)
  })

  it('explains mistakes in the status bar below the canvas', () => {
    expect(mistakeMessage('badTapped', { text: 'Fear', type: 'bad' })).toBe(
      'Tapped a bad emotion: Fear',
    )
    expect(mistakeMessage('goodMissed', { text: 'Joy', type: 'good' })).toBe(
      'Missed a good emotion: Joy',
    )
  })

  it('shows a red message when a bad emotion is tapped, and none for a good one', async () => {
    const { click, frames, tapAt, session } = await setup(6)
    click('.game-hud__start')
    const seen: string[] = []

    for (let i = 0; i < 40 && session.lifecycle.state === 'playing'; i++) {
      frames.frames(10, 50)
      const bubbles = lastDrawnBubbles()
      // Visible, and not overlapped by any other bubble (visible or not).
      const alone = bubbles.find((b) => b.y < 700 && bubblesAt(bubbles, b.x, b.y).length === 1)
      if (!alone) continue
      session.status.clear()
      tapAt(alone.x, alone.y)
      const message = session.status.element.textContent
      if (isGood(alone.word)) {
        expect(message).toBe('')
        seen.push('good')
      } else {
        expect(message).toBe(`Tapped a bad emotion: ${alone.word}`)
        expect(session.status.element.dataset.tone).toBe('bad')
        seen.push('bad')
      }
    }

    expect(seen).toContain('good')
    expect(seen).toContain('bad')
  })

  it('shows a red message when a good emotion escapes, and none when a bad one does', async () => {
    const { click, frames, session } = await setup(7)
    click('.game-hud__start')
    const messages = new Set<string>()

    // No taps: every good and every bad emotion that reaches the top escapes.
    for (let t = 0; t < 60_000 && session.lifecycle.state === 'playing'; t += 20) {
      frames.frame(20)
      const message = session.status.element.textContent!
      if (message) messages.add(message)
    }

    expect(messages.size).toBeGreaterThan(5)
    for (const message of messages) {
      const missed = message.match(/^Missed a good emotion: (.+)$/)
      expect(emotions.positive, message).toContain(missed?.[1])
    }
  })

  it('ends with the 10th mistake on Easy, and says what it was', async () => {
    const { click, playUntilOver, session, text, summaryValues } = await setup()
    click('.game-hud__start')

    // Nothing is tapped, so every mistake is a good emotion escaping.
    playUntilOver()

    const values = summaryValues()
    expect(values[1]).toBe(10)
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 10')
    expect(text('.game-hud__final-score')).toBe(`Score: ${session.score.value}`)
    expect(session.status.text).toMatch(/^Missed a good emotion: .+$/)
  })

  it('ends with the first mistake on Extreme', async () => {
    const { click, playUntilOver, summaryValues } = await setup()
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')

    playUntilOver()

    const values = summaryValues()
    expect(values[1]).toBe(1)
  })

  it.each([
    ['Extreme', 3, 1, 'finished'],
    ['Easy', 0, 2, 'playing'],
  ] as const)(
    'on %s, counts each bad emotion under one tap, up to the mistake that ends the round',
    async (_level, presses, mistakes, state) => {
      const { click, frames, session, text, tapAt, summaryValues } = await setup(8)
      for (let i = 0; i < presses; i++) click('.game-hud__difficulty')
      click('.game-hud__start')
      // Find a visible point over two bad emotions (and nothing else).
      let target: ReturnType<typeof findPoint<ReturnType<typeof lastDrawnBubbles>[number]>>
      for (let i = 0; i < 2_000 && !target && session.lifecycle.state === 'playing'; i++) {
        frames.frame(50)
        target = findPoint(
          lastDrawnBubbles(),
          (under) => under.length === 2 && under.every((b) => !isGood(b.word)),
          { step: 10, maxY: 760 },
        )
      }
      const before = session.mistakes.count

      tapAt(target!.x, target!.y)

      expect(session.mistakes.count - before).toBe(mistakes)
      expect(text('.game-hud__mistakes')).toBe(`Mistakes: ${session.mistakes.count}`)
      expect(session.lifecycle.state).toBe(state)
      if (state === 'finished') expect(summaryValues()[2]).toBe(1)
    },
  )

  it('shows what happened to the emotions at the end, matching the score', async () => {
    const { click, frames, session, tapAt, container, playUntilOver, summaryValues } =
      await setup(4)
    click('.game-hud__start')
    // Tap one emotion every 2 seconds, so others escape.
    for (let i = 0; i < 30 && session.lifecycle.state === 'playing'; i++) {
      frames.frames(40, 50)
      const [bubble] = lastDrawnBubbles().filter((b) => b.y < 700)
      if (bubble) tapAt(bubble.x, bubble.y)
    }
    playUntilOver()

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    const labels = [...list.querySelectorAll('dt')].map((e) => e.textContent)
    const values = summaryValues()
    expect(list.hidden).toBe(false)
    expect(labels).toEqual([
      'Good emotions tapped',
      'Good emotions missed',
      'Bad emotions tapped',
      'Bad emotions let go',
    ])
    const [goodTapped, goodMissed, badTapped, badLetGo] = values
    expect(goodTapped).toBeGreaterThan(0)
    expect(badTapped).toBeGreaterThan(0)
    expect(goodMissed).toBeGreaterThan(0)
    expect(badLetGo).toBeGreaterThan(0)
    expect(session.score.value).toBe(goodTapped + badLetGo)
  })

  it('starts the record from zero on the next round', async () => {
    const { click, playUntilOver, summaryValues } = await setup(5)
    click('.game-hud__start')
    playUntilOver()
    click('.game-hud__overlay--finished .game-hud__restart')
    click('.game-hud__start')

    playUntilOver()

    // Everything from the new round escapes or stays on screen; nothing was tapped.
    const values = summaryValues()
    expect(values[0]).toBe(0)
    expect(values[2]).toBe(0)
  })
})
