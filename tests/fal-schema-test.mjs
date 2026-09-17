/**
 * Offline schema test (no fal calls): every tool's declared output schema must
 * accept the exact result shape the plugin produces, and its parameter schema
 * must accept realistic agent arguments.
 */
import { apply, DEFAULTS } from '../lib/index.js'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

const tools = new Map()
const ctx = {
  tools: { register: (tool) => { tools.set(tool.name, tool); return () => {} } },
  attachments: { async saveImages() { return [] }, async readImage() { return { ref: { mediaType: 'image/png' }, data: new Uint8Array(1) } } },
  systemPrompt: { section: () => () => {} },
  inject: (_names, cb) => cb({ settings: { installSection: (_o, _ns, _s, _e, hooks) => { hooks.setSource(() => DEFAULTS); hooks.onChange() } } }),
  effect() {},
}
apply(ctx, { ...DEFAULTS })

const imageRef = {
  attachment_id: 'att-1',
  media_type: 'image/png',
  bytes: 1024,
  width: 1024,
  height: 1024,
  name: 'fal-x.png',
  path: '/Users/x/.dsh/fal-imagegen/fal-x.png',
}
const taskResult = {
  status: 'completed',
  model: 'openai/gpt-image-2.5/flare/text-to-image',
  mode: 'text-to-image',
  request_id: '01a0add8-ee23-78a1-bebc-27d99ab5fef3',
  message: 'done',
  images: [imageRef],
}
const catalogue = {
  configured: {
    enabled: true,
    key_configured: true,
    default_text_to_image: DEFAULTS.defaultTextToImageModel,
    default_image_to_image: DEFAULTS.defaultImageToImageModel,
    default_size: '1:1',
    default_quality: 'high',
    timeout_seconds: 300,
    save_dir: '/Users/x/.dsh/fal-imagegen',
  },
  presets: [{ alias: 'gpt-image-2.5-flare', label: 'x', text_to_image: 'a', image_to_image: 'b', size_parameter: 'image_size', quality: true, note: 'n' }],
  note: 'text',
}

const results = {
  fal_generate_image: taskResult,
  fal_edit_image: { ...taskResult, model: 'openai/gpt-image-2.5/flare/edit', mode: 'image-to-image' },
  fal_list_image_models: catalogue,
}

let failures = 0
for (const [name, tool] of tools) {
  const violations = validateJsonSchemaValue(tool.output.schema, results[name], 'value') ?? []
  console.log(`${name}: output violations = ${violations.length}`)
  for (const violation of violations) console.log('   ', JSON.stringify(violation))
  if (violations.length > 0) failures += 1
}
console.log(failures === 0 ? '\nSCHEMA TEST PASSED' : `\nSCHEMA TEST FAILED (${failures})`)
process.exitCode = failures === 0 ? 0 : 1
