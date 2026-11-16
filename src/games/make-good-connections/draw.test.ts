import { describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext, type DrawCall } from '../../test/fake-canvas-context'
import { TIME_RING_WIDTH } from '../shared/time-ring'
import {
  CONNECT_COLORS,
  DOT_SHADOW_BLUR,
  drawScene,
  OUTLINE_RADIUS,
  OUTLINE_WIDTH,
  RING_RADIUS,
  type ConnectColors,
} from './draw'
import { DOT_RADIUS, EDGE_GAP, LINE_WIDTH, WALL_THICKNESS } from './layout'
import type { Round } from './make-good-connections'

/** Stand-ins for the colours read from the CSS. */
const colors: ConnectColors = {
  dot: 'white',
  dotShadow: 'shadow',
  good: 'green',
  wall: 'ink',
  ring: 'ink ring',
  wrong: 'red',
}
const names = (calls: readonly DrawCall[]) => calls.map((call) => call.name)
/** The strokes drawn, as [colour, width]. */
const strokes = (calls: readonly DrawCall[]) =>
  calls.filter((call) => call.name === 'stroke').map((call) => [call.strokeStyle, call.lineWidth])
/** The dots drawn, as their fill colours. */
const dotFills = (calls: readonly DrawCall[]) =>
  calls.filter((call) => call.name === 'fill').map((call) => call.fillStyle)

/** A round of 3 dots with a wall, shown at 1 s, with 7 s to connect them; the ring around dot 2. */
function round(changes: Partial<Round> = {}): Round {
  return {
    layout: {
      dots: [
        { x: 100, y: 200 },
        { x: 300, y: 200 },
        { x: 200, y: 500 },
      ],
      walls: [{ from: { x: 200, y: 185 }, to: { x: 200, y: 215 } }],
      solution: [0, 2, 1],
    },
    ringDot: 2,
    shownAtMs: 1_000,
    timeLimitMs: 7_000,
    deadlineMs: 8_000,
    path: [],
    wallHit: undefined,
    endedAtMs: undefined,
    goneAtMs: undefined,
    ...changes,
  }
}

