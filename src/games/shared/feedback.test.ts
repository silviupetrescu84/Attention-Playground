import { describe, expect, it } from 'vitest'
import { cssVariables } from '../../test/css-variables'
import { fadedOutAt, FEEDBACK_COLORS, FEEDBACK_FADE_MS, stillFading } from './feedback'

describe('feedback', () => {
  it('tints green for right and red for a mistake, at 20%', () => {
    expect(FEEDBACK_COLORS).toEqual({
      rightHue: '--canvas-right-hue',
      wrongHue: '--canvas-wrong-hue',
    })
    expect(cssVariables.get('--canvas-right-hue')).toBe(
      'color-mix(in srgb, var(--color-good) 20%, transparent)',
    )
    expect(cssVariables.get('--canvas-wrong-hue')).toBe(
      'color-mix(in srgb, var(--color-bad) 20%, transparent)',
    )
  })

  it('fades the thing chosen out over 0.1 s', () => {
    expect(FEEDBACK_FADE_MS).toBe(100)
    expect([1_000, 1_025, 1_050, 1_100, 2_000].map((t) => fadedOutAt(1_000, t))).toEqual([
      1, 0.75, 0.5, 0, 0,
    ])
  })

  it('keeps only what has not finished fading', () => {
    const chosen = [
      { item: 'a', right: true, atMs: 1_000 },
      { item: 'b', right: false, atMs: 1_050 },
    ]

    expect(stillFading(chosen, 1_099)).toEqual(chosen)
    expect(stillFading(chosen, 1_100)).toEqual([chosen[1]])
    expect(stillFading(chosen, 1_150)).toEqual([])
  })
})
