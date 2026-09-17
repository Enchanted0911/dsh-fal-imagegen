/**
 * Offline settings round-trip test — the seam between the two halves.
 *
 * Drives the browser-half card with the React stub, captures the exact
 * `mutate` operations a save produces, applies them to a fake user layer, and
 * feeds the merged section to the host half — then checks that the host reads
 * back what the card wrote, that a reset returns a field to the schema default,
 * and that the master switch actually gates the tools.
 *
 * This is the seam no single-half test covers: a card writing `enabled: false`
 * while the host reads `enabled !== true`, a number staged as a string, or a
 * reset that never clears.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeReactStub, find } from './helpers/react-stub.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const failures = []
const check = (condition, message) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`)
  if (!condition) failures.push(message)
}

const host = await import(join(here, '..', 'lib', 'index.js'))
const DEFAULTS = host.DEFAULTS

// The settings document's user layer (what a save writes) and every op batch.
const userLayer = {}
const applied = []

const clientSnapshot = () => ({
  status: 'ready',
  writable: true,
  // Mirrors the host: the resolved section is the defaults overlaid by the user layer.
  value: { ...DEFAULTS, ...userLayer },
  base: DEFAULTS,
  // Secrets never reach a wire view; every other override does.
  user: Object.fromEntries(Object.entries(userLayer).filter(([field]) => field !== 'falKey')),
  revision: 1,
})

let definition
globalThis.window = { __ModuleLoader__: { load: (def) => { definition = def } } }
await import(join(here, '..', 'lib', 'client.js'))

const { React, render, reset } = makeReactStub()
const client = definition.factory((specifier) => {
  if (specifier === 'react') return React
  throw new Error(`unexpected require("${specifier}")`)
})

const scope = {
  getSnapshot: clientSnapshot,
  subscribe: () => () => {},
  mutate: async (ops) => {
    applied.push(ops)
    for (const op of ops) {
      if (op.op === 'set') userLayer[op.path[0]] = op.value
      else delete userLayer[op.path[0]]
    }
    return { ok: true }
  },
}
let card
client.apply({
  get: () => undefined,
  settingsScope: { bind: () => scope },
  slots: { inject: (_name, callback) => callback(), register: (_options, component) => { card = component; return () => {} } },
})

/** Fire one control by its stable id, re-rendering between steps like React. */
const id = (field) => `dsh-fal-imagegen-${field}`
let view = render(card)
const headerOf = (tree) => find(tree, (node) => node.props?.['aria-expanded'] !== undefined)
/** The card starts collapsed (official chrome); open it before touching controls. */
const expand = () => {
  if (headerOf(view.tree)?.props['aria-expanded'] === false) {
    headerOf(view.tree).props.onClick()
    view = render(card)
  }
}
const set = (field, value, prop = 'value') => {
  const control = find(view.tree, (node) => node.props?.id === id(field))
  if (control === undefined) throw new Error(`no control for ${field}`)
  control.props.onChange({ target: { [prop]: value } })
  view = render(card)
}

// ---------------------------------------------------------------- card → ops
expand()
set('falKey', ' cardkey:cardsecret ')
set('quality', 'xhigh')
set('timeoutSeconds', '120')
set('saveDir', '/tmp/fal-out')
set('enabled', false, 'checked')
set('announceToAgent', false, 'checked')
find(view.tree, (node) => node.props?.id === 'dsh-fal-imagegen-save').props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))

console.log('card ops:', JSON.stringify(applied.at(-1)))
check(userLayer.falKey === 'cardkey:cardsecret', 'secret write lands trimmed')
check(userLayer.quality === 'xhigh', 'text write lands')
check(userLayer.timeoutSeconds === 120, 'number write lands as a number')
check(userLayer.saveDir === '/tmp/fal-out', 'path write lands')
check(userLayer.enabled === false, 'boolean write lands as false')
check(userLayer.announceToAgent === false, 'announce switch lands as false')

// ---------------------------------------------------------------- host reads
const hostTools = new Map()
let sections = 0
let notifySettings
const hostCtx = {
  tools: { register: (tool) => { hostTools.set(tool.name, tool); return () => {} } },
  attachments: {
    async saveImages() { return [] },
    async readImage() { return { ref: { mediaType: 'image/png' }, data: new Uint8Array(1) } },
  },
  systemPrompt: { section: () => { sections += 1; return () => { sections -= 1 } } },
  inject: (_names, callback) => callback({
    settings: {
      installSection: (_owner, _ns, _schema, _entry, hooks) => {
        notifySettings = () => hooks.onChange()
        // The host merges the user layer over the composition base on every read.
        hooks.setSource(() => ({ ...DEFAULTS, ...userLayer }))
        hooks.onChange()
      },
    },
  }),
  effect() {},
}
host.apply(hostCtx, { ...DEFAULTS })

const catalogue = await hostTools.get('fal_list_image_models').execute({}, {})
console.log('host view:', JSON.stringify(catalogue.configured))
check(catalogue.configured.key_configured === true, 'host sees the key the card wrote')
check(catalogue.configured.default_quality === 'xhigh', 'host reads the quality the card wrote')
check(catalogue.configured.timeout_seconds === 120, 'host reads the timeout as a number')
check(catalogue.configured.save_dir === '/tmp/fal-out', 'host reads the output directory')
// The announcement is gated by both switches: off-plugin wins over on-announce.
check(sections === 0, 'no announcement while the plugin is switched off')
userLayer.announceToAgent = true
notifySettings()
check(sections === 0, 'announce on does not bypass the master switch')
userLayer.enabled = true
notifySettings()
check(sections === 1, 'enabling the plugin registers the prompt section')
userLayer.announceToAgent = false
notifySettings()
check(sections === 0, 'turning the announcement off disposes the section')
userLayer.announceToAgent = true
notifySettings()
check(sections === 1, 'turning it back on re-registers the section')
userLayer.enabled = false
notifySettings()

try {
  await hostTools.get('fal_generate_image').execute({ prompt: 'x' }, {})
  check(false, 'generation refused while disabled')
} catch (error) {
  check(error.message.includes('已被关闭'), `generation refused with an actionable message (${error.message})`)
}

// --------------------------------------------------------------- reset path
reset()
view = render(card)
expand()
const resetControl = find(view.tree, (node) => node.props?.id === `${id('quality')}-reset`)
check(resetControl !== undefined, 'renders a reset control for an overridden field')
applied.length = 0
resetControl?.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
console.log('reset ops:', JSON.stringify(applied.at(-1)))
check(applied.at(-1)?.[0]?.op === 'unset' && applied.at(-1)?.[0]?.path?.[0] === 'quality', 'reset writes an unset op for that field')
check(userLayer.quality === undefined, 'reset dropped the user-layer entry')
notifySettings()
const afterReset = await hostTools.get('fal_list_image_models').execute({}, {})
check(afterReset.configured.default_quality === 'high', 'host falls back to the schema default after a reset')

console.log(failures.length === 0 ? '\nSETTINGS ROUND-TRIP TEST PASSED' : `\nSETTINGS ROUND-TRIP TEST FAILED (${failures.length})`)
process.exitCode = failures.length === 0 ? 0 : 1
