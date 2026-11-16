import { afterEach, describe, expect, it, vi } from 'vitest'
import bubbleZoneUrl from '../../assets/stay-in-the-zone/bubble-zone.png'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext, type DrawCall } from '../../test/fake-canvas-context'
import { stubImages } from '../../test/fake-image'
import { TIME_RING_WIDTH } from '../shared/time-ring'
import { BALL_RING_RADIUS, BALL_SIZE, createBall, LOWEST_Y, type Ball } from './ball'
import {
  BALL_IMAGE_BODY,
  BALL_LOOK,
  BALL_RING_SHADOW_BLUR,
  drawBallRing,
  drawScene,
  drawZone,
  STAY_COLORS,
  type SceneLook,
  type StayColors,
} from './draw'
import { ZONE_RING_RADIUS, type Zone } from './stay-in-the-zone'

/** Stand-ins for the colours read from the CSS. */
const colors: StayColors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  zone: 'see-through green',
  zoneRing: 'green',
  ballRing: 'white',
  ballRingShadow: 'shadow',
}
const ballImage = {} as CanvasImageSource
const look: SceneLook = { colors, ballImage }
const names = (calls: readonly DrawCall[]) => calls.map((call) => call.name)
/** How far round a ring drawn with `arc` goes: 1 all the way. */
const share = ({ args }: DrawCall) => ((args[4] as number) - (args[3] as number)) / (2 * Math.PI)

/** A zone from y = 300, 200 px tall, shown at 1 s for 5 s, needing the ball in it for 1 s. */
function zone(changes: Partial<Zone> = {}): Zone {
  return {
    top: 300,
    height: 200,
    shownAtMs: 1_000,
    timeLimitMs: 5_000,
    deadlineMs: 6_000,
    timeInZoneMs: 1_000,
    inZoneMs: 0,
    endedAtMs: undefined,
    outcome: undefined,
    ...changes,
  }
}

/** A ball still at `y`: where the scene draws it. */
function ballAt(y: number): Ball {
  return { ...createBall(), y }
}

describe('colours', () => {
  it('come from CSS variables the app declares', () => {
    for (const variable of Object.values(STAY_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('are the shared card colours, the good green for the zone and its ring, and a white ring with a button’s shadow', () => {
    expect(STAY_COLORS).toEqual({
      text: '--color-ink',
      cardFill: '--canvas-card-fill',
      cardBorder: '--canvas-card-border',
      zone: '--stay-zone',
      zoneRing: '--stay-zone-ring',
      ballRing: '--stay-ball-ring',
      ballRingShadow: '--button-shadow',
    })
    expect(cssVariables.get('--stay-zone')).toBe(
      'color-mix(in srgb, var(--color-good) 30%, transparent)',
    )
    expect(cssVariables.get('--stay-zone-ring')).toBe('var(--color-good)')
    expect(cssVariables.get('--stay-ball-ring')).toBe('#fff')
  })
})

describe('the ball', () => {
  it('is drawn so the ball in its image is 60 px across, whatever its glow', () => {
    expect(BALL_LOOK.width * BALL_IMAGE_BODY).toBeCloseTo(BALL_SIZE, 9)
    expect(BALL_LOOK).toEqual({
      width: BALL_LOOK.height,
      height: expect.closeTo(82.76, 2),
      radiusX: 30,
      radiusY: 30,
    })
  })
})

describe('drawing a zone', () => {
  it('fills it across the canvas, with a full ring in its middle when it appears', () => {
    const context = createFakeContext()

    drawZone(context.asContext(), zone(), 1_000, colors)

    const [fill] = context.callsTo('fillRect')
    expect([fill.args, fill.fillStyle]).toEqual([[0, 300, 400, 200], 'see-through green'])
    const [ring] = context.callsTo('arc')
    expect(ring.args.slice(0, 3)).toEqual([200, 400, ZONE_RING_RADIUS])
    expect(share(ring)).toBeCloseTo(1, 9)
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth]).toEqual(['green', TIME_RING_WIDTH])
  })

  it('runs its ring out with its time', () => {
    const context = createFakeContext()

    drawZone(context.asContext(), zone(), 3_500, colors)

    expect(share(context.callsTo('arc')[0])).toBeCloseTo(0.5, 9)
  })
})

describe('drawing the ball’s ring', () => {
  it('draws it white around the ball, as far round as the time in the zone left, with a soft shadow', () => {
    const context = createFakeContext()

    drawBallRing(context.asContext(), { x: 200, y: 500 }, 0.25, colors)

    const [ring] = context.callsTo('arc')
    expect(ring.args.slice(0, 3)).toEqual([200, 500, BALL_RING_RADIUS])
    expect(share(ring)).toBeCloseTo(0.25, 9)
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.shadowColor, stroke.shadowBlur]).toEqual([
      'white',
      'shadow',
      BALL_RING_SHADOW_BLUR,
    ])
    // Nothing drawn after it casts a shadow.
    expect(context.shadowBlur).toBe(0)
  })
})

