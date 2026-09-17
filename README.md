# dsh-fal-imagegen

Native [fal.ai](https://fal.ai) image generation for DeepSeek Harness (DSH): a settings card for your FAL_KEY and defaults, plus agent tools that speak fal's protocol end-to-end — no OpenAI-compatible gateway in between.

## Features

- **Native fal protocol** — `POST https://queue.fal.run/<slug>` with `Authorization: Key <key_id>:<key_secret>`, poll the queue ticket (`status_url` → `response_url`), consume `{ images: [{ url, width, height }] }`.
- **Settings card** — "fal 生图" under Settings → Plugins: master switch, FAL_KEY, default text-to-image / image-to-image endpoints, default size, quality, output format, timeout, output directory, and a system-prompt announcement toggle. The card matches the built-in plugin card chrome (collapsible, dirty-state tag, per-field reset, save/discard).
- **Agent tools**:

  | tool | purpose |
  | --- | --- |
  | `fal_generate_image` | text-to-image: `prompt` / `model` / `size` / `quality` / `count` |
  | `fal_edit_image` | image-to-image: `prompt` + a source (an attachment reference, or an `image_path` on disk) |
  | `fal_list_image_models` | list the built-in aliases, current defaults, and the output directory |

- **Results you can reuse** — every image is attached to the conversation (renders beside the tool call) **and** written to disk under `<DSH_HOME>/fal-imagegen`; the returned `path` goes straight back into `fal_edit_image`'s `image_path`.
- **Model aliases with verified slugs** — every built-in alias was checked against fal's own endpoint schema; unknown slugs containing "/" are passed through verbatim, and a clear text-to-image slug is refused for an edit instead of sending a broken request.

## Model aliases

| alias | text-to-image endpoint | image-to-image endpoint | size parameter | quality tier |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare` (default; also accepts `gpt-image-2.5` / `gpt-image-2.5-flash`) | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` | `image_size` | supported |
| `gpt-image-2.5-sunburst` | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` | `image_size` | supported |
| `gpt-image-2` | `openai/gpt-image-2` | `openai/gpt-image-2/edit` | `image_size` | supported |
| `gpt-image-1.5` | `fal-ai/gpt-image-1.5` | `fal-ai/gpt-image-1.5/edit` | `image_size` | supported |
| `nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | `aspect_ratio` | omitted |
| `gemini-25-flash-image` | `fal-ai/gemini-25-flash-image` | `fal-ai/gemini-25-flash-image/edit` | `aspect_ratio` | omitted |
| `flux-2-flash` | `fal-ai/flux-2/flash` | `fal-ai/flux-2/flash/edit` | `image_size` | omitted |

> Naming note: fal does not host a "gpt image 2.5 flash". GPT Image 2.5 has two tiers on fal: `flare` (the default fast tier) and `sunburst` (detail-first, slower and pricier). This plugin defaults to `flare` and additionally accepts `gpt-image-2.5-flash` as an alias.

## Configuration

| field | default | meaning |
| --- | --- | --- |
| `enabled` | `true` | master switch (tools + prompt announcement) |
| `falKey` | empty | FAL_KEY, `key_id:key_secret` (copy the full string from fal.ai → Keys) |
| `defaultTextToImageModel` | `openai/gpt-image-2.5/flare/text-to-image` | text-to-image endpoint |
| `defaultImageToImageModel` | `openai/gpt-image-2.5/flare/edit` | image-to-image endpoint |
| `defaultImageSize` | `1:1` | `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9`, a `WxH` pixel pair, or `auto` |
| `quality` | `high` | `auto / low / medium / high / xhigh / max` (omitted automatically for endpoints that do not document a tier) |
| `outputFormat` | `png` | `png / jpeg / webp` |
| `timeoutSeconds` | `300` | total budget for one request (submit + queue + fetch) |
| `saveDir` | empty | output directory; empty = `<DSH_HOME>/fal-imagegen` |
| `announceToAgent` | `true` | announce the plugin in every agent system prompt |

The card edits the same settings as the `dsh-fal-imagegen:` section of `~/.dsh/settings.yaml`. FAL_KEY is a password field: leaving it blank keeps the current key (the key is redacted from every wire view).

## Installation

### npm (recommended)

`dsh-fal-imagegen@0.1.0` is published:

```sh
# CLI-managed profiles (web / headless / custom):
dsh plugin --profile web add dsh-fal-imagegen
# restart the corresponding process afterwards
```

The **desktop profile** is owned by the DSH Desktop app (`dsh plugin --profile desktop` is refused): install through Settings → Plugins → market, or register manually in `~/.dsh/profiles/desktop/package.json` (add the dependency and `dsh-fal-imagegen` to `dsh.profile.bundles`), then fully restart DSH Desktop.

After installing, fill in FAL_KEY in Settings → Plugins → 插件配置 → the "fal 生图" card, or write the `dsh-fal-imagegen:` section of `~/.dsh/settings.yaml`.

### from git (fallback)

```sh
dsh plugin --profile web add github:Enchanted0911/dsh-fal-imagegen
```

### from source

```sh
git clone https://github.com/Enchanted0911/dsh-fal-imagegen
# link: it into a profile — dependency + dsh.profile.bundles entry — then restart DSH Desktop
```

The runtime packages (`@deepseek-ai/dsh-tools`, `dsh-attachment`, `dsh-settings`, `schemastery`) come from the harness; the `node_modules/` in this source tree only exists so the offline tests can load outside the harness.

## Development

Offline tests (no key, no network):

```sh
node tests/fal-manifest-test.mjs             # manifest contract: patch row, exports, dsh.client, wrapper id
node tests/fal-client-test.mjs               # browser half: slot registration, card states, save ops
node tests/fal-settings-roundtrip-test.mjs   # both halves: card writes → host reads, reset fallback, toggles
node tests/fal-schema-test.mjs               # tool parameter and output schemas
```

Live tests (spend fal credits):

```sh
FAL_KEY='<key_id>:<key_secret>' node tests/fal-host-test.mjs   # host simulation: generate + edit + attachments + failure paths
FAL_KEY='<key_id>:<key_secret>' node tests/fal-smoke.mjs       # fal client only (one generation)
```

Effect of source changes in a linked install: browser-half (`lib/client.js`) changes apply on a page refresh; host-half changes and `package.json` manifest changes require a DSH Desktop restart.

## Marketplace catalog source

The DSH community market has no default source; this repository ships a v1-contract catalog source under `catalog/` (see `catalog/entry.mjs`). Deploy the Cloudflare Pages form and register the manifest URL in Settings → Plugins → market → Sources:

```sh
npx wrangler pages deploy catalog/pages --project-name dsh-fal-imagegen-catalog
# then add https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json as a source
```

## Limitations

- The settings card copy is Chinese-only for now.
- A tool call waits synchronously (internal queue polling) within the `timeoutSeconds` budget; there is no background-task query API.
- Endpoints that document `aspect_ratio` (nano-banana / gemini) downgrade explicit pixel sizes to `auto`.
- Generation spends fal credits, and image content is produced by the fal-hosted model.