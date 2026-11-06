import { resolveRoute } from './router'
import { gameScreen } from './views/game-screen'
import { homeScreen } from './views/home-screen'
import './style.css'

function getAppElement() {
  const element = document.querySelector<HTMLDivElement>('#app')

  if (!element) {
    throw new Error('Missing #app element')
  }

  return element
}

const app = getAppElement()

function renderApp() {
  const route = resolveRoute(window.location.pathname)

  if (route.page === 'game') {
    app.innerHTML = gameScreen(route.gameName)
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
renderApp()
