import { describe, expect, it, vi } from 'vitest'
import { COMBO_STEPS, createCombo, MAX_MULTIPLIER, multiplierAfter } from './combo'
import { createGameLifecycle } from './game-lifecycle'
import { createMistakes } from './mistakes'

function setup() {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const mistakes = createMistakes({ lifecycle })
  const combo = createCombo({ lifecycle, mistakes })
  lifecycle.start()
  return { lifecycle, mistakes, combo }
}

/** `count` good things in a row. */
function score(combo: ReturnType<typeof setup>['combo'], count: number) {
  for (let i = 0; i < count; i++) combo.scored()
}

describe('the multiplier', () => {
  it('goes up after 5 good things in a row, 7 more, 10 more and 15 more, to X5 at most', () => {
    expect(COMBO_STEPS).toEqual([5, 7, 10, 15])
    expect(MAX_MULTIPLIER).toBe(5)
    const at = [0, 4, 5, 11, 12, 21, 22, 36, 37, 1_000].map(multiplierAfter)
    expect(at).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  })
})

describe('the combo', () => {
  it('starts at X1, none in a row', () => {
    const { combo } = setup()

    expect([combo.multiplier, combo.inARow, combo.best]).toEqual([1, 0, 1])
  })

  it('counts good things in a row, the multiplier going up with them', () => {
    const { combo } = setup()

    score(combo, 12)

    expect([combo.multiplier, combo.inARow, combo.best]).toEqual([3, 12, 3])
  })

  it('starts again from X1 and none in a row after a mistake, keeping the best of the round', () => {
    const { combo, mistakes } = setup()
    score(combo, 12)

    mistakes.add()

    expect([combo.multiplier, combo.inARow, combo.best]).toEqual([1, 0, 3])
    score(combo, 5)
    expect([combo.multiplier, combo.best]).toEqual([2, 3])
  })

  it('starts again from nothing, best included, when a round starts or restarts', () => {
    const { combo, lifecycle } = setup()
    score(combo, 22)
    lifecycle.pause()

    lifecycle.restart()
    expect([combo.multiplier, combo.inARow, combo.best]).toEqual([1, 0, 1])

    lifecycle.start()
    score(combo, 5)
    lifecycle.pause()
    lifecycle.restart()
    lifecycle.start()
    expect(combo.best).toBe(1)
  })

  it('keeps going through a pause', () => {
    const { combo, lifecycle } = setup()
    score(combo, 6)

    lifecycle.pause()
    lifecycle.resume()

    expect(combo.inARow).toBe(6)
  })

  it('tells its listeners of every change, and only of changes', () => {
    const { combo, mistakes, lifecycle } = setup()
    const listener = vi.fn()
    combo.subscribe(listener)

    combo.scored()
    mistakes.add()
    // Already none in a row: nothing changes.
    mistakes.add()
    lifecycle.pause()
    lifecycle.restart()

    expect(listener).toHaveBeenCalledTimes(2)
  })
})
