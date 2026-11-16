import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { games, TOTAL_GAMES } from './games/catalog'
import { findElement } from './games/shared/dom'

/**
 * The app in a real browser: what only real CSS, fonts and images show. The
 * app starts once, at the home screen, and the tests go from screen to
 * screen as a player would.
 */

/** Where the test page was, to go back there after. */
const testPage = location.href

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>'
  history.replaceState(null, '', '/')
  await import('./main')
})

afterAll(() => {
  history.replaceState(null, '', testPage)
})

const app = () => findElement(document, '#app', HTMLDivElement)
const find = (selector: string) => findElement(app(), selector, HTMLElement)
const box = (selector: string) => find(selector).getBoundingClientRect()

/** Whether `inner` is inside `outer`, give or take a pixel for rounding. */
function isInside(inner: DOMRect, outer: DOMRect) {
  return (
    inner.left >= outer.left - 1 &&
    inner.right <= outer.right + 1 &&
    inner.top >= outer.top - 1 &&
    inner.bottom <= outer.bottom + 1
  )
}

/** Opens `name` from the home screen, and waits until it has loaded. */
async function open(name: string) {
  await userEvent.click(page.getByRole('link', { name }))
  const start = findElement(app(), '.game-hud__start', HTMLButtonElement)
  await vi.waitFor(() => {
    expect(start.disabled).toBe(false)
  })
}

async function goHome() {
  await userEvent.click(page.getByRole('link', { name: 'Home' }))
}

describe('the home screen', () => {
  it('shows every game with its icon, and the ones still to come', async () => {
    await page.viewport(1024, 900)
    const icons = [...app().querySelectorAll('.game-link img')]

    expect(icons).toHaveLength(games.length)
    expect(app().querySelectorAll('.game-tile')).toHaveLength(TOTAL_GAMES)
    for (const icon of icons) {
      if (!(icon instanceof HTMLImageElement)) throw new Error('Not an image')
      await icon.decode()
      expect(icon.naturalWidth).toBe(600)
      expect(icon.getBoundingClientRect().width).toBeGreaterThan(100)
    }
  })
})

describe.each(games.map((game) => game.name))('%s', (name) => {
  it('fits the game and everything around it in a large window', async () => {
    await page.viewport(1024, 900)
    await open(name)

    const canvas = box('.game-canvas')
    // As big as it can be, up to the game size, in the middle.
    expect(canvas.width).toBeCloseTo(400 * (canvas.height / 800), 0)
    expect(canvas.height).toBeLessThanOrEqual(800)
    expect(canvas.left + canvas.width / 2).toBeCloseTo(1024 / 2, 0)
    // The buttons and texts over it are scaled with it, to cover it exactly.
    const hud = box('.game-hud')
    expect([hud.left, hud.top, hud.width, hud.height]).toEqual([
      expect.closeTo(canvas.left, 0),
      expect.closeTo(canvas.top, 0),
      expect.closeTo(canvas.width, 0),
      expect.closeTo(canvas.height, 0),
    ])
    expect(isInside(box('.game-hud__start'), canvas)).toBe(true)
    // Everything under it too, the instructions last (when the game has any).
    const instructions = find('.game-hud__instructions')
    if (!instructions.hidden) {
      expect(isInside(instructions.getBoundingClientRect(), canvas)).toBe(true)
    }
    // The Home button above the canvas, in the space kept for it.
    const home = box('.home-link')
    expect(home.bottom).toBeLessThanOrEqual(canvas.top)
    expect(home.top).toBeGreaterThanOrEqual(0)

    await goHome()
  })

  it('shrinks the game to fit a phone, still with room for the Home button', async () => {
    await page.viewport(360, 640)
    await open(name)

    const canvas = box('.game-canvas')
    expect(canvas.width).toBeLessThanOrEqual(360)
    // 56 px kept above for the Home button and 56 below for the status bar.
    expect(canvas.height).toBeCloseTo(640 - 56 - 56, 0)
    expect(box('.home-link').bottom).toBeLessThanOrEqual(canvas.top)
    expect(isInside(box('.game-hud__start'), canvas)).toBe(true)
    // The Start button is scaled down with the game.
    expect(box('.game-hud__start').height).toBeLessThan(58)

    await goHome()
  })
})

