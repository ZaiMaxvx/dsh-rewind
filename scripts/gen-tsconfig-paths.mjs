#!/usr/bin/env node
/**
 * Generate a tsconfig `paths` map for type-checking this out-of-tree plugin
 * against the dsh source tree without installing its node_modules.
 *
 * Maps every workspace package name (and its subpath exports) from the
 * packages and vendor group directories' package.json files to its TypeScript
 * source entry, mirroring the repo's own tsconfig.base.json source plane.
 *
 * Usage: node scripts/gen-tsconfig-paths.mjs <dsh-source-root> <out-tsconfig>
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [dshRoot, outFile] = process.argv.slice(2)
if (dshRoot === undefined || outFile === undefined) {
  console.error('usage: gen-tsconfig-paths.mjs <dsh-source-root> <out-tsconfig>')
  process.exit(1)
}
const root = resolve(dshRoot)

/** Collect candidate package.json locations under a group directory. */
function packageDirs(groupDir) {
  const group = join(root, groupDir)
  if (!existsSync(group)) return []
  const out = []
  for (const entry of readdirSync(group)) {
    const dir = join(group, entry)
    if (!statSync(dir).isDirectory()) continue
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) { out.push(dir); continue }
    for (const sub of readdirSync(dir)) {
      const subDir = join(dir, sub)
      if (statSync(subDir).isDirectory() && existsSync(join(subDir, 'package.json'))) {
        out.push(subDir)
      }
    }
  }
  return out
}

const paths = {}
let mapped = 0

/** Resolve an exports target (or main) to a repo-relative .ts/.tsx source. */
function sourceEntry(pkgDir, target) {
  if (typeof target !== 'string') return undefined
  const base = join(pkgDir, target)
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

function mapPackage(pkgDir) {
  let manifest
  try { manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) } catch { return }
  const name = manifest.name
  if (typeof name !== 'string' || name === '') return
  const targets = new Map()
  const rootTarget = typeof manifest.exports?.['.'] === 'string'
    ? manifest.exports['.']
    : manifest.exports?.['.']?.default
      ?? manifest.exports?.['.']?.import
      ?? manifest.main
  const dot = sourceEntry(pkgDir, rootTarget) ?? sourceEntry(pkgDir, './src/index.ts')
  if (dot !== undefined) targets.set(name, dot)
  if (manifest.exports !== undefined && typeof manifest.exports === 'object') {
    for (const [key, value] of Object.entries(manifest.exports)) {
      if (key === '.' || key.startsWith('./locale/') || !key.startsWith('./')) continue
      const target = typeof value === 'string' ? value : value?.default ?? value?.import ?? value?.types
      // Built targets (lib/...) do not exist in a source tree; fall back to
      // the mirrored source path (./src/<sub>[.ts|/index.ts]).
      const entry = sourceEntry(pkgDir, target)
        ?? sourceEntry(pkgDir, `./src${key.slice(1)}`)
      if (entry !== undefined) {
        targets.set(`${name}${key.slice(1)}`, entry)
      }
    }
  }
  // Fallbacks for specifiers without an exports entry (source-plane style).
  if (!targets.has(name) || targets.size === 1) {
    for (const extra of ['types', 'brand', 'message', 'client']) {
      const key = `${name}/${extra}`
      if (targets.has(key)) continue
      const entry = sourceEntry(pkgDir, `./src/${extra}.ts`)
      if (entry !== undefined) targets.set(key, entry)
    }
  }
  for (const [key, entry] of targets) {
    const relative = entry.replaceAll('\\', '/')
    paths[key] = [relative]
    mapped += 1
  }
}

for (const group of ['packages', 'vendor']) {
  for (const dir of packageDirs(group)) mapPackage(dir)
}
// The dsh launcher package lives directly under apps/.
mapPackage(join(root, 'apps', 'cli'))

const here = dirname(fileURLToPath(import.meta.url))
const config = {
  compilerOptions: {
    target: 'es2024',
    module: 'nodenext',
    moduleResolution: 'nodenext',
    strict: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    exactOptionalPropertyTypes: false,
    skipLibCheck: true,
    jsx: 'react-jsx',
    types: [],
    paths,
    baseUrl: root,
  },
  include: [
    resolve(here, '..', 'src', '*.ts'),
    resolve(here, '..', 'src', 'client', '*.ts'),
  ],
  exclude: [join(root, '**')],
}

writeFileSync(outFile, `${JSON.stringify(config, null, 2)}\n`)
console.log(`mapped ${mapped} specifiers from ${root} into ${outFile}`)
