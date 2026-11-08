import { describe, expect, it, vi } from 'vitest'
import { gamePath, games, notBuiltYet, preloadGames, TOTAL_GAMES, type CatalogGame } from './catalog'

describe('games catalog', () => {
  it('lists Emotions Rise and Align the Actions, in that order', () => {
    expect(games.map((game) => [game.id, game.name])).toEqual([
      ['emotions-rise', 'Emotions Rise'],
      ['align-the-actions', 'Align the Actions'],
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
    expect(games.map(gamePath)).toEqual(['/games/emotions-rise', '/games/align-the-actions'])
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

  it('preloads Emotions Rise', () => {
    expect(games.find((game) => game.id === 'emotions-rise')?.preload).toBeTypeOf('function')
  })

  it('runs games that are not built yet as an empty game', () => {
    const handlers = notBuiltYet({} as never)

    expect(() => {
      handlers.reset()
      handlers.start()
      handlers.frame({ deltaMs: 16, elapsedMs: 16 })
    }).not.toThrow()
    expect(handlers.tap).toBeUndefined()
  })
})
