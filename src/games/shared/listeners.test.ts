import { describe, expect, it, vi } from 'vitest'
import { createListeners } from './listeners'

describe('listeners', () => {
  it('notifies every listener with all arguments, in the order they were added', () => {
    const listeners = createListeners<[number, string]>()
    const calls: string[] = []
    listeners.add((n, s) => calls.push(`first ${n} ${s}`))
    listeners.add((n, s) => calls.push(`second ${n} ${s}`))

    listeners.notify(1, 'a')

    expect(calls).toEqual(['first 1 a', 'second 1 a'])
  })

  it('stops notifying a removed listener; removing twice is fine', () => {
    const listeners = createListeners<[]>()
    const listener = vi.fn()
    const remove = listeners.add(listener)

    remove()
    remove()
    listeners.notify()

    expect(listener).not.toHaveBeenCalled()
  })

  it('skips a listener removed during a notification', () => {
    const listeners = createListeners<[]>()
    const second = vi.fn()
    let removeSecond = () => {}
    listeners.add(() => removeSecond())
    removeSecond = listeners.add(second)

    listeners.notify()

    expect(second).not.toHaveBeenCalled()
  })

  it('lets a listener added during a notification hear only later ones', () => {
    const listeners = createListeners<[number]>()
    const late = vi.fn()
    listeners.add((n) => {
      if (n === 1) listeners.add(late)
    })

    listeners.notify(1)
    listeners.notify(2)

    expect(late.mock.calls).toEqual([[2]])
  })

  it('delivers notifications made from a listener in order, to everyone', () => {
    const listeners = createListeners<[number]>()
    const first: number[] = []
    const second: number[] = []
    listeners.add((n) => {
      first.push(n)
      if (n === 1) listeners.notify(2)
    })
    listeners.add((n) => second.push(n))

    listeners.notify(1)

    expect(first).toEqual([1, 2])
    expect(second).toEqual([1, 2])
  })

  it('notifies everyone even if a listener fails, then throws its error', () => {
    const listeners = createListeners<[]>()
    const failure = new Error('failed')
    const after = vi.fn()
    listeners.add(() => {
      throw failure
    })
    listeners.add(after)

    expect(() => listeners.notify()).toThrow(failure)
    expect(after).toHaveBeenCalledOnce()
  })

  it('reports several failing listeners together', () => {
    const listeners = createListeners<[]>()
    const errors = [new Error('a'), new Error('b')]
    for (const error of errors) {
      listeners.add(() => {
        throw error
      })
    }

    let caught: unknown
    try {
      listeners.notify()
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual(errors)
  })

  it('keeps working after a failure', () => {
    const listeners = createListeners<[]>()
    const listener = vi.fn()
    const remove = listeners.add(() => {
      throw new Error('once')
    })
    listeners.add(listener)
    expect(() => listeners.notify()).toThrow()

    remove()
    listeners.notify()

    expect(listener).toHaveBeenCalledTimes(2)
  })
})
