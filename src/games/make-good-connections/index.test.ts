// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cssVariables, useCssVariables } from '../../test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { mountForTest } from '../../test/mounted-game'
import { seededRandom } from '../../test/random'
import { repeatUntil } from '../../test/repeat'
import type { GamePoint } from '../shared/game-canvas'
import type { Random } from '../shared/random'
import { INSTRUCTIONS, makeGoodConnectionsGame, MISTAKE_MESSAGES } from './index'
import { DOT_RADIUS, goesThrough, pairsOf, WALL_THICKNESS, type Wall } from './layout'

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
const green = () => cssVariables.get('--connect-good')

function setup(random: Random = seededRandom(4)) {
  return mountForTest(makeGoodConnectionsGame({ random }))
}

type Played = Awaited<ReturnType<typeof setup>>

interface DrawnDot extends GamePoint {
  readonly fill: unknown
}

/** The dots (and their colours) and walls in the most recent drawing, read back from it. */
function lastDrawn() {
  const dots: DrawnDot[] = []
  const walls: Wall[] = []
  let from: GamePoint = { x: 0, y: 0 }
  let to: GamePoint = { x: 0, y: 0 }
  let arc: readonly unknown[] = []
  for (const { name, args, fillStyle, lineWidth } of context().lastDrawing()) {
    if (name === 'moveTo') from = { x: args[0] as number, y: args[1] as number }
    if (name === 'lineTo') to = { x: args[0] as number, y: args[1] as number }
    if (name === 'arc') arc = args
    if (name === 'stroke' && lineWidth === WALL_THICKNESS) walls.push({ from, to })
    if (name === 'fill' && arc[2] === DOT_RADIUS) {
      dots.push({ x: arc[0] as number, y: arc[1] as number, fill: fillStyle })
    }
  }
  return { dots, walls }
}

/** Plays in 50 ms frames until the next round's dots are on screen, fully faded in. */
function nextRound({ frames }: Played, count: number) {
  repeatUntil(
    () =>
      lastDrawn().dots.length === count &&
      context()
        .lastDrawing()
        .every((call) => call.globalAlpha === 1),
    () => frames.frame(50),
    200,
  )
  return lastDrawn()
}

const tapDot = ({ tapAt }: Played, dot: GamePoint) => tapAt(dot.x, dot.y)

