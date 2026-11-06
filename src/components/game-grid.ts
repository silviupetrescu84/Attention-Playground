import emotionsFlowIcon from '../assets/game-icons/emotions-flow.png'
import alignTheActionsIcon from '../assets/game-icons/align-the-actions.png'

export function gameGrid() {
  return `
    <section class="games" aria-label="Games">
      <ul class="game-grid">
        <li class="game-tile">
          <a class="game-link" href="/games/emotions-flow" data-route>
            <span class="game-cover">
              <img src="${emotionsFlowIcon}" alt="" />
            </span>
            <span class="game-title">Emotions Flow</span>
          </a>
        </li>

        <li class="game-tile">
          <a class="game-link" href="/games/align-the-actions" data-route>
            <span class="game-cover">
              <img src="${alignTheActionsIcon}" alt="" />
            </span>
            <span class="game-title">Align the Actions</span>
          </a>
        </li>

        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>

        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>

        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>

        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>

        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>

        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>

        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>

        <li class="game-tile game-tile--coming-soon">
          <div class="game-cover">
            <span class="coming-soon">Coming soon</span>
          </div>
        </li>
      </ul>
    </section>
  `
}
