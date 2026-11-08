import alignTheActionsIcon from '../assets/game-icons/align-the-actions.png'
import emotionsRiseIcon from '../assets/game-icons/emotions-rise.png'
import { alignTheActionsGame, preloadAlignTheActions } from './align-the-actions'
import { emotionsRiseGame, preloadEmotionsRise } from './emotions-rise'
import type { GameDefinition } from './shared/game-shell'

/**
 * Every game in the playground, in the order shown on the home screen. The
 * router, the home screen grid and the app all read this list, so adding a
 * game means adding it here (and its icon).
 */

export interface CatalogGame {
  /** Used in the URL: /games/<id>. */
  readonly id: string
  readonly name: string
  readonly icon: string
  /** Creates the game's rules for a new game screen. */
  readonly create: () => GameDefinition
  /** Starts loading what the game needs (fonts, images…), when the app starts. */
  readonly preload?: () => Promise<unknown>
}

/** How many games the playground will have; the rest show as "Coming soon". */
export const TOTAL_GAMES = 10

export const games: readonly CatalogGame[] = [
  {
    id: 'emotions-rise',
    name: 'Emotions Rise',
    icon: emotionsRiseIcon,
    create: () => emotionsRiseGame(),
    preload: () => preloadEmotionsRise(),
  },
  {
    id: 'align-the-actions',
    name: 'Align the Actions',
    icon: alignTheActionsIcon,
    create: () => alignTheActionsGame(),
    preload: () => preloadAlignTheActions(),
  },
]

/**
 * Starts loading every game's files in the background; never waits. A game
 * that fails to preload tries again when it is opened.
 */
export function preloadGames(list: readonly CatalogGame[] = games): void {
  for (const game of list) {
    game.preload?.().catch((error: unknown) => {
      console.warn(`Could not preload ${game.name}; it will load when opened`, error)
    })
  }
}

export function gamePath(game: CatalogGame): string {
  return `/games/${game.id}`
}
