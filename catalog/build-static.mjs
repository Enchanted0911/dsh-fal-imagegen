/**
 * Emit the plain-file variant of the catalog source.
 *
 *   node catalog/build-static.mjs                 # placeholder host
 *   node catalog/build-static.mjs https://wujunsheng.github.io/dsh-fal-imagegen
 *
 * Writes `static/catalog-source.json` and `static/v1/plugins`, which a static
 * host (GitHub Pages, serving this directory as the site root) exposes at
 * `<origin>/catalog-source.json` and `<origin>/v1/plugins`.
 *
 * Caveat: a static host picks the content type from the file extension, so the
 * extensionless `/v1/plugins` is usually served as `application/octet-stream`.
 * The v1 contract asks for JSON over HTTPS; if the market refuses the static
 * form, deploy `catalog/worker.js` instead — it sets the header explicitly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildManifest, buildPage, PLUGIN } from './entry.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = join(here, 'static')
const origin = process.argv[2] ?? 'https://REPLACE-WITH-YOUR-STATIC-HOST'

// Keep the catalog's version honest against the package it describes.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (pkg.version !== PLUGIN.latestVersion) {
  console.warn(`warning: catalog entry says ${PLUGIN.latestVersion} but package.json says ${pkg.version}`)
}

mkdirSync(join(out, 'v1'), { recursive: true })
writeFileSync(join(out, 'catalog-source.json'), `${JSON.stringify(buildManifest(origin), null, 2)}\n`)
writeFileSync(join(out, 'v1', 'plugins'), `${JSON.stringify(buildPage(), null, 2)}\n`)
console.log(`wrote static/catalog-source.json (origin ${origin}) and static/v1/plugins`)
