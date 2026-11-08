import type { CanvasFont } from '../games/shared/text'

/**
 * The app's CSS variables, read from its CSS files, for tests: jsdom does not
 * load CSS, so tests that draw put the real values on the page themselves.
 */

const cssFiles = import.meta.glob<string>('../**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Every CSS variable declared in the app's CSS files, with its value as written. */
export const cssVariables: ReadonlyMap<string, string> = new Map(
  Object.values(cssFiles).flatMap((css) =>
    [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  ),
)

/** The canvas font as the CSS sets it. */
export const cssCanvasFont: CanvasFont = {
  family: cssVariables.get('--canvas-font-family')!,
  weight: cssVariables.get('--canvas-font-weight')!,
}

/** Puts every CSS variable of the app on the page, as its CSS files would. */
export function useCssVariables(): void {
  for (const [name, value] of cssVariables) {
    document.documentElement.style.setProperty(name, value)
  }
}
