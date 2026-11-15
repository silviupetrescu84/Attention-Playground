/**
 * The goals of Break It Down, each with small actions that lead to it, and
 * the distractions that lead nowhere.
 */

/** The shape of `data/break-it-down.json`. */
export interface BreakItDownData {
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

export function goalsFrom({ goals }: BreakItDownData): Goal[] {
  return goals.map(({ title, actions }) => ({
    title,
    actions: actions.map(({ text }) => text),
  }))
}

export function distractionsFrom({ distractions }: BreakItDownData): string[] {
  return distractions.map(({ text }) => text)
}
