/**
 * Gives the lint tools TypeScript 6, while the project builds with TypeScript 7.
 *
 * typescript-eslint reads code with TypeScript's JavaScript API, which
 * TypeScript 7 (the project's `tsc`) no longer has, and refuses to run with
 * it (https://github.com/typescript-eslint/typescript-eslint/issues/10940).
 * This package has its own TypeScript 6, kept apart so the project's `tsc`
 * stays TypeScript 7. Importing it makes every `import 'typescript'` (or
 * `require`, or of a file in it) in the same process load TypeScript 6 instead: import it before
 * typescript-eslint loads (see eslint.config.js).
 *
 * Once typescript-eslint supports TypeScript 7: delete this folder, its line
 * in package.json (devDependencies and overrides) and its import in
 * eslint.config.js.
 */
import * as nodeModule from 'node:module'

// Node 22.15 and later have it (the project needs 22.21, see package.json).
if (!('registerHooks' in nodeModule)) {
  throw new Error(
    `ESLint needs Node 22.15 or later to run here, got ${process.version}. ` +
      'In VS Code, the project settings make the ESLint extension use your Node.',
  )
}

const { registerHooks } = nodeModule

/** TypeScript 6: this package's own (found before the hook below is in place). */
const typescript6 = import.meta.resolve('typescript')
/** Its folder, for imports of its files ('typescript/lib/…'). */
const typescript6Folder = new URL('../', typescript6)

/** The file `specifier` ('typescript' or 'typescript/…') is in TypeScript 6. */
function fileIn6(specifier) {
  if (specifier === 'typescript') {
    return typescript6
  }

  const path = specifier.slice('typescript/'.length)
  const withExtension = /\.(c?js|json)$/.test(path) ? path : `${path}.js`
  return new URL(withExtension, typescript6Folder).href
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'typescript' || specifier.startsWith('typescript/')) {
      const url = fileIn6(specifier)
      const format = url.endsWith('.json') ? 'json' : 'commonjs'
      return { url, format, shortCircuit: true }
    }

    return nextResolve(specifier, context)
  },
})
