/**
 * dsh-fal-imagegen — fal.ai native image generation for DSH (host half).
 *
 * The plugin exists because fal speaks its own protocol: `queue.fal.run/<slug>`
 * with `Authorization: Key <FAL_KEY>`, a queue ticket to poll, and endpoints
 * that answer `{ images: [{ url }] }`. That shape does not fit an
 * OpenAI-compatible channel, so this plugin owns the whole path: a settings
 * section for the key and defaults, a direct fal client, and the Agent tools
 * `fal_generate_image` / `fal_edit_image` / `fal_list_image_models`.
 *
 * Generated images are saved as harness attachments (so they render beside the
 * tool call) and as files on disk (so they can be edited again by path).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from 'schemastery'
import { FalError, falFetchBytes, falKeyProblem, falRun } from './fal.js'
import {
  bytesToBase64,
  detectMime,
  extensionForMime,
  imageDimensions,
  normalizeFormat,
  normalizeQuality,
  resolveSizeParams,
} from './image-meta.js'
import { listPresets, resolveEndpoint } from './presets.js'
import { installSettingsSectionCompat, settingsNamespaceCompat } from './settings-compat.js'

export const name = 'dsh-fal-imagegen'
export const inject = ['tools', 'attachments', 'systemPrompt']

/** The settings namespace this plugin's section is registered under. */
export const FAL_IMAGE_SETTINGS_NAMESPACE = 'dsh-fal-imagegen'
export const FalImageSettingsNamespace = settingsNamespaceCompat(FAL_IMAGE_SETTINGS_NAMESPACE)

export const DEFAULT_TEXT_MODEL = 'openai/gpt-image-2.5/flare/text-to-image'
export const DEFAULT_EDIT_MODEL = 'openai/gpt-image-2.5/flare/edit'

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 152
/** A reference image read from disk is capped so one call cannot blow up memory. */
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024

/**
 * Plugin config. Flat on purpose: every field renders and saves in the generic
 * settings card, so the plugin is usable without any browser half.
 */
export const Config = z.object({
  /** Master switch for the tools and the prompt section. */
  enabled: z.boolean().default(true),
  /** fal API key in `key_id:key_secret` form (stored as a secret). */
  falKey: z.string().role('secret').default(''),
  /** Endpoint used for text-to-image (a fal slug). */
  defaultTextToImageModel: z.string().default(DEFAULT_TEXT_MODEL),
  /** Endpoint used for image-to-image (a fal slug). */
  defaultImageToImageModel: z.string().default(DEFAULT_EDIT_MODEL),
  /** Size sent when a call does not name one: a ratio, WxH, fal preset, or auto. */
  defaultImageSize: z.string().default('1:1'),
  /** Quality tier for endpoints that document one. */
  quality: z.string().default('high'),
  /** Output image format: png, jpeg, webp. */
  outputFormat: z.string().default('png'),
  /** Total budget for one fal request, in seconds. */
  timeoutSeconds: z.number().default(300),
  /** Directory generated images are copied to; empty uses <DSH_HOME>/fal-imagegen. */
  saveDir: z.string().default(''),
  /** Announce the plugin in every agent's system prompt. */
  announceToAgent: z.boolean().default(true),
})

/** Schema defaults, re-read for hand-built contexts. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  falKey: '',
  defaultTextToImageModel: DEFAULT_TEXT_MODEL,
  defaultImageToImageModel: DEFAULT_EDIT_MODEL,
  defaultImageSize: '1:1',
  quality: 'high',
  outputFormat: 'png',
  timeoutSeconds: 300,
  saveDir: '',
  announceToAgent: true,
})

/** Model-facing announcement: plugin presence, tools, and limits. */
export const FAL_IMAGEGEN_GUIDANCE = [
  '本机已安装 dsh-fal-imagegen 插件（fal.ai 原生生图，宿主半）：Agent 工具 `fal_generate_image`（文生图）、`fal_edit_image`（图生图，参考图传附件引用 source_image 或本机绝对路径 image_path）、`fal_list_image_models`（列出内置 fal 别名）。',
  `默认模型「gpt-image-2.5-flare」= ${DEFAULT_TEXT_MODEL}（fal 上没有 "flash" 这个名字，flare 就是它的默认快档；图生图为 .../flare/edit）。`,
  '尺寸可用 1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9、1024x1536 这样的像素值或 auto；质量档 auto/low/medium/high/xhigh/max（nano-banana、gemini、flux 档端点不支持 quality，插件会自动省略）；也可直接传 fal slug（含 "/" 即视为端点原样调用）。',
  '生成的图片同时（1）作为附件显示在工具调用旁（模型只收到 attachment 引用与本地路径文本）、（2）写入本地目录；把返回的 path 交给 `fal_edit_image` 的 image_path 即可继续编辑。',
  'FAL_KEY 在「设置 → 插件」的 fal 生图设置段配置（namespace dsh-fal-imagegen），密钥只存本机设置文档；生成消耗 fal 额度，图片由 fal 侧模型产出。用户提到「fal 生图 / 文生图 / 图生图」时即指本插件；本插件工具名一律带 fal_ 前缀。',
].join('')

