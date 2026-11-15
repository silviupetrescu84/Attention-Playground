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

  it('shows the high scores over the whole game, and goes back to Start', async () => {
    await page.viewport(1024, 900)
    await open(name)

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
