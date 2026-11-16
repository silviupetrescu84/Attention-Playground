import { describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext } from '../../test/fake-canvas-context'
import {
  boxOf,
  BUTTON_COLORS,
  BUTTON_PRESS_DEPTH,
  drawButton,
  isOnButton,
  PRESS_MS,
  type ButtonColors,
} from './canvas-button'
import gameCss from './game.css?raw'
import { RAISED } from './pill'
import { fontAt, type CanvasFont } from './text'

const font: CanvasFont = { family: '"Test Sans"', weight: '600' }
/** Stand-ins for the colours read from the CSS. */
const colors: ButtonColors = {
  pillShadow: 'shadow',
  buttonFill: 'button ink',
  buttonText: 'button white',
  buttonPressed: 'button light ink',
}
const done = { label: 'Done', x: 120, y: 728, width: 160, height: 60 }

describe('colours', () => {
  it('come from CSS variables the app declares', () => {
    for (const variable of Object.values(BUTTON_COLORS)) {
      expect(cssVariables.get(variable), variable).toBeTruthy()
    }
  })

  it('make the buttons look like the app’s own: ink blue, white text, the same shadow', () => {
    const appButton = /\.game-hud \.game-hud__button \{([^}]*)\}/.exec(gameCss)![1]
    const property = (name: string) => new RegExp(`${name}: ([^;]+);`).exec(appButton)![1]

    expect(cssVariables.get('--canvas-button-fill')).toBe(property('background'))
    expect(cssVariables.get('--canvas-button-text')).toBe(property('color'))
    // Its box-shadow: 0 0.5rem 1.5rem (8 px down, blurred 24 px), in ink at 25%.
    expect(property('box-shadow')).toBe(`0 0.5rem 1.5rem var(${BUTTON_COLORS.pillShadow})`)
    expect(RAISED).toEqual({ offsetY: 8, blur: 24 })
    expect(cssVariables.get('--canvas-button-pressed')).toBe(
      'color-mix(in srgb, var(--color-ink) 80%, white)',
    )
  })
})

describe('where a button is', () => {
  it('is the box from its top left corner, its size across and down', () => {
    expect(boxOf(done)).toEqual({ left: 120, right: 280, top: 728, bottom: 788 })
  })

  it('takes taps on it, its edges included, and no others', () => {
    const on = [
      { x: 200, y: 758 },
      { x: 120, y: 728 },
      { x: 280, y: 788 },
    ]
    const off = [
      { x: 119, y: 758 },
      { x: 281, y: 758 },
      { x: 200, y: 727 },
      { x: 200, y: 789 },
    ]

    expect(on.map((point) => isOnButton(point, done))).toEqual([true, true, true])
    expect(off.map((point) => isOnButton(point, done))).toEqual([false, false, false, false])
  })
})

describe('drawing a button', () => {
  it('draws a raised pill with its label in white in the middle, and no border', () => {
    const context = createFakeContext()

    drawButton(context.asContext(), done, false, font, 18, colors)

    expect(context.callsTo('roundRect')[0].args).toEqual([120, 728, 160, 60, 30])
    const [fill] = context.callsTo('fill')
    expect([fill.fillStyle, fill.shadowColor, fill.shadowBlur]).toEqual([
      'button ink',
      'shadow',
      RAISED.blur,
    ])
    expect(context.callsTo('stroke')).toEqual([])
    const [label] = context.callsTo('fillText')
    expect([label.args, label.font, label.fillStyle, label.shadowBlur]).toEqual([
      ['Done', 200, 758],
      fontAt(font, 18),
      'button white',
      0,
    ])
  })

  it('looks pressed for 0.15 s: pushed down, lighter, and without its shadow', () => {
    const context = createFakeContext()

    drawButton(context.asContext(), done, true, font, 18, colors)

    expect(PRESS_MS).toBe(150)
    expect(context.callsTo('roundRect')[0].args[1]).toBe(728 + BUTTON_PRESS_DEPTH)
    const [fill] = context.callsTo('fill')
    expect([fill.fillStyle, fill.shadowBlur]).toEqual(['button light ink', 0])
    expect(context.callsTo('fillText')[0].args[2]).toBe(758 + BUTTON_PRESS_DEPTH)
  })
})
