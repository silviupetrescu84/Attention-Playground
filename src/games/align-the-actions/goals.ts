import { randomItem, shuffled, type Random } from '../shared/random'

/**
 * The goals of Align the Actions and the rows of actions the player chooses
 * from.
 *
 * Every row is for one goal, picked at random: one action aligned with it,
 * two that work against it, and one action aligned with a different goal
 * (also picked at random), which does not count as aligned. They are shuffled
 * into the lanes, so the aligned action can be in any of them.
 */

export interface Goal {
  readonly title: string
  /** Actions that serve the goal. */
  readonly aligned: readonly string[]
  /** Actions that work against it. */
  readonly against: readonly string[]
}

/** The shape of `data/align_the_actions_goals.json`. */
export interface GoalsData {
  readonly categories: readonly {
    readonly goals: readonly {
      readonly title: string
      readonly aligned_actions: readonly string[]
      readonly negative_actions: readonly string[]
    }[]
  }[]
}

/** Every goal in the data, in order, whatever its category. */
export function goalsFrom(data: GoalsData): Goal[] {
  return data.categories.flatMap((category) =>
    category.goals.map((goal) => ({
      title: goal.title,
      aligned: goal.aligned_actions,
      against: goal.negative_actions,
    })),
  )
}

/**
 * - `aligned`: serves the row's goal (+1).
 * - `against`: works against the row's goal (a mistake).
 * - `otherGoal`: serves a different goal, not this one (a mistake).
 */
export type ActionKind = 'aligned' | 'against' | 'otherGoal'

export interface Action {
  readonly text: string
  readonly kind: ActionKind
  /** The goal the action belongs to (a different one for `otherGoal`). */
  readonly goal: Goal
}

/** A goal and the actions to choose from for it, one per lane, left to right. */
export interface ActionSet {
  readonly goal: Goal
  readonly actions: readonly Action[]
}

export const AGAINST_PER_SET = 2

export interface ActionSetGeneratorOptions {
  goals: readonly Goal[]
  random?: Random
}

export interface ActionSetGenerator {
  next(): ActionSet
}

export function createActionSetGenerator({
  goals,
  random = Math.random,
}: ActionSetGeneratorOptions): ActionSetGenerator {
  if (goals.length < 2) {
    throw new RangeError(`Need at least 2 goals, got ${goals.length}`)
  }

  for (const { title, aligned, against } of goals) {
    if (aligned.length < 1 || against.length < AGAINST_PER_SET) {
      throw new RangeError(
        `"${title}" needs at least 1 aligned action and ${AGAINST_PER_SET} against it`,
      )
    }
  }

  return {
    next() {
      const goal = randomItem(random, goals)
      const otherGoal = randomItem(
        random,
        goals.filter((candidate) => candidate !== goal),
      )
      const actions: Action[] = [
        { text: randomItem(random, goal.aligned), kind: 'aligned', goal },
        ...shuffled(random, goal.against)
          .slice(0, AGAINST_PER_SET)
          .map((text): Action => ({ text, kind: 'against', goal })),
        { text: randomItem(random, otherGoal.aligned), kind: 'otherGoal', goal: otherGoal },
      ]

      return { goal, actions: shuffled(random, actions) }
    },
  }
}