/** Effective config after defaults and trimming. */
function normalizeConfig(value) {
  const raw = value ?? {}
  const seconds = Number(raw.timeoutSeconds)
  return {
    enabled: raw.enabled !== false,
    falKey: text(raw.falKey),
    textModel: text(raw.defaultTextToImageModel) === '' ? DEFAULT_TEXT_MODEL : text(raw.defaultTextToImageModel),
    editModel: text(raw.defaultImageToImageModel) === '' ? DEFAULT_EDIT_MODEL : text(raw.defaultImageToImageModel),
    imageSize: text(raw.defaultImageSize) === '' ? '1:1' : text(raw.defaultImageSize),
    quality: text(raw.quality) === '' ? 'high' : text(raw.quality),
    outputFormat: text(raw.outputFormat) === '' ? 'png' : text(raw.outputFormat),
    timeoutMs: (Number.isFinite(seconds) && seconds >= 30 ? seconds : 300) * 1000,
    saveDir: text(raw.saveDir),
    announce: raw.announceToAgent !== false,
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Where generated images are copied; DSH_HOME mirrors the harness data root. */
function imageDir(config) {
  if (config.saveDir !== '') return config.saveDir
  const root = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(root, 'fal-imagegen')
}

/** Fail early with an actionable message instead of a raw API error. */
function ensureConfigured(config) {
  if (!config.enabled) {
    throw new Error('fal 生图插件已被关闭：请在「设置 → 插件」的 fal 生图卡片里打开总开关。')
  }
  const problem = falKeyProblem(config.falKey)
  if (problem !== undefined) throw new Error(problem)
}

const imageRefSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    attachment_id: { type: 'string', required: true },
    media_type: { type: 'string', required: true },
    bytes: { type: 'integer', required: true },
    width: { type: 'integer', required: true },
    height: { type: 'integer', required: true },
    name: { type: 'string' },
    path: { type: 'string' },
  },
}

const taskResultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', required: true },
    model: { type: 'string', required: true },
    mode: { type: 'string' },
    request_id: { type: 'string' },
    message: { type: 'string', required: true },
    error: { type: 'string' },
    images: { type: 'array', required: true, items: imageRefSchema },
  },
}

/** The UI-only projection that keeps generated images beside the tool call. */
function imagePresentationMeta(value) {
  const images = Array.isArray(value?.images) ? value.images : []
  return {
    images: images.flatMap(image => typeof image?.attachment_id === 'string'
      ? [{
        attachment_id: image.attachment_id,
        media_type: image.media_type,
        bytes: image.bytes,
        width: image.width,
        height: image.height,
        ...typeof image.name === 'string' ? { name: image.name } : {},
      }]
      : []),
  }
}

/** Rehydrate the attachment blocks the conversation view renders. */
function presentImageResult(_args, result) {
  if (result?.isError === true) return undefined
  const raw = Array.isArray(result?.meta?.images) ? result.meta.images : []
  const content = raw.flatMap(image => typeof image?.attachment_id === 'string'
    ? [{
      type: 'image',
      attachment: {
        attachmentId: image.attachment_id,
        mediaType: image.media_type,
        bytes: image.bytes,
        width: image.width,
        height: image.height,
        ...typeof image.name === 'string' ? { name: image.name } : {},
      },
    }]
    : [])
  return content.length === 0 ? undefined : { card: 'generic', content }
}

