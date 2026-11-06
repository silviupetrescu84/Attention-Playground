const gameRoutes = {
  '/games/emotions-flow': 'Emotions Flow',
  '/games/align-the-actions': 'Align the Actions',
} as const

type GamePath = keyof typeof gameRoutes

export type Route =
  | { page: 'home' }
  | { page: 'game'; gameName: (typeof gameRoutes)[GamePath] }

function isGamePath(pathname: string): pathname is GamePath {
  return pathname in gameRoutes
}

export function resolveRoute(pathname: string): Route {
  if (isGamePath(pathname)) {
    return {
      page: 'game',
      gameName: gameRoutes[pathname],
    }
  }

  return { page: 'home' }
}