describe('colours', () => {
  it('come from CSS variables the app declares', () => {
    for (const variable of Object.values(CONNECT_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('are white dots with the buttons’ shadow, green connections, ink walls and ring, and red for a wall hit', () => {
    expect(CONNECT_COLORS).toEqual({
      dot: '--connect-dot',
      dotShadow: '--button-shadow',
      good: '--connect-good',
      wall: '--connect-wall',
      ring: '--connect-ring',
      wrong: '--connect-wrong',
    })
    expect(
      [
        '--connect-dot',
        '--connect-good',
        '--connect-wall',
        '--connect-ring',
        '--connect-wrong',
      ].map((variable) => cssVariables.get(variable)),
    ).toEqual([
      '#fff',
      'var(--color-good)',
      'var(--color-ink)',
      'var(--color-ink)',
      'var(--color-bad)',
    ])
  })
})

describe('sizes', () => {
  it('puts the outline just outside the dot, and the ring outside that, within the space kept around dots', () => {
    expect(OUTLINE_RADIUS - OUTLINE_WIDTH / 2).toBeGreaterThan(DOT_RADIUS)
    expect(RING_RADIUS - TIME_RING_WIDTH / 2).toBeGreaterThan(OUTLINE_RADIUS + OUTLINE_WIDTH / 2)
    expect(RING_RADIUS + TIME_RING_WIDTH / 2).toBeLessThanOrEqual(DOT_RADIUS + EDGE_GAP)
  })
})

describe('drawing the scene', () => {
  it('draws nothing without a round', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { round: undefined, timeMs: 0 }, colors)

    expect(names(context.calls)).toEqual(['clearRect'])
  })

  it('draws the walls, the dots white with a shadow, then the full ring around its dot', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { round: round(), timeMs: 2_000 }, colors)

    const [wall, ring] = context.callsTo('stroke')
    expect([wall.strokeStyle, wall.lineWidth]).toEqual(['ink', WALL_THICKNESS])
    expect(context.callsTo('lineTo')[0].args).toEqual([200, 215])
    const fills = context.callsTo('fill')
    expect(fills.map((call) => [call.fillStyle, call.shadowColor, call.shadowBlur])).toEqual([
      ['white', 'shadow', DOT_SHADOW_BLUR],
      ['white', 'shadow', DOT_SHADOW_BLUR],
      ['white', 'shadow', DOT_SHADOW_BLUR],
    ])
    const dots = context.callsTo('arc').slice(0, 3)
    expect(dots.map((call) => call.args.slice(0, 3))).toEqual([
      [100, 200, DOT_RADIUS],
      [300, 200, DOT_RADIUS],
      [200, 500, DOT_RADIUS],
    ])
    expect([ring.strokeStyle, ring.lineWidth]).toEqual(['ink ring', TIME_RING_WIDTH])
    expect(context.callsTo('arc').at(-1)!.args.slice(0, 3)).toEqual([200, 500, RING_RADIUS])
    // Nothing drawn after the dots casts a shadow.
    expect(ring.shadowBlur).toBe(0)
  })

  it('runs the ring out with the time to connect', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { round: round(), timeMs: 4_500 }, colors)

    const ring = context.callsTo('arc').at(-1)!
    const share = ((ring.args[4] as number) - (ring.args[3] as number)) / (2 * Math.PI)
    expect(share).toBeCloseTo(0.5, 9)
  })

  it('shows a dot tapped alone with a green outline, still white', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { round: round({ path: [0] }), timeMs: 2_000 }, colors)

    expect(dotFills(context.calls)).toEqual(['white', 'white', 'white'])
    expect(strokes(context.calls)).toEqual([
      ['ink', WALL_THICKNESS],
      ['green', OUTLINE_WIDTH],
      ['ink ring', TIME_RING_WIDTH],
    ])
    expect(context.callsTo('arc')[3].args.slice(0, 3)).toEqual([100, 200, OUTLINE_RADIUS])
  })

  it('joins the dots of the path with green lines, lights them green, and outlines the last', () => {
    const context = createFakeContext()

    drawScene(context.asContext(), { round: round({ path: [0, 2] }), timeMs: 2_000 }, colors)

    expect(dotFills(context.calls)).toEqual(['green', 'white', 'green'])
    expect(strokes(context.calls)).toEqual([
      ['ink', WALL_THICKNESS],
      ['green', LINE_WIDTH],
      ['green', OUTLINE_WIDTH],
      ['ink ring', TIME_RING_WIDTH],
    ])
    expect(context.callsTo('moveTo')[1].args).toEqual([100, 200])
    expect(context.callsTo('lineTo')[1].args).toEqual([200, 500])
    expect(context.callsTo('arc')[3].args.slice(0, 3)).toEqual([200, 500, OUTLINE_RADIUS])
  })

  it('shows every dot green once all are connected, with no outline', () => {
    const context = createFakeContext()
    const connected = round({ path: [0, 2, 1], endedAtMs: 3_000, goneAtMs: 4_500 })

    drawScene(context.asContext(), { round: connected, timeMs: 4_000 }, colors)

    expect(dotFills(context.calls)).toEqual(['green', 'green', 'green'])
    expect(strokes(context.calls).filter(([, width]) => width === OUTLINE_WIDTH)).toEqual([])
  })

  it('shows a line that went through a wall in red, for a moment', () => {
    const context = createFakeContext()
    const wallHit = { from: { x: 100, y: 200 }, to: { x: 300, y: 200 }, atMs: 2_000 }

    drawScene(context.asContext(), { round: round({ wallHit }), timeMs: 2_400 }, colors)
    const shown = strokes(context.lastDrawing())
    drawScene(context.asContext(), { round: round({ wallHit }), timeMs: 2_500 }, colors)
    const gone = strokes(context.lastDrawing())

    expect(shown).toContainEqual(['red', LINE_WIDTH])
    expect(gone).not.toContainEqual(['red', LINE_WIDTH])
  })

  it('fades the round in, and out once gone', () => {
    const context = createFakeContext()
    const over = round({ endedAtMs: 8_000, goneAtMs: 8_000 })

    drawScene(context.asContext(), { round: round(), timeMs: 1_050 }, colors)
    const fadingIn = context.lastDrawing()
    drawScene(context.asContext(), { round: over, timeMs: 8_050 }, colors)
    const fadingOut = context.lastDrawing()
    drawScene(context.asContext(), { round: over, timeMs: 8_100 }, colors)

    for (const drawing of [fadingIn, fadingOut]) {
      const alphas = drawing
        .filter((call) => call.name !== 'clearRect')
        .map((call) => call.globalAlpha)
      expect(new Set(alphas)).toEqual(new Set([0.5]))
    }
    expect(names(context.lastDrawing())).toEqual(['clearRect'])
    expect(context.globalAlpha).toBe(1)
  })
})
