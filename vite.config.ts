import { defineConfig } from 'vitest/config'

export default defineConfig({
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
  },
})
