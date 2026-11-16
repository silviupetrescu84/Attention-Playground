// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bubbleZoneUrl from '../../assets/stay-in-the-zone/bubble-zone.png'
import { useCssVariables } from '../../test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from '../../test/fake-canvas-context'
import { FakeFrames } from '../../test/fake-frames'
import { stubImages } from '../../test/fake-image'
import { FakeStorage } from '../../test/fake-storage'
import { mountForTest } from '../../test/mounted-game'
import { constantRandom, seededRandom } from '../../test/random'
import { repeatUntil } from '../../test/repeat'
import { mountGame } from '../shared/game-shell'
import type { Random } from '../shared/random'
import { HIGHEST_Y, LOWEST_Y } from './ball'
import { BALL_LOOK } from './draw'
import { INSTRUCTIONS, MISTAKE_MESSAGE, preloadStayInTheZone, stayInTheZoneGame } from './index'
import { FIRST_ZONE_MS } from './stay-in-the-zone'

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

function setup(random: Random = constantRandom(0.5)) {
  return mountForTest(stayInTheZoneGame({ random }))
}

type Played = Awaited<ReturnType<typeof setup>>

/** The ball and the zone in the most recent drawing, read back from it. */
function lastDrawn() {
  const drawing = context().lastDrawing()
  const ball = drawing.find((call) => call.name === 'drawImage')
  const zone = drawing.find((call) => call.name === 'fillRect')
  return {
    ballY: ball && (ball.args[2] as number) + BALL_LOOK.height / 2,
    zone: zone && {
      top: zone.args[1] as number,
      height: zone.args[3] as number,
      opacity: zone.globalAlpha,
    },
    rings: drawing.filter((call) => call.name === 'stroke').map((call) => call.strokeStyle),
  }
}

/**
 * Plays in 50 ms frames until `done`, the finger down while the ball is below
 * the middle of the zone drawn and lifted while above: as a player keeping
 * the ball in it. Fails after 2 minutes of play.
 */
function hover({ frames, finger }: Played, done: () => boolean) {
  repeatUntil(
    done,
    () => {
      frames.frame(50)
      const { ballY, zone } = lastDrawn()
      if (zone && ballY! > zone.top + zone.height / 2) finger.down()
      else finger.up()
    },
    2_400,
  )
}

describe('loading', () => {
  it('waits for the ball’s bubble before Start can be pressed', async () => {
    const container = document.createElement('main')
    document.body.replaceChildren(container)
    vi.resetModules()
    const { stayInTheZoneGame: freshGame } = await import('./index')

    mountGame(container, {
      signal: new AbortController().signal,
      game: freshGame(),
      gameId: 'test-game',
      storage: new FakeStorage(),
      scheduler: new FakeFrames(),
    })
    const start = container.querySelector<HTMLButtonElement>('.game-hud__start')!

    expect(start.disabled).toBe(true)
    await vi.waitFor(() => {
      expect(start.disabled).toBe(false)
    })
  })

  it.each([
    ['has loaded', 'load', ['drawImage']],
    ['could not load', 'error', ['ellipse']],
  ] as const)('draws the ball again once its bubble %s', async (_, event, drawn) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages(event)
    // Fresh modules, so the image loaded by other tests is not cached.
    vi.resetModules()
    const { stayInTheZoneGame: freshGame } = await import('./index')
    const { container } = await mountForTest(freshGame())
    const start = container.querySelector<HTMLButtonElement>('.game-hud__start')!

    // Drawn once before loading, and once after.
    expect(start.disabled).toBe(false)
    expect(context().callsTo('clearRect')).toHaveLength(2)
    const names = context()
      .lastDrawing()
      .map((call) => call.name)
    expect(names.filter((name) => name === 'drawImage' || name === 'ellipse')).toEqual(drawn)
  })

  it('loads the ball’s bubble, when the app starts too', async () => {
    vi.resetModules()
    const images = stubImages()
    const { preloadStayInTheZone: freshPreload } = await import('./index')

    const image = await freshPreload()

    expect(images).toEqual([image])
    expect(image.src).toBe(bubbleZoneUrl)
    expect(preloadStayInTheZone).toBeTypeOf('function')
  })

  it('can still be played, with a plain ball, if its bubble does not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubImages('error')
    vi.resetModules()
    const { stayInTheZoneGame: freshGame } = await import('./index')
    const { click, frames, finger, session } = await mountForTest(freshGame())

    click('.game-hud__start')
    finger.down()
    frames.frames(20, 50)

    expect(session.lifecycle.state).toBe('playing')
    expect(context().callsTo('drawImage')).toEqual([])
    const [ball] = context()
      .lastDrawing()
      .filter((call) => call.name === 'ellipse')
    expect(ball.args[1]).toBeLessThan(LOWEST_Y)
  })
})

