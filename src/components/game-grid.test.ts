// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { games, TOTAL_GAMES } from '../games/catalog'
import { gameGrid } from './game-grid'

/** The grid as a page element, to look into. */
function grid(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

describe('the game grid', () => {
  it('shows a tile for every game, linking to it, and no "Coming soon" once all are there', () => {
    const shown = grid(gameGrid())

    expect(games).toHaveLength(TOTAL_GAMES)
    expect([...shown.querySelectorAll('.game-title')].map((title) => title.textContent)).toEqual(
      games.map((game) => game.name),
    )
    expect(shown.querySelector('a.game-link')?.getAttribute('href')).toBe('/games/emotions-rise')
    expect(shown.querySelectorAll('.game-tile--coming-soon')).toHaveLength(0)
  })

  it('fills the rest of the grid with "Coming soon" tiles while games are missing', () => {
    const shown = grid(gameGrid(games.slice(0, 7)))

    expect(shown.querySelectorAll('.game-tile')).toHaveLength(TOTAL_GAMES)
    const soon = [...shown.querySelectorAll('.game-tile--coming-soon')]
    expect(soon.map((tile) => tile.textContent.trim())).toEqual([
      'Coming soon',
      'Coming soon',
      'Coming soon',
    ])
  })
})
