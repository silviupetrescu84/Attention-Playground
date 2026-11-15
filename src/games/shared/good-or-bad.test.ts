import { describe, expect, it, vi } from 'vitest'
import { createGameLifecycle } from './game-lifecycle'
import {
  createGoodOrBadTally,
  judge,
  mistakeMessageFor,
  NO_GOOD_OR_BAD_STATS,
  summaryOf,
} from './good-or-bad'
import { createScore } from './score'

const words = { one: 'situation', many: 'situations', tapped: 'tapped', letGo: 'let pass' }

describe('good and bad ones', () => {
  it('are right when a good one is tapped or a bad one goes, mistakes otherwise', () => {
    expect([
      judge('good', 'tapped'),
      judge('good', 'gone'),
      judge('bad', 'tapped'),
      judge('bad', 'gone'),
    ]).toEqual([
      { counted: 'goodTapped', mistake: undefined },
      { counted: 'goodMissed', mistake: 'goodMissed' },
      { counted: 'badTapped', mistake: 'badTapped' },
      { counted: 'badLetGo', mistake: undefined },
    ])
  })

  it('are counted from none, scoring each as the game says, or telling of the mistake', () => {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const score = createScore({ lifecycle })
    const onMistake = vi.fn()
    const tally = createGoodOrBadTally({ score, points: { goodTapped: 2 }, onMistake })
    expect(tally.stats).toEqual(NO_GOOD_OR_BAD_STATS)
    expect(Object.values(NO_GOOD_OR_BAD_STATS)).toEqual([0, 0, 0, 0])

    tally.count('Help', 'good', 'tapped')
    tally.count('Help again', 'good', 'tapped')
    // No points for a bad one let go in this game.
    tally.count('Sulk', 'bad', 'gone')
    tally.count('Scroll', 'bad', 'tapped')
    tally.count('Call back', 'good', 'gone')

    expect(tally.stats).toEqual({ goodTapped: 2, goodMissed: 1, badTapped: 1, badLetGo: 1 })
    expect(score.value).toBe(4)
    expect(onMistake.mock.calls).toEqual([
      ['badTapped', 'Scroll'],
      ['goodMissed', 'Call back'],
    ])
  })

  it('are counted afresh after a reset, and without anyone told of mistakes', () => {
    const lifecycle = createGameLifecycle({ signal: new AbortController().signal })
    const tally = createGoodOrBadTally({ score: createScore({ lifecycle }), points: {} })
    tally.count('Scroll', 'bad', 'tapped')

    tally.reset()

    expect(tally.stats).toEqual(NO_GOOD_OR_BAD_STATS)
  })

  it('say what the mistake was, and with what', () => {
    expect(mistakeMessageFor('badTapped', 'Replay an awkward moment', words)).toBe(
      'Tapped a bad situation: Replay an awkward moment',
    )
    expect(mistakeMessageFor('goodMissed', 'A friend needs a hand', words)).toBe(
      'Missed a good situation: A friend needs a hand',
    )
  })

  it('are told with the game’s own words', () => {
    const caught = { one: 'word', many: 'words', tapped: 'caught', letGo: 'let fall' }
    const stats = { goodTapped: 5, goodMissed: 1, badTapped: 2, badLetGo: 7 }

    expect(mistakeMessageFor('badTapped', 'worthless', caught)).toBe('Caught a bad word: worthless')
    expect(summaryOf(stats, caught).map((item) => item.label)).toEqual([
      'Good words caught',
      'Good words missed',
      'Bad words caught',
      'Bad words let fall',
    ])
  })

  it('are summed up at the end of the round', () => {
    const stats = { goodTapped: 5, goodMissed: 1, badTapped: 2, badLetGo: 7 }

    expect(summaryOf(stats, words)).toEqual([
      { label: 'Good situations tapped', value: 5 },
      { label: 'Good situations missed', value: 1 },
      { label: 'Bad situations tapped', value: 2 },
      { label: 'Bad situations let pass', value: 7 },
    ])
  })
})