describe('Make Good Connections', () => {
  it('has nothing to load: Start can be pressed at once', async () => {
    const { container } = await setup()

    expect(container.querySelector<HTMLButtonElement>('.game-hud__start')!.disabled).toBe(false)
  })

  it('explains how to play with the Start button', async () => {
    const { container } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!

    expect(INSTRUCTIONS).toEqual([
      'Make connections by tapping one dot and then the next',
      'Sometimes connections are blocked by obstacles so make them in the right order',
    ])
    expect([...card.querySelectorAll('p')].map((p) => p.textContent)).toEqual(INSTRUCTIONS)
  })

  it('shows nothing behind the Start button', async () => {
    await setup()

    expect(lastDrawn()).toEqual({ dots: [], walls: [] })
  })

  it('connects two dots tapped one after the other: both green, +1, no message', async () => {
    const played = await setup()
    const { click, text, session } = played
    click('.game-hud__start')
    const [a, b] = nextRound(played, 2).dots

    tapDot(played, a)
    tapDot(played, b)

    expect(text('.game-hud__score')).toBe('Score: 1')
    expect(session.status.text).toBe('')
    expect(lastDrawn().dots.map((dot) => dot.fill)).toEqual([green(), green()])
  })

  it('takes a dot back when it is tapped again', async () => {
    const played = await setup()
    const { click } = played
    click('.game-hud__start')
    const [a] = nextRound(played, 2).dots
    const outlined = () =>
      context()
        .lastDrawing()
        .filter((call) => call.name === 'stroke' && call.strokeStyle === green())

    tapDot(played, a)
    expect(outlined()).toHaveLength(1)
    tapDot(played, a)
    expect(outlined()).toHaveLength(0)
  })

  it('counts a line through a wall as a mistake, showing it red, and lets the player go round it', async () => {
    const played = await setup()
    const { click, text, session } = played
    click('.game-hud__start')
    const [a, b] = nextRound(played, 2).dots
    tapDot(played, a)
    tapDot(played, b)
    const { dots, walls } = nextRound(played, 3)
    // The two dots the wall is between, and the one to go through.
    const [start, end] = pairsOf(3).find(([i, j]) => goesThrough(dots[i], dots[j], walls[0]))!
    const middle = [0, 1, 2].find((i) => i !== start && i !== end)!

    tapDot(played, dots[start])
    tapDot(played, dots[end])

    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe(MISTAKE_MESSAGES.wall)
    expect(session.status.element.dataset.tone).toBe('bad')
    const red = context()
      .lastDrawing()
      .filter(
        (call) =>
          call.name === 'stroke' && call.strokeStyle === cssVariables.get('--connect-wrong'),
      )
    expect(red).toHaveLength(1)
    // Nothing selected: no dot green, and none outlined as the one to go on from.
    expect(lastDrawn().dots.map((dot) => dot.fill)).not.toContain(green())
    const outlines = context()
      .lastDrawing()
      .filter((call) => call.name === 'stroke' && call.strokeStyle === green())
    expect(outlines).toEqual([])

    for (const dot of [start, middle, end]) tapDot(played, dots[dot])
    expect(text('.game-hud__score')).toBe('Score: 2')
  })

  it('counts running out of time as a mistake, and brings a new round', async () => {
    const played = await setup()
    const { click, frames, text, session } = played
    click('.game-hud__start')

    // The first round's 10 s are up.
    frames.frames(200, 50)

    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
    expect(session.status.text).toBe(MISTAKE_MESSAGES.tooSlow)
    expect(nextRound(played, 3).dots).toHaveLength(3)
  })

  it('gives the time of the pace chosen before Start: 15% longer at Slow', async () => {
    const played = await setup()
    const { click, frames, session, choosePace } = played
    choosePace('slow')
    click('.game-hud__start')

    // Still in time at 11.4 s; 10 s × 1.15 is up by 11.6 s.
    frames.frames(228, 50)
    expect(session.mistakes.count).toBe(0)
    frames.frames(4, 50)
    expect(session.status.text).toBe(MISTAKE_MESSAGES.tooSlow)
  })

  it('ends with the 10th mistake on Easy, the summary matching what happened', async () => {
    const played = await setup()
    const { click, container, playUntilOver, session, summaryValues } = played
    click('.game-hud__start')
    const [a, b] = nextRound(played, 2).dots
    tapDot(played, a)
    tapDot(played, b)

    playUntilOver()

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    expect([...list.querySelectorAll('dt')].map((e) => e.textContent)).toEqual([
      'Rounds connected',
      'Too slow',
      'Walls hit',
      'Best combo',
    ])
    expect(summaryValues()).toEqual([1, 10, 0])
    expect(session.score.value).toBe(1)
  })

  it('ends with the first mistake on Extreme, keeping everything on screen', async () => {
    const played = await setup()
    const { click, frames, session } = played
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')
    const [a] = nextRound(played, 2).dots
    tapDot(played, a)

    repeatUntil(
      () => session.lifecycle.state !== 'playing',
      () => frames.frame(50),
      200,
    )
    const before = context().lastDrawing()
    frames.frames(20, 50)

    expect(session.mistakes.count).toBe(1)
    expect(lastDrawn().dots).toHaveLength(2)
    expect(context().lastDrawing()).toEqual(before)
  })

  it('clears everything on restart', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')
    frames.frames(20, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')

    expect(lastDrawn()).toEqual({ dots: [], walls: [] })
  })
})
