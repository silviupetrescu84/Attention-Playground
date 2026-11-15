// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cssVariables, useCssVariables } from '../../test/css-variables'
import { createFakeContext, fontSizeOf } from '../../test/fake-canvas-context'
import {
  CANVAS_FONT,
  chooseTextStyle,
  defaultTextStyle,
  drawTextBlock,
  fitFontSize,
  fitInCircle,
  fitInEllipse,
  fontAt,
  largestTextStyle,
  layOutText,
  LINE_HEIGHT,
  loadCanvasFont,
  loadWithCanvasFont,
  READABLE_SIZE,
  textsFit,
  textStyleAt,
  wrapText,
  type CanvasFont,
  type TextShape,
} from './text'

// The fake font is 0.6 × size wide per character, spaces included.

/** A font as it would be read from the CSS. */
const font: CanvasFont = { family: '"Test Sans", sans-serif', weight: '600' }

afterEach(() => {
  document.documentElement.removeAttribute('style')
})

describe('the canvas font', () => {
  it('is set in CSS: the bundled condensed font, semi-bold, with condensed fallbacks', () => {
    expect(CANVAS_FONT).toEqual({
      family: '--canvas-font-family',
      weight: '--canvas-font-weight',
    })
    expect(cssVariables.get('--canvas-font-family')).toBe(
      "'Roboto Condensed', 'Arial Narrow', sans-serif",
    )
    expect(cssVariables.get('--canvas-font-weight')).toBe('600')
  })

  it('is written for the canvas as weight, size, then family', () => {
    expect(fontAt(font, 19)).toBe('600 19px "Test Sans", sans-serif')
  })

  it('is loaded as the CSS sets it', async () => {
    useCssVariables()
    const fonts = { load: vi.fn(async () => [{ status: 'loaded' }]) }

    await expect(loadCanvasFont({ fonts })).resolves.toBe(true)

    expect(fonts.load).toHaveBeenCalledExactlyOnceWith(
      "600 16px 'Roboto Condensed', 'Arial Narrow', sans-serif",
    )
  })

  it('cannot be loaded if the CSS does not set it', () => {
    expect(() => loadCanvasFont()).toThrow(
      new Error('The CSS variable --canvas-font-family is not set'),
    )
  })
})

describe('wrapText', () => {
  /** A context at 10 px: 6 px per character. */
  function contextAt10px() {
    const context = createFakeContext()
    context.font = fontAt(font, 10)
    return context.asContext()
  }

  it('keeps a text that fits on one line', () => {
    expect(wrapText(contextAt10px(), 'Set a tone', 60)).toEqual(['Set a tone'])
  })

  it('breaks between words, filling each line as far as it goes', () => {
    // 60 px is 10 characters.
    expect(wrapText(contextAt10px(), 'Set a tone for today', 60)).toEqual([
      'Set a tone',
      'for today',
    ])
    expect(wrapText(contextAt10px(), 'Read my intention back', 60)).toEqual([
      'Read my',
      'intention',
      'back',
    ])
  })

  it('gives a word that is too wide a line of its own', () => {
    expect(wrapText(contextAt10px(), 'Act on autopilot now', 42)).toEqual([
      'Act on',
      'autopilot',
      'now',
    ])
  })

  it('never starts with an empty line, even when the first word is too wide', () => {
    expect(wrapText(contextAt10px(), 'Intentionality matters', 30)).toEqual([
      'Intentionality',
      'matters',
    ])
  })
})

