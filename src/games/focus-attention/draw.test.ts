import { afterEach, describe, expect, it, vi } from 'vitest'
import greenBubbleUrl from '../../assets/focus-attention/green-bubble.png'
import projectorUrl from '../../assets/focus-attention/focus-projector.png'
import { cssVariables } from '../../test/css-variables'
import gameCss from '../shared/game.css?raw'
import { createFakeContext, type DrawCall } from '../../test/fake-canvas-context'
import { stubImages } from '../../test/fake-image'
import { fitFontSize, fontAt, wrapText, type CanvasFont } from '../shared/text'
import data from './data/focus-attention.json'
import {
  BUBBLE_BORDER_WIDTH,
  BUTTON_PRESS_DEPTH,
  BUTTON_SHADOW_BLUR,
  BUTTON_SHADOW_OFFSET,
  BUTTON_TEXT_FIT,
  drawBeam,
  drawBubble,
  drawButton,
  drawProjector,
  drawScene,
  FOCUS_COLORS,
  PRESS_MS,
  WORD_TEXT_FIT,
  type FocusColors,
  type SceneLook,
} from './draw'
import {
  BUBBLE_RADIUS,
  BUBBLE_SIZE,
  BUTTONS,
  CENTRE,
  PROJECTOR_RADIUS,
  PROJECTOR_SIZE,
  type Bubble,
} from './focus-attention'

// The fake font is 0.6 × size wide per character, spaces included.

const font: CanvasFont = { family: '"Test Sans"', weight: '600' }
/** Stand-ins for the colours read from the CSS. */
const colors: FocusColors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  projector: 'yellow',
  beam: 'see-through yellow',
  buttonFill: 'button ink',
  buttonText: 'button white',
  buttonPressed: 'button light ink',
  buttonShadow: 'shadow',
  rightHue: 'green hue',
  wrongHue: 'red hue',
}
const bubbleImage = { name: 'bubble' } as unknown as CanvasImageSource
const projectorImage = { name: 'projector' } as unknown as CanvasImageSource
const look: SceneLook = {
  wordFontSize: 14,
  buttonFontSize: 18,
  font,
  colors,
  bubbleImage,
  projectorImage,
}
const names = (calls: readonly DrawCall[]) => calls.map((call) => call.name)

function bubble(text: string, x: number, y: number): Bubble {
  return {
    text,
    type: 'good',
    start: { x, y },
    spawnedAtMs: 0,
    inViewAtMs: 0,
    touchAtMs: 10_000,
    x,
    y,
  }
}

