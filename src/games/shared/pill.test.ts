import { describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { createFakeContext } from '../../test/fake-canvas-context'
import gameCss from './game.css?raw'
import { drawPill, FLAT, PILL_COLORS, RAISED, type Pill } from './pill'
import { fontAt } from './text'

const font = { family: '"Test Sans"', weight: '600' }
const colors = { fill: 'white', text: 'ink', shadow: 'soft ink' }
const pill: Pill = {
  box: { left: 10, right: 110, top: 50, bottom: 80 },
  label: 'Inner Voice',
  fontSize: 15,
}

describe('the shadow', () => {
  it('is the one under the app’s own buttons: 0 0.5rem 1.5rem (8 px down, blurred 24 px)', () => {
    const appButton = /\.game-hud \.game-hud__button \{([^}]*)\}/.exec(gameCss)![1]

    expect(appButton).toContain(`box-shadow: 0 0.5rem 1.5rem var(${PILL_COLORS.pillShadow});`)
    expect(cssVariables.get(PILL_COLORS.pillShadow)).toBe(
      'color-mix(in srgb, var(--color-ink) 25%, transparent)',
    )
    expect(RAISED).toEqual({ offsetY: 8, blur: 24 })
  })
})

describe('drawing a pill', () => {
  it('fills its box with rounded ends, raised by a shadow', () => {
    const context = createFakeContext()

    drawPill(context.asContext(), pill, font, colors)

    expect(context.callsTo('roundRect')[0].args).toEqual([10, 50, 100, 30, 15])
    const [fill] = context.callsTo('fill')
    expect([fill.fillStyle, fill.shadowColor, fill.shadowBlur, fill.shadowOffsetY]).toEqual([
      'white',
      'soft ink',
      24,
      8,
    ])
    expect(context.callsTo('stroke')).toEqual([])
  })

  it('can have a border around it, which casts no shadow', () => {
    const context = createFakeContext()

    drawPill(context.asContext(), { ...pill, border: { color: 'green', width: 3 } }, font, colors)

    const names = context.calls.map((call) => call.name)
    expect(names.slice(0, 4)).toEqual(['beginPath', 'roundRect', 'fill', 'stroke'])
    const [stroke] = context.callsTo('stroke')
    expect([stroke.strokeStyle, stroke.lineWidth, stroke.shadowBlur]).toEqual(['green', 3, 0])
  })

  it('writes its label in the middle, on one line, without a shadow', () => {
    const context = createFakeContext()

    drawPill(context.asContext(), pill, font, colors)

    const [label] = context.callsTo('fillText')
    expect(label.args).toEqual(['Inner Voice', 60, 65])
    expect([label.font, label.fillStyle, label.shadowBlur, label.shadowOffsetY]).toEqual([
      fontAt(font, 15),
      'ink',
      0,
      0,
    ])
    expect([context.textAlign, context.textBaseline]).toEqual(['center', 'middle'])
  })

  it('can be flat, without a shadow', () => {
    const context = createFakeContext()

    drawPill(context.asContext(), pill, font, colors, FLAT)

    const [fill] = context.callsTo('fill')
    expect([fill.shadowBlur, fill.shadowOffsetY]).toEqual([0, 0])
  })
})
