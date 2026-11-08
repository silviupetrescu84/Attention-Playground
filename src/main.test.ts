// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import emotions from './games/emotions-rise/data/emotions.json'
import { font, MAX_FONT_SIZE } from './games/emotions-rise/draw'
import { useFakeCanvasContexts, type FakeContext } from './test/fake-canvas-context'

// main.ts registers listeners on `document` and `window` when it is imported.
// Each test imports a fresh copy, so remember those listeners and remove them
// afterwards to keep tests independent.
const cleanups: (() => void)[] = []

// Errors thrown inside event listeners are reported, not thrown, so collect
// them and fail the test if there are any.
let uncaughtErrors: unknown[] = []
let contexts: FakeContext[]

function trackListeners(target: Document | Window) {
  const original = target.addEventListener.bind(target)

  vi.spyOn(target, 'addEventListener').mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      original(type, listener, options)
      cleanups.push(() => target.removeEventListener(type, listener, options))
    },
  )
}

function onError(event: ErrorEvent) {
  uncaughtErrors.push(event.error)
}

beforeEach(() => {
  uncaughtErrors = []
  window.addEventListener('error', onError)
  trackListeners(document)
  trackListeners(window)
  contexts = useFakeCanvasContexts()
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  vi.restoreAllMocks()
  window.removeEventListener('error', onError)
  expect(uncaughtErrors).toEqual([])
})

async function startApp(pathname = '/') {
  document.body.innerHTML = '<div id="app"></div>'
  history.replaceState({}, '', pathname)
  vi.resetModules()
  await import('./main')
  // Same module instance main.ts uses, because modules were just reset.
  const screenSignal = await import('./screen-signal')
  const app = document.querySelector<HTMLElement>('#app')!
  return { app, screenSignal }
}

/** Which screen is showing: 'home' or the game's name. */
function currentScreen() {
  const gameName = document.querySelector('#app .game-name')
  if (gameName) {
    return gameName.textContent
  }
  return document.querySelector('#app .game-grid') ? 'home' : 'nothing'
}

function click(target: EventTarget) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function routeLink(href: string) {
  const link = document.querySelector<HTMLAnchorElement>(
    `#app a[data-route][href="${href}"]`,
  )
  expect(link, `link to ${href}`).not.toBeNull()
  return link!
}

function nextPopstate() {
  return new Promise((resolve) => {
    window.addEventListener('popstate', resolve, { once: true })
  })
}

describe('app start', () => {
  it('starts loading the game fonts straight away, even on the home screen', async () => {
    const load = vi.fn(async () => [{ status: 'loaded' }])
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })
    try {
      await startApp('/')

      expect(currentScreen()).toBe('home')
      expect(load).toHaveBeenCalledWith(font(MAX_FONT_SIZE))
    } finally {
      delete (document as { fonts?: unknown }).fonts
    }
  })

  it('throws when the page has no #app element', async () => {
    document.body.innerHTML = ''
    vi.resetModules()

    await expect(import('./main')).rejects.toThrow('Missing #app element')
  })

  it('shows the home screen at /', async () => {
    await startApp('/')

    expect(currentScreen()).toBe('home')
  })

  it.each([
    ['/games/emotions-rise', 'Emotions Rise'],
    ['/games/align-the-actions', 'Align the Actions'],
  ])('opens %s directly on the %s screen', async (pathname, gameName) => {
    await startApp(pathname)

    expect(currentScreen()).toBe(gameName)
  })

  it('shows the home screen for an unknown path', async () => {
    await startApp('/does-not-exist')

    expect(currentScreen()).toBe('home')
  })
})