function renderTaskResult(value) {
  // Images are presentation output, never model input: the model-facing result
  // stays textual (references + local paths) so text-only models still work.
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** Hard-fail on a malformed reference rather than crashing inside the client. */
function attachmentRefFrom(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('source_image 必须是 fal_generate_image 返回的 images[] 元素（原样传回）。')
  }
  const raw = value
  const mediaType = text(raw.media_type)
  if (typeof raw.attachment_id !== 'string' || raw.attachment_id === '' || !mediaType.startsWith('image/')) {
    throw new Error('source_image 缺少 attachment_id / media_type：请把上一次生成结果里的 images[0] 原样传入。')
  }
  return {
    attachmentId: raw.attachment_id,
    mediaType,
    bytes: Number.isFinite(raw.bytes) ? raw.bytes : 0,
    width: Number.isFinite(raw.width) ? raw.width : 0,
    height: Number.isFinite(raw.height) ? raw.height : 0,
    ...typeof raw.name === 'string' && raw.name !== '' ? { name: raw.name } : {},
  }
}

/** Read a reference image from the local filesystem into a data URI. */
async function referenceFromPath(path) {
  const wanted = text(path)
  if (wanted === '') throw new Error('image_path 不能为空。')
  let bytes
  try {
    bytes = await readFile(wanted)
  } catch (error) {
    throw new Error(`读不到参考图 ${wanted}：${error instanceof Error ? error.message : String(error)}`)
  }
  if (bytes.byteLength > MAX_REFERENCE_BYTES) {
    throw new Error(`参考图 ${wanted} 超过 ${Math.round(MAX_REFERENCE_BYTES / 1024 / 1024)}MB 上限，请先缩小再试。`)
  }
  const mime = detectMime(bytes)
  if (mime === undefined) throw new Error(`${wanted} 看起来不是 PNG/JPEG/WebP/GIF 图片。`)
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
}

/**
 * Run one endpoint and materialize its images: download/decode every result,
 * store the batch as attachments, copy the bytes to the local directory.
 */
async function runAndCollect(ctx, config, options) {
  const { slug, input, mode, source, signal, notify } = options
  const { requestId, response } = await falRun({
    slug,
    input,
    apiKey: config.falKey,
    timeoutMs: config.timeoutMs,
    signal,
    onProgress: notify,
  })

  const entries = Array.isArray(response.images) ? response.images : []
  if (entries.length === 0) {
    throw new Error(`fal 端点 ${slug} 没有返回任何图片（响应：${JSON.stringify(response).slice(0, 300)}）。`)
  }

  const collected = []
  for (const entry of entries) {
    const url = typeof entry?.url === 'string' ? entry.url : ''
    const fetched = await falFetchBytes(url, { signal })
    const bytes = fetched.bytes
    const mime = detectMime(bytes) ?? normalizeMime(entry?.content_type) ?? normalizeMime(fetched.contentType) ?? 'image/png'
    const declared = { width: entry?.width, height: entry?.height }
    const measured = imageDimensions(bytes)
    const width = Number.isFinite(declared.width) ? declared.width : measured?.width
    const height = Number.isFinite(declared.height) ? declared.height : measured?.height
    collected.push({ bytes, mime, width, height })
  }

  const base = `${Date.now().toString(36)}-${slug.split('/').slice(-2).join('-')}`
    .replace(/[^a-z0-9-]/gi, '-')
  const dir = imageDir(config)
  const inputs = collected.map((item, index) => ({
    data: item.bytes,
    mediaType: item.mime,
    name: `fal-${base}-${index + 1}.${extensionForMime(item.mime)}`,
  }))
  const refs = await ctx.attachments.saveImages(inputs)

  await mkdir(dir, { recursive: true })
  const images = []
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index]
    const item = collected[index]
    const name = ref.name ?? inputs[index].name
    const path = join(dir, name)
    try {
      await writeFile(path, item.bytes)
    } catch { /* the attachment is the durable copy; the disk copy is a bonus */ }
    images.push({
      attachment_id: ref.attachmentId,
      media_type: ref.mediaType ?? item.mime,
      bytes: ref.bytes ?? item.bytes.byteLength,
      width: ref.width ?? item.width ?? 0,
      height: ref.height ?? item.height ?? 0,
      name,
      path,
    })
  }

  return {
    status: 'completed',
    model: slug,
    request_id: requestId,
    mode,
    message: [
      `生成完成：${images.length} 张（${slug}）。`,
      source === undefined ? '' : `参考图：${source}。`,
      `图片已作为附件显示在这次工具调用旁，并写入 ${dir}。`,
      '要继续编辑，把返回的 path 传给 fal_edit_image 的 image_path 即可。',
    ].filter(part => part !== '').join(' '),
    images,
  }
}

