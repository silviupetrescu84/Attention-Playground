/**
 * Loads a font for canvas drawing.
 *
 * A canvas does not wait for fonts: text drawn (or measured) before its font
 * has loaded silently uses a fallback font. Games therefore load their fonts
 * before the round starts (see `GameHandlers.load`).
 */

/** The part of `document.fonts` this needs (lets tests pass a fake). */
export interface FontLoader {
  load(font: string): Promise<readonly { readonly status: string }[]>
}

export interface LoadFontOptions {
  /** Defaults to `document.fonts`. */
  fonts?: FontLoader
  /** Give up after this long, so a slow connection cannot block the game. */
  timeoutMs?: number
}

export const FONT_TIMEOUT_MS = 5_000

/**
 * Resolves `true` once `font` (a CSS font shorthand like `600 20px "Roboto
 * Condensed"`) is ready to draw with, or `false` if it is not declared, fails
 * to load or takes longer than `timeoutMs`. Never rejects.
 */
export async function loadFont(
  font: string,
  { fonts = globalThis.document?.fonts, timeoutMs = FONT_TIMEOUT_MS }: LoadFontOptions = {},
): Promise<boolean> {
  if (!fonts) {
    return false
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })

  try {
    const faces = await Promise.race([fonts.load(font), timeout])

    // No faces means no @font-face matches: the font is not declared.
    return faces !== false && faces.length > 0 && faces.every((face) => face.status === 'loaded')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
