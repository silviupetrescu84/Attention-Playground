// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import goalsData from './games/align-the-actions/data/align_the_actions_goals.json'
import { goalsFrom } from './games/align-the-actions/goals'
import emotions from './games/emotions-rise/data/emotions.json'
import focusData from './games/focus-attention/data/focus-attention.json'
import { cssCanvasFont, useCssVariables } from './test/css-variables'
import { useFakeCanvasContexts, type FakeContext } from './test/fake-canvas-context'
import { stubImages } from './test/fake-image'

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
  stubImages()
  useCssVariables()
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
      expect(load).toHaveBeenCalledWith(expect.stringContaining(cssCanvasFont.family))
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
    ['/games/shift-perspective', 'Shift Perspective'],
    ['/games/focus-attention', 'Focus Attention'],
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
  it.each([
    '/games/emotions-rise',
    '/games/align-the-actions',
    '/games/shift-perspective',
    '/games/focus-attention',
  ])(
    '%s first shows a Start button',
    async (pathname) => {
      const { app } = await startApp(pathname)
      const start = app.querySelector<HTMLElement>('.game-hud__start')

      expect(start).not.toBeNull()
      expect(start!.closest('[hidden]')).toBeNull()
      expect(app.querySelector<HTMLElement>('.game-hud__pause')!.hidden).toBe(true)
    },
  )

  it('plays Align the Actions on its screen', async () => {
    const { app } = await startApp('/games/align-the-actions')
    const start = app.querySelector<HTMLButtonElement>('.game-hud__start')!
    // jsdom cannot load fonts, so the game soon gives up and uses a fallback.
    await vi.waitFor(() => expect(start.disabled).toBe(false))

    start.click()

    // The goal and its row of 4 actions.
    const drawn = contexts.at(-1)!.callsTo('fillText').map((call) => String(call.args[0]))
    const titles = goalsFrom(goalsData).map((goal) => goal.title)
    expect(drawn.some((text) => titles.some((title) => title.startsWith(text)))).toBe(true)
    expect(contexts.at(-1)!.callsTo('roundRect')).toHaveLength(5)
    expect(app.querySelector<HTMLElement>('.game-hud__pause')!.hidden).toBe(false)
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

  it('plays Shift Perspective on its screen', async () => {
    const { app } = await startApp('/games/shift-perspective')
    const start = app.querySelector<HTMLButtonElement>('.game-hud__start')!
    // jsdom cannot load fonts, so the game soon gives up and uses a fallback.
    await vi.waitFor(() => expect(start.disabled).toBe(false))
    const before = contexts.at(-1)!.calls.length

    start.click()

    // The round is on, and the canvas is cleared for the first thought to
    // fade in. (Its frames are not timed in jsdom: the game's own tests
    // play it frame by frame.)
    expect(app.querySelector<HTMLElement>('.game-hud__pause')!.hidden).toBe(false)
    expect(contexts.at(-1)!.calls.slice(before).map((call) => call.name)).toEqual(['clearRect'])
  })

  it('plays Focus Attention on its screen', async () => {
    const { app } = await startApp('/games/focus-attention')
    const start = app.querySelector<HTMLButtonElement>('.game-hud__start')!
    // jsdom cannot load fonts, so the game soon gives up and uses a fallback.
    await vi.waitFor(() => expect(start.disabled).toBe(false))

    start.click()

    // The first word comes straight away, and the two buttons are at the bottom.
    const drawn = contexts.at(-1)!.lastDrawing()
    const texts = drawn.filter((call) => call.name === 'fillText').map((call) => call.args[0])
    expect(texts).toHaveLength(3)
    expect([...focusData.values, ...focusData.antiValues]).toContain(texts[0])
    expect(texts.slice(1)).toEqual(['Focus', 'Change attention'])
    expect(app.querySelector<HTMLElement>('.game-hud__pause')!.hidden).toBe(false)
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