describe('colours', () => {
  it('come from CSS variables the app declares', () => {
    for (const variable of Object.values(FOCUS_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('make the beam the yellow of the projector’s orb, half see-through', () => {
    expect(cssVariables.get('--focus-projector')).toBe('#fecc1e')
    expect(cssVariables.get('--focus-beam')).toBe(
      'color-mix(in srgb, var(--focus-projector) 50%, transparent)',
    )
  })

  it('make the buttons look like the app’s own: ink blue, white text, the same shadow', () => {
    const appButton = /\.game-hud \.game-hud__button \{([^}]*)\}/.exec(gameCss)![1]
    const property = (name: string) => new RegExp(`${name}: ([^;]+);`).exec(appButton)![1]

    expect(cssVariables.get('--focus-button-fill')).toBe(property('background'))
    expect(cssVariables.get('--focus-button-text')).toBe(property('color'))
    // Its box-shadow: 0 0.5rem 1.5rem (8 px down, blurred 24 px), in ink at 25%.
    expect(property('box-shadow')).toBe(
      `0 0.5rem 1.5rem ${cssVariables.get('--focus-button-shadow')}`,
    )
    expect([BUTTON_SHADOW_OFFSET, BUTTON_SHADOW_BLUR]).toEqual([8, 24])
    expect(cssVariables.get('--focus-button-pressed')).toBe(
      'color-mix(in srgb, var(--color-ink) 80%, white)',
    )
  })
})

describe('text sizes', () => {
  it('writes words on one line, up to 18 px, inside the bubble', () => {
    expect(WORD_TEXT_FIT).toMatchObject({ maxLines: 1, minSize: 10, maxSize: 18 })
    // As wide as the bubble is at the top and bottom of an 18 px line, less 4 px a side.
    const halfHeight = (18 * 1.2) / 2
    expect(Math.hypot(WORD_TEXT_FIT.maxWidth / 2 + 4, halfHeight)).toBeLessThanOrEqual(
      BUBBLE_RADIUS,
    )
  })

  it('fits every value and anti-value on one line inside its bubble', () => {
    const context = createFakeContext().asContext()
    const words = [...data.values, ...data.antiValues]

    const size = fitFontSize(context, font, words, WORD_TEXT_FIT)
    context.font = fontAt(font, size)

    for (const word of words) {
      expect(wrapText(context, word, WORD_TEXT_FIT.maxWidth), word).toEqual([word])
      expect(context.measureText(word).width, word).toBeLessThanOrEqual(WORD_TEXT_FIT.maxWidth)
    }
  })

  it('writes both button labels on one line, up to 20 px, inside the button', () => {
    expect(BUTTON_TEXT_FIT).toEqual({ maxWidth: BUTTONS[0].width - 32, minSize: 12, maxSize: 20 })
  })
})

describe('drawing the projector', () => {
  it('multiplies its image onto the canvas, centred, so its white background disappears', () => {
    const context = createFakeContext()

    drawProjector(context.asContext(), look)

    const [image] = context.callsTo('drawImage')
    const half = PROJECTOR_SIZE / 2
    expect(image.args).toEqual([
      projectorImage,
      CENTRE.x - half,
      CENTRE.y - half,
      PROJECTOR_SIZE,
      PROJECTOR_SIZE,
    ])
    expect(image.globalCompositeOperation).toBe('multiply')
    expect(context.globalCompositeOperation).toBe('source-over')
  })

  it('draws a plain yellow orb if the image did not load', () => {
    const context = createFakeContext()

    drawProjector(context.asContext(), { colors })

    expect(context.callsTo('arc')[0].args).toEqual([
      CENTRE.x,
      CENTRE.y,
      PROJECTOR_RADIUS,
      0,
      Math.PI * 2,
    ])
    expect(context.callsTo('fill')[0].fillStyle).toBe('yellow')
  })
})

describe('drawing the beam', () => {
  /** The triangle drawn: its three corners. */
  function corners(target: { x: number; y: number }) {
    const context = createFakeContext()
    drawBeam(context.asContext(), target, 'see-through yellow')
    const points = context.calls
      .filter((call) => call.name === 'moveTo' || call.name === 'lineTo')
      .map((call) => call.args as [number, number])
    return { context, points }
  }

  it('is a filled triangle from the sides of the orb to the centre of the target', () => {
    // A target straight to the right: the sides are straight above and below.
    const { context, points } = corners({ x: 350, y: CENTRE.y })

    expect(points[0][0]).toBeCloseTo(CENTRE.x, 9)
    expect(points[0][1]).toBeCloseTo(CENTRE.y + PROJECTOR_RADIUS, 9)
    expect(points[1]).toEqual([350, CENTRE.y])
    expect(points[2][0]).toBeCloseTo(CENTRE.x, 9)
    expect(points[2][1]).toBeCloseTo(CENTRE.y - PROJECTOR_RADIUS, 9)
    expect(names(context.calls)).toContain('closePath')
    const [fill] = context.callsTo('fill')
    expect(fill.fillStyle).toBe('see-through yellow')
  })

  it('turns with the target: its base is always square to it, across the orb', () => {
    for (const target of [
      { x: 60, y: 200 },
      { x: 330, y: 700 },
      { x: 200, y: 100 },
    ]) {
      const [a, apex, b] = corners(target).points
      const toTarget = [target.x - CENTRE.x, target.y - CENTRE.y]
      const base = [b[0] - a[0], b[1] - a[1]]

      expect(apex).toEqual([target.x, target.y])
      expect(Math.hypot(base[0], base[1])).toBeCloseTo(2 * PROJECTOR_RADIUS, 9)
      expect(base[0] * toTarget[0] + base[1] * toTarget[1]).toBeCloseTo(0, 9)
      // The base's middle is the projector's centre.
      expect((a[0] + b[0]) / 2).toBeCloseTo(CENTRE.x, 9)
      expect((a[1] + b[1]) / 2).toBeCloseTo(CENTRE.y, 9)
    }
  })

  it('only shows outside the orb, as if it came out of it', () => {
    const { context } = corners({ x: 350, y: CENTRE.y })

    const calls = names(context.calls)
    expect(context.callsTo('rect')[0].args).toEqual([0, 0, 400, 800])
    expect(context.callsTo('arc')[0].args).toEqual([
      CENTRE.x,
      CENTRE.y,
      PROJECTOR_RADIUS,
      0,
      Math.PI * 2,
    ])
    expect(context.callsTo('clip')[0].args).toEqual(['evenodd'])
    expect(calls.indexOf('clip')).toBeLessThan(calls.indexOf('fill'))
    expect(calls.at(-1)).toBe('restore')
  })
})

describe('drawing a bubble', () => {
  it('draws the bubble image at its size with the word over it, centred', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Kindness', 150, 300), look)

    const half = BUBBLE_SIZE / 2
    expect(context.callsTo('drawImage')[0].args).toEqual([
      bubbleImage,
      150 - half,
      300 - half,
      BUBBLE_SIZE,
      BUBBLE_SIZE,
    ])
    const [text] = context.callsTo('fillText')
    expect([text.args, text.font, text.fillStyle]).toEqual([
      ['Kindness', 150, 300],
      fontAt(font, 14),
      'ink',
    ])
    expect([context.textAlign, context.textBaseline]).toEqual(['center', 'middle'])
  })

  it('tints the bubble itself with a hue, over the image and under the word', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Kindness', 150, 300), look, 'green hue')

    expect(context.callsTo('arc')[0].args).toEqual([150, 300, BUBBLE_RADIUS, 0, Math.PI * 2])
    const calls = names(context.calls)
    expect(calls.indexOf('drawImage')).toBeLessThan(calls.indexOf('fill'))
    expect(calls.indexOf('fill')).toBeLessThan(calls.indexOf('fillText'))
    expect(context.callsTo('fill')[0].fillStyle).toBe('green hue')
  })

  it('draws a plain circle the size of the bubble itself if the image did not load', () => {
    const context = createFakeContext()

    drawBubble(context.asContext(), bubble('Greed', 150, 300), { ...look, bubbleImage: undefined })

    expect(context.callsTo('arc')[0].args).toEqual([150, 300, BUBBLE_RADIUS, 0, Math.PI * 2])
    expect(context.callsTo('fill')[0].fillStyle).toBe('card fill')
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth]).toEqual(['card border', BUBBLE_BORDER_WIDTH])
    expect(context.callsTo('fillText')[0].args[0]).toBe('Greed')
  })
})

