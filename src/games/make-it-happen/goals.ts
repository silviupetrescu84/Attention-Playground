/**
 * The goals of Make It Happen, each with small actions that lead to it, and
 * the distractions that lead nowhere.
 */

/** The shape of `data/make-it-happen.json`. */
export interface MakeItHappenData {
  readonly goals: readonly {
    readonly title: string
    readonly actions: readonly { readonly text: string }[]
  }[]
  readonly distractions: readonly { readonly text: string }[]
}

export interface Goal {
  readonly title: string
  /** Small actions that lead to the goal. */
  readonly actions: readonly string[]
}

export function goalsFrom({ goals }: MakeItHappenData): Goal[] {
  return goals.map(({ title, actions }) => ({
    title,
    actions: actions.map(({ text }) => text),
  }))
}

export function distractionsFrom({ distractions }: MakeItHappenData): string[] {
  return distractions.map(({ text }) => text)
}
