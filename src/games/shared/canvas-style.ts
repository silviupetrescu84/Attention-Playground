/**
 * How games draw on the canvas (colours, font), shared by every minigame.
 *
 * Every style in the app is set in CSS. A canvas cannot use CSS, so each game
 * lists the CSS variables it draws with (under names its drawing code uses)
 * and reads their values from the page with `readCssVariables`. The
 * variables are in game.css (shared) and each game's own CSS.
 */

export type CssVariable = `--${string}`

/** The CSS variable for each style (a colour, a font…) a game draws with. */
export type CssVariables<Name extends string = string> = Readonly<Record<Name, CssVariable>>

/** The value of each of those styles, ready to draw with. */
export type CssValues<Name extends string> = Readonly<Record<Name, string>>

/** The colours of a card with text on it (see game.css). */
export const CARD_COLORS = {
  text: '--color-ink',
  cardFill: '--canvas-card-fill',
  cardBorder: '--canvas-card-border',
} as const satisfies CssVariables

/**
 * The value of each of `variables` for `element` (the game's canvas). Throws
 * if one is not set, so a style missing from the CSS is never drawn with
 * nothing.
 */
export function readCssVariables<Name extends string>(
  element: Element,
  variables: CssVariables<Name>,
): CssValues<Name> {
  const style = getComputedStyle(element)
  const values = Object.entries<CssVariable>(variables).map(([name, variable]) => {
    const value = style.getPropertyValue(variable).trim()

    if (!value) {
      throw new Error(`The CSS variable ${variable} is not set`)
    }

    return [name, value]
  })

  // Object.entries loses the names' type; these are exactly the names given.
  return Object.fromEntries(values) as CssValues<Name>
}
