import alignTheActionsIcon from '../assets/game-icons/align-the-actions.png'
import breakItDownIcon from '../assets/game-icons/break-it-down.png'
import emotionsRiseIcon from '../assets/game-icons/emotions-rise.png'
import focusAttentionIcon from '../assets/game-icons/focus-attention.png'
import improveInnerVoiceIcon from '../assets/game-icons/improve-inner-voice.png'
import pauseBeforeReactingIcon from '../assets/game-icons/pause-before-reacting.png'
import shiftPerspectiveIcon from '../assets/game-icons/shift-perspective.png'
import { alignTheActionsGame, preloadAlignTheActions } from './align-the-actions'
import { breakItDownGame, preloadBreakItDown } from './break-it-down'
import { emotionsRiseGame, preloadEmotionsRise } from './emotions-rise'
import { focusAttentionGame, preloadFocusAttention } from './focus-attention'
import { improveInnerVoiceGame, preloadImproveInnerVoice } from './improve-inner-voice'
import { pauseBeforeReactingGame, preloadPauseBeforeReacting } from './pause-before-reacting'
import type { GameDefinition } from './shared/game-shell'
import { preloadShiftPerspective, shiftPerspectiveGame } from './shift-perspective'

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
  {
    id: 'shift-perspective',
    name: 'Shift Perspective',
    icon: shiftPerspectiveIcon,
    create: () => shiftPerspectiveGame(),
    preload: () => preloadShiftPerspective(),
  },
  {
    id: 'focus-attention',
    name: 'Focus Attention',
    icon: focusAttentionIcon,
    create: () => focusAttentionGame(),
    preload: () => preloadFocusAttention(),
  },
  {
    id: 'break-it-down',
    name: 'Break It Down',
    icon: breakItDownIcon,
    create: () => breakItDownGame(),
    preload: () => preloadBreakItDown(),
  },
  {
    id: 'pause-before-reacting',
    name: 'Pause Before Reacting',
    icon: pauseBeforeReactingIcon,
    create: () => pauseBeforeReactingGame(),
    preload: () => preloadPauseBeforeReacting(),
  },
  {
    id: 'improve-inner-voice',
    name: 'Improve Inner Voice',
    icon: improveInnerVoiceIcon,
    create: () => improveInnerVoiceGame(),
    preload: () => preloadImproveInnerVoice(),
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
