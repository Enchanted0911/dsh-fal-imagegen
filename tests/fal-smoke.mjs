/**
 * Standalone smoke test for the plugin's fal client (no DSH involvement).
 * Usage: node /tmp/fal-smoke.mjs
 */
import { falRun, falFetchBytes, falKeyProblem, FalError } from '../lib/fal.js'
import { detectMime, imageDimensions, resolveSizeParams, normalizeQuality } from '../lib/image-meta.js'
import { resolveEndpoint } from '../lib/presets.js'

const KEY = process.env.FAL_KEY ?? ''
console.log('key problem:', falKeyProblem(KEY) ?? 'none')

const endpoint = resolveEndpoint('gpt-image-2.5-flash', 'openai/gpt-image-2.5/flare/text-to-image', 'text')
console.log('resolved alias gpt-image-2.5-flash ->', endpoint.slug, '| sizeParam:', endpoint.sizeParam, '| quality:', endpoint.supportsQuality)

const input = {
  prompt: 'a single red apple on a white table, product photo, soft studio light',
  ...resolveSizeParams('1:1', endpoint.sizeParam),
  quality: normalizeQuality('low'),
  output_format: 'png',
  num_images: 1,
}
console.log('input:', JSON.stringify(input))

try {
  const started = Date.now()
  const { requestId, response } = await falRun({
    slug: endpoint.slug,
    input,
    apiKey: KEY,
    timeoutMs: 240_000,
    onProgress: (event) => console.log('  queue:', event.status, event.queuePosition ?? ''),
  })
  console.log(`request ${requestId} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  const images = response.images ?? []
  console.log('images:', images.length, JSON.stringify(images[0] ?? {}).slice(0, 220))

  const first = images[0]
  const { bytes, contentType } = await falFetchBytes(first.url)
  const mime = detectMime(bytes)
  const dims = imageDimensions(bytes)
  console.log('downloaded bytes:', bytes.byteLength, '| content-type:', contentType, '| magic:', mime, '| parsed dims:', JSON.stringify(dims), '| fal dims:', first.width, 'x', first.height)
  if (mime !== 'image/png') throw new Error(`expected png, got ${mime}`)
  // fal reports width/height as null on this endpoint; the local parser is the
  // only source, and the plugin falls back to it.
  if (dims === undefined) throw new Error('dimension parse failed')
  if (first.width !== null && dims.width !== first.width) throw new Error('dimension mismatch')
  if (first.height !== null && dims.height !== first.height) throw new Error('dimension mismatch')
  console.log('SMOKE TEST PASSED')
} catch (error) {
  if (error instanceof FalError) console.error('FAL ERROR', error.code, error.message)
  else console.error('ERROR', error)
  process.exitCode = 1
}
