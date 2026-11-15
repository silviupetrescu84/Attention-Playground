/**
 * How the code is checked: `npm run lint` (`npm run lint:fix` fixes what it
 * can). Formatting is Prettier's (`npm run format`), so no rule here is about
 * how code looks.
 */

// First: the lint tools below read TypeScript through it (see its index.js).
import 'typescript-for-lint'

const [
  { defineConfig },
  { default: js },
  { default: vitest },
  { default: prettier },
  { default: perfectionist },
  { default: globals },
  { default: tseslint },
] = await Promise.all([
  import('eslint/config'),
  import('@eslint/js'),
  import('@vitest/eslint-plugin'),
  import('eslint-config-prettier'),
  import('eslint-plugin-perfectionist'),
  import('globals'),
  import('typescript-eslint'),
])

/** Alphabetical, whatever the case: `CARD_COLORS` with the c's. */
const alphabetical = { type: 'alphabetical', ignoreCase: true }

export default defineConfig(
  { ignores: ['dist/', 'coverage/', '.vitest/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { perfectionist },
    rules: {
      // `() => game.stop()` is as clear as with braces.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // Numbers read well in messages: `Score: ${value}`.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Packages first, then the project's own files, each alphabetical by path.
      'perfectionist/sort-imports': [
        'error',
        { ...alphabetical, groups: [['builtin', 'external'], 'unknown'], newlinesBetween: 0 },
      ],
      // Values first, then types: `{ drawHue, hueFor, type Chosen }`.
      'perfectionist/sort-named-imports': [
        'error',
        { ...alphabetical, groups: ['value-import', 'type-import'] },
      ],
      'perfectionist/sort-named-exports': [
        'error',
        { ...alphabetical, groups: ['value-export', 'type-export'] },
      ],
      'perfectionist/sort-exports': ['error', alphabetical],
    },
  },
  {
    // Settings and tools, outside src (and tsconfig.json): checked without types.
    files: ['*.js', '*.ts', 'tools/**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.test.ts', 'src/test/**/*.ts'],
    extends: [vitest.configs.recommended],
    rules: {
      // A missing element fails the test anyway, loudly.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Stand-ins: `() => {}` does nothing on purpose; `async` ones fake async APIs.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
      // `expect(mock.method)` only reads the mock.
      '@typescript-eslint/unbound-method': 'off',
      // Vitest's matchers (`expect.any()`…) are typed `any`.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Tests check each item of a list by its kind: `if (good) expect(…)`.
      'vitest/no-conditional-expect': 'off',
      // Helpers that check for the test: `expectGaps(…)`.
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expect*'] }],
      // `expect(value, 'what it is')`: the message says what failed.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      // Checks after every test (e.g. no errors left uncaught) are part of each test.
      'vitest/no-standalone-expect': ['error', { additionalTestBlockFunctions: ['afterEach'] }],
    },
  },
  prettier,
)
