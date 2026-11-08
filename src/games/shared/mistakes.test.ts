import { describe, expect, it } from 'vitest'
import { createGameLifecycle } from './game-lifecycle'
import {
  createMistakes,
  DIFFICULTY_LEVELS,
  DIFFICULTY_NAMES,
  MISTAKES_TO_FAIL,
  type DifficultyLevel,
} from './mistakes'

function setup() {
  const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
  const mistakes = createMistakes({ lifecycle })
  return { lifecycle, mistakes }
}

/** A new game at `level`, started. */
function playingAt(level: DifficultyLevel) {
  const played = setup()
  while (played.mistakes.level !== level) played.mistakes.nextLevel()
  played.lifecycle.start()
  return played
}

describe('difficulties', () => {
  it('are easy, medium, hard and extreme, failing on mistake 10, 6, 3 and 1', () => {
    expect(DIFFICULTY_LEVELS).toEqual(['easy', 'medium', 'hard', 'extreme'])
    expect(MISTAKES_TO_FAIL).toEqual({ easy: 10, medium: 6, hard: 3, extreme: 1 })
    expect(DIFFICULTY_NAMES).toEqual({
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      extreme: 'Extreme',
    })
  })

  it('starts at easy', () => {
    expect(setup().mistakes.level).toBe('easy')
  })

  it('goes easy → medium → hard → extreme, then back to easy', () => {
    const { mistakes } = setup()
    const seen: DifficultyLevel[] = []

    for (let i = 0; i < 5; i++) {
      mistakes.nextLevel()
      seen.push(mistakes.level)
    }

    expect(seen).toEqual(['medium', 'hard', 'extreme', 'easy', 'medium'])
  })

  it.each([
    ['playing', ['start']],
    ['paused', ['start', 'pause']],
    ['finished', ['start', 'finish']],
  ] as const)('cannot change while %s, so a round is at one difficulty', (state, actions) => {
    const { lifecycle, mistakes } = setup()
    for (const action of actions) lifecycle[action]()

    expect(() => mistakes.nextLevel()).toThrow(
      new Error(`Cannot change the difficulty of a game that is ${state}`),
    )
    expect(mistakes.level).toBe('easy')
  })

  it('stays as chosen for the next round', () => {
    const { lifecycle, mistakes } = setup()
    mistakes.nextLevel()
    lifecycle.start()
    lifecycle.finish()

    lifecycle.restart()

    expect(mistakes.level).toBe('medium')
  })
})

describe('counting mistakes', () => {
  it('starts at none', () => {
    expect(setup().mistakes.count).toBe(0)
  })

  it.each([
    ['easy', 10],
    ['medium', 6],
    ['hard', 3],
    ['extreme', 1],
  ] as const)('on %s, ends the round the moment mistake %i happens', (level, fatal) => {
    const { lifecycle, mistakes } = playingAt(level)

    for (let i = 1; i < fatal; i++) mistakes.add()
    expect(mistakes.count).toBe(fatal - 1)
    expect(lifecycle.state).toBe('playing')

    mistakes.add()
    expect(mistakes.count).toBe(fatal)
    expect(lifecycle.state).toBe('finished')
  })

  it('does not count mistakes after the one that ended the round', () => {
    const { mistakes } = playingAt('extreme')

    mistakes.add()
    mistakes.add()
    mistakes.add()

    expect(mistakes.count).toBe(1)
  })

  it.each([
    ['before the round starts', []],
    ['while paused', ['start', 'pause']],
  ] as const)('does not count mistakes %s', (_when, actions) => {
    const { lifecycle, mistakes } = setup()
    for (const action of actions) lifecycle[action]()

    mistakes.add()

    expect(mistakes.count).toBe(0)
  })

  it.each([
    ['a round starts', ['finish', 'restart', 'start']],
    ['the game restarts', ['pause', 'restart']],
  ] as const)('starts again from none when %s', (_when, actions) => {
    const { lifecycle, mistakes } = playingAt('easy')
    for (let i = 0; i < 4; i++) mistakes.add()

    for (const action of actions) lifecycle[action]()

    expect(mistakes.count).toBe(0)
  })

  it('keeps the count while paused and on resume', () => {
    const { lifecycle, mistakes } = playingAt('easy')
    mistakes.add()
    mistakes.add()

    lifecycle.pause()
    lifecycle.resume()

    expect(mistakes.count).toBe(2)
  })

  it('tells listeners the new count on every change, back to 0 included', () => {
    const { lifecycle, mistakes } = playingAt('hard')
    const heard: number[] = []
    mistakes.subscribe((count) => heard.push(count))

    mistakes.add()
    mistakes.add()
    lifecycle.pause()
    lifecycle.restart()
    // Nothing changes: no news.
    lifecycle.start()

    expect(heard).toEqual([1, 2, 0])
  })

  it('stops telling a listener once it unsubscribes', () => {
    const { mistakes } = playingAt('easy')
    const heard: number[] = []
    const unsubscribe = mistakes.subscribe((count) => heard.push(count))

    mistakes.add()
    unsubscribe()
    mistakes.add()

    expect(heard).toEqual([1])
  })
})