describe('navigation', () => {
  it('opens a game from the home screen without reloading the page', async () => {
    await startApp('/')

    const event = click(routeLink('/games/emotions-rise'))

    expect(event.defaultPrevented).toBe(true)
    expect(location.pathname).toBe('/games/emotions-rise')
    expect(currentScreen()).toBe('Emotions Rise')
  })

  it('opens a game for every game link on the home screen', async () => {
    await startApp('/')
    const hrefs = [
      ...document.querySelectorAll<HTMLAnchorElement>('#app a[data-route]'),
    ].map((link) => link.getAttribute('href')!)
    expect(hrefs.length).toBeGreaterThan(0)

    for (const href of hrefs) {
      history.replaceState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
      expect(currentScreen()).toBe('home')

      click(routeLink(href))

      expect(location.pathname).toBe(href)
      expect(currentScreen()).not.toBe('home')
    }
  })

  it('navigates when clicking inside a link, e.g. on its image', async () => {
    await startApp('/')
    const image = routeLink('/games/align-the-actions').querySelector('img')!

    click(image)

    expect(currentScreen()).toBe('Align the Actions')
  })

  it('shows a Home button on game screens only', async () => {
    const { app } = await startApp('/games/emotions-rise')
    expect(app.querySelectorAll('.home-link')).toHaveLength(1)

    click(routeLink('/'))

    expect(app.querySelector('.home-link')).toBeNull()
  })

  it('goes back to the game selection with the Home button', async () => {
    const { screenSignal } = await startApp('/games/emotions-rise')
    const gameSignal = screenSignal.getScreenSignal()

    const event = click(routeLink('/'))

    expect(event.defaultPrevented).toBe(true)
    expect(location.pathname).toBe('/')
    expect(currentScreen()).toBe('home')
    expect(gameSignal.aborted).toBe(true)
  })

  it('follows the browser back and forward buttons', async () => {
    await startApp('/')
    click(routeLink('/games/emotions-rise'))

    history.back()
    await nextPopstate()
    expect(location.pathname).toBe('/')
    expect(currentScreen()).toBe('home')

    history.forward()
    await nextPopstate()
    expect(location.pathname).toBe('/games/emotions-rise')
    expect(currentScreen()).toBe('Emotions Rise')
  })

  it('ignores clicks outside route links', async () => {
    const { app } = await startApp('/')
    const title = app.querySelector('h1')!

    const event = click(title)

    expect(event.defaultPrevented).toBe(false)
    expect(title.isConnected).toBe(true)
    expect(location.pathname).toBe('/')
  })

  it('ignores links that are not marked as routes', async () => {
    const { app } = await startApp('/')
    const external = document.createElement('a')
    external.href = 'https://example.com/'
    app.append(external)
    let preventedByApp: boolean | undefined
    // Runs after the app's document listener; stops jsdom from navigating.
    window.addEventListener('click', (event) => {
      preventedByApp = event.defaultPrevented
      event.preventDefault()
    })

    click(external)

    expect(preventedByApp).toBe(false)
    expect(external.isConnected).toBe(true)
    expect(location.pathname).toBe('/')
  })

  it('ignores click events whose target is not an element', async () => {
    const { app } = await startApp('/')
    const text = document.createTextNode('text')
    app.append(text)

    click(text)

    expect(text.isConnected).toBe(true)
    expect(location.pathname).toBe('/')
  })
})

describe('game canvas', () => {
  it('is shown on game screens', async () => {
    const { app } = await startApp('/games/emotions-rise')

    expect(app.querySelectorAll('.game-screen canvas.game-canvas')).toHaveLength(1)
  })

  it('is not shown on the home screen', async () => {
    const { app } = await startApp('/')

    expect(app.querySelector('canvas')).toBeNull()
  })

  it('is replaced by a new one when switching games', async () => {
    const { app } = await startApp('/games/emotions-rise')
    const first = app.querySelector('canvas')
    history.replaceState({}, '', '/games/align-the-actions')

    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(app.querySelectorAll('canvas')).toHaveLength(1)
    expect(app.querySelector('canvas')).not.toBe(first)
    expect(first?.isConnected).toBe(false)
  })
})

describe('games', () => {
  it.each(['/games/emotions-rise', '/games/align-the-actions'])(
    '%s first shows a Start button',
    async (pathname) => {
      const { app } = await startApp(pathname)
      const start = app.querySelector<HTMLElement>('.game-hud__start')

      expect(start).not.toBeNull()
      expect(start!.closest('[hidden]')).toBeNull()
      expect(app.querySelector<HTMLElement>('.game-hud__pause')!.hidden).toBe(true)
    },
  )

  it('runs the shared shell for a game whose gameplay is not built yet', async () => {
    const { app } = await startApp('/games/align-the-actions')

    app.querySelector<HTMLButtonElement>('.game-hud__start')!.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))

    expect(app.querySelector<HTMLElement>('.game-hud__start')!.closest('[hidden]')).not.toBeNull()
    expect(app.querySelector<HTMLElement>('.game-hud__pause')!.hidden).toBe(false)
    expect(app.querySelector('.game-hud__time')!.textContent).toBe('00')
  })

  it('plays Emotions Rise on its screen', async () => {
    const { app } = await startApp('/games/emotions-rise')
    const start = app.querySelector<HTMLButtonElement>('.game-hud__start')!
    // jsdom cannot load fonts, so the game soon gives up and uses a fallback.
    await vi.waitFor(() => expect(start.disabled).toBe(false))

    start.click()

    const drawn = contexts.at(-1)!.callsTo('fillText').map((call) => call.args[0])
    expect(drawn).toHaveLength(1)
    expect([...emotions.positive, ...emotions.negative]).toContain(drawn[0])
  })
})

describe('leaving a screen', () => {
  it('stops the previous screen when a link is followed', async () => {
    const { screenSignal } = await startApp('/')
    const homeSignal = screenSignal.getScreenSignal()

    click(routeLink('/games/emotions-rise'))

    expect(homeSignal.aborted).toBe(true)
    expect(screenSignal.getScreenSignal().aborted).toBe(false)
  })

  it('stops the previous screen on browser back', async () => {
    const { screenSignal } = await startApp('/')
    click(routeLink('/games/emotions-rise'))
    const gameSignal = screenSignal.getScreenSignal()

    history.back()
    await nextPopstate()

    expect(gameSignal.aborted).toBe(true)
    expect(screenSignal.getScreenSignal().aborted).toBe(false)
  })
})
