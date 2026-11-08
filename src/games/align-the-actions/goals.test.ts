import { describe, expect, it } from 'vitest'
import { constantRandom, seededRandom } from '../../test/random'
import data from './data/align_the_actions_goals.json'
import {
  AGAINST_PER_SET,
  createActionSetGenerator,
  goalsFrom,
  type Goal,
} from './goals'

const goals = goalsFrom(data)

function goal(title: string, aligned = ['A1', 'A2'], against = ['X1', 'X2', 'X3']): Goal {
  return { title, aligned, against }
}

describe('goalsFrom', () => {
  it('lists the goals of every category, in order', () => {
    const small = {
      categories: [
        {
          goals: [
            { title: 'One', aligned_actions: ['a'], negative_actions: ['b', 'c'] },
            { title: 'Two', aligned_actions: ['d'], negative_actions: ['e', 'f'] },
          ],
        },
        { goals: [{ title: 'Three', aligned_actions: ['g'], negative_actions: ['h', 'i'] }] },
      ],
    }

    expect(goalsFrom(small)).toEqual([
      { title: 'One', aligned: ['a'], against: ['b', 'c'] },
      { title: 'Two', aligned: ['d'], against: ['e', 'f'] },
      { title: 'Three', aligned: ['g'], against: ['h', 'i'] },
    ])
  })
})

describe('the goals data', () => {
  const allActions = goals.flatMap((g) => [...g.aligned, ...g.against])

  it('has 25 goals with different titles', () => {
    expect(goals).toHaveLength(25)
    expect(new Set(goals.map((g) => g.title)).size).toBe(25)
  })

  it('has 10 aligned actions and 20 against them for every goal', () => {
    for (const { title, aligned, against } of goals) {
      expect([aligned.length, against.length], title).toEqual([10, 20])
    }
  })

  it('keeps every action to 25 characters', () => {
    const tooLong = allActions.filter((action) => action.length > 25)

    expect(tooLong).toEqual([])
  })

  it('never lists an action twice, so one from another goal is never aligned by mistake', () => {
    expect(new Set(allActions).size).toBe(allActions.length)
  })
})

describe('action sets', () => {
  it('has one aligned action, two against it and one for another goal', () => {
    const generator = createActionSetGenerator({ goals, random: seededRandom(1) })

    for (let i = 0; i < 200; i++) {
      const { goal: setGoal, actions } = generator.next()
      const kinds = actions.map((action) => action.kind).sort()

      expect(kinds).toEqual(['against', 'against', 'aligned', 'otherGoal'])
      for (const action of actions) {
        if (action.kind === 'aligned') expect(setGoal.aligned).toContain(action.text)
        if (action.kind === 'against') expect(setGoal.against).toContain(action.text)
        if (action.kind === 'otherGoal') {
          expect(action.goal).not.toBe(setGoal)
          expect(action.goal.aligned).toContain(action.text)
        } else {
          expect(action.goal).toBe(setGoal)
        }
      }
    }
  })

  it('never picks the same action twice in a set', () => {
    const generator = createActionSetGenerator({ goals, random: seededRandom(2) })

    for (let i = 0; i < 500; i++) {
      const texts = generator.next().actions.map((action) => action.text)
      expect(new Set(texts).size).toBe(texts.length)
    }
  })

  it('needs only two against actions per goal, and always picks two different ones', () => {
    const tight = [goal('One', ['a'], ['b', 'c']), goal('Two', ['d'], ['e', 'f'])]
    const generator = createActionSetGenerator({ goals: tight, random: seededRandom(3) })

    for (let i = 0; i < 50; i++) {
      const { goal: setGoal, actions } = generator.next()
      const against = actions.filter((action) => action.kind === 'against').map((a) => a.text)
      expect(against.sort()).toEqual([...setGoal.against].sort())
    }
  })

  it('uses every goal, and every lane for the aligned action', () => {
    const generator = createActionSetGenerator({ goals, random: seededRandom(4) })
    const titles = new Set<string>()
    const alignedLanes = [0, 0, 0, 0]

    for (let i = 0; i < 4_000; i++) {
      const set = generator.next()
      titles.add(set.goal.title)
      alignedLanes[set.actions.findIndex((action) => action.kind === 'aligned')]++
    }

    expect(titles.size).toBe(25)
    // About 1 000 each.
    for (const count of alignedLanes) {
      expect(count).toBeGreaterThan(850)
      expect(count).toBeLessThan(1_150)
    }
  })

  it('picks the other goal from the rest, even with only two goals', () => {
    const two = [goal('One'), goal('Two')]
    // Random 0 always picks the first goal; the other goal must be the second.
    const set = createActionSetGenerator({ goals: two, random: constantRandom(0) }).next()

    expect(set.goal).toBe(two[0])
    expect(set.actions.find((action) => action.kind === 'otherGoal')?.goal).toBe(two[1])
  })

  it('puts two against actions in each set', () => {
    expect(AGAINST_PER_SET).toBe(2)
  })
})

describe('checks', () => {
  it('needs at least two goals', () => {
    expect(() => createActionSetGenerator({ goals: [goal('Alone')] })).toThrow(
      new RangeError('Need at least 2 goals, got 1'),
    )
  })

  it.each([
    ['no aligned action', goal('Broken', [], ['x', 'y'])],
    ['only one against it', goal('Broken', ['a'], ['x'])],
  ])('names a goal with %s', (_case, broken) => {
    expect(() => createActionSetGenerator({ goals: [goal('Fine'), broken] })).toThrow(
      new RangeError('"Broken" needs at least 1 aligned action and 2 against it'),
    )
  })
})
