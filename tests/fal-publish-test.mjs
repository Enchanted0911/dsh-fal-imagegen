/**
 * Offline release gate — no network, no credentials.
 *
 * Mirrors what the DSH Community Market's install boundary and npm itself
 * require from a publishable plugin, so a broken release is caught here rather
 * than after the tarball is public:
 *   - an install boundary needs the same package name, an exact stable version,
 *     and a safe relative `dsh.bundle.patch`;
 *   - the client row needs `exports["./client"]` and `dsh.client.platform`;
 *   - the tarball must actually carry the host half, the patch and the licence;
 *   - no credential may ride along in a published file;
 *   - the catalog entry and the manifest must describe this same package.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const check = (condition, message) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`)
  if (!condition) failures.push(message)
}
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))

const pkg = readJson('package.json')
const catalog = await import(join(root, 'catalog', 'entry.mjs'))

// ---------------------------------------------------------------- package identity
check(pkg.private !== true, 'package is not private (npm would refuse otherwise)')
check(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(pkg.name), `package name is a valid npm name (${pkg.name})`)
check(/^\d+\.\d+\.\d+$/.test(pkg.version), `version is an exact stable semver (${pkg.version})`)
check(pkg.license === 'MIT' && existsSync(join(root, 'LICENSE')), 'declares MIT and ships a LICENSE')
check(Array.isArray(pkg.keywords) && pkg.keywords.includes('dsh-plugin'), 'carries the dsh-plugin keyword (topic/registry discovery)')

// ---------------------------------------------------------------- DSH declarations
const patchRel = pkg.dsh?.bundle?.patch
check(typeof patchRel === 'string' && !isAbsolute(patchRel) && !patchRel.split('/').includes('..'), `dsh.bundle.patch is a safe relative path (${patchRel})`)
check(typeof patchRel === 'string' && existsSync(join(root, patchRel)), 'the declared bundle patch exists')
check(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform is "web"')
const hostRel = pkg.exports?.['.']
const clientRel = pkg.exports?.['./client']
check(typeof hostRel === 'string' && existsSync(join(root, hostRel)), `exports["."] resolves (${hostRel})`)
check(typeof clientRel === 'string' && existsSync(join(root, clientRel)), `exports["./client"] resolves (${clientRel})`)
check(hostRel === `./${pkg.main}`, 'exports["."] matches main')

// ---------------------------------------------------------------- tarball contents
const included = (relPath) => {
  const want = relPath.split('/')
  return pkg.files.some((entry) => {
    const have = entry.split('/')
    // npm treats a bare directory entry as a prefix match.
    return want.length >= have.length && have.every((part, index) => want[index] === part)
  })
}
for (const required of ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
  check(included(required), `tarball files[] covers ${required}`)
}

// ---------------------------------------------------------------- no credentials ride along
const published = []
const walk = (relDir) => {
  for (const entry of readdirSync(join(root, relDir), { withFileTypes: true })) {
    const rel = join(relDir, entry.name)
    if (entry.isDirectory()) walk(rel)
    else published.push(rel)
  }
}
walk('lib')
published.push('cordis.patch.yml', 'README.md', 'LICENSE', 'package.json')
const SECRET_SHAPES = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{16,}/i, // fal key_id:key_secret
  /npm_[A-Za-z0-9]{20,}/,                                                          // npm token
  /gh[pousr]_[A-Za-z0-9]{20,}/,                                                    // github token
  /sk-[A-Za-z0-9]{20,}/,                                                           // openai-style key
]
const leaks = []
for (const rel of published) {
  const text = readFileSync(join(root, rel), 'utf8')
  for (const shape of SECRET_SHAPES) {
    const hit = shape.exec(text)
    if (hit !== null && !hit[0].includes('xxxxxxxx')) leaks.push(`${rel}: ${hit[0].slice(0, 12)}…`)
  }
}
check(leaks.length === 0, `no credential shape in published files${leaks.length === 0 ? '' : ` (${leaks.join(', ')})`}`)

// ------------------------------------------------- catalog describes this same package
const entry = catalog.PLUGIN
check(entry.name === pkg.name, 'catalog entry names this package')
check(entry.latestVersion === pkg.version, `catalog entry version matches package.json (${entry.latestVersion})`)
check(entry.package?.registry === 'npm' && entry.package?.name === pkg.name, 'catalog install identity is npm:<this package>')
const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
/** `git+https://host/a/b.git` and `https://host/a/b` name the same repository. */
const normalizeRepo = (value) => String(value).replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '')
check(
  typeof repoUrl === 'string' && normalizeRepo(repoUrl) === normalizeRepo(entry.repository.url),
  `package.json and catalog agree on the repository URL (${repoUrl} vs ${entry.repository.url})`,
)
check(typeof entry.homepage === 'string' && entry.homepage.startsWith('https://github.com/'), 'catalog homepage is a GitHub URL')
const manifest = catalog.buildManifest('https://example.invalid')
check(manifest.manifestVersion === '1.0.0' && manifest.transport.endpoint.endsWith('/v1/plugins'), 'manifest is v1 and its endpoint ends with /v1/plugins')
check(new URL(manifest.transport.endpoint).origin === 'https://example.invalid', 'manifest endpoint stays on the manifest origin')
check(catalog.buildPage().schemaVersion === '1.0.0', 'provider page is schemaVersion 1.0.0')

console.log(failures.length === 0 ? '\nPUBLISH GATE PASSED' : `\nPUBLISH GATE FAILED (${failures.length})`)
process.exitCode = failures.length === 0 ? 0 : 1
