import './style.css'
import { preloadGames } from './games/catalog'
import { findElement } from './games/shared/dom'
import { mountGame } from './games/shared/game-shell'
import { resolveRoute } from './router'
import { getScreenSignal, leaveScreen } from './screen-signal'
import { gameScreen } from './views/game-screen'
import { homeScreen } from './views/home-screen'

const app = findElement(document, '#app', HTMLDivElement)

function renderApp() {
  // Stop everything the previous screen started before showing the next one.
  leaveScreen()

  const route = resolveRoute(window.location.pathname)

  if (route.page === 'game') {
    app.innerHTML = gameScreen(route.game.name)
    mountGame(findElement(app, '.game-screen', HTMLElement), {
      signal: getScreenSignal(),
      game: route.game.create(),
      gameId: route.game.id,
    })
    return
  }

  app.innerHTML = homeScreen()
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) {
    return
  }

  const link = event.target.closest<HTMLAnchorElement>('a[data-route]')

  if (!link) {
    return
  }

  event.preventDefault()
  window.history.pushState({}, '', link.href)
  renderApp()
})

window.addEventListener('popstate', renderApp)
preloadGames()
renderApp()
