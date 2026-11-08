import { gamePath, games, TOTAL_GAMES } from '../games/catalog'

export function gameGrid() {
  const gameTiles = games.map(
    (game) => `
        <li class="game-tile">
          <a class="game-link" href="${gamePath(game)}" data-route>
            <span class="game-cover">
              <img src="${game.icon}" alt="" />
            </span>
            <span class="game-title">${game.name}</span>
          </a>
        </li>`,
  )
  const comingSoonTiles = Array.from(
    { length: Math.max(0, TOTAL_GAMES - games.length) },
    () => `
        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>`,
  )

  return `
    <section class="games" aria-label="Games">
      <ul class="game-grid">${[...gameTiles, ...comingSoonTiles].join('')}
      </ul>
    </section>
  `
}