function normalizeMime(value) {
  const wanted = text(value).toLowerCase()
  if (wanted === 'image/jpg') return 'image/jpeg'
  return wanted.startsWith('image/') ? wanted : undefined
}

/** Register the fal image tools against the live settings. */
function registerTools(ctx, resolve) {
  return [
    ctx.tools.register(defineTool({
      name: 'fal_generate_image',
      description:
        'Generate an image through fal.ai (native fal protocol: queue.fal.run + Authorization: Key). '
        + 'Generation waits for the queue to finish and returns attachment references plus local file paths; '
        + 'the images render beside this tool call. Only fal endpoints are allowed: pass one of the built-in aliases '
        + '(gpt-image-2.5-flare is the default and equals the fastest GPT Image 2.5 tier, gpt-image-2.5-sunburst, '
        + 'gpt-image-2, gpt-image-1.5, nano-banana-2, gemini-25-flash-image, flux-2-flash) or a raw fal slug containing "/". '
        + 'Call fal_list_image_models to see the catalog.',
      parameters: {
        prompt: { type: 'string', required: true, description: 'Detailed image-generation prompt.' },
        model: { type: 'string', description: 'Built-in fal alias or raw fal endpoint slug. Defaults to the configured text-to-image endpoint.' },
        size: { type: 'string', description: 'Aspect ratio (1:1, 16:9, 9:16, …), a WxH pixel pair, or auto. Defaults to the configured size.' },
        quality: { type: 'string', description: 'auto, low, medium, high, xhigh, or max. Ignored by endpoints that do not document a quality tier.' },
        count: { type: 'integer', description: 'Number of images, 1 to 4. Defaults to 1.' },
      },
      output: {
        schema: taskResultSchema,
        render: (_args, value) => renderTaskResult(value),
        presentationMeta: (_args, value) => imagePresentationMeta(value),
      },
      presentResult: presentImageResult,
      async execute(args, exec) {
        const config = resolve()
        ensureConfigured(config)
        const endpoint = resolveEndpoint(args.model, config.textModel, 'text')
        const input = {
          prompt: text(args.prompt),
          ...resolveSizeParams(args.size ?? config.imageSize, endpoint.sizeParam),
          output_format: normalizeFormat(config.outputFormat),
          num_images: clampCount(args.count),
          ...endpoint.supportsQuality ? { quality: normalizeQuality(args.quality ?? config.quality) } : {},
        }
        if (input.prompt === '') throw new Error('prompt 不能为空。')
        return runAndCollect(ctx, config, {
          slug: endpoint.slug,
          input,
          mode: 'text-to-image',
          signal: exec?.signal,
        })
      },
    })),
    ctx.tools.register(defineTool({
      name: 'fal_edit_image',
      description:
        'Edit an existing image through fal.ai (image-to-image). Provide the source as source_image (an images[] element '
        + 'returned by fal_generate_image, passed through unchanged) or as image_path (an absolute local file path, e.g. the '
        + 'path returned by a previous generation). The matching fal /edit endpoint is used automatically for built-in aliases. '
        + 'The result renders beside this tool call and is also written to disk.',
      parameters: {
        prompt: { type: 'string', required: true, description: 'How to transform the source image.' },
        source_image: { ...imageRefSchema, description: 'An images[] element from fal_generate_image / fal_edit_image. Omit it when image_path is given.' },
        image_path: { type: 'string', description: 'Absolute path of a local image to edit. Alternative to source_image.' },
        model: { type: 'string', description: 'Built-in fal alias or raw fal /edit endpoint slug. Defaults to the configured image-to-image endpoint.' },
        size: { type: 'string', description: 'Aspect ratio (1:1, 16:9, …), a WxH pixel pair, or auto (fal infers from the reference).' },
        quality: { type: 'string', description: 'auto, low, medium, high, xhigh, or max.' },
        count: { type: 'integer', description: 'Number of images, 1 to 4. Defaults to 1.' },
      },
      output: {
        schema: taskResultSchema,
        render: (_args, value) => renderTaskResult(value),
        presentationMeta: (_args, value) => imagePresentationMeta(value),
      },
      presentResult: presentImageResult,
      async execute(args, exec) {
        const config = resolve()
        ensureConfigured(config)
        const endpoint = resolveEndpoint(args.model, config.editModel, 'edit')
        const prompt = text(args.prompt)
        if (prompt === '') throw new Error('prompt 不能为空。')

        let reference
        let origin
        if (args.source_image !== undefined && args.source_image !== null) {
          const ref = attachmentRefFrom(args.source_image)
          const image = await ctx.attachments.readImage(ref, exec?.signal)
          reference = `data:${image.ref.mediaType};base64,${bytesToBase64(image.data)}`
          origin = `附件 ${image.ref.name ?? ref.attachmentId}`
        } else if (text(args.image_path) !== '') {
          reference = await referenceFromPath(args.image_path)
          origin = basename(text(args.image_path))
        } else {
          throw new Error('需要一张参考图：传 source_image（生成结果的 images[] 元素）或 image_path（本机绝对路径）。')
        }

        const input = {
          prompt,
          image_urls: [reference],
          output_format: normalizeFormat(config.outputFormat),
          num_images: clampCount(args.count),
          ...resolveSizeParams(args.size ?? 'auto', endpoint.sizeParam),
          ...endpoint.supportsQuality ? { quality: normalizeQuality(args.quality ?? config.quality) } : {},
        }
        return runAndCollect(ctx, config, {
          slug: endpoint.slug,
          input,
          mode: 'image-to-image',
          source: origin,
          signal: exec?.signal,
        })
      },
    })),
    ctx.tools.register(defineTool({
      name: 'fal_list_image_models',
      description:
        'List the fal image endpoints this plugin knows (alias → text-to-image and image-to-image slug), with the '
        + 'currently configured defaults. Use it before picking a model for fal_generate_image / fal_edit_image.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute() {
        const config = resolve()
        return {
          configured: {
            enabled: config.enabled,
            key_configured: falKeyProblem(config.falKey) === undefined,
            default_text_to_image: config.textModel,
            default_image_to_image: config.editModel,
            default_size: config.imageSize,
            default_quality: config.quality,
            timeout_seconds: Math.round(config.timeoutMs / 1000),
            save_dir: imageDir(config),
          },
          presets: listPresets(),
          note: 'Any other fal slug containing "/" is also accepted and called as-is.',
        }
      },
    })),
  ]
}

