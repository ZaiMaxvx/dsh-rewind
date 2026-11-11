#!/usr/bin/env node
/**
 * Compose the two type-check configs for this out-of-tree plugin, one per
 * compilation face (the repo builds host and client halves as separate
 * programs, so their Context merges never collide):
 *
 * - tsconfig.check.host.json   — src root files, extends tsconfig.base.json
 * - tsconfig.check.client.json — src/client files, extends tsconfig.base.client.json
 *
 * Both layer the generated full path map over the repo base's own entries and
 * anchor baseUrl at the dsh source root.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const dshRoot = resolve(pkgRoot, '..', 'dsh-source', 'src')
const typesRoot = resolve(pkgRoot, '..', 'node_modules', '@types')

const stripJsonComments = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''))
const base = stripJsonComments(readFileSync(resolve(dshRoot, 'tsconfig.base.json'), 'utf8'))
const generated = JSON.parse(readFileSync(resolve(pkgRoot, 'tsconfig.paths.json'), 'utf8'))
const paths = { ...(base.compilerOptions.paths ?? {}), ...generated.compilerOptions.paths }

const typeRoots = [resolve(dshRoot, 'scripts', 'types'), typesRoot].filter(p => existsSync(p))

const host = {
  extends: resolve(dshRoot, 'tsconfig.base.json'),
  compilerOptions: {
    noEmit: true,
    composite: false,
    incremental: false,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    types: ['node'],
    lib: ['esnext'],
    typeRoots,
    baseUrl: dshRoot,
    paths,
  },
  include: [resolve(pkgRoot, 'src', '*.ts')],
}

const client = {
  extends: resolve(dshRoot, 'tsconfig.base.client.json'),
  compilerOptions: {
    noEmit: true,
    composite: false,
    incremental: false,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    typeRoots,
    baseUrl: dshRoot,
    paths,
  },
  include: [resolve(pkgRoot, 'src', 'client', '**', '*.ts'), resolve(pkgRoot, 'src', 'client', '**', '*.tsx')],
}

writeFileSync(resolve(pkgRoot, 'tsconfig.check.host.json'), `${JSON.stringify(host, null, 2)}\n`)
writeFileSync(resolve(pkgRoot, 'tsconfig.check.client.json'), `${JSON.stringify(client, null, 2)}\n`)
console.log(`composed host + client check configs with ${Object.keys(paths).length} path entries`)