describe('drawing a button', () => {
  const [focus] = BUTTONS

  it('draws a raised pill with its label in white in the middle, and no border', () => {
    const context = createFakeContext()

    drawButton(context.asContext(), focus, false, look)

    expect(context.callsTo('roundRect')[0].args).toEqual([
      focus.x,
      focus.y,
      focus.width,
      focus.height,
      focus.height / 2,
    ])
    const [fill] = context.callsTo('fill')
    expect([fill.fillStyle, fill.shadowBlur]).toEqual(['button ink', BUTTON_SHADOW_BLUR])
    expect(context.callsTo('stroke')).toEqual([])
    const [label] = context.callsTo('fillText')
    expect([label.args, label.font, label.fillStyle, label.shadowBlur]).toEqual([
      ['Focus', focus.x + focus.width / 2, focus.y + focus.height / 2],
      fontAt(font, 18),
      'button white',
      0,
    ])
  })

  it('looks pressed: pushed down, lighter, and without its shadow', () => {
    const context = createFakeContext()

    drawButton(context.asContext(), focus, true, look)

    expect(context.callsTo('roundRect')[0].args[1]).toBe(focus.y + BUTTON_PRESS_DEPTH)
    const [fill] = context.callsTo('fill')
    expect([fill.fillStyle, fill.shadowBlur]).toEqual(['button light ink', 0])
    expect(context.callsTo('fillText')[0].args[2]).toBe(
      focus.y + BUTTON_PRESS_DEPTH + focus.height / 2,
    )
  })
})