function clampCount(value) {
  const wanted = Number(value)
  if (!Number.isFinite(wanted)) return 1
  return Math.min(4, Math.max(1, Math.round(wanted)))
}

/**
 * Mount the settings section, the Agent tools, and the prompt announcement.
 *
 * @param ctx - host plugin context carrying tools / attachments / systemPrompt.
 * @param config - the composition entry for this plugin row.
 */
export function apply(ctx, config) {
  let current = () => config ?? DEFAULTS
  const resolve = () => normalizeConfig(current())

  const disposers = registerTools(ctx, resolve)

  let disposeSection
  const sync = () => {
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    const value = resolve()
    if (!value.enabled || !value.announce) return
    disposeSection = ctx.systemPrompt.section({
      name: 'plugin:dsh-fal-imagegen',
      order: SECTION_ORDER,
      text: `${FAL_IMAGEGEN_GUIDANCE}当前默认模型：${value.textModel}（图生图 ${value.editModel}）；本地输出目录：${imageDir(value)}。`,
    })
  }

  installSettingsSectionCompat(ctx, FalImageSettingsNamespace, Config, { ...DEFAULTS }, {
    setSource: (source) => {
      current = source
      sync()
    },
    onChange: sync,
  })

  // Composition entries without a settings service keep the initial config.
  sync()

  return () => {
    for (const dispose of disposers) dispose()
    if (disposeSection !== undefined) disposeSection()
  }
}

export { FalError }
