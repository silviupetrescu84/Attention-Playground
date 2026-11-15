import { describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext } from '../../test/fake-canvas-context'
import gameCss from '../shared/game.css?raw'
import { RAISED } from '../shared/pill'
import { fontAt, largestTextStyle, textsFit, type TextStyle } from '../shared/text'
import data from './data/improve-inner-voice.json'
import {
  createWordText,
  drawEmpoweredEdge,
  drawPad,
  drawScene,
  EMPOWERED_BORDER_WIDTH,
  EMPOWERED_EDGE_HEIGHT,
  INNER_VOICE_COLORS,
  PAD_LABEL,
  PAD_TEXT_FIT,
  WORD_TEXT,
  type SceneLook,
} from './draw'
import { WORD_OVAL, type FallingWord } from './improve-inner-voice'
import { createPad } from './pad'
import { wordsFrom } from './words'

// The fake font is 0.6 × size wide per character, spaces included.

const font = { family: '"Test Sans"', weight: '600' }
const colors = {
  text: 'ink',
  cardFill: 'card fill',
  cardBorder: 'card border',
  rightHue: 'green hue',
  wrongHue: 'red hue',
  pillShadow: 'shadow',
  padFill: 'white',
  padText: 'pad ink',
  empowered: 'green',
}
const ovalImage = { name: 'oval' } as unknown as CanvasImageSource
const look: SceneLook = {
  textOf: (falling) => ({ fontSize: 12, lines: [falling.word.text] }),
  padFontSize: 15,
  font,
  colors,
  ovalImage,
}

function word(text: string, type: 'good' | 'bad', changes: Partial<FallingWord> = {}) {
  const falling: FallingWord = {
    word: { text, type },
    column: 1,
    x: 100,
    y: 300,
    speed: 40,
    shownAtMs: 1_000,
    endedAtMs: undefined,
    end: undefined,
    ...changes,
  }
  return falling
}

