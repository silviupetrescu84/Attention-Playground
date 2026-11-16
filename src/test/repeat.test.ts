import { describe, expect, it, vi } from 'vitest'
import { repeatUntil } from './repeat'

describe('repeatUntil', () => {
  it('steps until done, and no more', () => {
    let count = 0
    const step = vi.fn(() => count++)

    repeatUntil(() => count === 3, step)

    expect(step).toHaveBeenCalledTimes(3)
  })

  it('does not step when done already', () => {
    const step = vi.fn()

    repeatUntil(() => true, step)

    expect(step).not.toHaveBeenCalled()
  })

  it('fails, rather than going on forever, when never done', () => {
    const step = vi.fn()

    expect(() => repeatUntil(() => false, step, 5)).toThrow('Still not done after 5 steps')
    expect(step).toHaveBeenCalledTimes(5)
  })
})
