/**
 * Resolve the harness-provided schemastery module across DSH generations.
 *
 * DSH 2.x publishes the package as `@deepseek-ai/schemastery`; older harnesses
 * expose the same `Schema` default export under the unscoped `schemastery`
 * name. The host owns this dependency either way, so the plugin probes the
 * scoped name first and falls back to the legacy one. A missing package is the
 * only error we swallow: anything thrown while evaluating a found package must
 * keep propagating.
 */

const MISSING_PACKAGE_CODES = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'])

/**
 * Whether an import failure means "this package is not installed here" rather
 * than "this package is installed but broken". Node reports the former with a
 * module-not-found code; the DSH Desktop resolver reports it as a
 * `PackageOverlayNotFoundError`. Both name the package in the message.
 *
 * @param {unknown} error
 * @param {string} specifier
 * @returns {boolean}
 */
function isMissingPackage(error, specifier) {
  const message = String(error?.message ?? '')
  if (!message.includes(specifier)) return false
  return MISSING_PACKAGE_CODES.has(error?.code) || error?.name === 'PackageOverlayNotFoundError'
}

/**
 * Import one candidate specifier, returning `undefined` when the package itself
 * is absent and rethrowing every other failure.
 *
 * @param {string} specifier
 * @returns {Promise<unknown>}
 */
async function importCandidate(specifier) {
  try {
    const module = await import(specifier)
    return module.default
  } catch (error) {
    if (isMissingPackage(error, specifier)) return undefined
    throw error
  }
}

let schema = await importCandidate('@deepseek-ai/schemastery')
if (schema === undefined) schema = await importCandidate('schemastery')

if (typeof schema !== 'function') {
  throw new TypeError(
    'dsh-fal-imagegen needs schemastery from the harness '
      + '(@deepseek-ai/schemastery on DSH 2.x, schemastery on DSH 1.x)',
  )
}

export default schema
