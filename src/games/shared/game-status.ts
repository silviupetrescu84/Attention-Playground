import type { GameLoop } from './game-loop'

/**
 * The status bar below the canvas, shared by every game. A game shows short
 * messages in it (e.g. "Tapped a bad emotion: Fear"); each one stays for
 * STATUS_DURATION_MS of play (the time stands still while paused) unless a
 * newer message replaces it. Screen readers announce each message.
 */

export const STATUS_DURATION_MS = 2_000

export type StatusTone = 'good' | 'bad'

export interface GameStatus {
  readonly element: HTMLElement
  /** The message shown now ('' when none). */
  readonly text: string
  show(text: string, tone: StatusTone): void
  /** Hides the message once its time is up (called on every frame). */
  update(): void
  clear(): void
}

export interface GameStatusOptions {
  loop: GameLoop
}

export function createGameStatus(
  container: HTMLElement,
  { loop }: GameStatusOptions,
): GameStatus {
  const element = document.createElement('p')
  element.className = 'game-status'
  element.setAttribute('role', 'status')
  container.append(element)

  let text = ''
  let shownAtMs = 0

  function clear() {
    text = ''
    element.textContent = ''
    delete element.dataset.tone
  }

  return {
    element,
    get text() {
      return text
    },
    show(message, tone) {
      text = message
      element.textContent = message
      element.dataset.tone = tone
      shownAtMs = loop.elapsedMs
    },
    update() {
      if (text && loop.elapsedMs - shownAtMs >= STATUS_DURATION_MS) {
        clear()
      }
    },
    clear,
  }
}