describe('drawing the scene', () => {
  const target = bubble('Kindness', 300, 250)
  const other = bubble('Greed', 80, 600)

  it('draws the projector, the beam, the bubbles, then the buttons over everything', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      { bubbles: [other, target], target, answered: [], press: undefined, timeMs: 1_000 },
      look,
    )

    const calls = names(context.calls)
    expect(calls[0]).toBe('clearRect')
    const images = context.callsTo('drawImage').map((call) => call.args[0])
    expect(images).toEqual([projectorImage, bubbleImage, bubbleImage])
    const beam = calls.indexOf('clip')
    expect(calls.indexOf('drawImage')).toBeLessThan(beam)
    expect(beam).toBeLessThan(calls.lastIndexOf('drawImage'))
    expect(context.callsTo('fillText').map((call) => call.args[0])).toEqual([
      'Greed',
      'Kindness',
      'Focus',
      'Change attention',
    ])
  })

  it('draws no beam without a target', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      { bubbles: [other], target: undefined, answered: [], press: undefined, timeMs: 1_000 },
      look,
    )

    expect(context.callsTo('clip')).toEqual([])
  })

  it('draws answered bubbles fading out where they were, green if right, red if not', () => {
    const context = createFakeContext()
    const answered = [
      { item: bubble('Kindness', 100, 300), right: true, atMs: 1_000 },
      { item: bubble('Greed', 300, 500), right: false, atMs: 1_050 },
    ]

    drawScene(
      context.asContext(),
      { bubbles: [], target: undefined, answered, press: undefined, timeMs: 1_075 },
      look,
    )

    // 75% and 25% of the 0.1 s fade to go.
    const words = context.callsTo('fillText').filter((call) => call.font === fontAt(font, 14))
    expect(words.map((call) => [call.args[0], call.globalAlpha])).toEqual([
      ['Kindness', 0.25],
      ['Greed', 0.75],
    ])
    const hues = context.callsTo('fill').filter((call) => call.fillStyle !== 'button ink')
    expect(hues.map((call) => [call.fillStyle, call.globalAlpha])).toEqual([
      ['green hue', 0.25],
      ['red hue', 0.75],
    ])
    // The buttons, drawn after, are not faded.
    expect(context.callsTo('fillText').at(-1)!.globalAlpha).toBe(1)
  })

  it('shows the button pressed for 0.15 s after it was', () => {
    const fillsAt = (timeMs: number) => {
      const context = createFakeContext()
      drawScene(
        context.asContext(),
        {
          bubbles: [],
          target: undefined,
          answered: [],
          press: { answer: 'change', atMs: 1_000 },
          timeMs,
        },
        look,
      )
      return context.callsTo('fill').map((call) => call.fillStyle)
    }

    expect(PRESS_MS).toBe(150)
    expect(fillsAt(1_000)).toEqual(['button ink', 'button light ink'])
    expect(fillsAt(1_149)).toEqual(['button ink', 'button light ink'])
    expect(fillsAt(1_150)).toEqual(['button ink', 'button ink'])
  })
})

describe('loading the images', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the green bubble and the projector artwork', async () => {
    // A fresh copy of the module, so no image loaded by another test is used.
    vi.resetModules()
    const { loadBubbleImage, loadProjectorImage } = await import('./draw')
    const images = stubImages()

    const loaded = await Promise.all([loadBubbleImage(), loadProjectorImage()])

    expect(images).toEqual(loaded)
    expect(loaded.map((image) => image.src)).toEqual([greenBubbleUrl, projectorUrl])
  })
})
