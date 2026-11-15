import { describe, expect, it, vi } from 'vitest'
import { remember } from './remember'

describe('remember', () => {
  it('computes once per key, and gives the same value every time', () => {
    const compute = vi.fn((key: { name: string }) => ({ upper: key.name.toUpperCase() }))
    const lookUp = remember(compute)
    const a = { name: 'a' }
    const b = { name: 'b' }

    const first = lookUp(a)

    expect(lookUp(a)).toBe(first)
    expect(first).toEqual({ upper: 'A' })
    expect(lookUp(b)).toEqual({ upper: 'B' })
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('tells keys apart by identity, not by what is in them', () => {
    const lookUp = remember((key: { name: string }) => [key.name])

    expect(lookUp({ name: 'a' })).not.toBe(lookUp({ name: 'a' }))
  })

  it('remembers any value, even undefined', () => {
    const compute = vi.fn((): undefined => undefined)
    const lookUp = remember(compute)
    const key = {}

    lookUp(key)
    lookUp(key)

    expect(compute).toHaveBeenCalledOnce()
  })
})
