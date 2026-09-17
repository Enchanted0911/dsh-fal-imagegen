/**
 * Compatibility helpers for the dsh-settings API across harness versions.
 *
 * rc.7 exposes `settingsNamespace` / `installSettingsSection` as module
 * functions; alpha.2 moves the installer onto the settings provider service.
 * Both paths register the same section, so the plugin works either way.
 */

import * as settingsModule from '@deepseek-ai/dsh-settings'

/** Brand a namespace where the installed settings package still exposes it. */
export function settingsNamespaceCompat(value) {
  return typeof settingsModule.settingsNamespace === 'function'
    ? settingsModule.settingsNamespace(value)
    : value
}

/** Register an optional settings section across both settings APIs. */
export function installSettingsSectionCompat(ctx, ns, schema, entry, hooks) {
  if (typeof settingsModule.installSettingsSection === 'function') {
    settingsModule.installSettingsSection(ctx, ns, schema, entry, hooks)
    return
  }
  ctx.inject(['settings'], (sctx) => {
    const provider = sctx.settings ?? (typeof sctx.get === 'function' ? sctx.get('settings') : undefined)
    if (provider === undefined || typeof provider.installSection !== 'function') {
      throw new TypeError('dsh-settings does not expose installSection')
    }
    provider.installSection(ctx, ns, schema, entry, hooks)
  })
}
