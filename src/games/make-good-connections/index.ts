import { readCssVariables } from '../shared/canvas-style'
import type { GameDefinition } from '../shared/game-shell'
import type { Random } from '../shared/random'
import { CONNECT_COLORS, drawScene } from './draw'
import { createMakeGoodConnections, type Mistake } from './make-good-connections'

/**
 * The status bar message for each kind of mistake. Adding a new kind of
 * mistake without a message here is a type error.
 */
export const MISTAKE_MESSAGES: Readonly<Record<Mistake, string>> = {
  wall: 'Went through a wall: start again',
  tooSlow: 'Too slow: not all connected',
}

export interface MakeGoodConnectionsGameOptions {
  random?: Random
}

/** How to play, shown with the Start button. */
export const INSTRUCTIONS: readonly string[] = [
  'Make connections by tapping one dot and then the next',
  'Sometimes connections are blocked by obstacles so make them in the right order',
]

/** Make Good Connections draws no text and no images: it has nothing to load. */
export function makeGoodConnectionsGame({
  random = Math.random,
}: MakeGoodConnectionsGameOptions = {}): GameDefinition {
  return ({ canvas, score, mistakes, status, pace }) => {
    const game = createMakeGoodConnections({
      score,
      random,
      onMistake: (mistake) => {
        status.show(MISTAKE_MESSAGES[mistake], 'bad')
        mistakes.add()
      },
    })
    const colors = readCssVariables(canvas.element, CONNECT_COLORS)
    const draw = () => drawScene(canvas.context, game, colors)

    return {
      instructions: INSTRUCTIONS,
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
      tap(point) {
        game.tap(point)
        draw()
      },
      end() {
        game.stop()
      },
      summary() {
        const { connected, tooSlow, wallsHit } = game.stats
        return [
          { label: 'Rounds connected', value: connected },
          { label: 'Too slow', value: tooSlow },
          { label: 'Walls hit', value: wallsHit },
        ]
      },
    }
  }
}
