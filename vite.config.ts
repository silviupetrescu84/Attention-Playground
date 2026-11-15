import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * In tests, the games get their difficulty from src/test/pinned-difficulty.ts
 * instead of src/config/difficulty.json: the numbers the tests were written
 * for, so tuning the games does not break them. Only difficulty.ts's own
 * import is swapped, so a test can still read the real file.
 */
function pinDifficultyInTests(): Plugin {
  const config = fileURLToPath(new URL('src/config/difficulty.ts', import.meta.url))
  const pinned = fileURLToPath(new URL('src/test/pinned-difficulty.ts', import.meta.url))

  return {
    name: 'pin-difficulty-in-tests',
    enforce: 'pre',
    apply: (_config, { mode }) => mode === 'test',
    resolveId(source, importer) {
      return source === './difficulty.json' && importer === config ? pinned : undefined
    },
  }
}

export default defineConfig({
  plugins: [pinDifficultyInTests()],
  test: {
    // Tests read the app's CSS variables from its CSS files (see src/test/css-variables.ts).
    css: { include: [/src\/.+\.css/] },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/vite-env.d.ts', 'src/**/*.test.ts', 'src/test/**'],
      // Every line, branch and function must be tested: below this, `npm test` fails.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
    projects: [
      {
        // `npm test`: quick, in Node (jsdom for the page), with coverage.
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts'],
        },
      },
      {
        // `npm run test:browser`: what only a real browser shows (fonts, images,
        // layout, pointer events), in Chromium (`npx playwright install chromium`).
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
