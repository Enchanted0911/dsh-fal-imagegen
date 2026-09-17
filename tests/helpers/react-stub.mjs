/**
 * Minimal React stand-in for the offline browser-half tests.
 *
 * Enough of the surface for a plugin card: `createElement`, `useState` and
 * `useEffect` over a hook list that survives re-renders (like React does), plus
 * tree helpers so a test can find controls and fire their handlers.
 */

export function makeReactStub() {
  let hooks = []
  let cursor = 0
  const React = {
    createElement(type, props, ...children) {
      const kids = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
      return { type, props: { ...(props ?? {}), ...kids === undefined ? {} : { children: kids } } }
    },
    useState(initial) {
      const slot = cursor++
      if (!(slot in hooks)) hooks[slot] = typeof initial === 'function' ? initial() : initial
      return [hooks[slot], (next) => { hooks[slot] = typeof next === 'function' ? next(hooks[slot]) : next }]
    },
    useEffect(effect) { hooks.effects.push(effect) },
    useRef(initial) {
      const slot = cursor++
      if (!(slot in hooks)) hooks[slot] = { current: initial }
      return hooks[slot]
    },
  }
  return {
    React,
    /** Render a component, keeping hook state across renders. */
    render(component) {
      cursor = 0
      hooks.effects = []
      const tree = component({})
      const runEffects = () => { for (const effect of hooks.effects.splice(0)) effect() }
      return { tree, runEffects }
    },
    /** Drop all hook state, i.e. unmount and mount again. */
    reset() { hooks = [] },
  }
}

/** Visit every element node in a stub tree (function components are expanded). */
export function walk(node, visit) {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return }
  if (typeof node !== 'object') return
  if (typeof node.type === 'function') { walk(node.type(node.props), visit); return }
  visit(node)
  walk(node.props?.children, visit)
}

/** Flatten a stub tree into its text, for label assertions. */
export function textOf(tree) {
  const parts = []
  const collect = (node) => {
    if (typeof node === 'string' || typeof node === 'number') { parts.push(String(node)); return }
    if (Array.isArray(node)) { for (const child of node) collect(child); return }
    if (node === null || node === undefined || node === false || typeof node !== 'object') return
    if (typeof node.type === 'function') { collect(node.type(node.props)); return }
    collect(node.props?.children)
  }
  collect(tree)
  return parts.join(' ')
}

/** The first element node matching a predicate. */
export function find(tree, predicate) {
  let found
  walk(tree, (node) => { if (found === undefined && predicate(node)) found = node })
  return found
}

/** All element nodes matching a predicate. */
export function findAll(tree, predicate) {
  const found = []
  walk(tree, (node) => { if (predicate(node)) found.push(node) })
  return found
}
