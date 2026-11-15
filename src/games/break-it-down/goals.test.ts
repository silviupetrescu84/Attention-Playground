import { describe, expect, it } from 'vitest'
import data from './data/break-it-down.json'
import { distractionsFrom, goalsFrom } from './goals'

describe('the data', () => {
  it('has 30 goals, each with 10 actions of its own', () => {
    const goals = goalsFrom(data)

    expect(goals).toHaveLength(30)
    expect(goals[0]).toEqual({
      title: 'Be healthier',
      actions: expect.arrayContaining(['Drink a glass of water', 'Put on walking shoes']),
    })
    for (const goal of goals) {
      expect(new Set(goal.actions).size, goal.title).toBe(10)
    }
  })

  it('has 150 distractions, none of them an action', () => {
    const distractions = distractionsFrom(data)
    const actions = new Set(goalsFrom(data).flatMap((goal) => goal.actions))

    expect(new Set(distractions).size).toBe(150)
    expect(distractions[0]).toBe('Scroll Instagram')
    expect(distractions.filter((text) => actions.has(text))).toEqual([])
  })

  it('reads only the titles and texts', () => {
    const small = {
      goals: [{ id: 'g', title: 'Goal', actions: [{ id: 'a', text: 'Act' }] }],
      distractions: [{ id: 'd', text: 'Scroll' }],
    }

    expect(goalsFrom(small)).toEqual([{ title: 'Goal', actions: ['Act'] }])
    expect(distractionsFrom(small)).toEqual(['Scroll'])
  })
})
