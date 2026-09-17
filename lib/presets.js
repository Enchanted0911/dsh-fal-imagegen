/**
 * Built-in fal.ai image-model presets.
 *
 * Every slug below was verified against fal's own endpoint schema
 * (`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<slug>`), so a
 * preset never points at a non-existent endpoint. Users may still pass a raw
 * slug containing "/" to the tools — presets are convenience, not a gate.
 *
 * `sizeParam` records which size field the endpoint documents:
 *   - 'image_size'   OpenAI gpt-image family and FLUX (image_size)
 *   - 'aspect_ratio' Gemini / Nano Banana family (aspect_ratio)
 * `quality` records whether the endpoint documents a quality tier.
 */

export const MODEL_PRESETS = [
  {
    alias: 'gpt-image-2.5-flare',
    extraAliases: ['gpt-image-2.5', 'gpt-image-2.5-flash'],
    label: 'GPT Image 2.5 Flare',
    textToImage: 'openai/gpt-image-2.5/flare/text-to-image',
    imageToImage: 'openai/gpt-image-2.5/flare/edit',
    sizeParam: 'image_size',
    quality: true,
    note: 'OpenAI 的默认档：快、质量高；fal 上没有 "flash" 这个名字，flare 就是它。',
  },
  {
    alias: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst',
    textToImage: 'openai/gpt-image-2.5/sunburst/text-to-image',
    imageToImage: 'openai/gpt-image-2.5/sunburst/edit',
    sizeParam: 'image_size',
    quality: true,
    note: '细节优先档，更慢也更贵。',
  },
  {
    alias: 'gpt-image-2',
    label: 'GPT Image 2',
    textToImage: 'openai/gpt-image-2',
    imageToImage: 'openai/gpt-image-2/edit',
    sizeParam: 'image_size',
    quality: true,
    note: '上一代 GPT Image。',
  },
  {
    alias: 'gpt-image-1.5',
    label: 'GPT-Image 1.5',
    textToImage: 'fal-ai/gpt-image-1.5',
    imageToImage: 'fal-ai/gpt-image-1.5/edit',
    sizeParam: 'image_size',
    quality: true,
    note: '更便宜的 GPT Image 档。',
  },
  {
    alias: 'nano-banana-2',
    label: 'Nano Banana 2 (Google)',
    textToImage: 'fal-ai/nano-banana-2',
    imageToImage: 'fal-ai/nano-banana-2/edit',
    sizeParam: 'aspect_ratio',
    quality: false,
    note: 'Google 系，尺寸走 aspect_ratio，不支持 quality。',
  },
  {
    alias: 'gemini-25-flash-image',
    label: 'Gemini 2.5 Flash Image',
    textToImage: 'fal-ai/gemini-25-flash-image',
    imageToImage: 'fal-ai/gemini-25-flash-image/edit',
    sizeParam: 'aspect_ratio',
    quality: false,
    note: 'Gemini 图像档，尺寸走 aspect_ratio。',
  },
  {
    alias: 'flux-2-flash',
    label: 'FLUX.2 Flash',
    textToImage: 'fal-ai/flux-2/flash',
    imageToImage: 'fal-ai/flux-2/flash/edit',
    sizeParam: 'image_size',
    quality: false,
    note: 'FLUX 快速档，支持 image_size，不支持 quality。',
  },
]

/** A raw slug (contains a slash) is used verbatim, with a sibling edit guess. */
export function presetBySlug(slug) {
  const wanted = slug.trim()
  return MODEL_PRESETS.find(preset => preset.textToImage === wanted || preset.imageToImage === wanted)
}

/** Resolve an alias, a raw slug, or '' (fall back to the configured default). */
export function presetByAlias(value) {
  const wanted = value.trim().toLowerCase()
  if (wanted === '') return undefined
  return MODEL_PRESETS.find(preset =>
    preset.alias === wanted
    || (preset.extraAliases ?? []).includes(wanted)
    || preset.textToImage.toLowerCase() === wanted
    || preset.imageToImage.toLowerCase() === wanted)
}

/**
 * Resolve the endpoint a tool call must hit.
 *
 * @param requested - the tool's `model` argument (alias or fal slug), may be ''.
 * @param fallback - the configured default slug for this mode.
 * @param mode - 'text' for text-to-image, 'edit' for image-to-image.
 * @returns the preset (when known) plus the concrete slug to call.
 * @throws {Error} when an edit call resolves to an endpoint that cannot edit.
 */
export function resolveEndpoint(requested, fallback, mode) {
  const want = typeof requested === 'string' ? requested.trim() : ''
  const known = want === '' ? presetBySlug(fallback) : presetByAlias(want)
  const slug = known === undefined
    ? (want === '' ? fallback.trim() : want)
    : (mode === 'edit' ? known.imageToImage : known.textToImage)

  if (slug === '') {
    throw new Error('未配置模型：请在「设置 → 插件」的 fal 生图卡片里填写默认模型。')
  }
  if (mode === 'edit' && known === undefined && /\/text-to-image$|^[^/]+$/.test(slug)) {
    // A raw slug that is clearly a text-to-image endpoint cannot edit.
    throw new Error(`模型端点「${slug}」不是图生图端点：请改用带 /edit 的 slug，或用内置别名（如 gpt-image-2.5-flare）。`)
  }
  return {
    slug,
    preset: known,
    sizeParam: known?.sizeParam ?? (known === undefined && /nano-banana|gemini/.test(slug) ? 'aspect_ratio' : 'image_size'),
    supportsQuality: known?.quality ?? !/nano-banana|gemini|flux/.test(slug),
    label: known?.label ?? slug,
  }
}

/** Compact catalog for the Agent-facing model list tool and the prompt section. */
export function listPresets() {
  return MODEL_PRESETS.map(preset => ({
    alias: preset.alias,
    label: preset.label,
    text_to_image: preset.textToImage,
    image_to_image: preset.imageToImage,
    size_parameter: preset.sizeParam,
    quality: preset.quality,
    note: preset.note,
  }))
}
