/**
 * dsh-fal-imagegen — browser half.
 *
 * The harness renders the plugin-configuration tab as the intersection of the
 * settings namespaces the Host serves and the cards registered into the keyed
 * slot `settings.plugin.item`, so a host-only plugin would be configurable but
 * invisible. This half owns that card: one staged form over the
 * `dsh-fal-imagegen` namespace, written through `ctx.settingsScope` on save.
 *
 * The chrome mirrors the official `ui-settings-plugins` PluginCard — an `<li>`
 * with a disclosure header (name + one-line description + "未保存" tag +
 * chevron), collapsed by default, auto-collapsing after a clean save, with
 * 放弃修改 / 保存 in the footer — so this card reads as a sibling of the
 * built-in Shell / Agent loop / Web search cards instead of a bare block.
 *
 * Hand-written plain ESM — no bundler, no JSX. The module system wraps every
 * plugin bundle in `window.__ModuleLoader__.load({ id, factory })` and the
 * factory must return the plugin face (`name` / `inject` / `apply`).
 *
 * Slot contract (from the harness's own slot catalog):
 *   settings.plugin.item — kind "keyed", scope "root",
 *   registerOptions [{ name: 'key', required: true }],
 *   declared by the client-ui-settings-plugins tab while it is mounted.
 */