describe('fitFontSize', () => {
  const fit = { maxWidth: 120, minSize: 10, maxSize: 22 }
  // A word of n characters fits on one line up to 120 / (0.6 × n) px.
  const widthAt = (text: string, size: number) => text.length * size * 0.6

  it('uses the largest size when every text fits', () => {
    expect(fitFontSize(createFakeContext().asContext(), font, ['Joy', 'Calm'], fit)).toBe(22)
  })

  it('picks the largest half-pixel size at which the widest text fits', () => {
    const size = fitFontSize(createFakeContext().asContext(), font, ['Joy', 'Disappointment'], fit)

    // 14 characters: 14 × 0.6 × 14 = 117.6 ≤ 120, but at 14.5 it is 121.8.
    expect(size).toBe(14)
    expect(widthAt('Disappointment', size)).toBeLessThanOrEqual(120)
    expect(widthAt('Disappointment', size + 0.5)).toBeGreaterThan(120)
  })

  it('steps down in half pixels, to keep the text as large as possible', () => {
    // 12 characters: 12 × 0.6 × 16.5 = 118.8 ≤ 120, but at 17 it is 122.4.
    expect(fitFontSize(createFakeContext().asContext(), font, ['Hopelessness'], fit)).toBe(16.5)
  })

  it('never goes below the smallest size', () => {
    const texts = ['Supercalifragilisticexpialidocious']

    expect(fitFontSize(createFakeContext().asContext(), font, texts, fit)).toBe(10)
  })

  it('lets texts wrap onto as many lines as allowed', () => {
    const context = createFakeContext().asContext()
    const texts = ['Drift through the morning']
    const twoLines = { maxWidth: 60, maxLines: 2, minSize: 6, maxSize: 20 }

    // 'through the morning' (19 characters) would be a line: at 2 lines the
    // best split is 'Drift through' / 'the morning', 13 characters: 60 / 7.8.
    expect(fitFontSize(context, font, texts, twoLines)).toBe(7.5)
    expect(fitFontSize(context, font, texts, { ...twoLines, maxLines: 1 })).toBe(6)
    // With 3 lines: 'Drift' / 'through the' / 'morning', 11 characters: 60 / 6.6.
    expect(fitFontSize(context, font, texts, { ...twoLines, maxLines: 3 })).toBe(9)
  })

  it('does not count a word that is too wide as fitting, however few lines', () => {
    const context = createFakeContext().asContext()

    // 'Intentionality' (14 characters) alone needs 8.4 px per px of size.
    const fourLines = { maxWidth: 84, maxLines: 4, minSize: 6, maxSize: 20 }

    expect(fitFontSize(context, font, ['Intentionality'], fourLines)).toBe(10)
  })

  it('measures in the given font', () => {
    const context = createFakeContext()
    const fonts: string[] = []
    const measure = context.asContext().measureText
    Object.assign(context, {
      measureText: (text: string) => {
        fonts.push(context.font)
        return measure(text)
      },
    })

    fitFontSize(context.asContext(), font, ['Disappointment', 'Two words'], { ...fit, maxLines: 2 })

    expect(fonts.length).toBeGreaterThan(0)
    for (const measuredIn of fonts) {
      expect(measuredIn).toBe(fontAt(font, fontSizeOf(measuredIn)))
    }
  })
})

describe('drawTextBlock', () => {
  it('centres one line on the point, in the font and colour given', () => {
    const context = createFakeContext()

    drawTextBlock(context.asContext(), { fontSize: 14, lines: ['Rest'] }, 150, 300, font, 'ink')

    const texts = context.callsTo('fillText')
    expect(texts.map(({ args, font: drawn, fillStyle }) => [args, drawn, fillStyle])).toEqual([
      [['Rest', 150, 300], fontAt(font, 14), 'ink'],
    ])
    expect([context.textAlign, context.textBaseline]).toEqual(['center', 'middle'])
  })

  it('centres several lines on the point, 1.2 × the size apart', () => {
    const context = createFakeContext()
    const twoLines = { fontSize: 10, lines: ['Drift', 'through'] }

    drawTextBlock(context.asContext(), twoLines, 150, 300, font, 'ink')

    expect(LINE_HEIGHT).toBe(1.2)
    expect(context.callsTo('fillText').map((call) => call.args)).toEqual([
      ['Drift', 150, 294],
      ['through', 150, 306],
    ])
  })
})

describe('fitInCircle', () => {
  it('makes lines as wide as the circle at the top and bottom of the text, less a margin', () => {
    const fit = fitInCircle(50, 4, { maxLines: 2, minSize: 8, maxSize: 15 })

    // 2 lines of 15 px: 36 px high. 18 px from the centre, the circle is 2 × 46.6 wide.
    expect(fit).toEqual({ maxWidth: 85, maxLines: 2, minSize: 8, maxSize: 15 })
  })

  it('keeps every corner of the tallest text inside the circle', () => {
    for (const [radius, maxLines, maxSize] of [
      [50, 1, 20],
      [62, 3, 20],
      [56, 3, 16],
    ]) {
      const { maxWidth } = fitInCircle(radius, 4, { maxLines, minSize: 8, maxSize })
      const halfHeight = (maxLines * maxSize * LINE_HEIGHT) / 2

      expect(Math.hypot(maxWidth / 2 + 4, halfHeight)).toBeLessThanOrEqual(radius)
    }
  })
})

describe('fitInEllipse', () => {
  it('makes lines as wide as the ellipse at the top and bottom of the text, less a margin', () => {
    const fit = fitInEllipse(100, 50, 8, { maxLines: 2, minSize: 10, maxSize: 15 })

    // 2 lines of 15 px: 36 px high. 18 px from the centre, the ellipse is
    // 2 × 100 × √(1 − (18/50)²) = 186.6 wide.
    expect(fit).toEqual({ maxWidth: 170, maxLines: 2, minSize: 10, maxSize: 15 })
  })

  it('is a circle when both radii are the same', () => {
    const options = { maxLines: 3, minSize: 8, maxSize: 16 }

    expect(fitInEllipse(56, 56, 4, options)).toEqual(fitInCircle(56, 4, options))
  })

  it('keeps every corner of the tallest text inside the ellipse', () => {
    for (const [radiusX, radiusY, maxLines, maxSize] of [
      [93, 50, 2, 24],
      [93, 50, 3, 20],
      [60, 40, 1, 30],
    ]) {
      const { maxWidth } = fitInEllipse(radiusX, radiusY, 8, { maxLines, minSize: 8, maxSize })
      const halfHeight = (maxLines * maxSize * LINE_HEIGHT) / 2

      const corner = ((maxWidth / 2 + 8) / radiusX) ** 2 + (halfHeight / radiusY) ** 2
      expect(corner).toBeLessThanOrEqual(1)
    }
  })

  it('refuses text taller than the ellipse', () => {
    expect(() => fitInEllipse(100, 30, 4, { maxLines: 3, minSize: 10, maxSize: 20 })).toThrow(
      '3 lines of 20 px do not fit 60 px high',
    )
  })
})

