// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { GameLoop } from './game-loop'
import { createGameStatus, STATUS_DURATION_MS } from './game-status'

function setup() {
  const container = document.createElement('main')
  const loop = { elapsedMs: 10_000 } satisfies GameLoop
  const status = createGameStatus(container, { loop })
  return { container, loop, status }
}

describe('game status bar', () => {
  it('is an empty status region in the container', () => {
    const { container, status } = setup()

    expect(status.element.parentElement).toBe(container)
    expect(status.element.className).toBe('game-status')
    expect(status.element.getAttribute('role')).toBe('status')
    expect(status.text).toBe('')
  })

  it('shows a message with its tone', () => {
    const { status } = setup()

    status.show('Tapped a bad emotion: Fear (−1)', 'bad')

    expect(status.element.textContent).toBe('Tapped a bad emotion: Fear (−1)')
    expect(status.element.dataset.tone).toBe('bad')
    expect(status.text).toBe('Tapped a bad emotion: Fear (−1)')
  })

  it('keeps a message for 2 seconds of play, then hides it', () => {
    const { loop, status } = setup()
    expect(STATUS_DURATION_MS).toBe(2_000)
    status.show('Oops', 'bad')

    loop.elapsedMs += 1_999
    status.update()
    expect(status.text).toBe('Oops')

    loop.elapsedMs += 1
    status.update()
    expect(status.text).toBe('')
    expect(status.element.dataset.tone).toBeUndefined()
  })

  it('replaces the message and restarts its time with a newer one', () => {
    const { loop, status } = setup()
    status.show('First', 'bad')
    loop.elapsedMs += 1_500

    status.show('Second', 'good')
    loop.elapsedMs += 1_500
    status.update()

    expect(status.text).toBe('Second')
    expect(status.element.dataset.tone).toBe('good')
  })

  it('clears on request', () => {
    const { status } = setup()
    status.show('Oops', 'bad')

    status.clear()

    expect(status.text).toBe('')
    expect(status.element.dataset.tone).toBeUndefined()
  })

  it('does nothing on update when there is no message', () => {
    const { loop, status } = setup()
    loop.elapsedMs += 5_000

    expect(() => status.update()).not.toThrow()
    expect(status.text).toBe('')
  })

  it('shows messages as plain text', () => {
    const { status } = setup()

    status.show('<img src=x onerror=alert(1)>', 'bad')

    expect(status.element.querySelector('img')).toBeNull()
  })
})
