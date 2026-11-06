import { gameGrid } from '../components/game-grid'

export function homeScreen() {
  return `
    <main>
      <section class="hero" aria-labelledby="page-title">
        <h1 id="page-title">Attention Playground</h1>
        <p class="intro">
          Ten small browser games connected to Practice of Happiness
        </p>
      </section>

      ${gameGrid()}
    </main>

    <footer>
      <p>An independent, open-source companion to Practice of Happiness.</p>
    </footer>
  `
}
