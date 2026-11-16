import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../test/random'
import { LARGE_OVAL } from '../shared/artwork'
import type { BubbleSize } from '../shared/canvas-style'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import { isInBox } from '../shared/geometry'
import { gapBetweenOvals } from '../shared/placing'
import {
  centresAreaFor,
  DONE_BUTTON,
  EDGE_GAP,
  FALLBACK_SPOTS,
  MOST_THINGS,
  ovalFor,
  placeThings,
  THING_GAP,
  THINGS_AREA,
} from './layout'

/** Checks that every one of `spots` has an oval of `size` fully in the area, apart from the others. */
function expectApart(spots: readonly { x: number; y: number }[], size: BubbleSize) {
  for (const [i, spot] of spots.entries()) {
    expect(isInBox(spot, centresAreaFor(size)), `spot ${i}`).toBe(true)
    for (const other of spots.slice(i + 1)) {
      expect(gapBetweenOvals(spot, other, size)).toBeGreaterThanOrEqual(THING_GAP)
    }
  }
}

describe('the Done button', () => {
  it('is 160 × 60 px, in the middle, 12 px above the bottom', () => {
    expect(DONE_BUTTON).toEqual({ label: 'Done', x: 120, y: 728, width: 160, height: 60 })
  })

  it('is below every thing', () => {
    expect(THINGS_AREA).toEqual({ left: 0, right: 400, top: GAME_BAR_HEIGHT, bottom: 728 })
  })
})

describe('the ovals', () => {
  it('are as big as the large oval up to 5 things, then 8 px narrower for each more, down to 144 px', () => {
    const widths = [2, 3, 4, 5, 6, 7, 8].map((count) => ovalFor(count).width)

    expect(widths).toEqual([168, 168, 168, 168, 160, 152, 144])
    expect(ovalFor(5)).toEqual(LARGE_OVAL)
  })

  it('keep their shape as they get smaller', () => {
    const { width, height } = ovalFor(8)

    expect(height / width).toBeCloseTo(LARGE_OVAL.height / LARGE_OVAL.width, 9)
  })

  it('are one size object for every turn with as many things', () => {
    expect(ovalFor(7)).toBe(ovalFor(7))
  })

  it('can have their centres anywhere they are EDGE_GAP inside the area', () => {
    const { width, height } = LARGE_OVAL

    expect(centresAreaFor(LARGE_OVAL)).toEqual({
      left: width / 2 + EDGE_GAP,
      right: 400 - width / 2 - EDGE_GAP,
      top: GAME_BAR_HEIGHT + height / 2 + EDGE_GAP,
      bottom: 728 - height / 2 - EDGE_GAP,
    })
  })
})

describe('placing the things', () => {
  it('puts every number of things, 2 to 8, at random places, apart and inside the area', () => {
    for (let count = 2; count <= MOST_THINGS; count++) {
      for (let seed = 1; seed <= 5; seed++) {
        const spots = placeThings(count, ovalFor(count), seededRandom(seed))

        expect(spots).toHaveLength(count)
        expectApart(spots, ovalFor(count))
        expect(spots.every((spot) => FALLBACK_SPOTS.includes(spot))).toBe(false)
      }
    }
  })

  it('puts them in different places each time', () => {
    const random = seededRandom(9)
    const first = placeThings(3, ovalFor(3), random)
    const second = placeThings(3, ovalFor(3), random)

    expect(second).not.toEqual(first)
  })

  it('has 8 places that always fit, even with the largest ovals', () => {
    expect(FALLBACK_SPOTS).toHaveLength(MOST_THINGS)
    expectApart(FALLBACK_SPOTS, LARGE_OVAL)
  })

  it('falls back on them when no random places are found', () => {
    // Always the same corner: no second oval ever fits.
    const spots = placeThings(3, ovalFor(3), () => 0)

    expect(spots).toHaveLength(3)
    for (const spot of spots) {
      expect(FALLBACK_SPOTS).toContain(spot)
    }
  })
})
