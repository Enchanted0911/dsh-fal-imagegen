/**
 * Offline browser-half test — no DSH, no browser, no React install needed.
 *
 * Loads `lib/client.js` the way the harness's client module system does (a
 * `window.__ModuleLoader__.load({ id, factory })` wrapper whose factory returns
 * the plugin face), applies it against a fake client context, and drives the
 * registered card with a minimal React stub: hooks, a tree, and enough
 * handling to fire real `onChange` / `onClick` handlers.
 *
 * Also checks the official card chrome behaviour: an `<li>` card that starts
 * collapsed, expands from its header button, collapses again after a clean
 * save, and blocks a save while a draft is unusable.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeReactStub, textOf, find, findAll } from './helpers/react-stub.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const failures = []
const check = (condition, message) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`)
  if (!condition) failures.push(message)
}

// ---------------------------------------------------------------- module load
let definition
globalThis.window = { __ModuleLoader__: { load: (def) => { definition = def } } }
await import(join(here, '..', 'lib', 'client.js'))

check(definition !== undefined, 'client bundle registers through window.__ModuleLoader__.load')
check(definition.id === 'dsh-fal-imagegen', `bundle id is the package name (${definition.id})`)

const { React, render, reset } = makeReactStub()
const plugin = definition.factory((specifier) => {
  if (specifier === 'react') return React
  throw new Error(`unexpected require("${specifier}") in the client bundle`)
})
check(typeof plugin.apply === 'function' && Array.isArray(plugin.inject), 'factory returns the plugin face')
check(plugin.inject.join(',') === 'slots,settingsScope', `injects ${plugin.inject.join(', ')}`)

// ------------------------------------------------------------- apply the half
const values = {
  enabled: true,
  defaultTextToImageModel: 'openai/gpt-image-2.5/flare/text-to-image',
  defaultImageToImageModel: 'openai/gpt-image-2.5/flare/edit',
  defaultImageSize: '1:1',
  quality: 'high',
  outputFormat: 'png',
  timeoutSeconds: 300,
  saveDir: '',
  announceToAgent: true,
}
const userLayer = { defaultImageSize: '16:9' }
const mutations = []
let status = 'ready'
let boundNamespace
const scope = {
  getSnapshot: () => ({ status, writable: true, value: values, base: values, user: userLayer, revision: 1 }),
  subscribe: () => () => {},
  mutate: async (ops) => { mutations.push(ops); return { ok: true } },
}
let registered
let injectedSlot
plugin.apply({
  get: () => undefined,
  settingsScope: { bind: (spec) => { boundNamespace = spec.namespace; return scope } },
  slots: {
    inject: (name, callback) => { injectedSlot = name; callback() },
    register: (options, component) => { registered = { options, component }; return () => {} },
  },
})

check(boundNamespace === 'dsh-fal-imagegen', 'binds the dsh-fal-imagegen namespace')
check(injectedSlot === 'settings.plugin.item', 'registers into settings.plugin.item')
check(registered.options.key === 'dsh-fal-imagegen', 'keyed entry uses the namespace as its key')

/** The disclosure button the official chrome renders. */
const headerOf = (tree) => find(tree, (node) => node.props?.['aria-expanded'] !== undefined)
/** Expand the card if it is collapsed (its default state). */
const expand = () => {
  let view = render(registered.component)
  if (headerOf(view.tree)?.props['aria-expanded'] === false) {
    headerOf(view.tree).props.onClick()
    view = render(registered.component)
  }
  return view
}
const byId = (tree, field) => find(tree, (node) => node.props?.id === `dsh-fal-imagegen-${field}`)

// ------------------------------------------------ chrome: card list + disclosure
let view = render(registered.component)
check(view.tree.type === 'li' && String(view.tree.props.className).includes('dfi-card'), 'renders as a card <li> (official chrome)')
check(headerOf(view.tree) !== undefined, 'renders a disclosure header button')
check(headerOf(view.tree).props['aria-expanded'] === false, 'card starts collapsed like the built-in cards')
check(byId(view.tree, 'falKey') === undefined, 'collapsed card renders no controls')
check(textOf(view.tree).includes('fal 生图'), 'collapsed card still shows its title')

