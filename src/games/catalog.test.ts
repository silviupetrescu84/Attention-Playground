import { describe, expect, it, vi } from 'vitest'
import { gamePath, games, preloadGames, TOTAL_GAMES, type CatalogGame } from './catalog'

describe('games catalog', () => {
  it('lists the four games in their order on the home screen', () => {
    expect(games.map((game) => [game.id, game.name])).toEqual([
      ['emotions-rise', 'Emotions Rise'],
      ['align-the-actions', 'Align the Actions'],
      ['shift-perspective', 'Shift Perspective'],
      ['focus-attention', 'Focus Attention'],
    ])
  })

  it('gives every game a unique id that works in a URL', () => {
    const ids = games.map((game) => game.id)

    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('builds each game path from its id', () => {
    expect(games.map(gamePath)).toEqual([
      '/games/emotions-rise',
      '/games/align-the-actions',
      '/games/shift-perspective',
      '/games/focus-attention',
    ])
  })

  it('gives every game an icon and a way to create it', () => {
    for (const game of games) {
      expect(game.icon).toBeTruthy()
      expect(typeof game.create()).toBe('function')
    }
  })

  it('has room for every game it lists', () => {
    expect(TOTAL_GAMES).toBe(10)
    expect(games.length).toBeLessThanOrEqual(TOTAL_GAMES)
  })

  it("starts every game's preload without waiting for it", () => {
    const slow = vi.fn(() => new Promise(() => {}))
    const list: CatalogGame[] = [
      { ...games[0], preload: slow },
      { ...games[1], preload: undefined },
      { ...games[0], id: 'other', preload: slow },
    ]

    expect(preloadGames(list)).toBeUndefined()
    expect(slow).toHaveBeenCalledTimes(2)
  })

  it('only warns when a preload fails (the game loads again when opened)', async () => {
    const failure = new Error('offline')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() =>
      preloadGames([{ ...games[0], preload: () => Promise.reject(failure) }]),
    ).not.toThrow()

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Could not preload Emotions Rise; it will load when opened', failure),
    )
    warn.mockRestore()
  })

  it('preloads every game', () => {
    for (const game of games) {
      expect(game.preload, game.name).toBeTypeOf('function')
    }
  })
})
