/**
 * Single source of truth for this repository's community-market catalog entry.
 *
 * Consumed by two shapes of the same catalog source:
 *   - catalog/worker.js       Cloudflare Worker (serves manifest + page with
 *                             `application/json`, the reliable option)
 *   - catalog/build-static.mjs  emits the plain-file variant for a static host
 *
 * The catalog contract is the public v1 `dsh-community-market` one
 * (`manifestVersion` / `schemaVersion` `1.0.0`): a manifest at any URL plus one
 * HTTPS-JSON GET endpoint whose path ends in `/v1/plugins`, on the same origin.
 */

/** The plugin this catalog currently lists. */
export const PLUGIN = {
  id: 'fal-imagegen',
  name: 'dsh-fal-imagegen',
  displayName: 'fal 生图（fal.ai 原生）',
  summary: 'fal.ai 原生生图：FAL_KEY 设置卡片 + Agent 工具 fal_generate_image / fal_edit_image / fal_list_image_models，直连 queue.fal.run（Key 鉴权、队列轮询），默认模型 openai/gpt-image-2.5/flare。',
  homepage: 'https://github.com/wujunsheng/dsh-fal-imagegen',
  latestVersion: '0.1.0',
  license: 'MIT',
  categories: ['image-generation', 'agent-tools', 'interface'],
  keywords: ['fal', 'fal.ai', 'text-to-image', 'image-to-image', 'gpt-image-2.5', 'nano-banana', 'flux'],
  repository: { url: 'https://github.com/wujunsheng/dsh-fal-imagegen' },
  package: { registry: 'npm', name: 'dsh-fal-imagegen' },
  publisher: { name: 'wujunsheng', url: 'https://github.com/wujunsheng' },
  capabilities: {
    required: ['tools', 'settings'],
    optional: ['attachments', 'systemPrompt'],
  },
  compatibility: {
    apiVersion: '1.x',
    hosts: ['dsh>=0.1.5-rc.2'],
  },
}

/** Provider id this catalog claims; reverse-domain form, per the contract. */
export const PROVIDER_ID = 'dev.wujunsheng.dsh-fal-imagegen-catalog'

/** ISO timestamp without a locale-dependent format. */
function iso(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** The catalog source manifest (the URL a user registers). */
export function buildManifest(origin, now = new Date()) {
  return {
    manifestVersion: '1.0.0',
    providerId: PROVIDER_ID,
    name: 'dsh-fal-imagegen 目录源',
    description: '个人维护的 DSH 插件目录源，目前收录 dsh-fal-imagegen（fal.ai 原生插件）。',
    homepage: PLUGIN.homepage,
    attribution: {
      name: 'wujunsheng',
      url: 'https://github.com/wujunsheng',
    },
    transport: {
      kind: 'https-json',
      endpoint: `${origin}/v1/plugins`,
      method: 'GET',
    },
    query: {
      supported: ['q', 'category', 'cursor', 'limit'],
      defaultLimit: 50,
      maxLimit: 50,
      sorts: [],
    },
    updatedAt: iso(now),
  }
}

/** One standard provider page (the endpoint response). */
export function buildPage(now = new Date()) {
  return {
    schemaVersion: '1.0.0',
    generatedAt: iso(now),
    revision: iso(now),
    items: [{ ...PLUGIN, updatedAt: iso(now) }],
    page: { total: 1 },
  }
}
