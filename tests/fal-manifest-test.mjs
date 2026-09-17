/**
 * Offline packaging test — the manifest invariants the harness's loader and
 * client-module system check before anything can mount.
 *
 * Mirrors what the Host does at boot: resolve the bundle patch declared by
 * `dsh.bundle.patch`, resolve `exports["."]` for the host half, resolve
 * `exports["./client"]` for the browser half, and require
 * `dsh.client.platform === "web"`.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const failures = []
const check = (condition, message) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`)
  if (!condition) failures.push(message)
}

check(pkg.name === 'dsh-fal-imagegen', `package name is ${pkg.name}`)
check(pkg.type === 'module', 'package is ESM')
check(existsSync(join(root, pkg.main)), `main exists (${pkg.main})`)
check(pkg.exports?.['.'] === `./${pkg.main}`, 'exports["."] points at the host half')

const clientRel = pkg.exports?.['./client']
check(typeof clientRel === 'string', 'declares exports["./client"]')
check(existsSync(join(root, clientRel ?? '')), `client bundle exists (${clientRel})`)
check(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform is "web"')

const patchRel = pkg.dsh?.bundle?.patch
check(typeof patchRel === 'string' && existsSync(join(root, patchRel)), `dsh.bundle.patch exists (${patchRel})`)
const patch = readFileSync(join(root, patchRel ?? ''), 'utf8')
check(patch.includes(`name: '${pkg.name}'`), 'patch inserts a row named after the package')
check(/^\s*-\s*insert:/m.test(patch), 'patch is a top-level insert list')

// The client wrapper must announce the package's own id, which is how the
// module system binds the served bundle to the plugin row.
const client = readFileSync(join(root, clientRel ?? ''), 'utf8')
check(client.includes(`id: '${pkg.name}'`), 'client wrapper id matches the package name')
check(client.includes('__ModuleLoader__.load'), 'client bundle registers through the module loader')

// Host half must stay importable without the browser globals.
check(!/window\./.test(readFileSync(join(root, pkg.main), 'utf8')), 'host half never touches window')

console.log(failures.length === 0 ? '\nMANIFEST TEST PASSED' : `\nMANIFEST TEST FAILED (${failures.length})`)
process.exitCode = failures.length === 0 ? 0 : 1
