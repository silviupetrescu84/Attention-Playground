import { readCssVariables } from '../shared/canvas-style'
import type { GameDefinition } from '../shared/game-shell'
import type { Random } from '../shared/random'
import { drawScene, loadBallImage, STAY_COLORS } from './draw'
import { createStayInTheZone } from './stay-in-the-zone'

/** The status bar message for a zone missed. */
export const MISTAKE_MESSAGE = 'Not long enough in the zone'

export interface StayInTheZoneGameOptions {
  random?: Random
}

/**
 * Loads what Stay in the Zone needs (the ball's bubble; it writes nothing,
 * so it needs no font). Called when the app starts, so it is usually ready
 * before the game is opened, and again by the game itself in case it is not.
 * Loading twice does not download twice.
 */
export function preloadStayInTheZone(): Promise<HTMLImageElement> {
  return loadBallImage()
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'Hold anywhere to make the ball rise, let go to let it fall',
  'Keep it in the green zone until its white ring runs out',
]

export function stayInTheZoneGame({
  random = Math.random,
}: StayInTheZoneGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status, pace }) => {
    const game = createStayInTheZone({
      score,
      random,
      onMistake: () => {
        status.show(MISTAKE_MESSAGE, 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, STAY_COLORS)
    let ballImage: HTMLImageElement | undefined
    const draw = () => drawScene(canvas.context, game, { colors, ballImage })

    return {
      instructions: INSTRUCTIONS,
      async load() {
        try {
          ballImage = await preloadStayInTheZone()
        } finally {
          // The ball was drawn before its bubble loaded: again, now it has.
          draw()
        }
      },
      reset() {
        game.clear()
        draw()
      },
      start() {
        // At the pace chosen for this round.
        game.start(pace.pace)
        draw()
      },
      frame({ elapsedMs }) {
        game.update(elapsedMs)
        draw()
      },
      drag(point) {
        game.hold(point !== undefined)
      },
      end() {
        game.stop()
      },
      summary() {
        const { held, missed } = game.stats
        return [
          { label: 'Zones held', value: held },
          { label: 'Zones missed', value: missed },
        ]
      },
    }
  }
}
