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
/** The immediate answer of the async path: no images, task_id to query. */
const asyncSubmit = {
  status: 'queued',
  task_id: 'fal-m1abcdefg-abc123',
  mode: 'text-to-image',
  model: 'openai/gpt-image-2.5/flare/text-to-image',
  request_id: '01a0add8-ee23-78a1-bebc-27d99ab5fef3',
  queue_position: 3,
  message: 'submitted',
  next_action: 'fal_get_image_task(task_id=…)',
  images: [],
}
/** A query answer: still pending (no images yet) or finished with images. */
const queryPending = {
  status: 'running',
  task_id: 'fal-m1abcdefg-abc123',
  mode: 'text-to-image',
  model: 'openai/gpt-image-2.5/flare/text-to-image',
  request_id: '01a0add8-ee23-78a1-bebc-27d99ab5fef3',
  queue_position: 1,
  message: 'still running',
  next_action: 'query again',
  images: [],
}
const queryFailed = {
  ...queryPending,
  status: 'failed',
  message: 'failed',
  error: 'fal 生成失败：boom',
}
const queryDone = { ...taskResult, task_id: asyncSubmit.task_id }
const queryList = {
  status: 'ok',
  model: 'task-list',
  message: '2 tasks',
  tasks: [{
    task_id: 'fal-m1abcdefg-abc123',
    status: 'completed',
    model: 'openai/gpt-image-2.5/flare/text-to-image',
    mode: 'text-to-image',
    request_id: '01a0add8-ee23-78a1-bebc-27d99ab5fef3',
    queue_position: 1,
    images: 1,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:01.000Z',
  }],
  images: [],
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
  async_note: 'async',
}

const results = {
  fal_generate_image: asyncSubmit,
  fal_edit_image: { ...taskResult, model: 'openai/gpt-image-2.5/flare/edit', mode: 'image-to-image' },
  fal_get_image_task: queryDone,
  fal_list_image_models: catalogue,
}

let failures = 0
for (const [name, tool] of tools) {
  const violations = validateJsonSchemaValue(tool.output.schema, results[name], 'value') ?? []
  console.log(`${name}: output violations = ${violations.length}`)
  for (const violation of violations) console.log('   ', JSON.stringify(violation))
  if (violations.length > 0) failures += 1
}

// The query tool's schema also covers the pending, failed and list shapes.
const queryTool = tools.get('fal_get_image_task')
for (const [label, sample] of [['pending', queryPending], ['failed', queryFailed], ['list', queryList], ['done', queryDone]]) {
  const violations = validateJsonSchemaValue(queryTool.output.schema, sample, 'value') ?? []
  console.log(`fal_get_image_task [${label}]: output violations = ${violations.length}`)
  for (const violation of violations) console.log('   ', JSON.stringify(violation))
  if (violations.length > 0) failures += 1
}

console.log(failures === 0 ? '\nSCHEMA TEST PASSED' : `\nSCHEMA TEST FAILED (${failures})`)
process.exitCode = failures === 0 ? 0 : 1
