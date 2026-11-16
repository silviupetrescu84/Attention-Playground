import { describe, expect, it, vi } from 'vitest'
import { createCombo } from './combo'
import { createGameLifecycle } from './game-lifecycle'
import { createMistakes } from './mistakes'
import { createScore } from './score'

function setup() {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const score = createScore({ lifecycle })
  const listener = vi.fn()
  score.subscribe(listener)
  return { lifecycle, score, listener }
}

describe('score', () => {
  it('starts at 0', () => {
    expect(setup().score.value).toBe(0)
  })

  it('adds any number of points', () => {
    const { score } = setup()

    score.add(1)
    score.add(5)
    score.add(0.5)

    expect(score.value).toBe(6.5)
  })

  it('notifies subscribers with the new value on every change', () => {
    const { score, listener } = setup()

    score.add(2)
    score.add(1)

    expect(listener.mock.calls).toEqual([
      [2, { reason: 'add' }],
      [3, { reason: 'add' }],
    ])
  })

  it('does not notify when nothing changes', () => {
    const { score, listener } = setup()

    score.add(0)

    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const { score } = setup()
    const listener = vi.fn()
    const unsubscribe = score.subscribe(listener)

    unsubscribe()
    score.add(1)

    expect(listener).not.toHaveBeenCalled()
  })

  it('still notifies the other subscribers when one fails', () => {
    const { score, listener } = setup()
    const failure = new Error('display failed')
    score.subscribe(() => {
      throw failure
    })
    const last = vi.fn()
    score.subscribe(last)

    expect(() => score.add(1)).toThrow(failure)
    expect(score.value).toBe(1)
    expect(listener).toHaveBeenCalledOnce()
    expect(last).toHaveBeenCalledOnce()
  })

  it('resets to 0 when a round starts', () => {
    const { lifecycle, score, listener } = setup()
    score.add(7)
    listener.mockClear()

    lifecycle.start()

    expect(score.value).toBe(0)
    expect(listener).toHaveBeenCalledExactlyOnceWith(0, { reason: 'reset' })
  })

  it('resets to 0 on restart, and again on the next start', () => {
    const { lifecycle, score } = setup()
    lifecycle.start()
    score.add(3)
    lifecycle.pause()

    lifecycle.restart()
    expect(score.value).toBe(0)

    lifecycle.start()
    score.add(1)
    expect(score.value).toBe(1)
  })

  it.each([
    ['pause', ['start', 'pause']],
    ['resume', ['start', 'pause', 'resume']],
    ['finish', ['start', 'finish']],
  ] as const)('keeps the score on %s', (_name, actions) => {
    const { lifecycle, score } = setup()
    lifecycle.start()
    score.add(4)

    for (const action of actions.slice(1)) {
      lifecycle[action]()
    }

    expect(score.value).toBe(4)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s points', (points) => {
    const { score } = setup()

    expect(() => score.add(points)).toThrow(RangeError)
    expect(score.value).toBe(0)
  })
})

describe('score with a combo', () => {
  function withCombo() {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const mistakes = createMistakes({ lifecycle })
    const combo = createCombo({ lifecycle, mistakes })
    const score = createScore({ lifecycle, combo })
    lifecycle.start()
    return { score, combo, mistakes }
  }

  it('multiplies points by the combo, from the good thing after the one that raised it', () => {
    const { score, combo } = withCombo()

    for (let i = 0; i < 5; i++) score.add(1)
    expect([score.value, combo.multiplier]).toEqual([5, 2])
    // The next 7 at X2, then X3.
    for (let i = 0; i < 7; i++) score.add(1)
    expect([score.value, combo.multiplier]).toEqual([5 + 14, 3])
    score.add(1)

    expect(score.value).toBe(5 + 14 + 3)
  })

  it('counts each addition of points as one good thing in a row', () => {
    const { score, combo } = withCombo()

    score.add(1)
    score.add(3)

    expect(combo.inARow).toBe(2)
  })

  it('does not count adding no points as a good thing', () => {
    const { score, combo } = withCombo()
    score.add(1)

    score.add(0)

    expect([score.value, combo.inARow]).toEqual([1, 1])
  })

  it('adds points at X1 again after a mistake', () => {
    const { score, mistakes } = withCombo()
    for (let i = 0; i < 6; i++) score.add(1)

    mistakes.add()
    score.add(1)

    expect(score.value).toBe(5 + 2 + 1)
  })
})
