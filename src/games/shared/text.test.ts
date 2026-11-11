// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cssVariables, useCssVariables } from '../../test/css-variables'
import { createFakeContext, fontSizeOf } from '../../test/fake-canvas-context'
import {
  CANVAS_FONT,
  drawTextBlock,
  fitFontSize,
  fitInCircle,
  fontAt,
  LINE_HEIGHT,
  loadCanvasFont,
  wrapText,
  type CanvasFont,
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
      '"Roboto Condensed", "Arial Narrow", sans-serif',
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
      '600 16px "Roboto Condensed", "Arial Narrow", sans-serif',
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