window.__ModuleLoader__.load({
  id: 'dsh-fal-imagegen',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    /** Settings namespace the Host plugin registers. */
    const NS = 'dsh-fal-imagegen'
    /** Slot the plugin-configuration tab dispatches per namespace. */
    const SLOT = 'settings.plugin.item'
    /** Where the chosen card language is remembered across reloads. */
    const LANG_KEY = 'dsh-fal-imagegen-lang'

    /**
     * Card copy, bilingual (zh + en). The card defaults to the GUI locale and
     * offers a manual toggle; the choice is persisted in localStorage.
     */
    const STRINGS = {
      zh: {
        language: '语言',
        title: 'fal 生图',
        description: 'fal.ai 原生生图：Agent 工具 fal_generate_image / fal_edit_image / fal_get_image_task / fal_list_image_models',
        expand: '展开设置',
        collapse: '收起设置',
        unsaved: '未保存',
        readOnly: '本部署的设置为只读。',
        notExposed: '宿主没有开放 dsh-fal-imagegen 设置段：插件未挂载或已被移除。',
        saveFailed: '本部署没有接受这些值，已保留供你修改。',
        discard: '放弃修改',
        save: '保存',
        saving: '保存中…',
        overridden: '已覆盖',
        reset: '恢复默认',
        invalidNumber: '请填数字；留空表示使用默认值。',
        saved: '已保存',
        secretPlaceholder: '留空表示保持当前密钥',
      },
      en: {
        language: 'Language',
        title: 'fal imagegen',
        description: 'Native fal.ai image generation: agent tools fal_generate_image / fal_edit_image / fal_get_image_task / fal_list_image_models',
        expand: 'Expand settings',
        collapse: 'Collapse settings',
        unsaved: 'Unsaved',
        readOnly: 'Settings are read-only in this deployment.',
        notExposed: 'The host does not serve the dsh-fal-imagegen settings namespace: the plugin is not mounted or has been removed.',
        saveFailed: 'This deployment did not accept these values; they are kept for you to edit.',
        discard: 'Discard',
        save: 'Save',
        saving: 'Saving…',
        overridden: 'Overridden',
        reset: 'Reset',
        invalidNumber: 'Enter a number; leave blank to use the default.',
        saved: 'Saved',
        secretPlaceholder: 'Leave blank to keep the current key',
      },
    }

    /** Per-language field rows; field keys are shared, copy is not. */
    const FIELDS = {
      zh: [
        { field: 'enabled', label: '启用插件', kind: 'boolean', hint: '关闭后 Agent 工具与系统提示公告都停用。' },
        { field: 'falKey', label: 'FAL_KEY', kind: 'secret', hint: '格式 key_id:key_secret。留空表示保持当前密钥；填写即覆盖。' },
        { field: 'defaultTextToImageModel', label: '默认文生图端点', kind: 'text', hint: 'fal slug，例如 openai/gpt-image-2.5/flare/text-to-image。' },
        { field: 'defaultImageToImageModel', label: '默认图生图端点', kind: 'text', hint: '例如 openai/gpt-image-2.5/flare/edit。' },
        { field: 'defaultImageSize', label: '默认尺寸', kind: 'text', hint: '1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9、1024x1536 或 auto。' },
        { field: 'quality', label: '质量档', kind: 'text', hint: 'auto / low / medium / high / xhigh / max；不支持的端点会自动省略。' },
        { field: 'outputFormat', label: '输出格式', kind: 'text', hint: 'png / jpeg / webp。' },
        { field: 'timeoutSeconds', label: '超时（秒）', kind: 'number', hint: '一次请求（提交 + 排队 + 取回）的总预算，默认 300。' },
        { field: 'saveDir', label: '输出目录', kind: 'text', hint: '留空写入 ~/.dsh/fal-imagegen。' },
        { field: 'announceToAgent', label: '系统提示里公告', kind: 'boolean', hint: '让 Agent 知道有 fal 生图工具。' },
      ],
      en: [
        { field: 'enabled', label: 'Enable plugin', kind: 'boolean', hint: 'Disables the agent tools and the system-prompt announcement.' },
        { field: 'falKey', label: 'FAL_KEY', kind: 'secret', hint: 'Format key_id:key_secret. Blank keeps the current key; typing overwrites it.' },
        { field: 'defaultTextToImageModel', label: 'Default text-to-image model', kind: 'text', hint: 'fal slug, e.g. openai/gpt-image-2.5/flare/text-to-image.' },
        { field: 'defaultImageToImageModel', label: 'Default image-to-image model', kind: 'text', hint: 'e.g. openai/gpt-image-2.5/flare/edit.' },
        { field: 'defaultImageSize', label: 'Default size', kind: 'text', hint: '1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9, a WxH pair like 1024x1536, or auto.' },
        { field: 'quality', label: 'Quality', kind: 'text', hint: 'auto / low / medium / high / xhigh / max; omitted automatically where unsupported.' },
        { field: 'outputFormat', label: 'Output format', kind: 'text', hint: 'png / jpeg / webp.' },
        { field: 'timeoutSeconds', label: 'Timeout (seconds)', kind: 'number', hint: 'Total budget for one request (submit + queue + fetch), default 300.' },
        { field: 'saveDir', label: 'Output directory', kind: 'text', hint: 'Leave blank to write to ~/.dsh/fal-imagegen.' },
        { field: 'announceToAgent', label: 'Announce in system prompt', kind: 'boolean', hint: 'Lets the agent know the fal image tools exist.' },
      ],
    }

    /** The card language: stored preference → GUI locale → Chinese (the original). */
    function detectLang() {
      try {
        const stored = typeof window !== 'undefined' ? window.localStorage?.getItem(LANG_KEY) : undefined
        if (stored === 'zh' || stored === 'en') return stored
      } catch { /* no storage available */ }
      const locale = typeof navigator !== 'undefined' && typeof navigator.language === 'string'
        ? navigator.language
        : 'zh'
      return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    /** Persist the toggle (guarded: the offline tests run without storage). */
    function storeLang(lang) {
      try {
        if ((lang === 'zh' || lang === 'en') && typeof window !== 'undefined') {
          window.localStorage?.setItem(LANG_KEY, lang)
        }
      } catch { /* no storage available */ }
    }

    /**
     * Card chrome, ported from the official PluginCard module: same design
     * tokens, radius, typography and states, so it matches the built-ins.
     */
    const STYLES = `
.dfi-card {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 12px;
  list-style: none;
  transition: border-color .16s, background .16s;
}
.dfi-card:hover { border-color: var(--dsw-alias-label-dimmed); }
.dfi-card.dfi-cardOpen { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-label-dimmed); }
.dfi-header {
  appearance: none; width: 100%; box-sizing: border-box; font: inherit; color: inherit;
  text-align: left; cursor: pointer; background: transparent; border: 0; border-radius: 12px;
  align-items: center; gap: 12px; padding: 14px 16px; display: flex;
}
.dfi-header:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.dfi-headText { flex-direction: column; flex: 1; gap: 4px; min-width: 0; display: flex; }
.dfi-name { color: var(--dsw-alias-label-primary); font-size: 15px; font-weight: 600; line-height: 1.4; }
.dfi-description { color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 1.5; }
.dfi-pending {
  white-space: nowrap; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary);
  border-radius: 999px; flex: none; padding: 1px 8px; font-size: 11px; font-weight: 500; line-height: 17px;
}
.dfi-chevron { color: var(--dsw-alias-label-tertiary); flex: none; transition: transform .16s; }
.dfi-chevronOpen { transform: rotate(180deg); }
.dfi-body { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 16px; padding-bottom: 8px; }
.dfi-readOnly { color: var(--dsw-alias-label-secondary); margin: 12px 0 0; font-size: 12px; line-height: 1.5; }
.dfi-notExposed { color: var(--dsw-alias-state-warn-primary); margin: 12px 0 0; font-size: 12px; line-height: 1.5; }
.dfi-footer {
  border-top: 1px solid var(--dsw-alias-border-l2); justify-content: flex-end; align-items: center;
  gap: 8px; padding: 12px 0 4px; display: flex;
}
.dfi-failed {
  color: var(--dsw-alias-state-error-primary, #b42318); flex: 1; margin: 0; font-size: 12px; line-height: 1.5;
  text-overflow: ellipsis; overflow: hidden; white-space: nowrap;
}
.dfi-status { color: var(--dsw-alias-label-secondary); flex: 1; margin: 0; font-size: 12px; line-height: 1.5; }
.dfi-discard, .dfi-save {
  appearance: none; font: inherit; cursor: pointer; border: 1px solid transparent;
  border-radius: 8px; padding: 5px 14px; font-size: 13px; line-height: 1.5;
}
.dfi-discard { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); background: transparent; }
.dfi-discard:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }
.dfi-save { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); }
.dfi-discard:disabled, .dfi-save:disabled { opacity: .4; cursor: default; }
.dfi-discard:focus-visible, .dfi-save:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dfi-field { flex-direction: column; gap: 6px; padding: 12px 0; display: flex; }
.dfi-field + .dfi-field { border-top: 1px solid var(--dsw-alias-border-l2); }
.dfi-head { align-items: center; gap: 8px; display: flex; }
.dfi-label { min-width: 0; color: var(--dsw-alias-label-primary); flex: 1; font-size: 13px; font-weight: 500; line-height: 1.5; }
.dfi-badges { align-items: center; gap: 8px; display: inline-flex; }
.dfi-badge {
  white-space: nowrap; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary);
  border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 500; line-height: 17px;
}
.dfi-reset {
  font: inherit; color: var(--dsw-alias-label-secondary); cursor: pointer; background: transparent;
  border: none; padding: 0; font-size: 12px; line-height: 1.5;
}
.dfi-reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dfi-reset:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dfi-input {
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); height: 34px;
  font: inherit; color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 0 12px;
  font-size: 13px; line-height: 1.5; width: 100%; box-sizing: border-box;
}
.dfi-input:focus-visible { border-color: var(--dsw-alias-brand-primary); outline: none; }
.dfi-input:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dfi-inputInvalid { border-color: var(--dsw-alias-state-error-primary, #b42318); }
.dfi-check { width: 16px; height: 16px; margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.dfi-hint { color: var(--dsw-alias-label-secondary); margin: 0; font-size: 12px; line-height: 1.5; }
.dfi-invalid { color: var(--dsw-alias-state-error-primary, #b42318); margin: 0; font-size: 12px; line-height: 1.5; }
.dfi-langs { align-items: center; gap: 8px; padding: 12px 0 0; display: flex; }
.dfi-langLabel { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
.dfi-lang {
  appearance: none; font: inherit; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); background: transparent; border-radius: 999px;
  padding: 1px 10px; font-size: 12px; line-height: 1.5;
}
.dfi-lang:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }
.dfi-langActive { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); border-color: transparent; }
@media (prefers-reduced-motion: reduce) {
  .dfi-card, .dfi-chevron, .dfi-chevronOpen, .dfi-discard, .dfi-save { transition: none; }
}`

    /** Inject the chrome styles once; a script-only environment has no document. */
    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-fal-imagegen-styles') !== null) return
      const style = document.createElement('style')
      style.id = 'dsh-fal-imagegen-styles'
      style.textContent = STYLES
      document.head.appendChild(style)
    }

    /** Stable control id for one field, used by the offline tests too. */
    function controlId(field) { return `dsh-fal-imagegen-${field}` }

    /** One draft entry's write, or undefined when the draft is unusable. */
    function toText(kind, value) {
      if (kind === 'boolean') return value !== false
      if (kind === 'number') return typeof value === 'number' ? String(value) : ''
      return typeof value === 'string' ? value : ''
    }

    /** One draft entry's write, or undefined when the draft is unusable. */
    function toWrite(kind, text) {
      if (kind === 'boolean') return { op: 'set', value: text === true }
      const trimmed = typeof text === 'string' ? text.trim() : ''
      if (kind === 'number') {
        if (trimmed === '') return { op: 'unset' }
        const parsed = Number(trimmed)
        return Number.isFinite(parsed) ? { op: 'set', value: parsed } : undefined
      }
      if (kind === 'secret') return trimmed === '' ? undefined : { op: 'set', value: trimmed }
      return trimmed === '' ? { op: 'unset' } : { op: 'set', value: trimmed }
    }

    /** The official chevron geometry, so the disclosure affordance matches. */
    function chevron(open) {
      return h('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 14 14',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: open ? 'dfi-chevron dfi-chevronOpen' : 'dfi-chevron',
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z',
        fill: 'currentColor',
      }))
    }

    /** The card component, closing over the bound namespace scope. */
    function makeCard(scope) {
      return function FalImagegenSettingsCard() {
        const [open, setOpen] = React.useState(false)
        const [snapshot, setSnapshot] = React.useState(() => scope.getSnapshot())
        const [drafts, setDrafts] = React.useState({})
        const [saving, setSaving] = React.useState(false)
        const [failed, setFailed] = React.useState(undefined)
        const [saved, setSaved] = React.useState(false)
        const [lang, setLang] = React.useState(() => detectLang())
        const copy = STRINGS[lang] ?? STRINGS.zh
        const fields = FIELDS[lang] ?? FIELDS.zh

        React.useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [])

        const values = snapshot.value ?? {}
        const user = snapshot.user ?? {}
        const dirty = Object.keys(drafts).length > 0

        const edit = (field, value) => {
          setSaved(false)
          setFailed(undefined)
          setDrafts((previous) => ({ ...previous, [field]: value }))
        }
        const discard = () => {
          setDrafts({})
          setFailed(undefined)
        }
        const reset = (field) => {
          setDrafts((previous) => {
            const next = { ...previous }
            delete next[field]
            return next
          })
          setSaved(false)
          void scope.mutate([{ op: 'unset', path: [field] }]).catch((error) => {
            setFailed(`恢复默认失败：${error instanceof Error ? error.message : String(error)}`)
          })
        }
        const save = async () => {
          const ops = []
          for (const [field, value] of Object.entries(drafts)) {
            const spec = fields.find((item) => item.field === field)
            if (spec === undefined) continue
            const write = toWrite(spec.kind, value)
            if (write === undefined) continue
            if (spec.kind !== 'secret' && toText(spec.kind, value) === toText(spec.kind, values[field])) continue
            ops.push(write.op === 'set'
              ? { op: 'set', path: [field], value: write.value }
              : { op: 'unset', path: [field] })
          }
          if (ops.length === 0) {
            setDrafts({})
            setOpen(false)
            return
          }
          setSaving(true)
          setFailed(undefined)
          try {
            await scope.mutate(ops)
            setDrafts({})
            setSaved(true)
            // Collapse again once a save settles cleanly, like the built-ins.
            setOpen(false)
          } catch (error) {
            setFailed(`保存失败：${error instanceof Error ? error.message : String(error)}`)
          } finally {
            setSaving(false)
          }
        }

        /** The 中文 / English switcher; survives reloads via localStorage. */
        const langRow = h('div', { className: 'dfi-langs' },
          h('span', { className: 'dfi-langLabel' }, copy.language),
          h('button', {
            id: 'dsh-fal-imagegen-lang-zh',
            type: 'button',
            className: lang === 'zh' ? 'dfi-lang dfi-langActive' : 'dfi-lang',
            onClick: () => { storeLang('zh'); setLang('zh') },
          }, '中文'),
          h('button', {
            id: 'dsh-fal-imagegen-lang-en',
            type: 'button',
            className: lang === 'en' ? 'dfi-lang dfi-langActive' : 'dfi-lang',
            onClick: () => { storeLang('en'); setLang('en') },
          }, 'English'))

        // Still loading: the built-in cards render nothing at all.
        if (snapshot.status === 'loading') return null

        const pending = dirty ? h('span', { className: 'dfi-pending', title: copy.unsaved }, copy.unsaved) : null
        const cardClass = open ? 'dfi-card dfi-cardOpen' : 'dfi-card'
        const header = h('button', {
          type: 'button',
          className: 'dfi-header',
          'aria-expanded': open,
          'aria-label': `${open ? copy.collapse : copy.expand}: ${copy.title}`,
          onClick: () => { setSaved(false); setOpen(!open) },
        },
        h('span', { className: 'dfi-headText' },
          h('span', { className: 'dfi-name', title: copy.title }, copy.title),
          h('span', { className: 'dfi-description', title: copy.description }, copy.description)),
        pending,
        chevron(open))

        // The Host does not serve the namespace: explain the gap instead of vanishing.
        if (snapshot.status !== 'ready') {
          return h('li', { className: cardClass },
            header,
            open ? h('div', { className: 'dfi-body' },
              langRow,
              h('p', { className: 'dfi-notExposed', role: 'status' }, copy.notExposed)) : null)
        }

        const disabled = snapshot.writable !== true
        const stagedWrites = new Map(fields
          .filter((spec) => Object.hasOwn(drafts, spec.field))
          .map((spec) => [spec.field, toWrite(spec.kind, drafts[spec.field])]))
        const invalidAny = [...stagedWrites.values()].some((write) => write === undefined)

        const rows = fields.map((spec) => {
          const staged = stagedWrites.has(spec.field)
          const value = Object.hasOwn(drafts, spec.field) ? drafts[spec.field] : toText(spec.kind, values[spec.field])
          const invalid = staged && stagedWrites.get(spec.field) === undefined
          // A secret is stripped from every wire view, so its user-layer
          // presence is unknowable here: no override marker, no reset.
          const overridden = spec.kind !== 'secret' && Object.hasOwn(user, spec.field)
          const control = spec.kind === 'boolean'
            ? h('input', {
              id: controlId(spec.field),
              className: 'dfi-check',
              type: 'checkbox',
              checked: value === true,
              disabled,
              onChange: (event) => edit(spec.field, event.target.checked),
            })
            : h('input', {
              id: controlId(spec.field),
              className: invalid ? 'dfi-input dfi-inputInvalid' : 'dfi-input',
              type: spec.kind === 'secret' ? 'password' : spec.kind === 'number' ? 'number' : 'text',
              value: typeof value === 'string' ? value : '',
              disabled,
              autoComplete: 'off',
              spellCheck: false,
              placeholder: spec.kind === 'secret' ? copy.secretPlaceholder : '',
              onChange: (event) => edit(spec.field, event.target.value),
            })
          const badges = []
          if (overridden) badges.push(h('span', { key: 'overridden', className: 'dfi-badge' }, copy.overridden))
          if (overridden && !disabled) {
            badges.push(h('button', {
              key: 'reset',
              id: `${controlId(spec.field)}-reset`,
              type: 'button',
              className: 'dfi-reset',
              title: copy.reset,
              onClick: () => reset(spec.field),
            }, copy.reset))
          }
          return h('div', { key: spec.field, className: 'dfi-field' },
            h('div', { className: 'dfi-head' },
              h('label', { className: 'dfi-label', htmlFor: controlId(spec.field) }, spec.label),
              badges.length === 0 ? null : h('span', { className: 'dfi-badges' }, badges)),
            control,
            h('p', { className: invalid ? 'dfi-invalid' : 'dfi-hint' }, invalid ? copy.invalidNumber : spec.hint))
        })

        return h('li', { className: cardClass },
          header,
          open
            ? h('div', { className: 'dfi-body' },
              langRow,
              disabled ? h('p', { className: 'dfi-readOnly', role: 'status' }, copy.readOnly) : null,
              rows,
              h('div', { className: 'dfi-footer' },
                failed !== undefined
                  ? h('p', { className: 'dfi-failed', role: 'status' }, `${copy.saveFailed} - ${failed}`)
                  : (saved && !dirty ? h('p', { className: 'dfi-status' }, copy.saved) : null),
                h('button', {
                  id: 'dsh-fal-imagegen-discard',
                  type: 'button',
                  className: 'dfi-discard',
                  disabled: !dirty || saving,
                  onClick: discard,
                }, copy.discard),
                h('button', {
                  id: 'dsh-fal-imagegen-save',
                  type: 'button',
                  className: 'dfi-save',
                  disabled: !dirty || saving || invalidAny,
                  onClick: () => { void save() },
                }, saving ? copy.saving : copy.save)))
            : null)
      }
    }

    /** Inline this card's chrome without a CSS module or a bundler. */
    function injectStyles() {
      // A script-only environment (the offline tests) has no document.
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-fal-imagegen-styles')) return
      const style = document.createElement('style')
      style.id = 'dsh-fal-imagegen-styles'
      style.textContent = STYLES
      document.head.appendChild(style)
    }

    /** Cordis services the client half waits for. */
    const inject = ['slots', 'settingsScope']

    function apply(ctx) {
      // The web shell fails its whole boot when a plugin apply throws, so a
      // missing service or an undeclared slot must degrade to a log line
      // instead of taking the GUI down with it.
      try {
        injectStyles()
        // The rc.6 bridge binder is optional; the official scope is the fallback.
        const binder = ctx.get('webUiSettings') ?? ctx.settingsScope
        const scope = binder.bind({ namespace: NS })
        ctx.slots.inject(SLOT, () => ctx.slots.register(
          { name: SLOT, key: NS, order: 150 },
          makeCard(scope),
        ))
      } catch (error) {
        console.error('[dsh-fal-imagegen] settings card not mounted:', error)
      }
    }

    exports.name = 'dsh-fal-imagegen-client'
    exports.inject = inject
    exports.apply = apply
    // Pure draft/write helpers, exposed for the offline client test only; the
    // module system reads just name / inject / apply.
    exports.__testing = { FIELDS, toText, toWrite }
    return module.exports
  },
})
