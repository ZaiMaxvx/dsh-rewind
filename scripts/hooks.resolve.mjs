/**
 * Resolve hook for running this plugin's tests against the dsh source tree
 * without installing its node_modules: `@deepseek-ai/*` (and vendored cordis)
 * specifiers map to TypeScript sources; external npm packages resolve through
 * the workspace-parent node_modules; everything else falls through to Node.
 */

import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

// DSH_SRC selects the dsh source tree to load (e.g. dsh-source-rc2).
const DSH_SRC = process.env.DSH_SRC ?? 'dsh-source'
const PATHS = (await import(new URL('../tsconfig.paths.json', import.meta.url).href, { with: { type: 'json' } })).default.compilerOptions.paths

function toUrl(entry) {
  const cleaned = entry.replace(/^\.\//, '')
  if (isAbsolute(cleaned)) return pathToFileURL(cleaned).href
  return new URL(`../../${DSH_SRC}/src/${cleaned}`, import.meta.url).href
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@deepseek-ai/') || specifier === '@deepseek-ai/cordis') {
    const mapped = PATHS[specifier]
    if (mapped !== undefined && mapped.length > 0) {
      return { url: toUrl(mapped[0]), shortCircuit: true }
    }
  }
  return nextResolve(specifier, context)
}
