import { homeIcon } from '../components/icons'
import './game-screen.css'

export function gameScreen(gameName: string) {
  return `
    <main class="game-screen">
      <h1 class="game-name">${gameName}</h1>
      <a class="home-link" href="/" data-route>
        ${homeIcon}
        Home
      </a>
    </main>
  `
}
