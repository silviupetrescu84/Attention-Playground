// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bubblesAt, findPoint } from '../../test/bubbles'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { FakeFrames } from '../../test/fake-frames'
import { seededRandom } from '../../test/random'
import { mountGame } from '../shared/game-shell'
import type { FontLoader } from '../shared/load-font'
import emotions from './data/emotions.json'
import { fitFontSize, font, MAX_FONT_SIZE } from './draw'
import { SPAWN_Y } from './emotions-rise'
import { emotionsRiseGame, mistakeMessage } from './index'

let contexts: FakeContext[]

beforeEach(() => {
  contexts = useFakeCanvasContexts()
})

/** The context of the game mounted in the test. */
const context = () => contexts.at(-1)!

afterEach(() => {
  vi.restoreAllMocks()
})

/** A font loader whose font is always ready. */
const loadedFonts: FontLoader = { load: async () => [{ status: 'loaded' }] }

/** Mounts the game and waits until it has loaded (Start enabled). */
async function setup(seed = 1) {
  const container = document.createElement('main')
  document.body.replaceChildren(container)
  const frames = new FakeFrames()
  const session = mountGame(container, {
    signal: new AbortController().signal,
    game: emotionsRiseGame({ random: seededRandom(seed), fonts: loadedFonts }),
    scheduler: frames,
  })
  const startButton = container.querySelector<HTMLButtonElement>('.game-hud__start')!
  await vi.waitFor(() => expect(startButton.disabled).toBe(false))
  // Shown at full size at the top-left corner, so screen = game units.
  vi.spyOn(session.canvas.element, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 800),
  )
  const click = (selector: string) =>
    container.querySelector<HTMLButtonElement>(`.game-hud ${selector}`)!.click()
  const text = (selector: string) => container.querySelector(selector)!.textContent
  const tapAt = (x: number, y: number) =>
    session.canvas.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: x, clientY: y }),
    )

  return { container, frames, session, click, text, tapAt }
}

/** The bubbles in the most recent drawing: word and centre. */
function lastDrawnBubbles() {
  const calls = context().calls
  const lastBackground = calls.map((c) => c.name).lastIndexOf('fillRect')
  return calls
    .slice(lastBackground)
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
    mountGame(container, {
      signal: new AbortController().signal,
      game: emotionsRiseGame({ fonts }),
      scheduler: new FakeFrames(),
    })
    const start = container.querySelector<HTMLButtonElement>('.game-hud__start')!

    expect(fonts.load).toHaveBeenCalledExactlyOnceWith(font(MAX_FONT_SIZE))
    expect(start.disabled).toBe(true)

    finishLoading([{ status: 'loaded' }])
    await vi.waitFor(() => expect(start.disabled).toBe(false))
  })

  it('can still be played if the font does not load', async () => {
    const fonts: FontLoader = { load: async () => [] }
    const container = document.createElement('main')
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

  it('draws every emotion at one size, chosen when the round starts', async () => {
    const { click, frames } = await setup(8)
    click('.game-hud__start')
    frames.frames(300, 50)

    const sizes = new Set(context().callsTo('fillText').map((call) => call.font))
    const allEmotions = [...emotions.positive, ...emotions.negative]
    expect(sizes).toEqual(new Set([font(fitFontSize(context().asContext(), allEmotions))]))
  })
})

describe('Emotions Rise', () => {
  it('shows only the background behind the Start button', async () => {
    await setup()

    expect(lastDrawnBubbles()).toEqual([])
    expect(context().callsTo('fillRect')).toHaveLength(1)
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

  it('changes the shown score when emotions are tapped', async () => {
    const { click, frames, tapAt, text } = await setup(3)
    click('.game-hud__start')
    frames.frames(200, 50)
    const bubbles = lastDrawnBubbles()

    // A visible point covered by exactly one bubble.
    const target = findPoint(bubbles, (under) => under.length === 1, { maxY: 795 })!
    const [tapped] = target.under
    tapAt(target.x, target.y)

    expect(text('.game-hud__score')).toBe(`Score: ${isGood(tapped.word) ? 1 : -1}`)
    expect(lastDrawnBubbles()).toHaveLength(bubbles.length - 1)
    expect(lastDrawnBubbles()).not.toContainEqual(tapped)
  })

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
      'Tapped a bad emotion: Fear (−1)',
    )
    expect(mistakeMessage('goodMissed', { text: 'Joy', type: 'good' })).toBe(
      'Missed a good emotion: Joy (−1)',
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
        expect(message).toBe(`Tapped a bad emotion: ${alone.word} (−1)`)
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
    while (session.lifecycle.state === 'playing') {
      frames.frame(20)
      const message = session.status.element.textContent!
      if (message) messages.add(message)
    }

    expect(messages.size).toBeGreaterThan(5)
    for (const message of messages) {
      expect(message).toMatch(/^Missed a good emotion: (.+) \(−1\)$/)
      expect(emotions.positive).toContain(message.match(/: (.+) \(/)![1])
    }
  })

  it('ends after 60 seconds with the final score', async () => {
    const { click, frames, session, text } = await setup()
    click('.game-hud__start')

    frames.frames(60, 1_000)

    expect(session.lifecycle.state).toBe('finished')
    expect(text('.game-hud__time')).toBe('60')
    expect(text('.game-hud__final-score')).toBe(`Score: ${session.score.value}`)
  })

  it('shows what happened to the emotions at the end, matching the score', async () => {
    const { click, frames, session, tapAt, container } = await setup(4)
    click('.game-hud__start')
    // Tap one emotion every 2 seconds, so others escape.
    for (let i = 0; i < 30 && session.lifecycle.state === 'playing'; i++) {
      frames.frames(40, 50)
      const [bubble] = lastDrawnBubbles().filter((b) => b.y < 700)
      if (bubble) tapAt(bubble.x, bubble.y)
    }
    frames.frames(100, 1_000)
    expect(session.lifecycle.state).toBe('finished')

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    const labels = [...list.querySelectorAll('dt')].map((e) => e.textContent)
    const values = [...list.querySelectorAll('dd')].map((e) => Number(e.textContent))
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
    expect(session.score.value).toBe(goodTapped - goodMissed - badTapped + badLetGo)
  })

  it('starts the record from zero on the next round', async () => {
    const { click, frames, container } = await setup(5)
    click('.game-hud__start')
    frames.frames(60, 1_000)
    click('.game-hud__overlay--finished .game-hud__restart')
    click('.game-hud__start')

    frames.frame(60_000)

    // Everything from the new round escapes or stays on screen; nothing was tapped.
    const values = [...container.querySelectorAll('.game-hud__summary dd')].map((e) =>
      Number(e.textContent),
    )
    expect(values[0]).toBe(0)
    expect(values[2]).toBe(0)
  })
})