describe('textsFit', () => {
  const context = () => createFakeContext().asContext()

  it('tells whether every text fits in its lines at a size', () => {
    const twoLines = { maxWidth: 30, maxLines: 2 }

    // 6 px a character at 10 px.
    expect(textsFit(context(), font, ['Aaaa Bbbb'], 10, twoLines)).toBe(true)
    expect(textsFit(context(), font, ['Aaaa Bbbb', 'Cccccc'], 10, twoLines)).toBe(false)
    expect(textsFit(context(), font, ['Aaaa Bbbb'], 10, { maxWidth: 30 })).toBe(false)
    expect(textsFit(context(), font, ['Aaaa Bbbb'], 10, { maxWidth: 54 })).toBe(true)
  })

  it('leaves the context set to that size', () => {
    const fake = context()

    textsFit(fake, font, ['A'], 13, { maxWidth: 100 })

    expect(fake.font).toBe(fontAt(font, 13))
  })
})

describe('layOutText', () => {
  it('breaks a text into lines at a size, in the font', () => {
    const context = createFakeContext()

    // 6 px a character at 10 px: 60 px is 10 characters.
    const block = layOutText(context.asContext(), font, 'Dim the lights', 10, 60)

    expect(block).toEqual({ fontSize: 10, lines: ['Dim the', 'lights'] })
    expect(context.font).toBe(fontAt(font, 10))
  })
})

describe('text styles', () => {
  /** A shape `radiusX` wide (across, from the middle), tall enough for 3 lines. */
  const shape = (radiusX: number): TextShape => ({
    radiusX,
    radiusY: 200,
    margin: 8,
    minSize: 10,
    maxSize: 20,
  })
  const context = () => createFakeContext().asContext()

  it('fit lines at a size as wide as the shape is at their top and bottom, less the margin', () => {
    expect(textStyleAt(shape(100), 2, 20)).toEqual({
      fontSize: 20,
      fit: fitInEllipse(100, 200, 8, { maxLines: 2, minSize: 20, maxSize: 20 }),
    })
  })

  it('start at the largest size, on 2 lines, until the font is measured', () => {
    expect(defaultTextStyle(shape(100))).toEqual(textStyleAt(shape(100), 2, 20))
  })

  it('write every text of a kind at the largest size they all fit on 2 lines', () => {
    // "Aaaa Bbbb" is 9 characters: 2 lines of 4 fit 20 px with room to spare.
    const style = chooseTextStyle(context(), font, ['Aaaa Bbbb', 'Cc Dd'], shape(100))

    expect(style.fontSize).toBe(20)
    expect(style.fit.maxLines).toBe(2)
  })

  it('go to 3 lines when 2 would be under 14 px and 3 allow larger', () => {
    // Three words of 8: one a line needs 8 × 0.6 × size ≤ width.
    const style = chooseTextStyle(context(), font, ['Aaaaaaaa Bbbbbbbb Cccccccc'], shape(70))

    expect(READABLE_SIZE).toBe(14)
    expect(style.fit.maxLines).toBe(3)
    expect(style.fontSize).toBeGreaterThanOrEqual(READABLE_SIZE)
  })

  it('stay on 2 lines when they are 14 px or more', () => {
    const style = chooseTextStyle(context(), font, ['Aaaaaaaa Bbbbbbbb Cccccccc'], shape(130))

    expect(style.fit.maxLines).toBe(2)
    expect(style.fontSize).toBeGreaterThanOrEqual(READABLE_SIZE)
  })

  it('can be the largest on so many lines, e.g. single words on 1', () => {
    // 12 px a character at 20 px: "Aaaaaaaa" is 96 px, under 200 − 2 × 8 across.
    const style = largestTextStyle(context(), font, ['Aaaaaaaa', 'Bbb'], shape(100), 1)

    expect(style).toEqual(textStyleAt(shape(100), 1, 20))
  })

  it('stay on 2 lines at the smallest size when 3 would be no larger', () => {
    // One long word: more lines do not help.
    const style = chooseTextStyle(context(), font, ['Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], shape(60))

    expect(style).toEqual(textStyleAt(shape(60), 2, 10))
  })
})

describe('loading the font with a game’s images', () => {
  it('loads both at once, and gives what the game loaded', async () => {
    useCssVariables()
    let finishImages: (images: string[]) => void = () => {}
    const images = new Promise<string[]>((resolve) => (finishImages = resolve))
    const fonts = { load: vi.fn(async () => [{ status: 'loaded' }]) }

    const loading = loadWithCanvasFont(() => images, { fonts })

    expect(fonts.load).toHaveBeenCalledOnce()
    finishImages(['bubble'])
    await expect(loading).resolves.toEqual(['bubble'])
  })
})
