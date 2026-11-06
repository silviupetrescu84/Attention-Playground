export function gameScreen(gameName: string) {
  return `
    <main class="game-screen">
      <a class="back-link" href="/" data-route>← Back</a>
      <h1 class="game-name">${gameName}</h1>
    </main>
  `
}