describe('colours', () => {
  it('come from CSS variables the app declares: the bubbles’, and the pad’s', () => {
    for (const variable of Object.values(INNER_VOICE_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('make the pad look like the app’s white buttons: white, ink text, the same shadow', () => {
    const whiteButton = /\.game-hud__high-scores-open \{([^}]*)\}/.exec(gameCss)![1]
    const property = (name: string) => new RegExp(`${name}: ([^;]+);`).exec(whiteButton)![1]

    expect(cssVariables.get(INNER_VOICE_COLORS.padFill)).toBe(property('background'))
    expect(cssVariables.get(INNER_VOICE_COLORS.padText)).toBe(property('color'))
    expect(INNER_VOICE_COLORS.pillShadow).toBe('--button-shadow')
  })

  it('show the player empowered in the app’s green', () => {
    expect(cssVariables.get(INNER_VOICE_COLORS.empowered)).toBe('var(--color-good)')
  })
})

describe('texts', () => {
  it('go inside the oval as seen, 6 px from its edge, up to 18 px', () => {
    expect(WORD_TEXT).toEqual({
      radiusX: WORD_OVAL.radiusX,
      radiusY: WORD_OVAL.radiusY,
      margin: 6,
      minSize: 8,
      maxSize: 18,
    })
  })

  it('fit every word of the real lists on one line, at one size', () => {
    const { good, bad } = wordsFrom(data)
    const context = createFakeContext().asContext()

    const { fontSize, fit } = largestTextStyle(context, font, [...good, ...bad], WORD_TEXT, 1)

    expect(fontSize).toBeGreaterThan(WORD_TEXT.minSize)
    expect(textsFit(context, font, [...good, ...bad], fontSize, fit)).toBe(true)
  })

  it('are laid out once for each word, however often it is drawn', () => {
    const style: TextStyle = {
      fontSize: 10,
      fit: { maxWidth: 80, maxLines: 1, minSize: 10, maxSize: 10 },
    }
    const textOf = createWordText(createFakeContext().asContext(), font, style)
    const falling = word('capable', 'good')

    const text = textOf(falling)

    expect(text).toEqual({ fontSize: 10, lines: ['capable'] })
    expect(textOf(falling)).toBe(text)
  })
})

describe('the pad’s label', () => {
  it('reads "Inner Voice", on one line, up to 15 px, at least 12 px from the pad’s ends', () => {
    expect(PAD_LABEL).toBe('Inner Voice')
    expect(PAD_TEXT_FIT).toEqual({ maxWidth: 100 - 2 * 12, minSize: 10, maxSize: 15 })
  })
})

describe('drawing the pad', () => {
  it('is a raised white pill where the pad is, with its label in ink in the middle', () => {
    const context = createFakeContext()

    drawPad(context.asContext(), createPad(), false, look)

    expect(context.callsTo('roundRect')[0].args).toEqual([150, 748, 100, 28, 14])
    const [fill] = context.callsTo('fill')
    expect([fill.fillStyle, fill.shadowColor, fill.shadowBlur, fill.shadowOffsetY]).toEqual([
      'white',
      'shadow',
      RAISED.blur,
      RAISED.offsetY,
    ])
    const [label] = context.callsTo('fillText')
    expect([label.args, label.font, label.fillStyle, label.shadowBlur]).toEqual([
      ['Inner Voice', 200, 762],
      fontAt(font, 15),
      'pad ink',
      0,
    ])
    expect(context.callsTo('stroke')).toEqual([])
  })

  it('has a green border while the player is empowered', () => {
    const context = createFakeContext()

    drawPad(context.asContext(), createPad(), true, look)

    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth]).toEqual(['green', EMPOWERED_BORDER_WIDTH])
    expect(EMPOWERED_BORDER_WIDTH).toBe(3)
  })
})

describe('drawing the green line along the bottom', () => {
  it('fills the bottom 6 px of the canvas, all the way across', () => {
    const context = createFakeContext()

    drawEmpoweredEdge(context.asContext(), 'green')

    const [edge] = context.callsTo('fillRect')
    expect([edge.args, edge.fillStyle]).toEqual([[0, 800 - 6, 400, 6], 'green'])
    expect(EMPOWERED_EDGE_HEIGHT).toBe(6)
  })
})

describe('drawing the scene', () => {
  it('shows the player empowered: the green line along the bottom, under the pad', () => {
    const context = createFakeContext()
    const words = [word('capable', 'good')]

    drawScene(
      context.asContext(),
      { words, pad: createPad(), empowered: true, timeMs: 2_000 },
      look,
    )

    const names = context.calls.map((call) => call.name)
    expect(context.callsTo('fillRect')).toHaveLength(1)
    expect(names.indexOf('fillRect')).toBeGreaterThan(names.lastIndexOf('drawImage'))
    expect(names.indexOf('fillRect')).toBeLessThan(names.indexOf('roundRect'))
    expect(context.callsTo('stroke').map((call) => call.strokeStyle)).toEqual(['green'])
  })

  it('shows nothing of it otherwise', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      { words: [], pad: createPad(), empowered: false, timeMs: 0 },
      look,
    )

    expect(context.callsTo('fillRect')).toEqual([])
    expect(context.callsTo('stroke')).toEqual([])
  })

  it('clears the canvas, draws each word in its oval, then the pad over them', () => {
    const context = createFakeContext()
    const words = [word('capable', 'good'), word('worthless', 'bad', { x: 300, y: 500 })]

    drawScene(
      context.asContext(),
      { words, pad: createPad(), empowered: false, timeMs: 2_000 },
      look,
    )

    expect(context.calls[0].name).toBe('clearRect')
    expect(context.callsTo('drawImage').map((call) => call.args)).toEqual([
      [ovalImage, 100 - 50, 300 - WORD_OVAL.height / 2, 100, WORD_OVAL.height],
      [ovalImage, 300 - 50, 500 - WORD_OVAL.height / 2, 100, WORD_OVAL.height],
    ])
    expect(context.callsTo('fillText').map((call) => call.args)).toEqual([
      ['capable', 100, 300],
      ['worthless', 300, 500],
      ['Inner Voice', 200, 762],
    ])
    const names = context.calls.map((call) => call.name)
    expect(names.lastIndexOf('roundRect')).toBeGreaterThan(names.lastIndexOf('drawImage'))
    expect(context.globalAlpha).toBe(1)
  })

  it.each([
    ['good', 'green hue'],
    ['bad', 'red hue'],
  ] as const)('tints a %s word caught %s as it fades out', (type, hue) => {
    const context = createFakeContext()
    const caught = word('capable', type, { endedAtMs: 2_000, end: 'tapped' })

    drawScene(
      context.asContext(),
      { words: [caught], pad: createPad(), empowered: false, timeMs: 2_050 },
      look,
    )

    const fills = context.callsTo('fill')
    expect(fills.map((call) => [call.fillStyle, call.globalAlpha])).toEqual([
      [hue, 0.5],
      ['white', 1],
    ])
  })

  it('draws words fading in see-through, and nothing of one gone', () => {
    const context = createFakeContext()
    const words = [
      word('capable', 'good', { shownAtMs: 1_950 }),
      word('worthless', 'bad', { endedAtMs: 1_000, end: 'gone' }),
    ]

    drawScene(
      context.asContext(),
      { words, pad: createPad(), empowered: false, timeMs: 2_000 },
      look,
    )

    expect(context.callsTo('drawImage').map((call) => call.globalAlpha)).toEqual([0.5])
  })

  it('draws plain ovals, as big as they are seen, if the image did not load', () => {
    const context = createFakeContext()

    drawScene(
      context.asContext(),
      { words: [word('capable', 'good')], pad: createPad(), empowered: false, timeMs: 2_000 },
      { ...look, ovalImage: undefined },
    )

    expect(context.callsTo('drawImage')).toEqual([])
    expect(context.callsTo('ellipse')[0].args.slice(0, 4)).toEqual([
      100,
      300,
      WORD_OVAL.radiusX,
      WORD_OVAL.radiusY,
    ])
  })
})
