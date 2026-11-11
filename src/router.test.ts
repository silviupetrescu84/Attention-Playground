import { describe, expect, it } from 'vitest'
import { games } from './games/catalog'
import { resolveRoute } from './router'

describe('resolveRoute', () => {
  it('resolves the root path to the home page', () => {
    expect(resolveRoute('/')).toEqual({ page: 'home' })
  })

  it.each([
    ['/games/emotions-rise', 'Emotions Rise'],
    ['/games/align-the-actions', 'Align the Actions'],
    ['/games/shift-perspective', 'Shift Perspective'],
    ['/games/focus-attention', 'Focus Attention'],
  ])('resolves %s to the %s game', (pathname, name) => {
    const route = resolveRoute(pathname)

    expect(route.page).toBe('game')
    expect(route.page === 'game' && route.game.name).toBe(name)
  })

  it('resolves every game in the catalog', () => {
    for (const game of games) {
      expect(resolveRoute(`/games/${game.id}`)).toEqual({ page: 'game', game })
    }
  })

  it.each([
    '',
    '/games',
    '/games/',
    '/games/unknown',
    '/emotions-rise',
    '/games/emotions-rise/extra',
    '/GAMES/EMOTIONS-RISE',
  ])('falls back to the home page for %j', (pathname) => {
    expect(resolveRoute(pathname)).toEqual({ page: 'home' })
  })

  it('does not match a game path with a trailing slash', () => {
    expect(resolveRoute('/games/emotions-rise/')).toEqual({ page: 'home' })
  })
})
