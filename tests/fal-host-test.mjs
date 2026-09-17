/**
 * Host-side integration test for dsh-fal-imagegen without booting DSH.
 *
 * Fakes the host seams the plugin injects (tools / attachments /
 * systemPrompt / settings) and drives the real tools end to end:
 *   fal_generate_image  → real fal.ai call → attachment + disk file
 *   fal_edit_image      → reuses the produced file by path
 *   fal_list_image_models
 * Also checks the failure path with a missing key.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { apply, DEFAULTS } from '../lib/index.js'
import { detectMime, imageDimensions } from '../lib/image-meta.js'

const FAL_KEY = process.env.FAL_KEY ?? ''
const settingsValue = {
  ...DEFAULTS,
  falKey: FAL_KEY,
  defaultImageSize: '1:1',
  quality: 'low',           // keep the verification cheap
  timeoutSeconds: 300,
}

const tools = new Map()
const sections = []
const registered = new Set()

// Minimal attachment store mirroring the DSH contract: saveImages takes
// {data, mediaType, name} and returns refs carrying id/mediaType/bytes/dims.
const blobStore = new Map()
const attachments = {
  async saveImages(inputs) {
    return inputs.map((input, index) => {
      const id = `att-${++attachmentCounter}`
      const dims = imageDimensions(input.data) ?? { width: 0, height: 0 }
      blobStore.set(id, { data: input.data, mediaType: input.mediaType, name: input.name })
      refs.push({ id, index })
      return {
        attachmentId: id,
        mediaType: input.mediaType,
        bytes: input.data.byteLength,
        width: dims.width,
        height: dims.height,
        name: input.name,
      }
    })
  },
  async readImage(ref) {
    const stored = blobStore.get(ref.attachmentId)
    if (stored === undefined) throw new Error(`unknown attachment ${ref.attachmentId}`)
    return { ref: { ...ref, name: stored.name }, data: stored.data }
  },
}
let attachmentCounter = 0
const refs = []

let installed = false
const ctx = {
  tools: {
    register(tool) {
      if (registered.has(tool.name)) throw new Error(`duplicate tool ${tool.name}`)
      registered.add(tool.name)
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    },
  },
  attachments,
  systemPrompt: {
    section(options) {
      sections.push(options)
      return () => { sections.pop() }
    },
  },
  inject(names, callback) {
    callback({
      settings: {
        installSection(_owner, ns, schema, entry, hooks) {
          installed = true
          console.log(`  settings section installed: ns=${String(ns)} base-enabled=${entry.enabled}`)
          hooks.setSource(() => settingsValue)
          hooks.onChange()
        },
      },
    })
  },
  effect() {},
}

console.log('== apply() ==')
const dispose = apply(ctx, { ...DEFAULTS })
console.log('tools registered:', [...tools.keys()].join(', '))
console.log('settings installed:', installed, '| prompt sections:', sections.length)

console.log('\n== fal_list_image_models ==')
const catalogue = await tools.get('fal_list_image_models').execute({}, { signal: undefined })
console.log('key_configured:', catalogue.configured.key_configured, '| default t2i:', catalogue.configured.default_text_to_image, '| presets:', catalogue.presets.length)

console.log('\n== fal_generate_image ==')
const generated = await tools.get('fal_generate_image').execute(
  { prompt: 'a small orange cat sleeping on a wooden desk, soft window light, photo', size: '1:1', count: 1 },
  { signal: undefined },
)
console.log('status:', generated.status, '| model:', generated.model, '| images:', generated.images.length)
const first = generated.images[0]
console.log('ref:', JSON.stringify({ ...first, path: first.path }))
if (!existsSync(first.path)) throw new Error(`expected a file at ${first.path}`)
const onDisk = readFileSync(first.path)
console.log('disk file:', statSync(first.path).size, 'bytes | magic:', detectMime(onDisk), '| dims:', JSON.stringify(imageDimensions(onDisk)))

console.log('\n== presentation projection ==')
const tool = tools.get('fal_generate_image')
const meta = tool.output.presentationMeta({}, generated)
console.log('presentationMeta images:', JSON.stringify(meta).slice(0, 160))
// presentResult validates its arguments first, so pass a well-formed call.
const view = tool.presentResult({ prompt: 'x' }, { isError: false, meta })
console.log('presentResult card:', view?.card, '| blocks:', view?.content.length, '| block type:', view?.content[0]?.type)

console.log('\n== fal_edit_image (by image_path) ==')
const edited = await tools.get('fal_edit_image').execute(
  { prompt: 'give the cat a tiny red scarf', image_path: first.path, size: 'auto', count: 1 },
  { signal: undefined },
)
console.log('status:', edited.status, '| model:', edited.model, '| images:', edited.images.length, '| path:', edited.images[0].path)

console.log('\n== missing-key failure path ==')
settingsValue.falKey = ''
try {
  await tools.get('fal_generate_image').execute({ prompt: 'x' }, { signal: undefined })
  throw new Error('expected the missing-key call to fail')
} catch (error) {
  console.log('refused with:', error.message)
}
settingsValue.falKey = FAL_KEY

console.log('\n== dispose ==')
dispose()
console.log('tools after dispose:', tools.size)
console.log('\nHOST INTEGRATION TEST PASSED')
