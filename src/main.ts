import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app element')
}

app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true">AP</span>
      <span>Attention Playground</span>
    </a>
  </header>

  <main>
    <section class="hero" aria-labelledby="page-title">
      <p class="eyebrow">Pause. Notice. Practice.</p>
      <h1 id="page-title">Attention Playground</h1>
      <p class="intro">
        Ten small browser games about values,
        awareness, habits, self-talk, gratitude, breathing, and connection.
      </p>
    </section>

    <section class="games" aria-labelledby="games-heading">
      <div class="section-heading">
        <p class="eyebrow">First up</p>
        <h2 id="games-heading">Games in development</h2>
      </div>

      <article class="game-card">
        <div>
          <p class="status">Coming next</p>
          <h3>Emotions Flow</h3>
          <p>Practice noticing emotions as they arise and change.</p>
        </div>
        <span class="card-symbol" aria-hidden="true">↝</span>
      </article>
    </section>
  </main>

  <footer>
    <p>An independent, open-source companion to Practice of Happiness.</p>
  </footer>
`
