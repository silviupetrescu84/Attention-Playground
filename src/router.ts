import { gamePath, games, type CatalogGame } from './games/catalog'

export type Route = { page: 'home' } | { page: 'game'; game: CatalogGame }

export function resolveRoute(pathname: string): Route {
  const game = games.find((candidate) => gamePath(candidate) === pathname)

  return game ? { page: 'game', game } : { page: 'home' }
}
