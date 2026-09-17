/**
 * Size mapping and image metadata decoding.
 *
 * fal endpoints document two different size vocabularies: the OpenAI gpt-image
 * family (and FLUX) take `image_size` — a preset name, an explicit
 * { width, height }, or 'auto' — while the Gemini / Nano Banana family takes an
 * `aspect_ratio` string. Both vocabularies are satisfied here so a tool call
 * can accept the same "1:1 / 16:9 / auto / 1024x1536" vocabulary everywhere.
 *
 * Explicit pixel sizes respect fal's documented constraints: both edges are
 * multiples of 16, the max edge is 3840px, the aspect ratio stays at or below
 * 3:1, and total pixels land between 655,360 and 8,294,400.
 */

/** Ratio → pixel pair for endpoints that take an explicit image_size object. */
const RATIO_PIXELS = Object.freeze({
  '1:1': { width: 1024, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
  '3:2': { width: 1152, height: 768 },
  '2:3': { width: 768, height: 1152 },
  '16:9': { width: 1536, height: 864 },
  '9:16': { width: 864, height: 1536 },
  '21:9': { width: 1792, height: 768 },
})

/** Ratios the aspect_ratio family documents (the panel vocabulary is a superset). */
const ASPECT_RATIOS = new Set(['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'])

/** fal's own image_size preset names, passed through untouched. */
const FAL_SIZE_PRESETS = new Set([
  'square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9', 'auto',
])

/**
 * Build the size fields for one request.
 *
 * @param value - the requested size: a ratio, a WxH pair, a fal preset, or ''.
 * @param sizeParam - which field the endpoint documents.
 * @returns the request fragment (empty for 'auto' on the aspect_ratio family).
 */
export function resolveSizeParams(value, sizeParam) {
  const wanted = typeof value === 'string' ? value.trim() : ''
  if (wanted === '' || wanted === 'auto') {
    return sizeParam === 'aspect_ratio' ? {} : { image_size: 'auto' }
  }
  if (sizeParam === 'aspect_ratio') {
    if (ASPECT_RATIOS.has(wanted)) return { aspect_ratio: wanted }
    // An explicit WxH pair is not part of the aspect_ratio vocabulary: fal
    // infers the shape from the reference image, so send 'auto' instead.
    return { aspect_ratio: 'auto' }
  }
  if (FAL_SIZE_PRESETS.has(wanted)) return { image_size: wanted }
  const pair = /^(\d{3,4})\s*[x×]\s*(\d{3,4})$/i.exec(wanted)
  if (pair !== null) {
    const width = Number(pair[1])
    const height = Number(pair[2])
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { image_size: { width, height } }
    }
  }
  const known = RATIO_PIXELS[wanted]
  if (known !== undefined) return { image_size: { ...known } }
  throw new Error(`无法识别的尺寸「${wanted}」：可用 1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9、1024x1536 这样的像素值，或 auto。`)
}

/** Normalize the quality tier for endpoints that document one. */
export function normalizeQuality(value) {
  const wanted = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (wanted === '') return 'high'
  const allowed = new Set(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
  if (allowed.has(wanted)) return wanted
  // Panel-style tiers map onto the documented ladder.
  if (wanted === '1k') return 'low'
  if (wanted === '2k') return 'medium'
  if (wanted === '4k') return 'high'
  throw new Error(`无法识别的质量档「${value}」：可用 auto / low / medium / high / xhigh / max。`)
}

/** Normalize the output format. */
export function normalizeFormat(value) {
  const wanted = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (wanted === '') return 'png'
  if (wanted === 'jpg') return 'jpeg'
  if (['png', 'jpeg', 'webp'].includes(wanted)) return wanted
  throw new Error(`无法识别的输出格式「${value}」：可用 png / jpeg / webp。`)
}

/** Detect an image media type from magic bytes; undefined when unknown. */
export function detectMime(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  return undefined
}

/**
 * Read image dimensions from the encoded header.
 *
 * Attachment references must carry width and height. fal usually reports both,
 * but they are nullable in its schema — this is the local fallback.
 */
export function imageDimensions(bytes) {
  const mime = detectMime(bytes)
  try {
    if (mime === 'image/png' && bytes.length >= 24) {
      return { width: readU32BE(bytes, 16), height: readU32BE(bytes, 20) }
    }
    if (mime === 'image/jpeg') return jpegDimensions(bytes)
    if (mime === 'image/webp') return webpDimensions(bytes)
    if (mime === 'image/gif' && bytes.length >= 10) {
      return { width: readU16LE(bytes, 6), height: readU16LE(bytes, 8) }
    }
  } catch {
    return undefined
  }
  return undefined
}

function jpegDimensions(bytes) {
  let index = 2
  while (index + 9 < bytes.length) {
    if (bytes[index] !== 0xff) { index += 1; continue }
    const marker = bytes[index + 1]
    if (marker === 0xff) { index += 1; continue }
    // SOF0…SOF15 minus the DHT/JPG/DAC markers that share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: readU16BE(bytes, index + 7), height: readU16BE(bytes, index + 5) }
    }
    const length = readU16BE(bytes, index + 2)
    if (length < 2) return undefined
    index += 2 + length
  }
  return undefined
}

function webpDimensions(bytes) {
  if (bytes.length < 30) return undefined
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (chunk === 'VP8X') {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    }
  }
  if (chunk === 'VP8 ') {
    return { width: readU16LE(bytes, 26) & 0x3fff, height: readU16LE(bytes, 28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  return undefined
}

function readU16BE(bytes, at) { return (bytes[at] << 8) | bytes[at + 1] }
function readU16LE(bytes, at) { return bytes[at] | (bytes[at + 1] << 8) }
function readU32BE(bytes, at) {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
}

/** File extension for a stored image. */
export function extensionForMime(mime) {
  if (mime === 'image/jpeg') return 'jpg'
  return mime.startsWith('image/') ? mime.slice('image/'.length) : 'bin'
}

/** Base64 of a byte buffer (data-URI payloads for fal reference images). */
export function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64')
}

/** Decode a `data:<mime>;base64,<payload>` URI. */
export function parseDataUri(value) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value.trim())
  if (match === null || match[3] === undefined || match[2] === undefined) return undefined
  return { mime: match[1] ?? 'application/octet-stream', bytes: Buffer.from(match[3], 'base64') }
}
