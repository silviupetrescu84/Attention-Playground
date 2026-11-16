import { describe, expect, it } from 'vitest'
import { nextChoice, recordOf } from './records'

describe('recordOf', () => {
  it('gives each key the value for it', () => {
    expect(recordOf(['a', 'bb'] as const, (key) => key.length)).toEqual({ a: 1, bb: 2 })
  })
})

describe('nextChoice', () => {
  it('goes to the next choice, and back to the first after the last', () => {
    const choices = ['slow', 'normal', 'fast']

    expect(['slow', 'normal', 'fast'].map((choice) => nextChoice(choices, choice))).toEqual([
      'normal',
      'fast',
      'slow',
    ])
  })
})
