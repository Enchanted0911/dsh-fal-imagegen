/**
 * Catalog source as a Cloudflare Worker.
 *
 * Deploying this worker gives the plugin a community-market source: the
 * manifest is served at `/catalog-source.json` (its `transport.endpoint` is
 * filled from the request origin, so it is always self-consistent) and the
 * provider page at `/v1/plugins` — the exact path the v1 contract requires,
 * served with `application/json` (a static host cannot set a JSON content type
 * for an extensionless path, which is why this worker is the recommended form).
 *
 *   cd catalog && npx wrangler deploy
 *
 * Then register `https://<worker>.<account>.workers.dev/catalog-source.json`
 * as a source in DSH's plugin market.
 */
import { buildManifest, buildPage } from './entry.mjs'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=300',
  'access-control-allow-origin': '*',
}

function json(value, status = 200) {
  return new Response(`${JSON.stringify(value, null, 2)}\n`, { status, headers: JSON_HEADERS })
}

export default {
  fetch(request) {
    const url = new URL(request.url)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'method not allowed' }, 405)
    }
    if (url.pathname === '/' || url.pathname === '/catalog-source.json') {
      return json(buildManifest(url.origin))
    }
    if (url.pathname === '/v1/plugins') {
      // The contract only supports q / category / cursor / limit; the catalog
      // holds one entry, so every query is answered by the same page.
      return json(buildPage())
    }
    return json({ error: 'not found' }, 404)
  },
}