describe('Stay in the Zone', () => {
  it('explains how to play with the Start button', async () => {
    const { container } = await setup()
    const card = container.querySelector<HTMLElement>('.game-hud__instructions')!

    expect(INSTRUCTIONS).toEqual([
      'Getting in the zone is half the battle, staying in it is the other half',
      'Hold anywhere to make the ball rise, let go to let it fall',
    ])
    expect([...card.querySelectorAll('p')].map((p) => p.textContent)).toEqual(INSTRUCTIONS)
  })

  it('shows the ball at the bottom behind the Start button, and no zone', async () => {
    await setup()

    expect(lastDrawn()).toEqual({ ballY: LOWEST_Y, zone: undefined, rings: [] })
  })

  it('brings a zone 1 s into the round, with its ring and the ball’s', async () => {
    const { click, frames } = await setup()
    click('.game-hud__start')

    frames.frames(19, 50)
    expect(lastDrawn().zone).toBeUndefined()

    frames.frame(50)
    expect(lastDrawn()).toEqual({
      ballY: LOWEST_Y,
      zone: { top: 332, height: 200, opacity: 1 },
      rings: ['var(--color-good)', '#fff'],
    })
    expect(FIRST_ZONE_MS).toBe(1_000)
  })

  it('makes the ball rise while a finger is held anywhere, and fall once it lifts', async () => {
    const { click, frames, finger } = await setup()
    click('.game-hud__start')

    finger.down(10, 780)
    frames.frames(20, 50)
    const risen = lastDrawn().ballY!
    finger.up()
    frames.frames(20, 50)

    // 1 s up from the bottom: about 60 + 40 / 2 = 80 px.
    expect(LOWEST_Y - risen).toBeCloseTo(80, -1)
    expect(lastDrawn().ballY).toBeGreaterThan(risen)
  })

  it('stops the ball below the score bar however long it is held', async () => {
    const { click, frames, finger } = await setup()
    click('.game-hud__start')

    finger.down()
    frames.frames(200, 50)

    expect(lastDrawn().ballY).toBe(HIGHEST_Y)
  })

  it('lets the ball fall when the game is paused, until the finger is down again', async () => {
    const { click, frames, finger } = await setup()
    click('.game-hud__start')
    finger.down()
    frames.frames(20, 50)

    click('.game-hud__pause')
    click('.game-hud__pause')
    const before = lastDrawn().ballY!
    frames.frames(10, 50)

    expect(lastDrawn().ballY).toBeGreaterThan(before)
  })

  it('gives a point for a zone held, with no message, and fades the zone out', async () => {
    const played = await setup()
    const { click, frames, text, session } = played
    click('.game-hud__start')

    hover(played, () => session.score.value > 0)
    frames.frame(50)

    expect(text('.game-hud__score')).toBe('Score: 1')
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 0')
    expect(session.status.text).toBe('')
    const { zone, rings } = lastDrawn()
    expect(zone?.opacity).toBeGreaterThan(0)
    expect(zone?.opacity).toBeLessThan(1)
    // The white ring has run out: only the zone's is left, fading.
    expect(rings).toEqual(['var(--color-good)'])
  })

  it('counts a zone missed as a mistake, and says so in red', async () => {
    const { click, frames, text, session } = await setup()
    click('.game-hud__start')

    // The first zone's 10 s are up 11 s into the round.
    frames.frames(220, 50)

    expect(session.status.text).toBe(MISTAKE_MESSAGE)
    expect(MISTAKE_MESSAGE).toBe('Not long enough in the zone')
    expect(session.status.element.dataset.tone).toBe('bad')
    expect(text('.game-hud__mistakes')).toBe('Mistakes: 1')
  })

  it('keeps zones for the time of the pace chosen before Start: 15% longer at Slow', async () => {
    const { click, frames, session, choosePace } = await setup()
    choosePace('slow')
    click('.game-hud__start')

    // The first zone, at 1 s, still there at 12.4 s; its 10 s × 1.15 are up by 12.6 s.
    frames.frames(248, 50)
    expect(session.mistakes.count).toBe(0)
    frames.frames(4, 50)
    expect(session.status.text).toBe(MISTAKE_MESSAGE)
  })

  it('ends with the 10th mistake on Easy, the summary matching what happened', async () => {
    const played = await setup(seededRandom(4))
    const { click, playUntilOver, container, session, summaryValues } = played
    click('.game-hud__start')

    // Holds the first zone, then lets every other go.
    hover(played, () => session.score.value > 0)
    played.finger.up()
    playUntilOver()

    const list = container.querySelector<HTMLElement>('.game-hud__summary')!
    expect([...list.querySelectorAll('dt')].map((e) => e.textContent)).toEqual([
      'Zones held',
      'Zones missed',
      'Best combo',
    ])
    expect(summaryValues()).toEqual([1, 10])
    expect(session.score.value).toBe(1)
  })

  it('ends with the first mistake on Extreme, keeping everything on screen', async () => {
    const { click, frames, finger, session } = await setup()
    for (let i = 0; i < 3; i++) click('.game-hud__difficulty')
    click('.game-hud__start')
    finger.down()

    repeatUntil(
      () => session.lifecycle.state !== 'playing',
      () => frames.frame(50),
    )
    const before = lastDrawn()
    frames.frames(20, 50)

    expect(session.mistakes.count).toBe(1)
    expect(before.zone).toMatchObject({ height: 200, opacity: 1 })
    expect(lastDrawn()).toEqual(before)
  })

  it('clears everything on restart, the ball back at the bottom', async () => {
    const { click, frames, finger } = await setup()
    click('.game-hud__start')
    finger.down()
    frames.frames(40, 50)
    click('.game-hud__pause')

    click('.game-hud__overlay--paused .game-hud__restart')

    expect(lastDrawn()).toEqual({ ballY: LOWEST_Y, zone: undefined, rings: [] })
  })
})