headerOf(view.tree).props.onClick()
view = render(registered.component)
check(headerOf(view.tree).props['aria-expanded'] === true, 'header click expands the card')
check(String(view.tree.props.className).includes('dfi-cardOpen'), 'expanded card carries the open class')

const text = textOf(view.tree)
check(text.includes('FAL_KEY'), 'renders the FAL_KEY field')
check(text.includes('openai/gpt-image-2.5/flare/text-to-image'), 'renders the live default text model')
check(text.includes('已覆盖'), 'marks the field the user layer overrides')
check(find(view.tree, (node) => node.props?.type === 'password') !== undefined, 'secret field is a password input')
check(find(view.tree, (node) => node.props?.id === 'dsh-fal-imagegen-save') !== undefined, 'renders the save control')
check(find(view.tree, (node) => node.props?.id === 'dsh-fal-imagegen-discard') !== undefined, 'renders the discard control')
check(findAll(view.tree, (node) => String(node.props?.className).includes('dfi-field')).length === 10, 'renders ten fields')

// --------------------------------------------------------- unavailable namespace
status = 'unavailable'
reset()
view = render(registered.component)
check(headerOf(view.tree).props['aria-expanded'] === false, 'unavailable card starts collapsed')
headerOf(view.tree).props.onClick()
view = render(registered.component)
check(textOf(view.tree).includes('没有开放'), 'explains an unavailable namespace when expanded')
check(find(view.tree, (node) => node.props?.type === 'password') === undefined, 'hides the form when the namespace is not served')
status = 'ready'

// ------------------------------------------------------------------ save writes
reset()
view = expand()
check(find(view.tree, (node) => node.props?.type === 'password')?.props?.placeholder === '留空表示保持当前密钥', 'secret field explains that blank keeps the current key')
find(view.tree, (node) => node.props?.type === 'password').props.onChange({ target: { value: ' newid:newsecret ' } })
view = render(registered.component)
check(String(view.tree.props.className).includes('dfi-cardOpen'), 'a staged edit keeps the card open')
check(textOf(view.tree).includes('未保存'), 'a staged edit shows the pending tag')
find(view.tree, (node) => node.props?.id === 'dsh-fal-imagegen-save').props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
check(
  JSON.stringify(mutations.at(-1)) === '[{"op":"set","path":["falKey"],"value":"newid:newsecret"}]',
  `secret save writes the trimmed key (${JSON.stringify(mutations.at(-1))})`,
)
view = render(registered.component)
check(headerOf(view.tree)?.props['aria-expanded'] === false, 'card collapses again after a clean save')

// A text field: set a real value through the same controls.
view = expand()
byId(view.tree, 'quality').props.onChange({ target: { value: 'xhigh' } })
view = render(registered.component)
find(view.tree, (node) => node.props?.id === 'dsh-fal-imagegen-save').props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
check(
  JSON.stringify(mutations.at(-1)) === '[{"op":"set","path":["quality"],"value":"xhigh"}]',
  `text save writes the new value (${JSON.stringify(mutations.at(-1))})`,
)

// An unusable draft blocks the save instead of dropping the edit.
view = expand()
byId(view.tree, 'timeoutSeconds').props.onChange({ target: { value: 'abc' } })
view = render(registered.component)
check(String(byId(view.tree, 'timeoutSeconds').props.className).includes('dfi-inputInvalid'), 'invalid draft marks the input')
check(find(view.tree, (node) => node.props?.id === 'dsh-fal-imagegen-save').props.disabled === true, 'invalid draft blocks the save')

// The reset control is a labelled text button, not a bare glyph.
check(find(view.tree, (node) => node.props?.id === 'dsh-fal-imagegen-defaultImageSize-reset')?.props?.children === '恢复默认', 'reset control uses the official label')

const { toText, toWrite } = plugin.__testing
check(toText('boolean', undefined) === true, 'boolean draft defaults to on')
check(JSON.stringify(toWrite('text', '')) === '{"op":"unset"}', 'empty text draft clears the override')
check(toWrite('number', 'abc') === undefined, 'unusable number draft blocks the write')
check(toWrite('secret', '') === undefined, 'empty secret draft keeps the current key')

console.log(failures.length === 0 ? '\nCLIENT TEST PASSED' : `\nCLIENT TEST FAILED (${failures.length})`)
process.exitCode = failures.length === 0 ? 0 : 1
