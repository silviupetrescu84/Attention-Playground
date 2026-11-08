// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { CARD_COLORS, readCssVariables } from './canvas-style'

/** A canvas on a page whose styles set `variables`. */
function canvasWith(variables: Record<string, string>) {
  for (const [name, value] of Object.entries(variables)) {
    document.documentElement.style.setProperty(name, value)
  }
  const canvas = document.createElement('canvas')
  document.body.replaceChildren(canvas)
  return canvas
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.body.replaceChildren()
})

describe('readCssVariables', () => {
  it('reads each colour from its CSS variable, under the name the game uses', () => {
    const canvas = canvasWith({ '--paper': 'rgb(255 255 255)', '--pen': '#17345d' })

    const colors = readCssVariables(canvas, { background: '--paper', text: '--pen' })

    expect(colors).toEqual({ background: 'rgb(255 255 255)', text: '#17345d' })
  })

  it('reads the value without the spaces around it', () => {
    const canvas = canvasWith({ '--pen': '   #17345d  ' })

    expect(readCssVariables(canvas, { text: '--pen' })).toEqual({ text: '#17345d' })
  })

  it('names a variable that is not set, instead of drawing with nothing', () => {
    const canvas = canvasWith({ '--pen': '#17345d' })

    expect(() => readCssVariables(canvas, { text: '--pen', fill: '--missing' })).toThrow(
      new Error('The CSS variable --missing is not set'),
    )
  })
})

describe('card colours', () => {
  it('are the ink text colour and the shared card fill and border', () => {
    expect(CARD_COLORS).toEqual({
      text: '--color-ink',
      cardFill: '--canvas-card-fill',
      cardBorder: '--canvas-card-border',
    })
  })

  it('are all declared in the CSS', () => {
    for (const variable of Object.values(CARD_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('make the border and the tints see-through versions of the page colours', () => {
    expect(cssVariables.get('--canvas-card-border')).toBe(
      'color-mix(in srgb, var(--color-ink) 35%, transparent)',
    )
    expect(cssVariables.get('--canvas-good-tint')).toBe(
      'color-mix(in srgb, var(--color-good) 35%, transparent)',
    )
    expect(cssVariables.get('--canvas-bad-tint')).toBe(
      'color-mix(in srgb, var(--color-bad) 35%, transparent)',
    )
  })
})