describe('drawing the scene', () => {
  it('shows only the ball, at the bottom, before any zone', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { ball: createBall(), zone: undefined, timeMs: 0 }, look)

    const { width, height } = BALL_LOOK
    expect(context.calls.map((call) => [call.name, call.args])).toEqual([
      ['clearRect', [0, 0, 400, 800]],
      ['drawImage', [ballImage, 200 - width / 2, LOWEST_Y - height / 2, width, height]],
    ])
  })

  it('draws a plain ball 60 px across if its image did not load', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { ball: createBall(), zone: undefined, timeMs: 0 }, { colors })

    expect(context.callsTo('ellipse').map((call) => call.args)).toEqual([
      [200, LOWEST_Y, 30, 30, 0, 0, Math.PI * 2],
    ])
    expect(context.lastFills()).toEqual(['card fill'])
  })

  it('draws the zone and its ring under the ball, and the white ring over it', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { ball: ballAt(450), zone: zone(), timeMs: 2_000 }, look)

    expect(names(context.calls)).toEqual([
      'clearRect',
      'fillRect',
      'beginPath',
      'arc',
      'stroke',
      'drawImage',
      'beginPath',
      'arc',
      'stroke',
    ])
    const [zoneRing, ballRing] = context.callsTo('arc')
    expect(zoneRing.args.slice(0, 3)).toEqual([200, 400, ZONE_RING_RADIUS])
    expect(ballRing.args.slice(0, 3)).toEqual([200, 450, BALL_RING_RADIUS])
    expect(context.calls.every((call) => call.globalAlpha === 1)).toBe(true)
  })

  it('runs the white ring out with the time the ball has been in the zone', () => {
    const context = createFakeContext()
    const inZone = zone({ inZoneMs: 750 })

    drawScene(context.asContext(), { ball: ballAt(450), zone: inZone, timeMs: 2_000 }, look)

    expect(share(context.callsTo('arc')[1])).toBeCloseTo(0.25, 9)
  })

  it('fades the zone out over 0.1 s once it is over, with what is left of its rings, but not the ball', () => {
    const context = createFakeContext()
    const alphaOf = (name: string, calls: DrawCall[]) =>
      calls.filter((call) => call.name === name).map((call) => call.globalAlpha)
    const held = zone({ inZoneMs: 1_000, endedAtMs: 3_000, outcome: 'held' })
    const missed = zone({ inZoneMs: 400, endedAtMs: 6_000, outcome: 'missed' })

    drawScene(context.asContext(), { ball: ballAt(450), zone: held, timeMs: 3_050 }, look)
    const heldFading = context.lastDrawing()
    drawScene(context.asContext(), { ball: ballAt(450), zone: missed, timeMs: 6_050 }, look)
    const missedFading = context.lastDrawing()
    drawScene(context.asContext(), { ball: ballAt(450), zone: held, timeMs: 3_100 }, look)
    const faded = context.lastDrawing()

    // Held: the white ring ran out; the zone's stopped where it was when the zone ended.
    expect(alphaOf('fillRect', heldFading)).toEqual([0.5])
    expect(alphaOf('stroke', heldFading)).toEqual([0.5])
    expect(heldFading.filter((call) => call.name === 'arc').map(share)).toEqual([
      expect.closeTo(0.6, 9),
    ])
    // Missed: the zone's ring ran out; the white one stopped where it was.
    expect(alphaOf('stroke', missedFading)).toEqual([0.5])
    expect(missedFading.filter((call) => call.name === 'arc').map(share)).toEqual([
      expect.closeTo(0.6, 9),
    ])
    expect(missedFading.find((call) => call.name === 'stroke')!.strokeStyle).toBe('white')
    // The ball, always fully shown.
    expect([...alphaOf('drawImage', heldFading), ...alphaOf('drawImage', missedFading)]).toEqual([
      1, 1,
    ])
    expect(names(faded)).toEqual(['clearRect', 'drawImage'])
    expect(context.globalAlpha).toBe(1)
  })
})

describe('loading the ball image', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the ball’s bubble artwork', async () => {
    // A fresh copy of the module, so no image loaded by another test is used.
    vi.resetModules()
    const { loadBallImage } = await import('./draw')
    const images = stubImages()

    const image = await loadBallImage()

    expect(images).toEqual([image])
    expect(image.src).toBe(bubbleZoneUrl)
  })
})