// The same shared bar in every game: checked once.
describe('the score bar', () => {
  it('fits the combo, the score, the mistakes and the time side by side, however large', async () => {
    await page.viewport(1024, 900)
    await open(games[0].name)
    await userEvent.click(page.getByRole('button', { name: 'Start' }))
    // The widest each can be: the top combo, a score of 5 digits, the most mistakes, 999 s.
    find('.game-hud__combo').textContent = 'X5'
    find('.game-hud__score').textContent = 'Score: 99999'
    find('.game-hud__mistakes').textContent = 'Mistakes: 10'
    find('.game-hud__time').textContent = '999'
    await document.fonts.ready

    const bar = box('.game-hud__bar')
    const parts = ['.game-hud__left', '.game-hud__mistakes', '.game-hud__right'].map(box)
    for (const part of parts) {
      expect(isInside(part, bar)).toBe(true)
    }
    expect(parts[0].right).toBeLessThanOrEqual(parts[1].left)
    expect(parts[1].right).toBeLessThanOrEqual(parts[2].left)
    expect(isInside(box('.game-hud__combo'), parts[0])).toBe(true)
    // Each on one line: no taller than a line of the bar's text.
    const lineHeight = box('.game-hud__time').height
    for (const text of ['.game-hud__score', '.game-hud__mistakes']) {
      expect(box(text).height, text).toBeLessThanOrEqual(lineHeight + 1)
    }

    await userEvent.click(page.getByRole('button', { name: 'Pause' }))
    await userEvent.click(page.getByRole('button', { name: 'Restart' }))
    await goHome()
  })
})

/** The red, green and blue (0 to 1) of a computed CSS colour: `rgb(…)` or `color(srgb …)`. */
function channels(color: string): number[] {
  const numbers = color
    .match(/[\d.]+/g)!
    .map(Number)
    .slice(0, 3)
  return color.startsWith('rgb') ? numbers.map((n) => n / 255) : numbers
}

/** How much brighter the lighter of two colours is than the darker (WCAG contrast ratio, 1 to 21). */
function contrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const [r, g, bl] = channels(color).map((c) =>
      c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    )
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (light + 0.05) / (dark + 0.05)
}

describe('the combo', () => {
  it('shows each multiplier in its own colour, its text easy to read on each', async () => {
    await page.viewport(1024, 900)
    await open(games[0].name)
    const combo = find('.game-hud__combo')

    const colours = [1, 2, 3, 4, 5].map((multiplier) => {
      combo.dataset.multiplier = String(multiplier)
      const { backgroundColor, color } = getComputedStyle(combo)
      return { backgroundColor, color }
    })

    expect(new Set(colours.map(({ backgroundColor }) => backgroundColor)).size).toBe(5)
    for (const { backgroundColor, color } of colours) {
      // WCAG AA for text: at least 4.5 to 1.
      expect(contrast(backgroundColor, color), backgroundColor).toBeGreaterThanOrEqual(4.5)
    }

    await goHome()
  })
})

// The same shared screen in every game: checked once.
describe('the high scores screen', () => {
  it('shows the high scores over the whole game, and goes back to Start', async () => {
    await page.viewport(1024, 900)
    await open(games[0].name)

    await userEvent.click(page.getByRole('button', { name: 'High scores' }))
    const canvas = box('.game-canvas')
    const scores = box('.game-hud__overlay--high-scores')
    expect([scores.width, scores.height]).toEqual([
      expect.closeTo(canvas.width, 0),
      expect.closeTo(canvas.height, 0),
    ])
    expect(find('.game-hud__no-high-scores').textContent).toBe('No high scores yet')

    await userEvent.click(page.getByRole('button', { name: 'Back' }))
    expect(find('.game-hud__start').closest('[hidden]')).toBeNull()

    await goHome()
  })
})
